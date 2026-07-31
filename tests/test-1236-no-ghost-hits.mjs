// build 1236: nothing invisible stops a bullet — reported from play with screenshots: "some bullets
// hit an invisible wall and leave decals just floating." Two ways an undrawn surface is raycastable:
// a mesh whose MATERIAL is invisible (material.visible=false / opacity ~0 — how asset packs ship
// collision volumes inside a GLB, and exactly the trick the enemy hit proxies use deliberately), and
// a mesh under an invisible ANCESTOR (the Raycaster honours a mesh's own visible:false but never its
// ancestors' — 1139's documented trap; editor-helper children live under hidden groups). Combat rays
// now skip any hit the renderer would not draw — except the explicit hit proxies. The 1152 rule,
// ballistics edition: nothing that is not drawn stops a shot.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the filter, executed
const CORE = extractFunction('_shotGhost') + '\n' + extractFunction('_firstSolidHit');
const fns = new Function(CORE + '\nreturn { _shotGhost, _firstSolidHit };')();
const node = (mat, over) => ({ material: mat, visible: true, parent: null, userData: {}, ...over });
{
  eq(fns._shotGhost(node({ visible: true, opacity: 1 })), false, 'an ordinary drawn mesh blocks shots — walls still work');
  eq(fns._shotGhost(node({ visible: false })), true, 'an invisible-material mesh (a GLB collision volume) is a GHOST — the pellet flies through');
  eq(fns._shotGhost(node({ visible: true, transparent: true, opacity: 0.01 })), true, 'opacity ~0 is a ghost too');
  eq(fns._shotGhost(node({ visible: true, transparent: true, opacity: 0.3 })), false, '...but real glass (0.3) still stops a bullet and takes its decal');
  eq(fns._shotGhost(node({ visible: false }, { userData: { isHitProxy: true } })), false,
    'the enemy hit proxies are invisible AND shootable BY DESIGN — the exception is explicit');
}
{ // the ancestor trap: the Raycaster honours a mesh's own visible:false but never its ancestors'
  const hidden = { visible: false, parent: null };
  const child = node({ visible: true, opacity: 1 }, { parent: hidden });
  eq(fns._shotGhost(child), true, 'a drawn mesh under a HIDDEN ancestor (an editor helper in play) is a ghost');
  const shown = { visible: true, parent: null };
  eq(fns._shotGhost(node({ visible: true, opacity: 1 }, { parent: shown })), false, '...and under a visible one it is not');
}
{ // multi-material: the HIT FACE's slot decides, not slot 0
  const mats = [{ visible: true, opacity: 1 }, { visible: false }];
  const m = node(mats);
  eq(fns._shotGhost(m, { face: { materialIndex: 1 } }), true, 'a face wearing the invisible slot of a multi-material mesh is a ghost');
  eq(fns._shotGhost(m, { face: { materialIndex: 0 } }), false, '...while a face wearing the drawn slot blocks');
}
{ // the walk: first SOLID hit wins, ghosts in front are skipped — the report's exact geometry
  const ghost = { object: node({ visible: false }), point: 'air' };
  const wall = { object: node({ visible: true, opacity: 1 }), point: 'wall' };
  const r = fns._firstSolidHit([ghost, ghost, wall]);
  eq(r && r.point, 'wall', 'two ghost surfaces in the doorway are skipped; the decal lands on the REAL wall behind them');
  eq(fns._firstSolidHit([ghost]), null, 'only ghosts on the ray = a clean miss, tracer to the sky — never a floating decal');
  const proxy = { object: node({ visible: false }, { userData: { isHitProxy: true } }), point: 'enemy' };
  eq(fns._firstSolidHit([ghost, proxy, wall]).point, 'enemy', 'an enemy behind a ghost surface is still hit — the proxy passes the filter');
}

// ---------------------------------------------------------------- the wiring
{
  const sh = extractFunction('shoot');
  assert(/const _cH = _firstSolidHit\(_cHits\);/.test(sh), 'the cursor-resolve ray filters (a ghost must not become the aim point)');
  assert(/const _sHit = _firstSolidHit\(hits\);/.test(sh) && /if\(_sHit\)\{\n      const hit = _sHit;/.test(sh),
    'every pellet filters — the first thing the player can SEE takes the hit');
  assert(/const _rH=\(typeof _firstSolidHit==='function'\)\?_firstSolidHit\(hits\):\(hits\[0\]\|\|null\); if\(_rH\)\{ p\.copy\(_rH\.point\); impact=true; \}/.test(src),
    'rockets stop detonating on invisible collision volumes mid-doorway');
  assert(/if\(o\.userData && o\.userData\.isHitProxy\) return false;/.test(extractFunction('_shotGhost')),
    'the proxy exception is the FIRST check — an invisible material can never eat an enemy hit');
}

done('build 1236: nothing invisible stops a bullet — the filter executed across every ghost class (invisible material, ~0 opacity, hidden ancestor, the per-face slot of a multi-material mesh) with real glass still blocking and the deliberately-invisible enemy hit proxies still shootable; the walk skips ghosts to the first drawn surface so decals land on real walls or nowhere; and the cursor resolve, every pellet, and rockets all route through it');
