import { gameSource, html, extractFunction, assert, near, done } from './harness.mjs';
const src = gameSource();
// build 522 (turret Phase 1.2): man a placed turret — USE to mount, a take-control camera (FP & TP), aim
// clamped to the traverse arc + pitch limits, a high-RoF MG with overheat, and an overlay + exit.

// ---- state + the MG stats ----
assert(/let mountedTurret = null,/.test(src), 'mount state exists');
assert(/const TURRET_GUN = \{ fireRate:70, dmg:16, spread:0\.02, range:150, heatPerShot:0\.05/.test(src), 'turret MG stats with heat');
for(const f of ['mountTurret','dismountTurret','turretUpdate','turretFire','turretEyeWorld','_turretAimClamp'])
  assert(new RegExp('function '+f+'\\b').test(src), 'function '+f+' exists');

// ---- mount via USE; dismount on USE/Esc ----
assert(/if\(best\) nearTarget = \{ type:'turret', turret:best \};/.test(src), 'standing near a turret is detectable');
assert(/Man the turret/.test(src), 'a mount prompt is shown');
assert(/if\(mountedTurret\)\{ dismountTurret\(\); return; \}/.test(src), 'USE dismounts while mounted');
assert(/else if\(nearTarget\.type==='turret'\)\{\s*\n?\s*mountTurret\(nearTarget\.turret\);/.test(src), 'USE mounts a nearby turret');
assert(/if\(e\.code==='Escape' && mountedTurret\)\{ e\.preventDefault\(\); dismountTurret\(\); return; \}/.test(src), 'Escape exits the turret');

// ---- camera takeover (FP & TP) + firing + movement lock ----
assert(/if\(mountedTurret\)\{\s*\n[\s\S]*?turretEyeWorld\(mountedTurret, camera\.position\);/.test(src), 'camera takes over at the turret eye');
assert(/if\(mountedTurret\) turretFire\(\); else shoot\(\);/.test(src), 'fire routes to the turret MG while mounted');
assert(/if\(mountedTurret\)\{ wish\.set\(0,0,0\); moveScale=0; \}/.test(src), 'movement is locked while mounted');
assert(/&& !mountedTurret\)\{ player\.vel\.y = JUMP;/.test(src), 'jump is blocked while mounted');
assert(/if\(mountedTurret\)\{ if\(_ownAvatar\) _ownAvatar\.visible=false; return; \}/.test(src), 'third-person body is hidden while mounted');

// ---- overlay + safety ----
assert(/id="turretHud"/.test(html) && /id="turretHeatFill"/.test(html), 'the control overlay + heat gauge exist');
assert(/if\(!gameOn \|\| gameOver \|\| \(player\.hp!=null && player\.hp<=0\)\)\{ dismountTurret\(\); return; \}/.test(src), 'auto-dismount on death / match end');
assert(/if\(mountedTurret\)\{ mountedTurret=null;[\s\S]*?turretHud[\s\S]*?\}/.test(src), 'a new match never starts mounted');

// ---- executable: the aim clamp respects the arc + pitch limits ----
const RAD=Math.PI/180;
const player={ yaw:1.0, pitch:2.0 };
const clampFn = new Function('player','RAD','return ('+extractFunction('_turretAimClamp')+')')(player, RAD);
const g={ rotation:{y:0}, userData:{ turret:{ yawArc:90, pitchMin:-15, pitchMax:35 } } };
const dy = clampFn(g);
near(player.yaw, 45*RAD, 1e-6, 'yaw clamps to +half-arc (45deg)');
near(player.pitch, 35*RAD, 1e-6, 'pitch clamps to max');
near(dy, 45*RAD, 1e-6, 'returns the clamped yaw delta');
player.yaw=-1.0; player.pitch=-2.0; clampFn(g);
near(player.yaw, -45*RAD, 1e-6, 'yaw clamps to -half-arc');
near(player.pitch, -15*RAD, 1e-6, 'pitch clamps to min');
player.yaw=0.3; player.pitch=0.1; clampFn(g);
near(player.yaw, 0.3, 1e-6, 'within-arc yaw is left alone');

done();
