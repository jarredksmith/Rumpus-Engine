// build 1169: the logic graph gains arithmetic and its first world-state query.
//
// The feature audit's two CRITICAL logic walls, cheapest first: (1) no arithmetic beyond add — "score × 2",
// a health percentage, any computed value was inexpressible; (2) no world-state READS — the graph could not
// ask a single question about the game (HP, ammo, score, wave, enemy count, time), only react to edges.
// Two nodes close both: Math (var = A op B, where A/B are literals or variable names, same resolution rule
// as Branch) and Read game stat (host state → a variable, pulse-driven like every state node).
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- executed: the math node
{
  // drive the real pulse switch with a minimal graph runtime
  const build = (nodes) => {
    const logicVars = {};
    const graph = { nodes, wires: [] };
    const pulse = new Function('logicGraph', 'logicVars', '_lgState', '_lgTimers', 'WEAPONS', 'curWep', 'player', 'score', 'credits', 'wave', 'enemies', '_lgRunT', 'performance',
      'let _lgBudget=0, _lgWarned=false;\n' +
      'const _lgNode=(id)=>logicGraph.nodes.find(n=>n.id===id);\n' +
      'const _lgFollow=()=>{};\n' +
      extractFunction('_lgVarKey') + '\n' + extractFunction('_lgNum') + '\n' + extractFunction('_lgPulse') + '\nreturn _lgPulse;'   /* build 1231 */
    )(graph, logicVars, {}, [], { rifle: { mag: 17, reserve: 51 } }, 'rifle',
      { hp: 73.4, maxHp: 100 }, 990, 250, 4,
      [{ hp: 5 }, { hp: 0 }, null, { hp: 12 }], 5000, { now: () => 12000 });
    return { pulse, vars: logicVars };
  };
  const mathNode = (id, name, a, op, b) => ({ id, type: 'math', p: { name, a, op, b } });

  { // every operator
    const { pulse, vars } = build([
      mathNode('n1', 'x', '7', '+', '3'), mathNode('n2', 'x2', '7', '-', '3'),
      mathNode('n3', 'x3', '7', '×', '3'), mathNode('n4', 'x4', '7', '÷', '2'),
      mathNode('n5', 'x5', '7', 'min', '3'), mathNode('n6', 'x6', '7', 'max', '3'),
      mathNode('n7', 'x7', '7', 'mod', '3'),
    ]);
    for (const id of ['n1','n2','n3','n4','n5','n6','n7']) pulse(id, 'in');
    eq(vars.x, 10, '7+3'); eq(vars.x2, 4, '7-3'); eq(vars.x3, 21, '7×3'); near(vars.x4, 3.5, 1e-9, '7÷2');
    eq(vars.x5, 3, 'min'); eq(vars.x6, 7, 'max'); eq(vars.x7, 1, 'mod');
  }
  { // variables as operands — the same resolution Branch uses
    const { pulse, vars } = build([
      mathNode('a', 'coins', '4', '+', '0'),
      mathNode('b', 'coins', 'coins', '×', '2'),
      mathNode('c', 'pct', 'coins', '÷', 'coins'),
    ]);
    pulse('a', 'in'); pulse('b', 'in');
    eq(vars.coins, 8, 'coins = coins × 2 — self-referencing arithmetic finally works');
    pulse('c', 'in'); eq(vars.pct, 1, 'both operands can be variables');
  }
  { // the poison guards
    const { pulse, vars } = build([
      mathNode('d', 'z', '5', '÷', '0'), mathNode('m', 'z2', '5', 'mod', '0'),
      mathNode('n', 'z3', '-7', 'mod', '3'),
    ]);
    pulse('d', 'in'); eq(vars.z, 0, '÷0 yields 0, never NaN — one NaN silently poisons every later compare');
    pulse('m', 'in'); eq(vars.z2, 0, 'mod 0 the same');
    pulse('n', 'in'); eq(vars.z3, 2, 'modulo is positive (-7 mod 3 = 2), the counting kind creators expect');
  }
  // ---------------------------------------------------------------- executed: the read node
  {
    const { pulse, vars } = build([
      { id: 'r1', type: 'read', p: { stat: 'hp', name: 'php' } },
      { id: 'r2', type: 'read', p: { stat: 'ammo', name: 'mag' } },
      { id: 'r3', type: 'read', p: { stat: 'enemies', name: 'foes' } },
      { id: 'r4', type: 'read', p: { stat: 'time', name: 't' } },
      { id: 'r5', type: 'read', p: { stat: 'score', name: 'sc' } },
      { id: 'r6', type: 'read', p: { stat: 'wave', name: 'wv' } },
      { id: 'r7', type: 'read', p: { stat: 'credits', name: 'cr' } },
      { id: 'r8', type: 'read', p: { stat: 'reserve', name: 'rsv' } },
      { id: 'r9', type: 'read', p: { stat: 'maxhp', name: 'mh' } },
    ]);
    for (let i = 1; i <= 9; i++) pulse('r' + i, 'in');
    eq(vars.php, 73, 'player HP reads (rounded — HUD numbers, not float dust)');
    eq(vars.mag, 17, 'current weapon mag'); eq(vars.rsv, 51, 'reserve');
    eq(vars.foes, 2, 'enemies alive counts hp>0 only, skipping holes');
    eq(vars.t, 7, 'seconds since the logic run started');
    eq(vars.sc, 990, 'score'); eq(vars.wv, 4, 'wave'); eq(vars.cr, 250, 'credits'); eq(vars.mh, 100, 'max HP');
  }
}

// ---------------------------------------------------------------- the palette and plumbing
{
  assert(/math:\s*\{ t:'Math',\s*cat:'st'/.test(src), 'Math is in the STATE palette');
  assert(/read:\s*\{ t:'Read game stat',\s*cat:'st'/.test(src), '...and Read game stat beside it');
  assert(/sel:\['\+','-','\\u00d7','\\u00f7','min','max','mod'\]/.test(src) || /sel:\['\+','-','×','÷','min','max','mod'\]/.test(src),
    'the operator set is + − × ÷ min max mod');
  assert(/\['enemies','Enemies alive'\]/.test(src) && /\['time','Seconds elapsed'\]/.test(src),
    'the stat list includes the systemic ones (enemy count, elapsed time)');
  assert(/n\.type==='setvar'\|\|n\.type==='addvar'\|\|n\.type==='math'\|\|n\.type==='read'/.test(src),
    'variable-name autocomplete learns both new nodes');
  assert(/_lgRunT = performance\.now\(\);/.test(src), 'the time stat zeroes at each logic run start');
}

done('build 1169: the logic graph gains Math (var = A op B with ÷0→0 and positive modulo, operands resolving as variables like Branch) and Read game stat (HP/maxHP/ammo/reserve/score/credits/wave/enemies-alive/elapsed → variable) — arithmetic and the first world-state query, the audit\'s two cheapest CRITICAL walls');
