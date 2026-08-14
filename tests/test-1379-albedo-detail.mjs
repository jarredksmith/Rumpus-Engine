// build 1379: THE PROPS STOP BEING ONE FLAT COLOUR.
//
// Build 1139 built the procedural detail set and deliberately left ALBEDO out of it, with a reason that is
// exactly right about textures: "an albedo map cannot be exposure-neutral. It multiplies the material
// colour, so it only darkens — neutrality would need values above 255." Every word of that is true of a
// MAP. None of it is true of a shader term, which has no 8-bit ceiling: a multiplier centred on 1.0 can go
// above 1.0, so the mean albedo — the quantity every level's lighting was tuned against — does not move.
//
// That is what lets this be RETROFITTED onto colours creators already chose, which is the whole reason
// 1139 declined to do it. The neutrality is not asserted here, it is MEASURED: the noise field is ported
// out of the shipped GLSL and integrated, and the multiplier's mean is checked against 1.0.
import { gameSource, assert, near, eq, done } from './harness.mjs';

const src = gameSource();
const fn = (name) => { const m = src.match(new RegExp('function ' + name + '\\(([\\s\\S]*?)\\n\\}')); assert(m, name + ' exists'); return m[0]; };
const num = (name) => { const m = src.match(new RegExp('const ' + name + ' = ([\\d.]+)')); assert(m, name + ' is declared'); return parseFloat(m[1]); };

const ALB = num('OBJ_DETAIL_ALB');
const PER_M = num('ALB_DETAIL_PER_M');
assert(ALB > 0 && ALB < 0.5, 'the albedo swing is a modest fraction (' + ALB + ') — albedo variation reads far more strongly than roughness');

// ------------------------------------------------------------ EXPOSURE NEUTRALITY, MEASURED ----
// The field is ported from the string the engine actually ships, so a retune of the noise cannot pass here
// by being described differently in the test. GLSL fract() is x - floor(x), which is NOT JS %.
{
  const glsl = src.match(/const _OBJ_NOISE_GLSL = \[([\s\S]*?)\]\.join\('\\n'\);/);
  assert(glsl, 'the noise field is a shipped string');
  const g = glsl[1];
  assert(/_odHash/.test(g) && /_odNoise/.test(g) && /_odField/.test(g), 'hash -> noise -> field, all three present');
  assert(/_odNoise\(p\)\*0\.65 \+ _odNoise\(p\*3\.1\)\*0\.35/.test(g), 'the field is the two-octave sum this port reproduces');

  const fract = (x) => x - Math.floor(x);
  const hash = (x, y, z) => {
    let px = fract(x * 0.3183099 + 0.71), py = fract(y * 0.3183099 + 0.113), pz = fract(z * 0.3183099 + 0.419);
    px *= 17; py *= 17; pz *= 17;
    return fract(px * py * pz * (px + py + pz));
  };
  const noise = (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const mix = (a, b, t) => a + (b - a) * t;
    return mix(
      mix(mix(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx), mix(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx), fy),
      mix(mix(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx), mix(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx), fy),
      fz);
  };
  const field = (x, y, z) => noise(x, y, z) * 0.65 + noise(x * 3.1, y * 3.1, z * 3.1) * 0.35;

  // Integrate over a large, irrationally-strided lattice so the samples do not land on the noise's own
  // period. This is the number the whole design rests on.
  let sum = 0, lo = 1e9, hi = -1e9, n = 0;
  for(let i = 0; i < 60; i++) for(let j = 0; j < 60; j++) for(let k = 0; k < 60; k++){
    const v = field(i * 0.618034 + 0.1, j * 0.381966 + 0.2, k * 0.7548 + 0.3);
    sum += v; if(v < lo) lo = v; if(v > hi) hi = v; n++;
  }
  const mean = sum / n;
  near(mean, 0.5, 0.02, 'the noise field integrates to 0.5 (measured ' + mean.toFixed(4) + ' over ' + n + ' samples)');
  // ...therefore the multiplier mix(1-a, 1+a, field) integrates to 1.0, which is the claim.
  const mulMean = (1 - ALB) + 2 * ALB * mean;
  near(mulMean, 1.0, 0.01, 'so the ALBEDO MULTIPLIER is mean-1.0 — the surface keeps the albedo the creator ' +
    'chose, and the level keeps the exposure it was tuned at (measured ' + mulMean.toFixed(4) + ')');
  assert(lo >= 0 && hi <= 1, 'the field stays in [0,1], so the multiplier stays inside 1 +/- ' + ALB);
  assert(hi - lo > 0.35, 'and it uses enough of that range to be visible (' + lo.toFixed(3) + '..' + hi.toFixed(3) + ')');
  // A texture could not have done this: 1 + ALB is above white.
  assert(1 + ALB > 1, 'the multiplier goes ABOVE 1 — which is precisely what an 8-bit map cannot do, and ' +
    'why build 1139 was right to refuse this as a texture and wrong to conclude it was impossible');
}

// ------------------------------------------------ the patch lands, in the order three emits ----
// Every one of these replaces is a SILENT no-op if the chunk is renamed: the material still compiles, the
// frame still renders, and the detail is simply absent. Asserted against the real three build.
{
  const T = await import('three');
  const s = T.ShaderLib.physical.fragmentShader;
  const at = (c) => { const i = s.indexOf('#include <' + c + '>'); assert(i >= 0, 'three ' + T.REVISION + ' still emits <' + c + '>'); return i; };
  const map = at('map_fragment'), rough = at('roughnessmap_fragment'), nrm = at('normal_fragment_maps');
  assert(map < rough, 'map_fragment runs BEFORE roughnessmap_fragment — which is what lets the field be ' +
    'evaluated once at the albedo and reused by the roughness patch');
  assert(rough < nrm, '...and roughnessmap_fragment before normal_fragment_maps (build 1145\'s pin, still true)');
}
{
  const f = fn('applyObjDetail');
  assert(/\.replace\('#include <map_fragment>'/.test(f), 'the albedo patch anchors on map_fragment');
  assert(/diffuseColor\.rgb \*= mix\(1\.0 - uOdAlb\*uOdOn, 1\.0 \+ uOdAlb\*uOdOn, _odBase\);/.test(f),
    '...and multiplies diffuseColor by the centred term, not by the raw field');
  assert(/_odP = vOdPos \* uOdFreq;[\s\S]{0,80}_odBase = _odField\(_odP\);[\s\S]{0,900}diffuseColor\.rgb \*=/.test(f),
    'the field is evaluated BEFORE it is used — reading _odBase before it is written is garbage, not an error');
  // and it is evaluated exactly once
  eq((f.match(/_odBase = _odField\(_odP\);/g) || []).length, 1, 'the field is evaluated exactly once per pixel, not once per patch');
  assert(/albOnly \? '#include <roughnessmap_fragment>'/.test(f), 'albedo-only mode skips the roughness patch');
  assert(/albOnly \? '#include <normal_fragment_maps>'/.test(f), '...and the normal patch');
  // build 1382 made the key COMPOSE with any the material already carried; the two modes are still two
  // distinct programs, which is what this always meant.
  assert(/\(albOnly \? 'objDetailA' : 'objDetail'\)/.test(f),
    'two modes are TWO programs, never one per material (build 1145\'s reason for the key)');
  /* build 1503: kept NON-ENUMERABLY now, so Material.copy's JSON walk never serializes a compiled
     shader's uniforms (sampler textures inside). Same intent: the pointer survives for retileProcSurface. */
  assert(/Object\.defineProperty\(mat\.userData, '_odU', \{ value: shader\.uniforms, enumerable: false/.test(f),
    'the uniforms are kept so a resize can move the density without a recompile');
  // THE FREQUENCY MUST NOT LIVE ONLY IN THE UNIFORM. onBeforeCompile does not run until the material is
  // first RENDERED, and a prop's real span is set at SPAWN — so a write to shader.uniforms before that is
  // a write to nothing, silently. Probed on the stock level before this was fixed: all 57 prop materials
  // were patched and every one still carried the frequency for a 1 m object, including a 16 m deck.
  assert(/mat\.userData\._odFreq = \(freq > 0\) \? freq : OBJ_DETAIL_CYCLES;/.test(f),
    'the frequency is stored on the MATERIAL...');
  assert(/shader\.uniforms\.uOdFreq = \{ value: mat\.userData\._odFreq \};/.test(f),
    '...and the uniform reads it at compile time, so a span set before the first render still lands');
  assert(f.indexOf('mat.userData._odFreq =') < f.indexOf('mat.onBeforeCompile'),
    '...written before the patch, not inside it');
}

// ------------------------------------------------------------------- who gets it, and who does not ----
{
  const w = fn('albedoDetailWanted');
  const _w = new Function('return ' + w + '; albedoDetailWanted')();
  const M = (o) => Object.assign({ isMeshStandardMaterial: true, userData: {} }, o);
  assert(_w(M({})), 'a standard material with no map wants it');
  assert(!_w(M({ map: {} })), "a creator's own albedo always wins");
  assert(!_w(M({ isMeshStandardMaterial: false })), 'a Basic/Phong material has no PBR response to detail');
  assert(!_w(M({ userData: { _objDetail: 'full' } })), 'and it is never applied twice');
  assert(!_w(null) && !_w(undefined), 'a missing material is refused rather than thrown on');
}

// The relief term still refuses a UV-having mesh; the albedo term deliberately does NOT, because the
// texture path carries no albedo at all (PROC_SLOTS is normalMap + roughnessMap).
{
  const slots = src.match(/const PROC_SLOTS = \[([^\]]*)\]/);
  assert(slots && !/map'/.test(slots[1].replace(/(normal|roughness)Map/g, '')), 'PROC_SLOTS still carries no albedo — which is why this term exists');
  const inst = fn('installObjDetail');
  assert(/if\(objDetailWanted\(o\.geometry, m\)\)\{ applyObjDetail\(m, f\); n\+\+; \}/.test(inst), 'a UV-less mesh still gets the full set');
  assert(/else if\(albedoDetailWanted\(m\)\)\{ applyObjDetail\(m, f, true\); n\+\+; \}/.test(inst),
    'and a UV-HAVING mesh with no map gets the albedo term alone — the low-poly pack case 1145 walked past');
}

// ----------------------------------------------------------------- the density is a physical size ----
{
  const _f = new Function('ALB_DETAIL_PER_M', fn('_albDetailFreq') + '; return _albDetailFreq;')(PER_M);
  eq(_f(4) / _f(1), 4, 'a 4 m prop gets 4x the cycles of a 1 m one — so both read as the SAME material, ' +
    'which is build 1139\'s "UV tiling is not a physical size", one layer down');
  assert(_f(0) > 0 && _f(-3) > 0 && isFinite(_f(1e9)), 'a degenerate or absurd span is clamped, never 0 or infinite');
  assert(/applyProcSurface\(mat, span, alb\)/.test(src) || /function applyProcSurface\(mat, span, alb\)/.test(src),
    'applyProcSurface takes the opt-in');
  // build 1384 put the texture-modulation opt-in on the same line, so this asserts the CALL rather than
  // the whole statement. Same intent: the frequency comes from the span applyProcSurface was handed.
  assert(/applyObjDetail\(mat, _albDetailFreq\(span\), true\);/.test(src),
    '...and uses the span it was already given');
  // primitives opt in; the two engine surfaces deliberately do not (they carry a real albedo since 1378)
  assert(/applyProcSurface\(new THREE\.MeshStandardMaterial\(\{ color:PRIM_DEFAULT_COLOR[\s\S]{0,200}\}\), 1, true\)/.test(src),
    'every primitive a creator places gets it');
  assert(/applyProcSurface\(floorMat, 140\);/.test(src) && /applyProcSurface\(wallMat, 140\);/.test(src),
    'floorMat and wallMat do NOT — they carry an authored albedo since 1378, and two detail systems on one surface is double grain');
  const rt = fn('retileProcSurface');
  assert(/m\.userData\._odFreq = _f;/.test(rt) && /if\(u && u\.uOdFreq\) u\.uOdFreq\.value = _f;/.test(rt),
    'a resize moves the density through the hook that already owns the world span — BOTH the stored value ' +
    '(for a material not yet compiled) and the live uniform (for one that has been)');
  assert(/if\(m\.userData\._odSpan\)\{/.test(rt),
    '...and only for the SPAN-driven path: an imported mesh normalises its frequency by its own bounding ' +
    'box (1145), so overwriting that with a scale-derived one would be wrong for it');
  assert(/mat\.userData\._odSpan = true;/.test(src), 'applyProcSurface is what marks a material span-driven');
  assert(fn('retileProcSurface').indexOf('u.uOdFreq.value') < fn('retileProcSurface').indexOf('if(!cur || cur === set) return;'),
    '...and BEFORE the procSurf early-out, since a material can carry the albedo term without ever holding one of our textures');
}

// ------------------------------------------------------- the batch must not lose it (1139's trap) ----
{
  // three's Material.copy() does not carry onBeforeCompile — it is an own property on the instance.
  const T = await import('three');
  const a = new T.MeshStandardMaterial(); a.onBeforeCompile = ()=>{};
  assert(typeof a.clone().onBeforeCompile !== 'function' || a.clone().onBeforeCompile !== a.onBeforeCompile,
    'three ' + T.REVISION + ": Material.clone() genuinely does not carry the caller's onBeforeCompile — " +
    'which is why the batch has to re-apply it');
  // The obvious guard, `!mat.onBeforeCompile`, is DEAD — three declares it as a no-op on Material.PROTOTYPE,
  // so it is truthy on every material ever made and the re-apply never runs. Asserted against the real build.
  {
    const T2 = await import('three');
    assert(!Object.prototype.hasOwnProperty.call(new T2.MeshStandardMaterial(), 'onBeforeCompile'),
      'three ' + T2.REVISION + ': onBeforeCompile is a prototype no-op, NOT an own property — which is why ' +
      'a truthiness guard here is always false and hasOwnProperty is the only question that works');
    assert(!!new T2.MeshStandardMaterial().onBeforeCompile,
      '...and it IS truthy, which is what made that guard fail silently');
  }
  assert(/!Object\.prototype\.hasOwnProperty\.call\(mat, 'onBeforeCompile'\)/.test(src),
    'the batch material re-applies the patch after the clone, guarded on OWNERSHIP');
  assert(/const _f = \+src0\.userData\._odFreq \|\| 0;/.test(src), '...at the frequency the source material stored');
  assert(/applyObjDetail\(mat, _f, _p\);/.test(src), '...at the same frequency and in the same mode');
  assert(/mat\.userData\._objDetail = null; mat\.userData\._odU = null;/.test(src),
    'and it clears the guard first, or the re-apply is a silent no-op — the clone copies userData');
}

done('build 1379: props carry an albedo their creator never has to author, and the mean of it is exactly 1.0');
