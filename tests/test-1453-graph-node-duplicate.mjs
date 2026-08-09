// build 1453 — a graph node can be copied.
//
// The board could ADD a node and DELETE one and never duplicate one. A booth wired with ten near-identical
// `do` nodes — the shooting range's own shape, one per plate — meant picking the type and re-filling every
// parameter ten times, and a `do` node carries up to nineteen of them (build 1407).
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();
const OFF = +extractConst('LG_DUP_OFF', src);
eq(OFF, 26, 'lifted the real offset from source');

/* ---- EXECUTED: the duplicate ------------------------------------------------------------------------ */
const rig = (nodes, wires = []) => {
  const g = { nodes: nodes.map((n) => ({ ...n, p: { ...n.p } })), wires: wires.slice() };
  const out = { dirty: 0, rendered: 0 };
  const dup = new Function('G', 'OUT', `
    const logicGraph = G;
    let _seq = 100;
    ${extractFunction('_lgNode', src)}
    const _lgNewId = () => 'n' + (_seq++);
    const _lgDirty = () => { OUT.dirty++; };
    const _lgRender = () => { OUT.rendered++; };
    const LG_DUP_OFF = ${OFF};
    ${extractFunction('_lgDupNode', src)}
    return _lgDupNode;
  `)(g, out);
  return { g, out, dup };
};

{
  const { g, out, dup } = rig([{ id: 'n1', type: 'do', x: 100, y: 200, p: { verb: 'showprop', target: 'plate1', amt: '5' } }]);
  const c = dup('n1');
  eq(g.nodes.length, 2, 'the copy is added to the graph');
  assert(c.id !== 'n1', 'with a fresh id');
  eq(c.type, 'do', '...the same type');
  eq(c.p.verb, 'showprop', '...and every parameter');
  eq(c.p.target, 'plate1', '...all of them');
  eq(c.p.amt, '5', '...including the ones a verb only shows sometimes');
  eq(c.x, 126, 'offset so the copy is visibly its own node');
  eq(c.y, 226, '...on both axes');
  eq(out.dirty, 1, 'the level is marked dirty once');
  eq(out.rendered, 1, '...and the board redrawn once');
}
{
  // THE DEEP COPY IS THE POINT. Sharing one `p` object makes editing any copy edit all of them — build
  // 1438's defect exactly, and invisible until a creator changes one and loses nine.
  const { g, dup } = rig([{ id: 'n1', type: 'do', x: 0, y: 0, p: { verb: 'damage', amt: '25' } }]);
  const c = dup('n1');
  assert(c.p !== g.nodes[0].p, 'the params are a NEW object, not the original');
  c.p.amt = '99';
  eq(g.nodes[0].p.amt, '25', 'editing the copy does not edit the original');
  g.nodes[0].p.verb = 'heal';
  eq(c.p.verb, 'damage', '...and editing the original does not edit the copy');
}
{
  // ten copies of one node must be ten independent nodes, which is the actual use case
  const { g, dup } = rig([{ id: 'n1', type: 'do', x: 0, y: 0, p: { target: 'plate1' } }]);
  const made = [];
  for (let i = 0; i < 10; i++) made.push(dup('n1'));
  eq(g.nodes.length, 11, 'ten copies land');
  eq(new Set(made.map((n) => n.id)).size, 10, '...with ten distinct ids');
  made.forEach((n, i) => { n.p.target = 'plate' + (i + 2); });
  eq(new Set(g.nodes.map((n) => n.p.target)).size, 11,
    '...and eleven independent targets, which is the whole reason to duplicate a node');
}
{
  // WIRES ARE NOT COPIED — the decision, not an omission. Copying the inbound ones fans one signal into two
  // places; copying the outbound ones fires every downstream verb twice. Both silent, both destructive.
  const { g, dup } = rig(
    [{ id: 'n1', type: 'do', x: 0, y: 0, p: {} }, { id: 'n2', type: 'event', x: 0, y: 0, p: {} }],
    [{ a: 'n2', o: 0, b: 'n1', i: 0 }, { a: 'n1', o: 0, b: 'n2', i: 0 }]);
  const c = dup('n1');
  eq(g.wires.length, 2, 'the wire list is untouched');
  assert(!g.wires.some((w) => w.a === c.id || w.b === c.id), '...and the copy arrives unwired');
}
{
  // it must not throw on a node that is not there
  const { g, out, dup } = rig([{ id: 'n1', type: 'do', x: 0, y: 0, p: {} }]);
  eq(dup('nope'), null, 'duplicating a node that does not exist returns null');
  eq(g.nodes.length, 1, '...and adds nothing');
  eq(out.dirty, 0, '...and does not mark the level dirty');
}
{
  // a node with no params at all
  const { dup } = rig([{ id: 'n1', type: 'win', x: 5, y: 7, p: {} }]);
  const c = dup('n1');
  eq(Object.keys(c.p).length, 0, 'a node with no params copies cleanly');
  eq(c.x, 5 + OFF, '...and is still offset');
}
{
  // inherited keys must not be copied as own params — `p` comes out of a level file (build 1325)
  const { dup } = rig([{ id: 'n1', type: 'do', x: 0, y: 0, p: {} }]);
  const c = dup('n1');
  assert(!Object.prototype.hasOwnProperty.call(c.p, 'toString'),
    'only OWN keys are copied, so a hostile prototype key cannot ride into the graph');
}

/* ---- the button, beside the delete it mirrors ------------------------------------------------------- */
{
  const rn = extractFunction('_lgRenderNode', src);
  assert(/const dup=document\.createElement\('span'\); dup\.textContent='\\u29c9'/.test(rn),
    'there is a duplicate control on the node header');
  assert(/dup\.title='Duplicate node \(params copied, wires not\)'/.test(rn),
    '...and it says what it does AND does not do, because "duplicate" reads as "with its wires"');
  // the header is a drag handle: without stopping pointerdown the drag claims the press and the click
  // never lands — which is why the delete beside it has the same line
  assert(/dup\.onpointerdown=\(e\)=>e\.stopPropagation\(\);/.test(rn),
    'the press is stopped, or the header drag eats the click');
  assert(/dup\.onclick=\(e\)=>\{ e\.stopPropagation\(\); pushUndoSnapshot\(\); _lgDupNode\(n\.id\); \};/.test(rn),
    'one undo snapshot per gesture (build 1163), then the duplicate');
  assert(rn.indexOf('dup.onclick') < rn.indexOf('del.onclick'),
    'and it sits before the delete, so the destructive control stays at the end');
}

/* ---- declaration order ------------------------------------------------------------------------------ */
// The offset is read by the function; `typeof` does not guard a temporal dead zone and this file has lost
// six things to that ordering (1127, 1331, 1350, 1383, 1411, 1447).
assert(src.indexOf('const LG_DUP_OFF') < src.indexOf('function _lgDupNode'),
  'the offset is declared above the function that reads it');
assert(src.indexOf('function _lgNewId') < src.indexOf('function _lgDupNode'),
  '...as is the id minter');

/* ---- and it does not disturb what was there --------------------------------------------------------- */
{
  const del = extractFunction('_lgDelNode', src);
  assert(/logicGraph\.wires=logicGraph\.wires\.filter\(w=>w\.a!==id && w\.b!==id\);/.test(del),
    'delete still takes a node’s wires with it');
  eq((src.match(/_lgDupNode\(/g) || []).length, 2, 'duplicated from exactly one place, plus its definition');
}

done('build 1453: a graph node duplicates from its own header — every parameter deep-copied so ten copies ' +
     'are ten independent nodes, offset so the copy is visibly its own, and deliberately unwired, because ' +
     'copying a node’s wires fans one signal into two places and fires every downstream verb twice');
