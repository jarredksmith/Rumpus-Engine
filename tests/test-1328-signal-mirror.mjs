import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1328 — reported: "If signals are created for a prop in the editor panel, make it show as nodes in
// the signal node modal."
//
// Two authoring systems that had never met. A SIGNAL is `{when, do, target}` on a prop — the simple path,
// and the one most levels are actually wired with. The GRAPH is nodes and wires. Open the graph on a level
// built entirely out of signals and it said "no nodes yet", which is false: the level is full of logic.
//
// Measured live (tools/probe/signal-mirror.mjs) on three props carrying five signals between them:
//   graph nodes 0, signals 5   ->  5 cards on the board, each reading its own when / prop / verb / target
//   still a VIEW: logicGraph.nodes 0, serialized graph nodes 0, [data-node] 0, trace painter blind to them
//   column at x 150 against the leftmost real node at 400, stacked 20/92/164/236/308
//   clicking one: board closed, "vault door" selected, mode build / target props
//   removing every signal -> 0 cards;  400 signals on one prop -> capped at 60

// ---------------------------------------------------------------- the mirror reads the props
{
  const m = extractFunction('_lgSigMirror');
  assert(/const sg = o\.userData\.signals;/.test(m), 'it reads the props’ own signals…');
  assert(/if\(!Array\.isArray\(sg\) \|\| !sg\.length\) continue;/.test(m), '…skipping props that carry none');
  assert(/if\(out\.length >= SIG_MIRROR_MAX\) return out;/.test(m), 'and it is capped');
  assert(/const SIG_MIRROR_MAX = 60;/.test(src), 'at 60 — "past this the panel is a wall, not a view"');
  // executed
  const rig = new Function('propModels', 'SIG_MIRROR_MAX', extractFunction('_lgSigMirror') + '; return _lgSigMirror;');
  const P = (sig) => ({ userData: sig ? { signals: sig } : {} });
  eq(rig([], 60)().length, 0, 'no props -> nothing');
  eq(rig([P(null), P(null)], 60)().length, 0, 'props with no signals -> nothing');
  eq(rig([P([{when:'a'},{when:'b'}]), P([{when:'c'}])], 60)().length, 3, 'one card per SIGNAL, not per prop');
  const many = []; for (let i = 0; i < 400; i++) many.push({ when: 'destroyed' });
  eq(rig([P(many)], 60)().length, 60, 'and 400 on one prop is capped at 60');
  eq(rig([P([null, {when:'x'}])], 60)().length, 1, 'a hole in the array is skipped');
}

// ---------------------------------------------------------------- it is a VIEW, and that is the point
{
  const r = extractFunction('_lgRenderSigMirror');
  assert(/el\.dataset\.signode = String\(k\);/.test(r), 'the cards are [data-signode]…');
  assert(!/dataset\.node/.test(r), '…never [data-node]');
  // the two things that would break if that were not true
  assert(/_lgBoard\.querySelectorAll\('\[data-node\]'\)/.test(extractFunction('_lgTracePaint')),
    'build 1318’s trace painter walks [data-node] only, so it cannot pulse a signal card');
  assert(/_lgBoard\.querySelectorAll\('\[data-signode\]'\)\.forEach\(e=>e\.remove\(\)\)/.test(r),
    'and the mirror clears its own cards, so a re-render cannot double them');
  // nothing about the graph's own data may change
  const lr = extractFunction('_lgRender');
  assert(/if\(typeof _lgRenderSigMirror==='function'\) _lgRenderSigMirror\(\);/.test(lr), 'rendered with the board…');
  assert(!/logicGraph\.nodes\.push/.test(r), '…without ever adding to logicGraph.nodes');
  assert(/Turning signals into real graph nodes would change what the level DOES/.test(src),
    'with the reason it is a view: the two systems fire at different times through different code');
  assert(/would silently rewrite every level that opens the board/.test(src), '...and the cost of getting that wrong');
}

// ---------------------------------------------------------------- the column keeps out of the way
{
  const cx = extractFunction('_lgSigColumnX');
  assert(/for\(const n of \(logicGraph\.nodes\|\|\[\]\)\) if\(\+n\.x < minX\) minX = \+n\.x;/.test(cx),
    'it sits left of whatever the graph already occupies…');
  assert(/if\(!isFinite\(minX\)\) minX = 120;/.test(cx), '…and an EMPTY graph does not put it at -Infinity');
  const rig = new Function('logicGraph', extractFunction('_lgSigColumnX') + '; return _lgSigColumnX;');
  eq(rig({ nodes: [] })(), -130, 'empty graph -> a fixed origin');
  eq(rig({ nodes: [{x:400},{x:900}] })(), 150, 'and otherwise 250 left of the leftmost node');
  eq(rig({ nodes: [{x:-500}] })(), -750, '...including when the graph is in negative space');
}

// ---------------------------------------------------------------- clicking one is honest
{
  const g = extractFunction('_lgSigGoto');
  assert(/if\(typeof _lgClose==='function'\) _lgClose\(\);/.test(g), 'it closes the board…');
  assert(/selProps = \[o\]; editorActive='props';/.test(g), '…selects the prop that owns the signal…');
  assert(/setEditorMode\('build', true\)/.test(g), '…switches to the tab where signals are edited…');
  assert(/_edFrameSelected\(\)/.test(g), '…and frames it, so a prop off screen is not "nothing happened"');
  const r = extractFunction('_lgRenderSigMirror');
  assert(/prop signal — click to edit on the prop/.test(r), 'and the card says so on its face');
  assert(/A card that looked editable here and was not would be worse than/.test(src),
    'with the reason there is no edit affordance on the card itself');
}

// ---------------------------------------------------------------- level data is level data (build 1325)
{
  const r = extractFunction('_lgRenderSigMirror');
  assert(!/innerHTML/.test(r), 'nothing on a card is built with innerHTML…');
  for (const bit of ['ti.textContent', 'who.textContent', 'act.textContent'])
    assert(r.indexOf(bit) > 0, '…every field is textContent: ' + bit);
  assert(/a prop name and a target tag are level data \(build 1325\)/.test(r), 'with 1325’s rule cited');
  assert(/String\(it\.s\.target\)\.slice\(0,24\)/.test(r), 'and the target is length-capped for the card');
  assert(/String\(u\.name \|\| u\.tag \|\| u\.src \|\| 'prop'\)\.slice\(0, 22\)/.test(extractFunction('_lgSigName')),
    'as is the prop’s own label, which falls back through name -> tag -> src');
}

done('build 1328 (reported): the logic board shows the level’s prop signals. Signals and the graph were two authoring systems that had never met — a level wired entirely with prop signals opened the graph and was told "no nodes yet", which is false. Each signal now draws a card on the board reading its trigger, its prop, its verb and its target. They are deliberately a VIEW and not graph nodes: they are drawn [data-signode] and never [data-node], so build 1318’s trace painter and the wire renderer cannot see them, and nothing is added to logicGraph.nodes — turning signals into real nodes would change what the level DOES, because the two systems fire at different times through different code, and would silently rewrite every level that opened the board. The column sits 250px left of the leftmost real node (and at a fixed origin when the graph is empty), the cards are capped at 60, every field is textContent per build 1325, and clicking one closes the board and selects and frames the prop that owns the signal — the only honest action a card can offer, since the signal is edited on the prop. Measured live: 3 props with 5 signals gave 5 cards with the graph still empty and unserialized, the column at x 150 against a leftmost node at 400, a click landing on "vault door" in Build/props, 0 cards once the signals were removed, and 400 signals on one prop capped at 60');
