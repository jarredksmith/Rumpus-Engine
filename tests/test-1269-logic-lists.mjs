import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1269: the logic graph learns ORDERED LISTS. Everything before it held ONE NUMBER per name, so a
// deck to deal from, the order buttons were pressed in, and a combination to check against were all
// unsayable — a 52-card deck was 52 nodes and a 4-step sequence could not be compared at all. This is the
// last gap named in the card/puzzle design pass (1259 read-inventory and 1260 HUD art closed the others).

// A list is a sequence of NUMBERS in its OWN store, which is the load-bearing decision: every consumer of
// logicVars coerces with `+logicVars[k]||0` — the HUD widget mirror, the `hudv` net message, campaign
// persistence — so a non-number there would silently become 0 and travel over the wire as one.

// declared together (`const LGL_MAX = 64, LGL_LEN = 256;`), which extractConst cannot split
const _caps = src.match(/const LGL_MAX = (\d+), LGL_LEN = (\d+);/);
assert(_caps, 'the two bounds are named');
const LGL_MAX = +_caps[1], LGL_LEN = +_caps[2];

function rig(opts = {}) {
  const pulse = extractFunction('_lgPulse');
  const body = [
    'const LGL_MAX = ' + LGL_MAX + ', LGL_LEN = ' + LGL_LEN + ';',
    'let logicVars = {}, logicLists = ' + JSON.stringify(opts.lists || {}) + ';',
    'let _lgCtx = { pid: 0 };',
    extractFunction('_lgVarKey'), extractFunction('_lgNum'), extractFunction('_lgList'),
    // drive ONLY the list case, through the real switch body, with a stub follow
    'function _lgFollow(){}',
    // the real case body, re-hosted in its own switch so `case`/`break` are legal
    'function run(p){ const id="n1"; switch("list"){ ' +
      pulse.slice(pulse.indexOf("case 'list': {"), pulse.indexOf("// build 1169: READ GAME STAT")) +
    ' } }',
    'return { run, vars:()=>logicVars, lists:()=>logicLists };',
  ].join('\n');
  return new Function(body)();
}
const L = (p) => { const r = rig(p.__lists ? { lists: p.__lists } : {}); r.run(p); return r; };

{ // push / length / clear — the bag behaviour
  const r = rig();
  r.run({ name: 'deck', op: 'push', value: 7 });
  r.run({ name: 'deck', op: 'push', value: 9 });
  eq(r.lists().deck.join(','), '7,9', 'values land in order');
  r.run({ name: 'deck', op: 'len', var: 'n' });
  eq(r.vars().n, 2, 'length reads out into a variable');
  r.run({ name: 'deck', op: 'clear' });
  eq(r.lists().deck.length, 0, 'clear empties it');
  r.run({ name: 'deck', op: 'len', var: 'n' });
  eq(r.vars().n, 0, '...and the length follows');
}
{ // fill: a deck in ONE node, which is the whole reason this is usable
  const r = rig();
  r.run({ name: 'deck', op: 'fill', value: 52 });
  eq(r.lists().deck.length, 52, 'fill 1..N builds a deck in one node');
  eq(r.lists().deck[0], 1, '...starting at 1');
  eq(r.lists().deck[51], 52, '...through N');
  r.run({ name: 'deck', op: 'fill', value: 3 });
  eq(r.lists().deck.join(','), '1,2,3', 'filling again REPLACES rather than appending');
}
{ // draw removes and yields — dealing a card
  const r = rig({ lists: { deck: [4, 5, 6] } });
  r.run({ name: 'deck', op: 'draw', var: 'card' });
  eq(r.vars().card, 4, 'draw takes the FIRST value (the top of the deck)');
  eq(r.lists().deck.join(','), '5,6', '...and removes it');
  r.run({ name: 'deck', op: 'draw', var: 'card' });
  r.run({ name: 'deck', op: 'draw', var: 'card' });
  eq(r.vars().card, 6);
  r.run({ name: 'deck', op: 'draw', var: 'card' });
  eq(r.vars().card, 0, 'drawing from an empty deck yields 0, never undefined');
}
{ // peek / contains / remove
  const r = rig({ lists: { hand: [3, 8, 8, 1] } });
  r.run({ name: 'hand', op: 'at', idx: 1, var: 'v' });
  eq(r.vars().v, 8, 'at reads WITHOUT removing');
  eq(r.lists().hand.length, 4);
  r.run({ name: 'hand', op: 'at', idx: 99, var: 'v' });
  eq(r.vars().v, 0, 'an index past the end is 0');
  r.run({ name: 'hand', op: 'at', idx: -1, var: 'v' });
  eq(r.vars().v, 0, '...as is a negative one');
  r.run({ name: 'hand', op: 'has', value: 8, var: 'v' });
  eq(r.vars().v, 1, 'contains is 1');
  r.run({ name: 'hand', op: 'has', value: 42, var: 'v' });
  eq(r.vars().v, 0, '...and 0');
  r.run({ name: 'hand', op: 'remove', value: 8 });
  eq(r.lists().hand.join(','), '3,8,1', 'remove takes the FIRST match only, so duplicates survive');
}
{ // THE PUZZLE QUESTION: same sequence, in order
  const r = rig({ lists: { entered: [1, 2, 3], combo: [1, 2, 3], wrong: [3, 2, 1], short: [1, 2] } });
  r.run({ name: 'entered', op: 'matches', other: 'combo', var: 'ok' });
  eq(r.vars().ok, 1, 'the right combination matches');
  r.run({ name: 'entered', op: 'matches', other: 'wrong', var: 'ok' });
  eq(r.vars().ok, 0, 'ORDER MATTERS — that is what separates a combination lock from a bag of tokens');
  r.run({ name: 'entered', op: 'matches', other: 'short', var: 'ok' });
  eq(r.vars().ok, 0, 'a prefix is not a match');
  r.run({ name: 'entered', op: 'matches', other: 'nosuch', var: 'ok' });
  eq(r.vars().ok, 0, 'comparing against a list that does not exist is 0, not a crash');
  const e = rig({ lists: { a: [], b: [] } });
  e.run({ name: 'a', op: 'matches', other: 'b', var: 'ok' });
  eq(e.vars().ok, 1, 'two empty lists are equal');
}
{ // shuffle: same multiset, and it really permutes
  const r = rig();
  r.run({ name: 'd', op: 'fill', value: 40 });
  const before = r.lists().d.slice();
  let moved = false;
  for (let i = 0; i < 6 && !moved; i++) {
    r.run({ name: 'd', op: 'shuffle' });
    moved = r.lists().d.some((v, j) => v !== before[j]);
  }
  assert(moved, 'shuffle changes the order');
  eq(r.lists().d.length, 40, '...without losing entries');
  eq(r.lists().d.slice().sort((a, b) => a - b).join(','), before.join(','), '...and without changing which entries they are');
}
{ // draw random removes exactly one and empties cleanly
  const r = rig({ lists: { bag: [1, 2, 3, 4, 5] } });
  const got = [];
  for (let i = 0; i < 5; i++) { r.run({ name: 'bag', op: 'drawrand', var: 'v' }); got.push(r.vars().v); }
  eq(r.lists().bag.length, 0, 'drawing every card empties the bag');
  eq(got.slice().sort((a, b) => a - b).join(','), '1,2,3,4,5', '...and yields each exactly once');
  r.run({ name: 'bag', op: 'drawrand', var: 'v' });
  eq(r.vars().v, 0, 'and an empty bag yields 0');
}
{ // values resolve as literals OR variables, the same rule Branch and Math use
  const r = rig();
  r.run({ name: 'd', op: 'push', value: 5 });
  r.run({ name: 'd', op: 'len', var: 'n' });
  r.run({ name: 'd', op: 'push', value: 'n' });      // a VARIABLE name
  eq(r.lists().d.join(','), '5,1', 'a value may be a variable name, not just a literal');
}
{ // hostile / malformed level data can neither allocate without limit nor poison a later compare
  const r = rig();
  r.run({ name: 'x', op: 'fill', value: 1e9 });
  eq(r.lists().x.length, LGL_LEN, 'fill is capped');
  const big = rig();
  for (let i = 0; i < 400; i++) big.run({ name: 'y', op: 'push', value: i });
  eq(big.lists().y.length, LGL_LEN, 'push stops at the cap rather than growing forever');
  const many = rig();
  for (let i = 0; i < 200; i++) many.run({ name: 'L' + i, op: 'push', value: 1 });
  eq(Object.keys(many.lists()).length, LGL_MAX, 'the number of lists is capped too');
  const nameless = rig();
  nameless.run({ name: '', op: 'len', var: 'v' });
  eq(nameless.vars().v, 0, 'an unnamed list reports empty rather than throwing mid-graph');
  const nan = rig({ lists: { d: [1] } });
  nan.run({ name: 'd', op: 'at', idx: 'zzz', var: 'v' });
  eq(nan.vars().v, 1, 'a garbage index resolves through _lgNum to 0, so it reads the first entry');
  const noDst = rig({ lists: { d: [1, 2] } });
  noDst.run({ name: 'd', op: 'draw' });
  eq(noDst.lists().d.join(','), '2', 'a draw with no destination still draws (and writes nothing)');
  eq(Object.keys(noDst.vars()).length, 0, '...leaving no stray variable behind');
}
{ // a real hand: fill, shuffle, deal three, and the deck is three shorter
  const r = rig();
  r.run({ name: 'deck', op: 'fill', value: 52 });
  r.run({ name: 'deck', op: 'shuffle' });
  for (const v of ['c1', 'c2', 'c3']) r.run({ name: 'deck', op: 'draw', var: v });
  eq(r.lists().deck.length, 49, 'three cards dealt leaves 49');
  const hand = [r.vars().c1, r.vars().c2, r.vars().c3];
  eq(new Set(hand).size, 3, '...and no card is dealt twice');
  assert(hand.every(v => v >= 1 && v <= 52), '...and every card is in the deck');
}

{ // build 1231's per-player convention: `hand@` is THIS player's hand — the difference between a card
  // GAME and a card demo, and the reason list names route through _lgVarKey like every other state node.
  const mk = (pid) => {
    const pulse = extractFunction('_lgPulse');
    return new Function([
      'const LGL_MAX = ' + LGL_MAX + ', LGL_LEN = ' + LGL_LEN + ';',
      'let logicVars = {}, logicLists = {}, _lgCtx = { pid: ' + pid + ' };',
      extractFunction('_lgVarKey'), extractFunction('_lgNum'), extractFunction('_lgList'),
      'function _lgFollow(){}',
      'function run(p){ const id="n1"; switch("list"){ ' +
        pulse.slice(pulse.indexOf("case 'list': {"), pulse.indexOf('// build 1169: READ GAME STAT')) + ' } }',
      'return { run, vars:()=>logicVars, lists:()=>logicLists };',
    ].join('\n'))();
  };
  const a = mk(1);
  a.run({ name: 'hand@', op: 'push', value: 5 });
  assert(a.lists()['hand@1'], 'a list named with a trailing @ is keyed to the acting player');
  eq(a.lists()['hand@1'].join(','), '5');
  const b = mk(2);
  b.run({ name: 'hand@', op: 'push', value: 9 });
  eq(Object.keys(b.lists())[0], 'hand@2', 'a different player gets a different hand from the same node');
  a.run({ name: 'hand@', op: 'draw', var: 'card@' });
  eq(a.vars()['card@1'], 5, 'and the destination variable is keyed the same way');
  const plain = mk(3);
  plain.run({ name: 'deck', op: 'push', value: 1 });
  assert(plain.lists().deck, 'a name without @ stays shared, as it always was');
}

// ---------------------------------------------------------------- wiring
{ // logicVars must stay numbers-only — the reason lists have their own store
  assert(/let logicLists = \{\};/.test(src), 'lists live in their own store');
  const reset = src.slice(src.indexOf('logicVars={}; logicLists={};'), src.indexOf('logicVars={}; logicLists={};') + 60);
  assert(/logicLists=\{\}/.test(reset), 'and are wiped with the rest of the run state — a deck must not survive a match');
  const hudv = src.slice(src.indexOf("msg.t==='hudv'"), src.indexOf("msg.t==='hudv'") + 200);
  assert(/\+msg\.v\[k\]\|\|0/.test(hudv) && !/logicLists/.test(hudv),
    'the net variable mirror is untouched and still numeric — nothing new crosses the wire');
}
{ // palette <-> runtime parity, which is what test-1028 exists to hold
  const defs = new Function('return ' + extractConst('LG_DEFS', src) + ';')();
  assert(defs.list, 'the node is in the palette');
  eq(defs.list.cat, 'st', '...in STATE, beside Math and Read');
  const ops = defs.list.params.find(p => p.k === 'op').sel.map(o => o[0]);
  const pulse = extractFunction('_lgPulse');
  const body = pulse.slice(pulse.indexOf("case 'list': {"), pulse.indexOf("// build 1169: READ GAME STAT"));
  for (const op of ops) assert(new RegExp("'" + op + "'").test(body), 'the runtime implements the offered op: ' + op);
  eq(ops.length, 11, 'every offered op is implemented and none is orphaned');
}
{ // authoring affordances
  assert(/_lgListOptions/.test(src) && /mk\('lgListList'\)/.test(src), 'list names autocomplete');
  const opt = extractFunction('_lgListOptions');
  assert(/logicGraph/.test(opt) && !/logicLists/.test(opt),
    'read off the AUTHORED graph, not the runtime store — at edit time nothing has run yet');
  assert(/pm\.listId==='lgListList'\) _lgRefreshDatalists\(\)/.test(src),
    'and naming a new deck refreshes the datalist, so the next node can pick it');
}

done('build 1269: the logic graph learns ordered lists — fill/shuffle/draw/peek/contains/remove/length and an ORDER-SENSITIVE match, all executed through the real _lgPulse case, with a full deal-a-hand round trip, every hostile bound (list count, length, unnamed, garbage index) held, and logicVars left numeric-only so the HUD mirror and net message are untouched');
