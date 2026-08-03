import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1331 — reported from play, WITH A STACK (which is what build 1330 was for):
//
//   ERROR: Promise: Cannot access 'FX_PRESETS' before initialization
//     at buildFxEmitter (breach.html:21506)
//     at Object.fx_dust (breach.html:13982)      <- PRIMITIVE_BUILDERS.fx_dust
//     at spawnProp     (breach.html:17947)
//     at loadHostedProps (breach.html:18027)
//
// `loadHostedProps()` is called BARE AT MODULE LEVEL and builds the saved level's props during boot. In the
// build that produced that stack, FX_PRESETS was declared ~3,400 lines BELOW it, so a saved level
// containing a single ambient emitter threw partway through the level load. Everything lives inside
// `window.GAME_START`, so the throw surfaced as an unhandled REJECTION — which is why it arrived with no
// line number until 1330 made the overlay keep the stack.
//
// Build 889 recorded this exact class four lines above the fix ("A saved level with track pieces builds
// them at boot (loadHostedProps) BEFORE worldCfg initializes, which crashed the whole boot") and patched it
// with a try/catch — right there, because the style re-applies moments later. NOT right here: an emitter
// with no preset is a thrown exception mid-load, and swallowing it strands every later prop silently.
//
// The durable guarantee is ORDER, so that is what this pins.

// ---------------------------------------------------------------- the ordering the stack demanded
{
  const at = (t) => { const i = src.indexOf(t); assert(i >= 0, 'present: ' + t); return i; };
  const fx      = at('const FX_PRESETS = {');
  const prims   = at('const PRIMITIVE_BUILDERS = {');
  const spawn   = at('function spawnProp');
  const loader  = at('function loadHostedProps');
  const call    = at('\nloadHostedProps();');
  assert(fx < prims, 'FX_PRESETS is declared BEFORE the builder table that reads it…');
  assert(prims < spawn, '…which is before spawnProp…');
  assert(spawn < loader, '…which is before loadHostedProps…');
  assert(fx < call, '…and all of it before the bare module-level loadHostedProps() call that runs at boot');
  // the call really is unconditional module-level work, which is what makes the order load-bearing
  assert(/\nloadHostedProps\(\);/.test(src),
    'loadHostedProps() is called at module level — not from a function someone might not reach');
}

// ---------------------------------------------------------------- the table is pure data, so moving it is free
{
  const i = src.indexOf('const FX_PRESETS = {');
  const j = src.indexOf('\n};\n', i);
  const body = src.slice(i, j);
  eq((body.match(/\bfx_[a-z]+:/g) || []).length, 6, 'six presets');
  // a data literal with no identifiers of its own cannot depend on anything declared later
  const idents = body.replace(/'[^']*'/g, '').match(/\b[A-Za-z_$][A-Za-z0-9_$]*\b(?!\s*:)/g) || [];
  const bad = idents.filter(w => !/^(const|FX_PRESETS|true|false|null)$/.test(w));
  eq(bad.length, 0, 'and it reads NO other binding, so it can sit anywhere: ' + bad.slice(0, 5).join(','));
}

// ---------------------------------------------------------------- buildFxEmitter needs nothing else
{
  const i = src.indexOf('function buildFxEmitter');
  const body = src.slice(i, src.indexOf('\n}\n', i));
  assert(/FX_PRESETS\[kind\] \|\| FX_PRESETS\.fx_ember/.test(body), 'it reads FX_PRESETS…');
  // if it read another late const, moving FX_PRESETS alone would have fixed only the first throw
  for (const late of ['_fxEff(', '_fxCfgSan(', '_getFireMat(', 'worldCfg'])
    assert(body.indexOf(late) < 0, '…and NOT ' + late + ', which is why moving one table is the whole fix');
  assert(/the runtime build happens later|_fxBuildRT/.test(src), 'the particle runtime is built later, not at spawn');
}

// ---------------------------------------------------------------- the rule, so the next table lands right
{
  assert(/anything a PRIMITIVE_BUILDERS entry reads must be declared above this\n\/\/ table/.test(src),
    'the rule is stated where the next person will add a builder');
  assert(/`loadHostedProps` can call any of them before most of the file has run/.test(src),
    '...with the reason: boot can call any builder before most of the file has run');
  assert(/It is NOT right here: an emitter with no preset is not a degraded emitter/.test(src),
    'and why this one is not a try/catch, unlike build 889’s');
  // the old home leaves a signpost rather than a hole
  assert(/build 1331: FX_PRESETS moved UP, above PRIMITIVE_BUILDERS/.test(src),
    'the old location says where it went');
}

done('build 1331 (reported from play, with the stack build 1330 exists to produce): a saved level containing a single ambient emitter failed to load. `loadHostedProps()` is called bare at module level and builds the saved level\'s props during boot, and FX_PRESETS was declared thousands of lines below it — so PRIMITIVE_BUILDERS.fx_dust -> buildFxEmitter hit a temporal dead zone partway through the level load. Because the whole engine lives inside window.GAME_START, the throw surfaced as an unhandled REJECTION, which is exactly why it arrived with no line number of its own. Build 889 recorded this same class at boot (track pieces vs worldCfg) and patched it with a try/catch, which was right there because the style re-applies moments later; it is wrong here, because an emitter with no preset is a thrown exception mid-load that would strand every later prop silently. FX_PRESETS is pure data reading no other binding — asserted here — so it simply moves above PRIMITIVE_BUILDERS, and buildFxEmitter is asserted to read nothing else late, which is what makes moving one table the whole fix. The durable guarantee is the ORDER, pinned: FX_PRESETS before the builder table, before spawnProp, before loadHostedProps, before the module-level call that runs at boot');
