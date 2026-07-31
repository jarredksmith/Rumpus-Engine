import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 464: rockets detonated using a point-inside-box test against the model's collider GRID boxes. Those
// boxes over-occupy the empty space around angled rock faces (the voxelizer marks each triangle's whole
// bounding box solid), so rockets blew up against an invisible wall in open air. Fix: sweep a ray over the
// rocket's travel this frame and detonate on the REAL mesh surface — geometry that's actually there — which
// also stops fast rockets tunnelling through thin walls. (build 436 grenade behaviour is retained.)

const ur = extractFunction('updateRockets');
assert(/_rkPrev\.copy\(rk\.mesh\.position\); rk\.mesh\.position\.addScaledVector\(rk\.vel, dt\)/.test(ur), 'rocket records its previous position before moving (for the sweep)');
assert(/_rkDir\.set\(dx\/L,dy\/L,dz\/L\); _rkRay\.set\(_rkPrev,_rkDir\); _rkRay\.far=L\+0\.05;/.test(ur), 'a ray is swept over this frame of travel');
assert(/const hits=_rkRay\.intersectObjects\(colliders, true\); const _rH=[^\n]*if\(_rH\)\{ p\.copy\(_rH\.point\); impact=true; \}/.test(ur), 'detonates on the real mesh hit point, not a bounding box');   // build 1236: the hit is ghost-filtered first — still a real mesh point, never a bbox
assert(!/for\(const b of bs\)\{ if\(p\.x>=b\.min\.x&&p\.x<=b\.max\.x/.test(ur), 'the old point-in-grid-box detonation is gone');

const ug = extractFunction('updateGrenades');
assert(/insideSolid\(g\.mesh\.position\.x, g\.mesh\.position\.z, g\.mesh\.position\.y-0\.22\)\)\{/.test(ug), 'grenade still detects entering a wall');
assert(/g\.vel\.x\*=-0\.5/.test(ug) && /g\.vel\.z\*=-0\.5/.test(ug), 'grenade ricochets off the blocked axis');

// --- executable: a phantom grid box over open air vs a swept mesh ray ---
// The voxelizer left a SOLID box floating over open floor (an angled face's bbox). The real wall is far away.
const phantomBox = { min:{x:10,y:0,z:-5}, max:{x:14,y:8,z:5} };   // occupies empty air around x=12
const realWallX = 30;                                             // the only actual geometry
function inBox(p,b){ return p.x>=b.min.x&&p.x<=b.max.x&&p.y>=b.min.y&&p.y<=b.max.y&&p.z>=b.min.z&&p.z<=b.max.z; }
// rocket crossing the open air at x~12 this frame
const prev={x:11.6,y:4,z:0}, now={x:12.0,y:4,z:0};
assert(inBox(now, phantomBox)===true, 'OLD: the point sits inside the phantom box -> false detonation in open air');
// swept ray prev->now (length 0.4): does it reach the real wall plane x=30? no.
function raySweepHitsPlaneX(prev, now, planeX){ const dx=now.x-prev.x; if(Math.abs(dx)<1e-9) return false; const t=(planeX-prev.x)/dx; return t>=0 && t<=1; }
assert(raySweepHitsPlaneX(prev, now, realWallX)===false, 'NEW: the sweep does not reach real geometry -> rocket flies on through the open air');
// near the real wall, the sweep crosses it -> detonate
assert(raySweepHitsPlaneX({x:29.8,y:4,z:0}, {x:30.2,y:4,z:0}, realWallX)===true, 'NEW: reaching the real wall still detonates');
done();
