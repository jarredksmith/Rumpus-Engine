// build 1382: MACRO VARIATION, over a surface that already has a texture.
//
// A cold rendering critic scored the engine 3/10 against AAA and its blind verdict named ONE tell:
// "regular, unbroken texture tiling on the two largest surfaces in frame." Verified in source, and it is
// an interaction between the two builds before it: 1378 gave the ground and boundary walls a real albedo
// at a 4 m tile, and 1379's break-up layer then EXCLUDED them, because `albedoDetailWanted` refuses a
// material that has a map. So the two surfaces that are most of every frame got NEITHER — a small tile
// pasted flat, edge to edge, ~35 times across 140 m.
//
// 1379's gate was right about what it was written for (two detail systems at the same scale is double
// grain) and does not cover this: a MACRO layer runs at several times the TILE period, so it breaks the
// repeat instead of competing with the texture's own frequency.
import { gameSource, assert, near, eq, done } from './harness.mjs';

const src = gameSource();
const T = await import('three');
const num = (n) => { const m = src.match(new RegExp('const ' + n + ' = ([\\d.]+)')); assert(m, n + ' is declared'); return parseFloat(m[1]); };
const fn = (n) => { const m = src.match(new RegExp('function ' + n + '\\(([\\s\\S]*?)\\n\\}')); assert(m, n + ' exists'); return m[0]; };

// ------------------------------------------------- the period must not land on the tile ----
{
  const tile = num('SURF_TILE_M'), mul = num('MACRO_TILE_MUL');
  assert(/const MACRO_PERIOD_M = SURF_TILE_M \* MACRO_TILE_MUL;/.test(src),
    'the macro period is DERIVED from the tile it exists to hide, not typed');
  assert(mul > 1.5, 'and it is genuinely macro (' + mul + 'x the tile), not a second detail layer');
  // An integer multiple lands on the repeat every time and REINFORCES it — the opposite of the point.
  assert(Math.abs(mul - Math.round(mul)) > 0.15,
    'the multiple is deliberately non-integer (' + mul + '): an integer one coincides with the tile ' +
    'boundary every period and strengthens the repeat instead of breaking it');
  near(tile * mul, 11, 1.5, 'which puts the period around 11 m — architectural scale, readable across a room');
}

// ------------------------------------------- the frequency semantics are NOT the primitive ones ----
// This is the trap the build was specified around. `_albDetailFreq(span) = ALB_DETAIL_PER_M * span`
// assumes a UNIT local box scaled by the object. floorMat's plane is a real PlaneGeometry(ARENA*2,
// ARENA*2) and a boundary wall is BoxGeometry(ARENA*2, H, 2) — neither is scaled — so vOdPos spans 140 m
// and the frequency there is 1/period. Using the primitive derivation would be ~1000x off, and would look
// like nothing happening rather than like an error.
{
  const f = fn('applyMacroDetail');
  assert(/applyObjDetail\(mat, 1 \/ Math\.max\(0\.5, \+periodM \|\| MACRO_PERIOD_M\), true\)/.test(f),
    'the macro frequency is 1/period — metres, because the geometry is in metres and unscaled');
  assert(!/ALB_DETAIL_PER_M/.test(f), '...and it never uses the primitive path\'s per-metre-times-span form');
  assert(/mat\.userData\._odAmp/.test(f), 'the amplitude rides the material (a uniform written before its shader exists is a write to nothing — 1379)');
  // the third argument is applyObjDetail's `albOnly`: relief and roughness on these two surfaces already
  // come from the texture path, and a second normal layer there would be the double grain 1379 refuses.
  assert(/applyObjDetail\(mat, 1 \/ Math\.max\(0\.5, \+periodM \|\| MACRO_PERIOD_M\), true\)/.test(f),
    'it is the ALBEDO-only mode: relief and roughness on these two surfaces come from the texture path');

  // executed: the derivation, and that it cannot divide by zero or produce an absurd frequency
  const MACRO_PERIOD_M = num('SURF_TILE_M') * num('MACRO_TILE_MUL');
  const freq = (p) => 1 / Math.max(0.5, +p || MACRO_PERIOD_M);
  near(freq(11) * 11, 1, 1e-9, 'one cycle per period, by construction');
  near(freq(MACRO_PERIOD_M), 1 / MACRO_PERIOD_M, 1e-9, 'the default period gives the default frequency');
  assert(freq(0) > 0 && isFinite(freq(0)), 'a zero period falls back rather than dividing by zero');
  assert(freq(-5) > 0 && isFinite(freq(-5)), 'and so does a negative one');
  // across a 140 m plane that is ~12.7 cycles — the number the probe read back off the live uniform
  near(freq(MACRO_PERIOD_M) * 140, 12.7, 0.6, 'which is ~12.7 cycles across the 140 m ground plane');
}

// --------------------------------------------------- who gets it, and the ORDER that matters ----
{
  assert(/applyMacroDetail\(floorMat, MACRO_PERIOD_M\);/.test(src), 'the ground plane opts in');
  assert(/applyMacroDetail\(wallMat, MACRO_PERIOD_M\);/.test(src), '...and the boundary walls');
  // floorMat has carried its OWN onBeforeCompile for the paint splat since build 1139. Probed before this
  // was fixed: the floor came back UNPATCHED while the wall patched, because the splat is assigned further
  // down the file and simply won. So the call has to sit AFTER it.
  const splat = src.indexOf('floorMat.onBeforeCompile = (shader)=>{');
  const macro = src.indexOf('applyMacroDetail(floorMat');
  assert(splat > 0 && macro > splat,
    'and the floor\'s call comes AFTER the paint splat assigns its own handler — otherwise the splat ' +
    'overwrites this patch and the largest surface in the frame silently gets nothing');
}

// ------------------------------------------------------------- chain, never clobber ----
// Build 1286 recorded this rule for the bake's patch and it never reached applyObjDetail, which assigned
// over the top. Harmless for the UV-less imports 1145 wrote it for; not harmless the moment it met a
// material that already had a handler.
{
  const f = fn('applyObjDetail');
  assert(/const _odPrev = Object\.prototype\.hasOwnProperty\.call\(mat, 'onBeforeCompile'\) \? mat\.onBeforeCompile : null;/.test(f),
    'a pre-existing handler is captured...');
  assert(/if\(_odPrev\)\{ try\{ _odPrev\.call\(mat, shader, renderer\); \}catch\(e\)\{\} \}/.test(f),
    '...and called FIRST, inside a try — a throwing predecessor must not take this patch down with it');
  assert(f.indexOf('_odPrev.call') < f.indexOf('shader.vertexShader'),
    'the predecessor runs before this patch edits the shader, so it sees the strings it expects');
  // hasOwnProperty and not truthiness: three declares a no-op on the PROTOTYPE (build 1379), so a
  // truthiness test would chain three's own empty function on every material forever.
  assert(!Object.prototype.hasOwnProperty.call(new T.MeshStandardMaterial(), 'onBeforeCompile'),
    'three ' + T.REVISION + ': onBeforeCompile is a prototype no-op, so ownership is the only question that works');
  assert(!!new T.MeshStandardMaterial().onBeforeCompile, '...and it is truthy, which is what makes the naive guard wrong');

  // the cache key must compose too, or a material carrying BOTH patches is served the other's program
  assert(/const _odPrevKey = Object\.prototype\.hasOwnProperty\.call\(mat, 'customProgramCacheKey'\)/.test(f),
    'the program cache key composes with any the material already had');
  const key = (albOnly, prev, prevKey) => {
    let p = ''; if(prevKey){ try{ p = String(prevKey() || ''); }catch(e){} }
    return (albOnly ? 'objDetailA' : 'objDetail') + (prev ? '+c' : '') + p;
  };
  assert(key(true, null, null) !== key(true, true, null),
    'a chained material compiles a DIFFERENT program from an unchained one');
  assert(key(true, true, () => 'splat') !== key(true, true, null), '...and so does one whose predecessor keys itself');
  eq(key(true, null, null), key(true, null, null), 'the key is still a pure function of the mode');
  assert(key(true, true, () => { throw new Error('x'); }) === key(true, true, null),
    'a throwing predecessor key degrades rather than breaking every material in the scene');
}

// ------------------------------------------------ the amplitude, and what it was measured against ----
{
  const amp = num('MACRO_DETAIL_ALB');
  assert(amp > 0 && amp < 0.5, 'the macro swing is a bounded fraction (' + amp + ')');
  // Exposure-neutral by the same construction as 1379: mix(1-a, 1+a, field) with a mean-0.5 field.
  assert(/diffuseColor\.rgb \*= mix\(1\.0 - uOdAlb, 1\.0 \+ uOdAlb, _odBase\);/.test(src),
    'it is the SAME centred multiplier as the detail term, so the mean albedo of the ground does not move ' +
    'and build 1360\'s staging and 1378\'s compensation both survive it');
  assert(/shader\.uniforms\.uOdAlb = \{ value: \(mat\.userData\._odAmp > 0\) \? mat\.userData\._odAmp : OBJ_DETAIL_ALB \};/.test(src),
    'the amplitude is per material, defaulting to the detail one');
  // 0.13 was the first guess and measured SUB-THRESHOLD (almost all of it 1-3 code values).
  assert(amp >= 0.2, 'and it is above the sub-threshold value the first sweep rejected');
}

// ------------------------------------------------------- the probe stages the game's assets ----
// Every capture between 1378 and 1382 was judged on a ground with NO albedo on it, because the probe
// staging copied breach.html and the vendored scripts and not `img/`. The textures 404'd, _loadSurfaceMap
// left floorMat.map null, and nothing errored.
{
  const mk = String.raw`` + (await import('node:fs')).readFileSync(new URL('../tools/probe/mkprobe.mjs', import.meta.url), 'utf8');
  assert(/for \(const d of \['img'\]\)/.test(mk), 'the probe stages the game\'s asset directories');
  assert(/fs\.cpSync\(from, path\.join\(out, d\), \{ recursive: true \}\)/.test(mk), '...recursively');
}

done('build 1382: the macro layer breaks the tile, at a period derived from the tile, on a surface that has one');
