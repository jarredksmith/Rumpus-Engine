// (build 848) HELP & TUTORIALS — the first-timer's front door. A left-nav modal reachable from the home menu
// AND the pause menu with: play controls, an editor tour matching the reorganized tabs, three step-by-step
// tutorials (race circuit / arena shootout / puzzle room) and SAVE & SHARE. Two tutorials carry one-click
// loadable examples built with the editor's own APIs (track pieces + spawnProp + gameCfg) behind an
// undo-friendly confirm — the race example lays an exactly-closed walled stadium, a drivable starter car and
// race rules; the arena example scatters cover + pillars and sets a 3-wave eliminate.
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// the modal + both entry points exist
assert(/<div id="helpModal" class="modalBack hidden">/.test(html), 'the help modal exists');
assert(/id="helpNav"/.test(html) && /id="helpBody"/.test(html), '...with nav + body panes');
assert(/id="helpBtn"[^>]*>.*Help &amp; tutorials/.test(html), 'a home-menu button');
assert(/id="pauseHelp"[^>]*>Help &amp; tutorials/.test(html), 'a pause-menu button');
assert(/const hlb=document\.getElementById\('helpBtn'\); if\(hlb\) hlb\.onclick=openHelp;/.test(src), 'home button wired');
assert(/const ph=document\.getElementById\('pauseHelp'\); if\(ph\) ph\.onclick=openHelp;/.test(src), 'pause button wired');

// the six topics, and the tutorials reference the REORGANIZED editor (not stale locations)
const topics=src.match(/const HELP_TOPICS = \[[\s\S]*?\n\];/)[0];
for(const id of ['play','editor','tut-race','tut-arena','tut-puzzle','share']) assert(topics.includes("id:'"+id+"'"), 'topic: '+id);
assert(/<b style="color:#eafff7">HUD<\/b> — colours, fonts, visibility, <b>crosshair<\/b>/.test(topics), 'the tour matches build 845 (crosshair under HUD)');
assert(/build menu, <b>cutscenes<\/b>/.test(topics), 'the tour matches build 846 (cutscenes under Gameplay)');
assert(/Close loop<\/b> bridges the gap exactly/.test(topics), 'the race tutorial teaches Close loop');

// example loaders: confirm-gated, editor-ensured, undo-friendly
assert(/uiConfirm\('Load the example into the editor\? This replaces the current level \(undo works\)\.'/.test(src), 'loading is confirm-gated');
const le=extractFunction('_helpLoadExample');
assert(/if\(!gameOn && typeof enterEditor==='function'\) enterEditor\(\); else if\(typeof toggleEditor==='function'\) toggleEditor\(\);/.test(le), 'the loader ensures the editor is open');
const be=extractFunction('_helpBuildExample');
assert(/pushUndoSnapshot\(\);/.test(be), 'one undo restores the previous level');
assert(/\['track_start','track_short','track_curve_l','track_curve_l','track_straight','track_curve_l','track_curve_l'\]/.test(be), 'the race example lays the exactly-closing stadium (mod-8 lengths)');
assert(/trackApply\(o, \{w:1\}\);/.test(be), '...with walls on every piece');
assert(/vehicleApply\(o, \{ maxSpeed:36, accel:22, turn:150/.test(be), '...and a drivable starter car');
assert(/gameCfg\.objective='race'; gameCfg\.raceLaps=3; gameCfg\.raceBots=2;/.test(be), '...ready to race with rivals');
assert(/gameCfg\.objective='eliminate'; gameCfg\.mode='random'; gameCfg\.winWaves=3;/.test(be), 'the arena example sets a 3-wave eliminate');

// executable: the example's track chain actually closes (same math the editor uses)
{
  const defsStart=src.indexOf('const TRACK_W = 12'), defsEnd=src.indexOf('// ONE merged BufferGeometry ribbon');
  const mod=new Function('"use strict";'+src.slice(defsStart,defsEnd)+'\n'+extractFunction('_trackExitPose')+'\nreturn _trackExitPose;')();
  let pose={x:0,y:0,z:0,yaw:0};
  for(const k of ['track_start','track_short','track_curve_l','track_curve_l','track_straight','track_curve_l','track_curve_l'])
    pose=mod({ position:{x:pose.x,y:pose.y,z:pose.z}, rotation:{y:pose.yaw}, scale:{x:1,y:1,z:1}, userData:{src:k} });
  assert(Math.abs(pose.x)<1e-9 && Math.abs(pose.z)<1e-9, 'the shipped example loop closes exactly');
}

done('build 848: help & tutorials with loadable example projects, wired to home + pause menus');
