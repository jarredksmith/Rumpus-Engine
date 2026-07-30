// build 1144: a matte surface received NO SKY LIGHT AT ALL.
//
// Found while chasing a brightness gap, not by reading: build 1143 gave the desert theme
// `floorMetal: 0.0` (sand has no specular) and its ground plane came out at (110,103,80) against the
// arena's own baked sand at (240,195,140) — 46% of the same albedo under the same sun. Chasing that led
// here. NOTE: the fix does NOT close that particular gap — the desert plane measures byte-identical
// before and after, which says that scene has no environment map to scale in the first place, and that is
// a separate open question recorded in CLAUDE.md. What IS established, and is what this build fixes, is
// one line written three times:
//
//   floorMat.envMapIntensity = floorMat.metalness * worldCfg.skyBright;   // "reflections track the metal slider"
//
// In r149, `envMapIntensity` scales the WHOLE image-based lighting term. Read out of the shipped library:
//
//   vec3 getIBLIrradiance( const in vec3 normal ) { ... return PI * envMapColor.rgb * envMapIntensity; }
//
// That is the DIFFUSE ambient. So multiplying it by metalness means metalness 0 receives zero sky. It is
// the r13x mental model — envMap as a reflection map you turn up for chrome — applied to a PBR pipeline
// where the environment IS the ambient light, and it withheld it from exactly the dielectrics that have
// nothing else. Build 1095 added a default environment so "metals don't render black and roughness has
// something to respond to"; this line then took it away from everything that was not metal.
//
// Measured, stock level, gating removed entirely (envMapIntensity 1):
//   floor plane   54,79,88     ->  85,116,136     (metal 0.1: it had a tenth of its sky)
//   crate face    116,133,137  ->  143,160,168    (metal 0.35)
//   warm deck     74,71,54     ->  99,100,89      (metal 0.08)
//   sky           175,202,231  ->  175,202,231    (byte-identical, as it must be)
//
// So the AMOUNT was accidentally in the right range; the fault was that it was a per-material coupling
// that hit zero. Hence a FLOOR rather than a rewrite — metals keep exactly the reflection strength they
// were tuned with, and nothing is ever unlit by the sky. Verified on the stock level: with the floor in
// place a crate face at metalness 0.35 is BYTE-IDENTICAL to before and the floor plane moves by one code
// value, so no existing level is restyled; the change is confined to surfaces at or near metalness 0.
//
// The floor's value is derived. Isolating the two ambient terms by capture (hemisphere light zeroed,
// probe at full): the probe delivers 0.0846 linear to a shadowed floor and the hemisphere only 0.0204,
// against 0.061 from the sun. A 3:1 sun-to-shade ratio — the low end of real daylight — wants total
// ambient at 0.0305, i.e. the hemisphere plus 0.12 of the probe. Ungated at 1.0 the ratio is 1.58:1,
// which reads flat.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the derivation, executed
{
  const m = src.match(/const SKY_ENV_FLOOR = ([\d.]+);/);
  assert(m, 'the floor is a named constant with its derivation beside it');
  const F = +m[1];
  assert(F > 0.02, 'it is enough for a matte surface to be visibly lit by the sky (' + F + ')');
  assert(F < 0.4, '...and not so much that the frame goes flat (' + F + ')');

  const fn = new Function('SKY_ENV_FLOOR', src.match(/const _envInten = [^;]+;/)[0] + '; return _envInten;')(F);

  // the whole point: metalness 0 no longer means "no sky"
  eq(fn(0), F, 'a fully matte surface still sees the sky');
  eq(fn(0, 1), F, '...at skyBright 1');
  // metals are untouched, so nothing that was tuned against a reflection changes
  eq(fn(0.35), 0.35, 'a prop at the default metalness keeps exactly its old value');
  eq(fn(1), 1, 'a mirror keeps its full environment');
  for (const m2 of [0.2, 0.5, 0.8]) eq(fn(m2), m2, 'metalness ' + m2 + ' is unchanged (it is above the floor)');
  // ...and everything below the floor is lifted TO the floor, never past it
  for (const m2 of [0, 0.01, 0.08, 0.1]) eq(fn(m2), F, 'metalness ' + m2 + ' is lifted to the floor, not beyond');
  // skyBright still scales the whole thing, because that is the author's HDRI brightness knob
  near(fn(0, 0.5), F * 0.5, 1e-9, 'skyBright halves it');
  near(fn(0.6, 2), 1.2, 1e-9, '...and doubles it');
  eq(fn(0), fn(0, null), 'an omitted skyBright means 1, for the callers that have no world to read');
  // garbage in must not produce NaN in a uniform
  eq(fn(undefined), F, 'undefined metalness falls back to the floor');
  eq(fn(NaN), F, 'NaN too');
}

// ---------------------------------------------------------------- every site goes through it
{
  // three places wrote the coupling and all three must now share one derivation, or the next one drifts
  assert(!/envMapIntensity = \w+\.metalness \* worldCfg\.skyBright/.test(src), 'no site still multiplies by metalness');
  assert(!/o\.material\.envMapIntensity = m;/.test(src), '...including the prop shine path');
  const sites = (src.match(/envMapIntensity[ :]*=? *_envInten\(/g) || []).length;
  assert(sites >= 4, 'every environment-intensity site goes through _envInten (' + sites + ')');
  assert(/floorMat\.envMapIntensity = _envInten\(floorMat\.metalness, worldCfg\.skyBright\);/.test(src), 'the floor plane');
  assert(/wallMat\.envMapIntensity = _envInten\(wallMat\.metalness, worldCfg\.skyBright\);/.test(src), 'the boundary walls');
  assert(/o\.material\.envMapIntensity = _envInten\(m\);/.test(extractFunction('applyPropShine')), 'a prop whose shine is edited');
  assert(/envMapIntensity:_envInten\(0\.35\)/.test(extractFunction('primitiveMat')), 'and a freshly built primitive');
}
{
  // The construction site was not merely wrong, it was ABSENT: primitiveMat never set envMapIntensity, so
  // a fresh box took three's default of 1.0 while any prop whose shine had been touched got 0.35 — the
  // same object lit two different ways depending on whether a slider had ever been dragged.
  const pm = extractFunction('primitiveMat');
  const shine = src.match(/const PRIM_DEFAULT_ROUGH = ([\d.]+), PRIM_DEFAULT_METAL = ([\d.]+);/);
  assert(shine, 'the primitive defaults are named');
  const metal = +shine[2];
  const F = +src.match(/const SKY_ENV_FLOOR = ([\d.]+);/)[1];
  const fn = new Function('SKY_ENV_FLOOR', src.match(/const _envInten = [^;]+;/)[0] + '; return _envInten;')(F);
  const built = pm.match(/envMapIntensity:_envInten\(([\d.]+)\)/);
  assert(built, 'primitiveMat sets it');
  eq(fn(+built[1]), fn(metal), 'a fresh primitive and an edited one at the same metalness get the same environment');
  eq(+built[1], metal, '...because it is built at the documented default metalness');
  // the instancing fallback material too, so a batch cannot differ from its members
  assert(/envMapIntensity:_envInten\(PRIM_DEFAULT_METAL\)/.test(extractFunction('buildInstancing')),
    'the batch fallback material matches its members');
}

// ---------------------------------------------------------------- the coupling that IS correct stays
{
  // specularIntensity is the dielectric sun-sheen and it genuinely should track the metal slider. Only
  // the ENVIRONMENT term was wrong; conflating the two is what caused this.
  assert(/floorMat\.specularIntensity = floorMat\.metalness;/.test(src), 'the floor\'s specular still tracks metalness');
  assert(/wallMat\.specularIntensity = wallMat\.metalness;/.test(src), 'and the wall\'s');
}
{
  // and the probe itself is unchanged — build 1136's raw-radiance rule and its `sky` scaling still hold,
  // because this build changed how much of the probe a MATERIAL sees, not what the probe contains
  const env = extractFunction('_skyEnv');
  assert(/gl_FragColor=vec4\(skyRadiance\(normalize\(vDir\)\),1\.0\)/.test(env), 'the probe is still raw radiance');
  assert(!/_aces\(/.test(env), '...neither tone-mapped');
  assert(/_envU\.uExp\.value \*= Math\.max\(0\.05, Math\.min\(2,/.test(env), '...and worldCfg.sky still scales it');
}

// ---------------------------------------------------------------- the shipped library's semantics
{
  // This assertion exists because the bug was a misreading of what envMapIntensity DOES. If a three
  // upgrade ever changes it from a diffuse-and-specular scale to specular-only, the floor is wrong and
  // this should be revisited rather than silently carried forward.
  assert(/getIBLIrradiance` returns `PI \* envMapColor\.rgb \* envMapIntensity`/.test(src),
    'the note quotes the shipped chunk verbatim, so the claim can be checked against the library rather than believed');
  assert(/that is the DIFFUSE ambient, not just a reflection/.test(src),
    'and states what that means, so the next reader does not have to rediscover it');
}

done('build 1144: metalness drives reflection strength, never whether a surface is lit by the sky at all');
