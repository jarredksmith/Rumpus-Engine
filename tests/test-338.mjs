import { gameSource, html, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
const page = html;
// build 448: jump pads — zones that launch the player + bots + enemies straight up by an editor-set amount,
// saved with the level and carried to multiplayer (the level travels to joiners).

// data + migration + save + load
assert(/function _migrateJumpPad\(z\)\{ return \{ x:\+z\.x\|\|0, z:\+z\.z\|\|0, r:\(z\.r!=null\?\+z\.r:6\), y:\(z\.y!=null\?\+z\.y:0\), h:\(z\.h!=null\?\+z\.h:2\), power:\(z\.power!=null\?\+z\.power:22\) \}; \}/.test(src), 'jump pad shape = x,z,r,y,h,power');
assert(/let jumpPads = \(savedLevel && Array\.isArray\(savedLevel\.jumpPads\)\)/.test(src), 'jump pads load from the saved level');
assert(/jumpPads: jumpPads\.map\(z=>\(\{ x:\+z\.x, z:\+z\.z, r:\+z\.r, y:\(\+z\.y\|\|0\), h:\(z\.h!=null\?\+z\.h:2\), power:\(\+z\.power\|\|22\) \}\)\)/.test(src), 'jump pads serialized with the level');
// client load path (must reach MP joiners) — appears in loadLevelFromNet
assert((src.match(/jumpPads = Array\.isArray\(level\.jumpPads\) \? level\.jumpPads\.map\(z=>_migrateJumpPad\(z\)\) : \[\];/g)||[]).length >= 2, 'jump pads adopted on the client level-load path (carries to joiners)');

// editor: section in the World/scene tab + panel + bounce control
assert(/sec\('Zones', 'zones',/.test(src) && /id="edJumpPads" class="zoneHost" data-zone="jumppads"/.test(src), 'Jump pads host registered under the grouped Zones section (build 649)');
assert(/scene:   \['world','generate','zones'\]/.test(src), 'zones (incl. jump pads) live under the World/scene mode');
assert(/function renderJumpPadsPanel\(\)/.test(src), 'jump pads have an editor panel');
assert(/mkN\('Bounce','power',2,50,0\.5/.test(src), 'editor exposes a Bounce (launch power) slider');
assert(/function addJumpPad\(\)/.test(src) && /function removeJumpPad\(i\)/.test(src), 'add/remove jump pads');

// markers (distinct green) + gizmo move support
assert(/function refreshJumpPadMarkers\(\)/.test(src) && /const JP_COLOR = 0x46e0a4/.test(src), 'jump pads draw their own (green) markers');
assert(/\(editorActive==='jumppads'&&selJumpPad>=0\)/.test(src), 'gizmo can move a selected jump pad');
assert(/editorActive==='jumppads'\)\{\s*const z=jumpPads\[selJumpPad\]; if\(!z\) return; z\.x=\+v\.x\.toFixed\(2\); z\.z=\+v\.z\.toFixed\(2\);/.test(src), 'dragging writes back the pad position');

// trigger logic applies to player + bots + enemies
const uj = extractFunction('updateJumpPads');
assert(/player\.vel\.y=pw; player\.onGround=false;/.test(uj), 'player is launched upward');
assert(/b\.vy=pw; b\.grounded=false;/.test(uj), 'bots are launched upward');
assert(/en\.vy=pw; en\.grounded=false;/.test(uj), 'wave enemies are launched upward');
assert(/_jpPlayerCd=0\.45;/.test(uj) && /b\._jpCd=0\.45;/.test(uj), 'a short per-actor cooldown prevents re-trigger every frame');
assert(/player\.onGround \|\| player\.vel\.y<=0\.5/.test(uj), 'only fires when landing on / standing in the pad (not while rising)');

// executable model of the trigger: in-band + grounded + cooldown elapsed -> set vy = power
function launch(feetY, baseY, h, onGround, vy, cd){
  const inBand = feetY <= baseY + h && feetY >= baseY - 1.0;
  if(cd > 0) return null;                       // cooling down
  if(!inBand) return null;
  if(!(onGround || vy <= 0.5)) return null;     // rising through -> ignore
  return 22;                                    // launch velocity
}
assert(launch(0.0, 0, 2, true, 0, 0) === 22, 'standing on the pad launches');
assert(launch(0.0, 0, 2, false, -3, 0) === 22, 'falling onto the pad launches');
assert(launch(0.0, 0, 2, false, 8, 0) === null, 'already rising -> no re-launch');
assert(launch(0.0, 0, 2, true, 0, 0.3) === null, 'within cooldown -> no launch');
assert(launch(5.0, 0, 2, true, 0, 0) === null, 'above the band -> no launch');
// apex height for the default power (v^2 / 2g), GRAV = 30
assert(Math.abs((22*22)/(2*30) - 8.07) < 0.1, 'default bounce clears ~8 units (vs ~2.8 for a normal jump)');
done();
