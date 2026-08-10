import { gameSource, html, extractFunction, assert, done, appliedOnceByBothLoaders } from './harness.mjs';
const src = gameSource();
const page = html;
// build 450: fire zones — an area that's on fire dealing damage-over-time to the player, bots, and enemies as
// they move through it, with flickering flame visuals. Saved with the level and carried to multiplayer.

// data + migration + save + load
assert(/function _migrateFireZone\(z\)\{ return \{ x:\+z\.x\|\|0, z:\+z\.z\|\|0, r:\(z\.r!=null\?\+z\.r:5\), y:\(z\.y!=null\?\+z\.y:0\), h:\(z\.h!=null\?\+z\.h:3\), dps:\(z\.dps!=null\?\+z\.dps:15\)/.test(src), 'fire zone shape = x,z,r,y,h,dps + particle look');
assert(/den:\(z\.den!=null\?\+z\.den:1\), psz:\(z\.psz!=null\?\+z\.psz:1\), hue:\(z\.hue!=null\?\+z\.hue:30\), turb:\(z\.turb!=null\?\+z\.turb:1\), wind:\(z\.wind!=null\?\+z\.wind:0\), spk:\(z\.spk!==false\)/.test(src), 'particle-look fields default to natural fire');
assert(/let fireZones = \(savedLevel && Array\.isArray\(savedLevel\.fireZones\)\)/.test(src), 'fire zones load from the saved level');
assert(/fireZones: fireZones\.map\(z=>\(\{ x:\+z\.x, z:\+z\.z, r:\+z\.r, y:\(\+z\.y\|\|0\), h:\(z\.h!=null\?\+z\.h:3\), dps:\(\+z\.dps\|\|0\), den:\(\+z\.den\|\|1\), psz:\(\+z\.psz\|\|1\), hue:\(z\.hue!=null\?\+z\.hue:30\), turb:\(z\.turb!=null\?\+z\.turb:1\), wind:\(\+z\.wind\|\|0\), spk:\(z\.spk!==false\), sat:\(z\.sat!=null\?\+z\.sat:1\), smoke:\(z\.smoke===true\?1:0\), rx:\(\+z\.rx\|\|0\), ry:\(\+z\.ry\|\|0\), rz:\(\+z\.rz\|\|0\), sx:\(z\.sx!=null\?\+z\.sx:1\), sy:\(z\.sy!=null\?\+z\.sy:1\), sz:\(z\.sz!=null\?\+z\.sz:1\) \}\)\)/.test(src), 'fire zones serialized with the level (incl. particle look + saturation + smoke + transform)');
appliedOnceByBothLoaders(/fireZones = Array\.isArray\(level\.fireZones\) \? level\.fireZones\.map\(z=>_migrateFireZone\(z\)\) : \[\];/g, 'fire zones adopted on the client level-load path (carries to joiners)');

// editor: section in the World/scene tab + panel + a Damage/sec control
assert(/sec\('Zones', 'zones',/.test(src) && /id="edFireZones" class="zoneHost" data-zone="firezones"/.test(src), 'Fire zones host registered under the grouped Zones section (build 649)');
assert(/scene:   \['world','generate','zones'\]/.test(src), 'zones (incl. fire) live under the World/scene mode');
assert(/function renderFireZonesPanel\(\)/.test(src), 'fire zones have an editor panel');
assert(/mkN\('Damage\/sec','dps',0,100,1/.test(src), 'editor exposes a Damage/sec slider');
assert(/function addFireZone\(\)/.test(src) && /function removeFireZone\(i\)/.test(src), 'add/remove fire zones');

// flame visuals (flicker + warm light) + gizmo move
assert(/function buildFireZoneGroup\(z, sel\)/.test(src) && /const FIRE_COLS = \[0xff7a1a, 0xffb020, 0xff3a0a\]/.test(src), 'fire zones build flickering flame tongues');
assert(/function _animateFire\(g, tms, dt\)/.test(src), 'flames are animated each frame');
/* build 1466: this quoted the per-type line, and that line is gone — the zone type used to be written
   out by hand in five places and the last three each named six of the eight, which is how water zones and
   effect zones ended up selectable but un-draggable. What it means is asserted against the derived form. */
assert(/const _zsel = ZONE_EDIT\[editorActive\] \? \(ZONE_EDIT\[editorActive\]\.sel\(\) >= 0\) : false;/.test(src)
  && /\bfirezones:\s*\{/.test(src), 'gizmo can move a selected fire zone');
/* build 1326: six near-identical zone drag branches became one table-driven _zoneMove that also writes Y. */
assert(/firezones:  \{ list:\(\)=>fireZones/.test(src) && /_zoneMove\(editorActive, v\)/.test(src), 'dragging writes back the fire-zone position');
assert(/z\.y = \+Math\.max\(0, v\.y - terr\)/.test(src), '...in all three axes now');

// damage applies to player + bots + enemies; player burn is throttled into ticks
const uf = extractFunction('updateFireZones');
assert(/playerDps=Math\.max\(playerDps,dps\)/.test(uf), 'player burn uses the strongest overlapping zone');
assert(/botHurt\(b, dps\*dt, \(\+z\.x\|\|0\), \(\+z\.z\|\|0\)\);/.test(uf), 'bots burn continuously');
assert(/enemyHurt\(en, dps\*dt, \(\+z\.x\|\|0\), \(\+z\.z\|\|0\)\);/.test(uf), 'wave enemies burn continuously');
assert(/_applyFireToPlayer\(playerDps, dt\)/.test(uf), 'player burn is applied via the tick helper');
const af = extractFunction('_applyFireToPlayer');
assert(/_fireTickT >= 0\.35/.test(af), 'player burn is applied on ~0.35s ticks (no per-frame flash/SFX spam)');
assert(/pvpMode\(\)\)\{ if\(!duelDead\) applyPvpDamage\(dmg, null\); \} else applyEnemyDamageToSelf\(dmg\)/.test(af), 'burn routes to the right death path (pvp vs co-op)');

// loop wiring (runs every frame; self-gates DoT)
assert(/updateFireZones\(dt\);/.test(src), 'fire zones update every frame');

// executable: damage-over-time model. dps=15 for 2s = 30 damage; ticks of 0.35s accumulate the same total.
function simulateBurn(dps, seconds, dt){
  let hp = 100, acc = 0, tickT = 0, applied = 0;
  const steps = Math.round(seconds/dt);
  for(let i=0;i<steps;i++){ acc += dps*dt; tickT += dt; if(tickT >= 0.35){ hp -= acc; applied += acc; acc = 0; tickT = 0; } }
  return { hp, applied };
}
const r = simulateBurn(15, 2.0, 1/60);
assert(Math.abs((100 - r.hp) - r.applied) < 1e-9, 'every point of burn lands on the player');
assert(r.applied > 24 && r.applied <= 30.01, 'dps=15 over ~2s deals ~30 (modulo the final partial tick)');
// continuous AI burn: hp -= dps*dt each frame
let ehp = 40; const dt=1/60; for(let i=0;i<Math.round(2/dt);i++) ehp -= 15*dt;
assert(Math.abs(ehp - 10) < 0.3, 'an enemy with 40hp in 15dps fire for 2s drops to ~10hp');
done();
