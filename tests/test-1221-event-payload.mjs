// build 1221: logic events finally carry a payload — position and HP, exposed as #-tokens.
//
// The editor/feature critic's ceiling: onkill/onhurt/onspot fired BARE — no identity, no position, no HP —
// so "drop loot where the enemy died", "the boss at half health switches phase", "the turret nearest the
// intruder powers on" were all inexpressible. Enemy events now carry a context (_lgCtx) exposed as reserved
// tokens _lgNum resolves — #x/#z (world position), #hp, #hpf (HP fraction 0..1) — readable by Branch, Math,
// Set variable, and the place field via '#here'. It rides the immediate pulse cascade and unwinds after
// (a Delay schedules a later timer with no context — the payload is a snapshot of the moment).
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- _lgNum resolves #-tokens from _lgCtx
{
  const api = new Function(
    'let _lgCtx = {}; let logicVars = { score: 7, "#i": 3 };\n' +
    extractFunction('_lgNum') +
    '\nreturn { num:_lgNum, setCtx:(c)=>{ _lgCtx = c; }, setVar:(k,v)=>{ logicVars[k]=v; } };')();

  eq(api.num('5'), 5, 'a literal number is itself');
  eq(api.num('score'), 7, 'a plain variable resolves from logicVars');
  eq(api.num('#x'), 0, 'an event token with no event context reads 0 (never NaN, never crashes)');
  api.setCtx({ x: 12.5, z: -4, hp: 30, hpf: 0.5 });
  eq(api.num('#x'), 12.5, 'inside an event, #x is the event position');
  eq(api.num('#z'), -4, '#z too');
  eq(api.num('#hpf'), 0.5, '#hpf is the HP fraction');
  // the crux for not breaking the repeat loop: an unknown #-token falls through to logicVars
  eq(api.num('#i'), 3, '#i (the repeat loop counter, a real variable) still resolves — the token handler falls through to logicVars when the context has no such key');
}

// ---------------------------------------------------------------- _lgEnemyEvent sets + unwinds the context
{
  const fired = [];
  const api = new Function('fired',
    'let _lgCtx = {}; const NET = { mode: "host" };\n' +
    'const logicGraph = { nodes: [{ id: "n", type: "onkill" }] };\n' +
    'function _lgFireEvents(kind){ fired.push({ kind, ctx: Object.assign({}, _lgCtx) }); }\n' +
    extractFunction('_lgEnemyEvent') +
    '\nreturn { ev:_lgEnemyEvent, ctxAfter:()=>_lgCtx };')(fired);

  api.ev('onkill', { x: 3, z: 9, hp: 0, hpf: 0 });
  eq(fired.length, 1, 'the event fired');
  eq(fired[0].ctx.x, 3, 'the fire saw the payload in _lgCtx');
  eq(Object.keys(api.ctxAfter()).length, 0, '...and _lgCtx unwound to empty after the cascade (no leak into later timers)');
}

// ---------------------------------------------------------------- #here resolves to the event position
{
  const api = new Function(
    'let _lgCtx = {}; const player = { pos: { x: 0, y: 2, z: 0 } }; const EYE = 1.6;\n' +
    'function terrainHeightAt(x, z){ return 1; }\n const triggerZones = []; const propModels = [];\n' +
    extractFunction('_lgPlaceAt') +
    '\nreturn { at:_lgPlaceAt, setCtx:(c)=>{ _lgCtx = c; } };')();

  eq(api.at('#here'), null, "'#here' outside an event returns null — never a spawn at (0,0)");
  api.setCtx({ x: 20, z: -8 });
  const here = api.at('#here');
  assert(here && here.x === 20 && here.z === -8, "'#here' inside an event resolves to the event position");
  eq(here.y, 1, '...at the terrain height there');
}

// ---------------------------------------------------------------- the wiring: all three enemy events carry it
{
  assert(/_lgEnemyEvent\('onhurt', \{ x:en\.mesh\.position\.x, z:en\.mesh\.position\.z, hp:en\.hp, hpf:en\.hp\/\(en\.maxHp\|\|en\.hp\|\|1\) \}\)/.test(src),
    'onhurt carries the enemy position + HP (the boss-phase hook)');
  assert(/_lgEnemyEvent\('onspot', \{ x:en\.mesh\.position\.x, z:en\.mesh\.position\.z, hp:en\.hp, hpf:/.test(src),
    'onspot carries it too (the alerted-position hook)');
  assert(/_lgCtx=\{ x:en\.mesh\.position\.x, z:en\.mesh\.position\.z, hp:0, hpf:0 \}; try\{ _lgFireEvents\('onkill',''\); \} finally \{ _lgCtx=_pv; \}/.test(src),
    'onkill sets the death position around its _lgFireEvents call and restores after (the drop-loot-where-it-died hook)');
  assert(/for\(const t of \['#x','#z','#hp','#hpf'\]\) set\.add\(t\);/.test(src),
    'the four payload tokens are offered in the variable autocomplete');
  assert(/\{ v:'#here', l:'where the event fired \(onkill\/onhurt\/onspot\)' \}/.test(src),
    "'#here' is offered in the place autocomplete");
}

done('build 1221: logic events carry a payload — _lgNum executed resolving #x/#z/#hp/#hpf from the event context while #i still falls through to a normal variable, _lgEnemyEvent proven to set AND unwind the context around its fire, #here resolving to the event position (null outside an event), and all three enemy events wired to carry the enemy position + HP; the per-actor authoring ceiling is lifted for enemy events');
