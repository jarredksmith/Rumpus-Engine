// build 1188: the collider grid — hot queries stop walking the whole collider list.
//
// Build 1148's tight collider tripled the box count (795 -> 2,291 on a 3-storey block) and every hot
// query — the per-enemy obstacle resolve, per-bolt hit tests, segmentBlocked, _surfCull under every bot,
// clearAt/ceilingAt/insideSolid — still walked the WHOLE collider list. An 8m XZ hash over each
// collider's overall box turns those walks into a few cell lookups. The invariant this test exists for:
// the grid returns a SUPERSET of what each walk's own coarse reject kept, so the loop bodies are
// unchanged — proven here by property test against the linear walk, not by trusting the hash.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

const mkGrid = (colliders) => new Function('colliders',
  'const CG_CELL=8, CG_HALF=512; const _cgMap=new Map(); const _cgDyn=[]; let _cgLen=-1, _cgStale=true, _cgSeen=0;\n' +
  extractFunction('_cgDirty') + '\n' + extractFunction('_cgMobileNow') + '\n' + extractFunction('_cgKey') + '\n' +
  extractFunction('_cgRebuild') + '\n' + extractFunction('_cgQuery') +
  '\nreturn { query:_cgQuery, dyn:_cgDyn, isStale:()=>_cgStale, dirty:_cgDirty,' +
  ' guard:(o)=>{ if(o && o.userData && !o.userData._cgMobile) _cgDirty(); } };'
)(colliders);

let _seed = 1188;
const rnd = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };
const box = (x0, z0, w, d) => ({ userData: { box: { min: { x: x0, y: 0, z: z0 }, max: { x: x0 + w, y: 3, z: z0 + d } } } });

// ---------------------------------------------------------------- the property: grid ⊇ linear walk
{
  const colliders = [];
  for (let i = 0; i < 60; i++) colliders.push(box(rnd() * 400 - 200, rnd() * 400 - 200, 0.5 + rnd() * 30, 0.5 + rnd() * 30));
  colliders.push({ userData: { box: { min: { x: 5, y: 0, z: 5 }, max: { x: 8, y: 3, z: 8 } }, phys: { body: {} } } });   // a mover
  colliders.push({ userData: { box: { min: { x: -9, y: 0, z: -9 }, max: { x: -6, y: 3, z: -6 } }, xa: { on: true } } }); // an animated door
  colliders.push({ userData: {} });                                                                                     // boxless (just spawned)
  const g = mkGrid(colliders);
  const scratch = [];
  let misses = 0, checks = 0;
  for (let q = 0; q < 300; q++) {
    const cx = rnd() * 460 - 230, cz = rnd() * 460 - 230, r = rnd() * 12;
    const out = g.query(cx - r, cx + r, cz - r, cz + r, scratch);
    const seen = new Set(out);
    eq(seen.size, out.length, 'no duplicates even when a big box spans many cells (query ' + q + ')');
    for (const c of colliders) {
      const b = c.userData.box, mobile = !b || c.userData.phys || c.userData.xa;
      const hit = b && !(cx + r < b.min.x - 0.01 || cx - r > b.max.x + 0.01 || cz + r < b.min.z - 0.01 || cz - r > b.max.z + 0.01);
      checks++;
      if ((hit || mobile) && !seen.has(c)) misses++;
    }
  }
  eq(misses, 0, 'across 300 random queries and ' + checks + ' membership checks, the grid NEVER misses a collider the linear walk would have kept — the superset property the whole build stands on');
  { // movers ride every query — their boxes change per frame and are never hashed
    const out = g.query(1000, 1001, 1000, 1001, scratch);
    eq(out.length, 3, 'a query in empty space still returns the two movers and the boxless collider');
  }
  { // clamping: far outside the world still resolves, conservatively
    colliders.push(box(99990, 99990, 5, 5)); g.dirty();
    const out = g.query(99990, 99999, 99990, 99999, scratch);
    assert(out.includes(colliders[colliders.length - 1]), 'a box beyond ±4096 clamps into an edge cell and is still found there');
    colliders.pop(); g.dirty();
  }
}

// ---------------------------------------------------------------- the lifecycle
{
  const colliders = [box(0, 0, 4, 4), box(20, 20, 4, 4)];
  const g = mkGrid(colliders); const scratch = [];
  g.query(0, 1, 0, 1, scratch);
  assert(!g.isStale(), 'a query rebuilds and clears the stale flag');
  { // adds and removes are caught by the length check alone
    colliders.push(box(40, 40, 4, 4));
    assert(g.query(40, 44, 40, 44, scratch).length === 1, 'a pushed collider is found with no explicit dirty call');
    colliders.pop();
    eq(g.query(40, 44, 40, 44, scratch).length, 0, '...and a removed one is gone');
  }
  { // a STATIC that starts moving self-heals through one rebuild, then stops rebuilding
    const c = colliders[0];
    c.userData.phys = { body: {} };            // physics switched on at runtime
    g.guard(c);                                 // what refreshPropCollider does on its next box update
    assert(g.isStale(), 'the first refresh of a formerly-static collider dirties the grid');
    g.query(0, 1, 0, 1, scratch);
    assert(g.dyn.includes(c), '...the rebuild reclassifies it as a mover');
    g.guard(c);
    assert(!g.isStale(), '...and its per-frame refreshes are stamp-guarded: they rebuild NOTHING');
  }
}

// ---------------------------------------------------------------- the wiring
{
  eq((src.match(/_cgQuery\(/g) || []).length, 9, 'eight consumers query the grid (plus the definition): _surfCull, surfaceTopAt\'s fallback, clearAt, insideSolid, ceilingAt, segmentBlocked, the bolt hit test, the enemy resolve');
  assert(/const _cgSurf = \[\], _cgClear = \[\], _cgInside = \[\], _cgCeil = \[\], _cgSeg = \[\], _cgBolt = \[\], _cgEnemy = \[\];/.test(src),
    'one scratch per consumer — clearAt calls surfaceTopAt (through _surfCull) before its own query, and a shared array would be clobbered the day that order matters');
  assert(/function refreshPropCollider\(obj\)\{\n  if\(obj && obj\.userData && !obj\.userData\._cgMobile && typeof _cgDirty==='function'\) _cgDirty\(\);/.test(src),
    'refreshPropCollider dirties the grid ONLY for statics — a mover\'s per-frame refresh must not rebuild');
  assert(/function refreshWallCollider\(m\)\{ if\(typeof _cgDirty==='function'\) _cgDirty\(\);/.test(src), 'the arena walls dirty it too');
  assert(/for\(const c of _cgQuery\(en\.mesh\.position\.x-eR-0\.01, en\.mesh\.position\.x\+eR\+0\.01/.test(src),
    'the enemy obstacle resolve — the hottest walk in the game — queries with its own radius');
  assert(/for\(const c of _cgQuery\(Math\.min\(ax,bx\), Math\.max\(ax,bx\), Math\.min\(az,bz\), Math\.max\(az,bz\), _cgSeg\)\)/.test(src),
    'segmentBlocked queries the segment\'s bbox — a crossed box contains a sample point, and every sample lies on the segment');
  assert(/if\(_cgStale \|\| _cgLen !== colliders\.length\) _cgRebuild\(\);/.test(src),
    'adds/removes are caught by length, box changes by the stale flag — no mutation site needs to know the grid exists');
}

done('build 1188: the collider grid — 8m XZ hash over overall boxes, movers in an always-consulted side list, self-healing static/mobile classification, superset-of-the-linear-walk proven by 300-query property test, eight hot consumers converted with byte-identical loop bodies and per-consumer scratch lists');
