// build 1506: painted floor areas stop wearing the BASE texture's relief.
//
// Reported from play: "I have the floor's main material set to a cobblestone texture. I want to paint
// areas of dirt, but when I do, the dirt shows up as expected, but it also overlays the cobblestone
// line texture on top." The splat patch (build 875) blends only the ALBEDO — the floor's normalMap and
// roughnessMap were sampled by three's own chunks across the whole surface. The map patch now records
// the total paint weight into a shader GLOBAL, and the roughness and normal chunks fade back to the
// un-perturbed base by that weight.
//
// Measured (tools/probe/paint-relief.mjs, FloatType readback, uniform white paint so relief is the
// only signal): painted-window gradient 0.01100 -> 0.00000 while the BARE control held 0.01001/0.01000
// across the two trees.
import { gameSource, assert, eq, done } from './harness.mjs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const src = gameSource();
const require = createRequire(import.meta.url);
const THREE = require('./node_modules/three/build/three.cjs');

// ---------------------------------------- the ORDER PREMISE, against the real three build ----
// The global is written in the map patch and read by the two later chunks. If an upgrade reorders
// them, _pwPaint is read before it is written — silent garbage, not an error (build 1388's lesson).
const frag = THREE.ShaderLib.physical.fragmentShader;
const iMap = frag.indexOf('#include <map_fragment>');
const iRgh = frag.indexOf('#include <roughnessmap_fragment>');
const iNB  = frag.indexOf('#include <normal_fragment_begin>');
const iNM  = frag.indexOf('#include <normal_fragment_maps>');
assert(iMap >= 0 && iRgh >= 0 && iNB >= 0 && iNM >= 0, 'all four chunks exist in the physical shader');
assert(iMap < iRgh && iRgh < iNB && iNB < iNM,
  'r149 emits map_fragment < roughnessmap_fragment < normal_fragment_begin < normal_fragment_maps — ' +
  'the paint weight is written before either reader runs');
assert(/vec3 geometryNormal = normal;/.test(THREE.ShaderChunk.normal_fragment_begin),
  'normal_fragment_begin declares geometryNormal — the un-perturbed normal the fade returns to');
assert(/float roughnessFactor = roughness;/.test(THREE.ShaderChunk.roughnessmap_fragment),
  'roughnessmap_fragment starts from the base `roughness` uniform — the value the fade returns to');

// ---------------------------------------- EXECUTE the real patch against the real shader ----
// A `.replace` that misses is a SILENT no-op rendering a perfectly plausible frame (builds 1381/1286);
// the only proof is running the shipped patch over the real source and finding every landing.
const i0 = src.indexOf('floorMat.onBeforeCompile = (shader)=>{');
assert(i0 >= 0, 'the splat patch exists');
const i1 = src.indexOf('\n};', i0);
const body = src.slice(i0, i1 + 3);
const patch = new Function('floorMat', '_paintU', 'Object', body + ' return floorMat.onBeforeCompile;')(
  {}, { uSplat: {}, uPL0: {}, uPL1: {}, uPL2: {}, uPHas: {}, uPRep: {} }, Object);
const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: frag };
patch(shader);
const out = shader.fragmentShader;

// the global is declared once, in the prelude, initialised (a GLSL global initialiser must be constant)
assert(/float _pwPaint = 0\.0;/.test(out), 'the paint-weight global is declared and initialised');
// ...written from the splat sample inside the map block, unconditionally (not behind a per-layer if)
const iW = out.indexOf('_pwPaint = clamp(pw.r + pw.g + pw.b, 0.0, 1.0);');
assert(iW >= 0, 'the weight is recorded from the splat sample, clamped to 1');
assert(iW < out.indexOf('if(pw.r>0.004)'),
  'the weight write precedes the per-layer ifs — recorded even where no single layer passes its gate');

// both fades LANDED, each directly after its chunk, in write-then-read order
const oRgh = out.indexOf('#include <roughnessmap_fragment>\n\troughnessFactor = mix(roughnessFactor, roughness, _pwPaint);');
const oNrm = out.indexOf('#include <normal_fragment_maps>\n\tnormal = normalize(mix(normal, geometryNormal, _pwPaint));');
assert(oRgh >= 0, 'the roughness fade landed directly after its chunk');
assert(oNrm >= 0, 'the normal fade landed directly after its chunk, normalized');
assert(iW < oRgh && oRgh < oNrm, 'write < roughness read < normal read, in the emitted source');

// the fades are exactly once each — a doubled replace would over-rotate nothing here, but a second
// landing means the anchor stopped being unique
eq(out.split('roughnessFactor = mix(roughnessFactor, roughness, _pwPaint);').length - 1, 1, 'one roughness fade');
eq(out.split('normal = normalize(mix(normal, geometryNormal, _pwPaint));').length - 1, 1, 'one normal fade');

// braces and parens still balance — a mangled template is every lit floor vanishing silently
const bal = (str, a, b) => str.split(a).length - str.split(b).length;
eq(bal(out, '{', '}'), 0, 'braces balance in the emitted fragment shader');
eq(bal(out, '(', ')'), 0, 'parens balance in the emitted fragment shader');

// ---------------------------------------- the JS mirror of the fade arithmetic ----
// mix(x, base, w): full paint returns the base exactly, no paint returns the mapped value exactly,
// and a soft brush edge is a proportional blend — the bump fades WITH the paint.
const mix = (x, y, a) => x * (1 - a) + y * a;
eq(mix(0.31, 0.95, 1.0), 0.95, 'full paint: the base roughness, no cobble gloss pattern');
eq(mix(0.31, 0.95, 0.0), 0.31, 'no paint: the mapped value, byte-identical to pre-1506');
assert(Math.abs(mix(0.31, 0.95, 0.5) - 0.63) < 1e-9, 'a soft edge blends proportionally');

// build 875's own pins are unmoved: the albedo lines are verbatim in the emitted shader
assert(out.includes('vec3 pw = texture2D(uSplat, vPaintUv).rgb * uPHas;'), 'the splat sample is untouched');
assert(out.includes('if(pw.r>0.004) diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(uPL0, vPaintUv*uPRep.x).rgb, pw.r);'),
  'the layer-1 albedo mix is untouched');

done('build 1506: the paint weight is a shader global written at map_fragment and read by the ' +
  'roughness and normal chunks — painted dirt no longer wears the cobblestone’s bump or gloss, ' +
  'a soft brush edge fades the relief with the paint, and unpainted floor is byte-identical');
