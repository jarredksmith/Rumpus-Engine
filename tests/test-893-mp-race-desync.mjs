// (build 893) THE MULTIPLAYER RACE MESS — "host started in the car, joined players didn't. All of the
// tracks and props seemed to have moved y position randomly." Root causes, all fixed here:
//  (1) TWO prop serializers disagreed: propTuple (pMov sync) stored terrain-RELATIVE y, propEntry (level
//      save + pAdd) stored RAW world y — while finalizeProp always re-adds the terrain lift on spawn. It
//      only ever looked right because boot placement sampled no terrain (worldCfg TDZ). Now propEntry
//      subtracts the lift too, levels carry tRel:1, and all three loaders pin LEGACY (raw-y) levels to
//      their stored y exactly.
//  (2) netApplyMovProp set the tuple's terrain-relative y RAW, so on hilly levels every synced edit sank
//      the prop — and the receiver echoed a further-sunk pMov back: a cross-machine sinking loop. It now
//      re-adds the lift (scale first — the footprint drives the lift) and never stomps your driven car.
//  (3) loadLevelFromNet / restoreLevel applied the world (terrain!) AFTER spawning props, so placement
//      lifted against the PREVIOUS level's terrain. World now applies first on both paths, and boot
//      placement samples the autosave's terrain instead of 0.
//  (4) A one-car level could only ever seat the host: the grid now FILLS ITSELF — each machine clones the
//      first car locally (runtime-only, never serialized or net-synced) so every joiner gets a seat.
// Verified headless: pMov tuple round-trip is identity on hills; author-on-A -> joiner-was-on-B net load
// lands every prop at its authored world y (drift 0, legacy drift 0); a rank-1 client with one authored
// car ends up DRIVING a grid clone.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// ---- (1) one y convention ----
assert(/const e=\{ src:o\.userData\.src\|\|PROP_MODEL_URL, t:\[ h\.x, h\.y - _maxTerrainOver\(h\.x, h\.z, o\.userData\.footR\|\|0\), h\.z,/.test(src),
  'propEntry stores terrain-relative y (the same convention as propTuple + finalizeProp)');
assert(/tRel: 1,   \/\/ build 893/.test(src), 'levels are stamped with the convention');
assert((src.match(/if\(!level\.tRel\)\{ obj\.position\.y=p\.t\[1\]; refreshPropCollider\(obj\); \}/g)||[]).length===2,
  'restoreLevel + loadLevelFromNet pin legacy levels to their stored raw y');
assert(/const _tRel = !!\(savedLevel && savedLevel\.tRel\);/.test(src) && /if\(!_tRel\)\{ obj\.position\.y=p\.t\[1\]; refreshPropCollider\(obj\); \}/.test(src),
  '...and so does the boot loader');
assert(/catch\(e\)\{ t=\(typeof savedLevel!=='undefined' && savedLevel && savedLevel\.world\) \? savedLevel\.world\.terrain : null; \}/.test(src),
  'boot placement samples the autosave terrain instead of 0 (worldCfg TDZ)');

// ---- (2) the sinking loop ----
const mov = extractFunction('netApplyMovProp', src);
assert(/o\.updateMatrixWorld\(true\); o\.userData\.footR = _propFootR\(o\);/.test(mov), 'scale applies before the footprint (the lift depends on it)');
assert(/o\.position\.y = x\[1\] \+ _maxTerrainOver\(x\[0\], x\[2\], o\.userData\.footR\);/.test(mov), 'pMov re-adds the terrain lift — the tuple round-trips exactly');
assert(/if\(typeof drivingCar!=='undefined' && o===drivingCar\) return false;/.test(mov), 'a late grid echo cannot teleport the car you are driving');

// ---- (3) world before props ----
{
  const net = extractFunction('loadLevelFromNet', src);
  const rst = extractFunction('restoreLevel', src);
  for(const [name, fn] of [['loadLevelFromNet', net], ['restoreLevel', rst]]){
    const w = fn.search(/if\(level\.world\)\{ worldCfg = Object\.assign/);
    const p = fn.search(/level\.props\.forEach/);
    assert(w>=0 && p>=0 && w<p, name+': terrain adopted BEFORE props spawn');
  }
}

// ---- (4) the grid fills itself ----
const seat = extractFunction('_raceAutoSeat', src);
assert(/const authored=propModels\.filter\(p=>p && p\.userData && p\.userData\.vehicle && !p\.userData\.runtime\);/.test(seat) && /const cars=authored\.concat\(_gridCars\);/.test(seat),
  'the seat list = authored cars + local grid clones');
assert(/if\(uniq\.length>cars\.length && authored\.length && _gridCloneReq<uniq\.length\)/.test(seat), 'more racers than seats -> clone the field out');
const clone = extractFunction('_gridCloneCar', src);
assert(/\{ const pi=propModels\.indexOf\(obj\); if\(pi>=0\) propModels\.splice\(pi,1\); \}/.test(clone), 'clones never serialize or net-sync (out of propModels)');
assert(/obj\.userData\.runtime=true; obj\.userData\.gridClone=true;/.test(clone), 'clones are runtime-only');
assert(/if\(typeof _gridCarsClear==='function'\) _gridCarsClear\(\);/.test(src), 'clones are torn down with the race');
assert(/propModels\.concat\(_gridCars\)/.test(src), 'E-to-enter finds grid clones too');

done('build 893: one y convention + lift-safe sync + world-first loads + self-filling MP grid');
