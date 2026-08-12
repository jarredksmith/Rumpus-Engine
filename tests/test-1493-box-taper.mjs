// build 1493 — a box primitive can pinch one end
//
// Reported from play: "I squished a square primitive to a thin rectangle and I wanted one end of it to have
// both corners moved towards the middle, making almost a triangle shape. Right now it isn't possible."
//
// True, and unfixable with the three scale numbers: a primitive is a unit shape scaled on x/y/z, and no
// combination of three scales moves ONE END of a box. A mesh editor is a whole subsystem; a FRUSTUM is two
// numbers and covers the report plus a pyramid, a roof, an obelisk and a flared plinth.
//
// Most of this file EXECUTES the real geometry builder against the real three build, because the taper is
// arithmetic on vertices and a sign or an axis order the wrong way round produces a plausible shape that is
// simply the wrong one.

import { readFileSync } from 'node:fs';
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';

const src = gameSource();
const T = await import('three');
const three = readFileSync(new URL('./node_modules/three/build/three.cjs', import.meta.url), 'utf8');

/* ================================================================= the premises, in the real builds */
{
  /* A frustum is CONVEX, which is what lets one shape serve the static, kinematic and dynamic paths — a
     trimesh (the wedge's answer) is static-only in Rapier and carries no volume, so it could never have
     served a dynamic tapered crate. */
  const rapier = readFileSync(new URL('../rapier3d-compat.js', import.meta.url), 'utf8');
  assert(/static convexHull\(/.test(rapier), 'Rapier really exposes ColliderDesc.convexHull');

  /* the box the taper deforms: 24 vertices, no subdivision, so the blend below is exact */
  const g = new T.BoxGeometry(1, 1, 1);
  eq(g.attributes.position.count, 24, 'a BoxGeometry is 24 vertices — 4 per face, none shared BETWEEN faces');
  /* that last clause is load-bearing: computeVertexNormals averages over shared indices, so per-face
     vertices keep the shape flat-shaded instead of smoothing its own corners */
  const idx = g.index, used = new Map();
  for(let i = 0; i < idx.count; i++) used.set(idx.getX(i), (used.get(idx.getX(i)) || 0) + 1);
  eq(used.size, 24, 'every vertex is used, and only by its own face');
}

/* ================================================================= the geometry, executed */
const geo = (function(){
  /* extractConst returns the VALUE, not the declaration — so the names are rebuilt here rather than
     restated: a rig that restates a table keeps passing against a stale copy of it. */
  const per = 'const _TAPER_PER = ' + extractConst('_TAPER_PER', src) + ';';
  const mid = 'const _TAPER_MID = ' + extractConst('_TAPER_MID', src) + ';';
  const max = 'const TAPER_MAX = ' + extractConst('TAPER_MAX', src) + ';';
  const body = [per, mid, max,
                extractFunction('_taperClamp', src), extractFunction('_taperAxis', src),
                extractFunction('_taperGeo', src)].join('\n');
  assert(body.indexOf('_taperGeo') > 0, 'the builder and its tables all extract');
  return new Function('THREE', body + '; return { g:_taperGeo, clamp:_taperClamp, axis:_taperAxis, PER:_TAPER_PER, MAX:TAPER_MAX };')(T);
})();

const pts = (g) => {
  const p = g.attributes.position, out = [];
  for(let i = 0; i < p.count; i++) out.push([p.getX(i), p.getY(i), p.getZ(i)]);
  return out;
};
const span = (g, ax) => {
  const a = pts(g).map(v => v[{x:0,y:1,z:2}[ax]]);
  return { min: Math.min(...a), max: Math.max(...a) };
};
/* the extent on `ax` measured only among the vertices at the FAR end of `along` — the end being pinched */
const farExtent = (g, along, ax) => {
  const i = {x:0,y:1,z:2}, hi = (along === 'y') ? 1 : 0.5;
  const at = pts(g).filter(v => Math.abs(v[i[along]] - hi) < 1e-6).map(v => v[i[ax]]);
  assert(at.length > 0, 'there are vertices at the far end of ' + along);
  return Math.max(...at) - Math.min(...at);
};

{
  /* IDENTITY: no taper is byte-identical to the shape every level already contains */
  const plain = geo.g('y', 1, 1);
  const s = span(plain, 'y');
  near(s.min, 0, 1e-12, 'the untapered box still sits base-at-origin (build 871s convention)');
  near(s.max, 1, 1e-12, '...and one unit tall');
  near(span(plain, 'x').min, -0.5, 1e-12, 'and centred on x');
  near(span(plain, 'z').max, 0.5, 1e-12, 'and on z');
}

{
  /* THE REPORT: a long thin box whose FAR END (+Z) has both x corners pulled to the middle */
  const dart = geo.g('z', 0, 1);
  near(farExtent(dart, 'z', 'x'), 0, 1e-9, 'the +Z end is pinched to nothing in x — the reported dart');
  const near0 = pts(dart).filter(v => Math.abs(v[2] + 0.5) < 1e-6).map(v => v[0]);
  near(Math.max(...near0) - Math.min(...near0), 1, 1e-9, 'while the -Z end keeps its full width');
  near(span(dart, 'y').min, 0, 1e-12, 'and the shape is still base-at-origin, so it still sits on the floor');
  near(span(dart, 'y').max, 1, 1e-12, '...with its full height, because y is not a perpendicular of z? no — it IS, and untouched here only because b=1');
}

{
  /* the axis choice is what makes the report answerable WITHOUT rotating the prop, which would throw away
     base-at-origin placement. Each axis pinches its own far end and leaves the near one alone. */
  for(const [ax, hi] of [['x', 0.5], ['y', 1], ['z', 0.5]]){
    const g = geo.g(ax, 0.25, 0.25), P = geo.PER[ax];
    for(const p of P) assert(farExtent(g, ax, p) < farExtent(geo.g(ax, 1, 1), ax, p) - 1e-9,
      'axis ' + ax + ' pinches its perpendicular ' + p);
    /* and the OTHER end is untouched — a taper is one-ended, which is what "one end of it" means */
    const i = {x:0,y:1,z:2}[ax], lo = (ax === 'y') ? 0 : -0.5;
    const atLo = pts(g).filter(v => Math.abs(v[i] - lo) < 1e-6);
    const atLoPlain = pts(geo.g(ax, 1, 1)).filter(v => Math.abs(v[i] - lo) < 1e-6);
    eq(JSON.stringify(atLo), JSON.stringify(atLoPlain), 'the near end of ' + ax + ' is byte-identical');
  }
}

{
  /* each perpendicular pinches about ITS OWN centre — one rule, and the reason it is one rule is that a
     centre-pinch is what "both corners toward the middle" means on every axis */
  const py = geo.g('y', 0, 0);                                  // a pyramid
  const tip = pts(py).filter(v => Math.abs(v[1] - 1) < 1e-6);
  for(const v of tip){ near(v[0], 0, 1e-9, 'the pyramid tip is on the x centreline'); near(v[2], 0, 1e-9, '...and z'); }
  const spear = geo.g('z', 0, 0);                               // pinched on x AND y
  const pt = pts(spear).filter(v => Math.abs(v[2] - 0.5) < 1e-6);
  for(const v of pt){ near(v[0], 0, 1e-9, 'the +Z point is on the x centreline'); near(v[1], 0.5, 1e-9, '...and on the HEIGHT centre, 0.5, not the floor'); }
}

{
  /* a FLARE above 1 is free and useful (an inverted plinth), and it really grows */
  const fl = geo.g('y', 2, 2);
  near(farExtent(fl, 'y', 'x'), 2, 1e-9, 'a taper of 2 doubles the top face');
  near(farExtent(geo.g('y', 1, 1), 'y', 'x'), 1, 1e-9, '...against 1 for the plain box');

  /* the normals are RECOMPUTED, or a tapered side face is lit as though it were still axis-aligned */
  const n = geo.g('y', 0.2, 0.2).attributes.normal;
  let tilted = 0;
  for(let i = 0; i < n.count; i++) if(Math.abs(n.getY(i)) > 1e-4 && Math.abs(n.getY(i)) < 1 - 1e-4) tilted++;
  assert(tilted > 0, 'the side faces have normals that are neither flat nor vertical — they were recomputed');
  for(let i = 0; i < n.count; i++)
    near(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)), 1, 1e-5, 'every normal is unit length');
  const bb = geo.g('y', 0.2, 0.2).boundingBox;
  assert(bb, 'the bounding box is recomputed too, or frustum culling uses the untapered one');
}

{
  /* hostile input cannot produce a NaN vertex — a level file is untrusted (build 1325) */
  for(const bad of [NaN, undefined, null, 'x', -5, 1e9, Infinity]){
    const g = geo.g('y', bad, bad);
    for(const v of pts(g)) for(const c of v) assert(Number.isFinite(c), 'a ' + String(bad) + ' taper still yields finite vertices');
  }
  eq(geo.clamp(-3), 0, 'negative clamps to 0 — a taper never turns the shape inside out');
  eq(geo.clamp(1e9), geo.MAX, 'and an absurd flare clamps');
  eq(geo.axis('nope'), 'y', 'an unknown axis falls back to the top, never undefined');
}

/* ================================================================= the collider */
{
  const info = extractFunction('propShapeInfo', src);
  assert(/kind:'hull'/.test(info), 'a tapered box reports a convex hull');
  assert(/src==='box' && obj\.userData\.taper/.test(info), 'and only when it is actually tapered');
  /* THE ONE THAT WAS WRONG FIRST: the points are stored relative to the AABB centre and `off` is that
     centre, so the cuboid FALLBACK lands in the same place. Base-relative points with off=0 put the
     fallback cuboid centred on the body origin — half buried in the floor, silently, and only for the
     shapes flat enough to defeat the hull builder. */
  assert(/raw\[i\*3\]-=cx; raw\[i\*3\+1\]-=cy; raw\[i\*3\+2\]-=cz;/.test(info),
    'the hull points are centred on the AABB');
  assert(/off:_poff\.set\(cx, cy, cz\)/.test(info), '...and `off` is that same centre, so the fallback agrees');
  assert(info.indexOf("kind:'hull'") < info.indexOf("if(src==='box')      return { kind:'cuboid'"),
    'the tapered branch is tested BEFORE the plain cuboid one, or it can never be reached');

  const desc = extractFunction('colliderDescFor', src);
  /* the fallback is a GUARD, and the probe could not reach it — this Rapier build's convexHull returned a
     descriptor for every input tried, including an empty array. Pinned anyway, because what matters is that
     if it ever fires it lands in the same place as the hull it replaces. */
  assert(/convexHull\(info\.pts\) \|\| RAPIER\.ColliderDesc\.cuboid\(info\.hx, info\.hy, info\.hz\)/.test(desc),
    'a degenerate hull falls back to the cuboid that shares its offset');

  /* every consumer of propShapeInfo reads hx/hy/hz for the player footprint, so the hull must carry them */
  for(const k of ['hx:', 'hy:', 'hz:']) assert(info.indexOf(k + 'Math.max(0.05,(') > 0,
    'the hull reports ' + k + ' from its own AABB, so createBodyFor\'s footprint still works');
}

/* ================================================================= wiring */
{
  const ap = extractFunction('applyPropTaper', src);
  assert(/obj\.userData\.src !== 'box'/.test(ap), 'box only — "pinch the far end" means nothing on a sphere');
  assert(/delete obj\.userData\.taper/.test(ap), 'an identity taper DELETES the flag rather than storing 1,1');
  assert(/old\.dispose\(\)/.test(ap), 'the replaced geometry is disposed');
  /* refreshPropCollider runs BEFORE this in spawnProp, and its per-mesh boxes come from the very vertices
     this just moved — so the refresh is not tidiness, it is the collider being correct at all */
  assert(/refreshPropCollider\(obj\)/.test(ap), 'and the collider is refreshed against the new vertices');

  /* instancing: a batch draws ONE shared geometry looked up by shape NAME, so a tapered member would
     silently render as a plain box */
  const ie = extractFunction('instanceEligible', src);
  assert(/!o\.userData\.taper/.test(ie), 'a tapered prop is excluded from instancing');

  /* SHAPE, not material — so it rides at the top level rather than inside propMaterialDesc */
  assert(/e\.tpr=\[ T\.ax, \+T\.a, \+T\.b \]/.test(src), 'the taper serializes');
  /* NOT inside propMaterialDesc, whose name would then be a lie about what it carries. Asserted by
     EXTRACTING that function rather than by a character window from its name — the window reached 33 lines
     into propEntry, where this build's own comment says the word, which is this file's recorded
     character-budget trap (1149) and prose-defeats-a-pin trap (1421) in one. */
  assert(!/taper/.test(extractFunction('propMaterialDesc', src)),
    '...and NOT inside the material descriptor');
  const pe = extractFunction('propEntry', src);
  assert(/if\(o\.userData\.taper\)\{/.test(pe), 'only when set, so no existing level grows a key');

  /* BOTH apply sites — build 1280 keeps _pfSpawnEntry as a deliberate near-copy, and duplicate, paste,
     prefabs and the array tool all route through it */
  eq((src.match(/applyPropTaper\(obj, p\.tpr\[0\], p\.tpr\[1\], p\.tpr\[2\]\)/g) || []).length, 2,
     'restored by _applyPropEntry AND by _pfSpawnEntry');
  const apply = extractFunction('_applyPropEntry', src);
  assert(apply.indexOf('applyPropTaper') < apply.indexOf('applyPropDynState'),
    'FIRST, before a physics body can be created from the shape');
}

/* ================================================================= the door */
{
  /* a capability nobody can find is one that does not exist (build 1348) */
  assert(/hdr\.textContent='Taper';/.test(src), 'the fold says Taper');
  assert(/\['y','top \(\+Y\)'\],\['x','right end \(\+X\)'\],\['z','far end \(\+Z\)'\]/.test(src),
    'and the axis picker names the END rather than the axis letter alone');
  assert(/_tObj\.userData\.src === 'box'/.test(src), 'shown for a box and nothing else');
  assert(/rng\.addEventListener\('mousedown',\(\)=>pushUndoSnapshot\(\)\)[\s\S]{0,400}?ap\(rng\.value\)/.test(src),
    'one undo snapshot per gesture, matching every other slider (build 1163)');
}

done('build 1493 — a box can pinch one end: a frustum on any axis, convex-hull collided, ' +
     'so the dart, the pyramid, the roof and the flared plinth are all two numbers');
