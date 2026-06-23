import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 421/424: death zones — placeable lethal areas (lava, pits, out-of-bounds). build 424 made each zone a
// LETHAL PLANE: { x, z, r, y, h } — lethal only when the player's feet are within band h above base y, so you
// can jump/arc OVER it but die if you fall onto it. (Replaced the old absolute maxY "only below" model.)

// data + migration + save/load
assert(/let deathZones = \(savedLevel && Array\.isArray\(savedLevel\.deathZones\)\) \? savedLevel\.deathZones\.map\(z=>_migrateDeathZone\(z\)\)/.test(src), 'death zones load through the migrator');
const mig = extractFunction('_migrateDeathZone');
assert(/if\(z\.maxY!=null\) return \{ x:\+z\.x\|\|0, z:\+z\.z\|\|0, r:\+z\.r\|\|6, y:0, h:Math\.max\(0\.5, \+z\.maxY\)/.test(mig), 'old maxY zones migrate to a band');
assert(/return \{ x:\+z\.x\|\|0, z:\+z\.z\|\|0, r:\+z\.r\|\|6, y:0, h:3 \};/.test(mig), 'old infinite zones become a sensible plane band');
assert(/deathZones: deathZones\.map\(z=>\(\{ x:\+z\.x, z:\+z\.z, r:\+z\.r, y:\(\+z\.y\|\|0\), h:\(z\.h!=null\?\+z\.h:3\) \}\)\)/.test(src), 'saved with y + h');

// per-frame plane check
const u = extractFunction('updateDeathZones');
assert(/if\(dx\*dx\+dz\*dz > r\*r\) continue;/.test(u), 'radius test (outside -> skip)');
assert(/if\(feetY > baseY \+ h\) continue;/.test(u), 'above the lethal band (jumped/arced over) -> safe');
assert(/if\(feetY < baseY - 6\) continue;/.test(u), 'far below -> safe');
assert(/if\(!_inDeathZone\)\{ _inDeathZone=true; applyEnemyDamageToSelf\(99999, null, null\); \}/.test(u), 'inside the band kills once (normal death path)');
assert(/const live = gameOn && !editorOpen && !gameOver/.test(u), 'only lethal during live play, not in the editor');
assert(/updateDeathZones\(\); if\(typeof updateJumpPads==='function'\) updateJumpPads\(dt\);/.test(src), 'checked every frame in the loop');

// editor: add seeds base Y from the surface, panel re-renders ITSELF (the build 424 bug fix)
const add = extractFunction('addDeathZone');
assert(/deathZones\.push\(\{ x:[\s\S]*?r:6, y:[\s\S]*?h:3 \}\)/.test(add), 'add seeds y from the surface + a default band');
assert(/refreshDeathZoneMarkers\(\); if\(typeof renderDeathZonesPanel==='function'\) renderDeathZonesPanel\(\);/.test(add), 'add re-renders the death-zones panel directly (not just renderEditorFields)');
const rm = extractFunction('removeDeathZone');
assert(/deathZones\.splice\(i,1\)[\s\S]*?renderDeathZonesPanel\(\)/.test(rm), 'remove re-renders the panel directly');
assert(/function renderDeathZonesPanel\(\)\{/.test(src), 'has an editor panel');
assert(/scene:   \['world','generate','audiozones','deathzones','jumppads','ladders','firezones'\]/.test(src), 'panel lives under the World/scene editor mode');

// executable: the plane predicate — fall onto it dies, arc above it is safe
function lethal(px,py,pz, z, EYE){
  const r=Math.max(1,+z.r||6);
  const dx=px-(+z.x||0), dz=pz-(+z.z||0);
  if(dx*dx+dz*dz > r*r) return false;
  const feetY=py-EYE, baseY=(+z.y||0), h=(z.h!=null?+z.h:3);
  if(feetY > baseY + h) return false;
  if(feetY < baseY - 6) return false;
  return true;
}
const lava={x:0,z:0,r:5,y:0,h:3};
assert(lethal(2, 1.6+0, 2, lava, 1.6)===true, 'feet on the surface inside -> die (fell onto it)');
assert(lethal(2, 1.6+2.5, 2, lava, 1.6)===true, 'feet 2.5m up, still in the band -> die');
assert(lethal(2, 1.6+5, 2, lava, 1.6)===false, 'feet 5m up (arced over) -> safe');
assert(lethal(9, 1.6, 0, lava, 1.6)===false, 'outside the radius -> safe');
done();
