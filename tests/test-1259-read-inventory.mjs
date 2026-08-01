import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1259: the graph can read the INVENTORY. Dialogue could branch on what you carry since 1076
// (`[if item:redKey >= 1]`); the graph never could — so "the player holds two fire cards" was
// expressible to an NPC and invisible to the rules. That is the wall under card/collection puzzles:
// cards, runes, ingredients and quest items are all inventory, and a puzzle is a CONDITION on what
// you hold. give/take were already verbs, so the graph could CHANGE what it could not READ.

// Drive the real `read` case out of _lgPulse with a stubbed world.
function rig(opts = {}) {
  const pulse = extractFunction('_lgPulse');
  const branch = pulse.slice(pulse.indexOf("case 'read':"), pulse.indexOf("case 'branch':"));
  const vars = {}, failures = [];
  const inv = opts.inventory || [];
  const fn = new Function('logicVars', '_lgVarKey', 'inventory', 'invCatalog', 'invCount',
    '_noteLogicFailure', '_lgFollow', 'player', 'WEAPONS', 'curWep', 'score', 'credits', 'wave',
    'enemies', '_lgRunT', 'performance', 'id',
    `return function(p){ switch(p.stat==null?'read':'read'){ ${branch} } };`)
    (vars, (k) => k, inv, opts.catalog || {},
      (id) => { const s = inv.find(x => x.id === id); return s ? s.n : 0; },
      (m) => failures.push(m), () => {}, { hp: 1, maxHp: 1 }, {}, '', 0, 0, 0, [], 0,
      { now: () => 0 }, 'n1');
  return { fn, vars, failures };
}

{ // counting one id
  const r = rig({ inventory: [{ id: 'card_fire', n: 3 }, { id: 'card_ice', n: 1 }],
                  catalog: { card_fire: {}, card_ice: {} } });
  r.fn({ stat: 'item', item: 'card_fire', name: 'fire' });
  eq(r.vars.fire, 3, 'the graph reads how many of an item the player holds');
  r.fn({ stat: 'item', item: 'card_ice', name: 'ice' });
  eq(r.vars.ice, 1, '...per item id');
  r.fn({ stat: 'item', item: 'card_void', name: 'void' });
  eq(r.vars.void, 0, 'an item the player does not hold reads 0');
  eq(r.failures.length, 1, '...and, being undefined, is reported once rather than silently reading 0 forever');
  assert(/card_void/.test(r.failures[0]) && /always read 0/.test(r.failures[0]),
    'the report names the id and the consequence');
}
{ // whitespace and a blank id
  const r = rig({ inventory: [{ id: 'rune', n: 2 }], catalog: { rune: {} } });
  r.fn({ stat: 'item', item: '  rune  ', name: 'n' });
  eq(r.vars.n, 2, 'the id is trimmed, so a stray space is not a silent zero');
  r.fn({ stat: 'item', item: '', name: 'blank' });
  eq(r.vars.blank, 0, 'a blank item reads 0');
  assert(r.failures.some(f => /names no item/.test(f)), '...and says the node names no item');
}
{ // distinct kinds — the shape a collection puzzle actually wants
  const r = rig({ inventory: [{ id: 'a', n: 5 }, { id: 'b', n: 1 }, { id: 'c', n: 0 }, { id: 'd', n: 2 }],
                  catalog: { a: {}, b: {}, c: {}, d: {} } });
  r.fn({ stat: 'itemkinds', name: 'kinds' });
  eq(r.vars.kinds, 3, 'counts DIFFERENT kinds held (an empty stack does not count) — "one of each of the four runes" needs this, and counting one id cannot express it');
  const empty = rig({ inventory: [] });
  empty.fn({ stat: 'itemkinds', name: 'k' });
  eq(empty.vars.k, 0, 'an empty inventory reads 0');
}
{ // the pre-existing stats are untouched
  const r = rig({ inventory: [{ id: 'x', n: 9 }], catalog: { x: {} } });
  r.fn({ stat: 'hp', name: 'h' });
  eq(r.vars.h, 1, 'reading hp still reads hp, not an item count');
}

// --- wiring pins ------------------------------------------------------------------------------------
assert(/\['item','How many of an item'\],\['itemkinds','Different items held'\]/.test(src),
  'both stats are offered in the Read-stat dropdown');
assert(/\{k:'item',l:'item',w:88,ifv:\['stat','item'\],listId:'lgItemList'\}/.test(src),
  'the item field appears only for the item stat, and offers the level’s real item ids');
assert(/case 'item':    \{ const _id=String\(p\.item\|\|''\)\.trim\(\);/.test(src), 'the runtime reads the field');
assert(/for\(const s of inventory\)\{ if\(s && s\.n>0\) v\+\+; \}/.test(src), 'and counts kinds by non-empty stacks');
{
  const pulse = extractFunction('_lgPulse');
  const rd = pulse.slice(pulse.indexOf("case 'read':"), pulse.indexOf("case 'branch':"));
  assert(/invCount\(_id\)/.test(rd), 'it goes through invCount — the same accessor dialogue conditions use, so the two can never disagree');
}

done('build 1259: the graph reads the inventory — per-id counts and distinct-kinds executed against a stub inventory, trimming, blank and undefined ids reported rather than silently zero, existing stats untouched');
