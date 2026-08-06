// build 1404 — a trigger can change the camera, and change it back.
//
// Asked for from use: "a player walks into a zone that triggers the camera to be from a single, security
// camera mounted POV, or switch to a top-down angle, and then go back to normal view with a different
// trigger."
//
// Every check drives the REAL verb through the REAL world-action dispatcher and reads a REAL observable —
// the camera's world position and where it is looking — never a flag the feature sets about itself.
import { withGame } from './driver.mjs';

const R = [];
const chk = (name, ok, detail) => R.push({ name, ok: !!ok, detail });
const safe = async (P, code) => {
  try { return await P(code); }
  catch (e) { return { __threw: String(e.message || e).split('\n')[0].replace('page.evaluate: ', '') }; }
};

await withGame(async (P, page) => {
  const setup = await safe(P, `(function(){
    paused = false; gameOn = true;
    /* a camera mounted high in a corner, yawed to face the room, FAR from the stock level (build 1323) */
    window.__cam = null;
    spawnProp('box',[520, 6, 520, 0, 0, 0, 0.4,0.4,0.4],(b)=>{ __cam=b; });
    __cam.userData.tag = 'seccam';
    __cam.rotation.set(0, Math.PI*0.25, 0); __cam.updateMatrixWorld(true);
    player.pos.set(500, 1.7, 500); player.yaw = 0; player.pitch = 0;
    window.__read = () => {
      camera.updateMatrixWorld(true);
      const d = new THREE.Vector3(); camera.getWorldDirection(d);
      return { mode: activeViewMode(), authored: gameCfg.view,
               pos: [+camera.position.x.toFixed(2), +camera.position.y.toFixed(2), +camera.position.z.toFixed(2)],
               dir: [+d.x.toFixed(2), +d.y.toFixed(2), +d.z.toFixed(2)] };
    };
    /* the verb, exactly as a trigger zone do-node reaches it */
    window.__view = (vmode, vtag, vtrack) => _applyWorldAction({ do:'view', vmode, vtag, vtrack });
    return { authored: gameCfg.view, camAt: [__cam.position.x, __cam.position.y, __cam.position.z] };
  })()`);
  chk('a camera prop is placed and the level is authored first-person',
    !setup.__threw && setup.authored === 'fps', setup);

  // ---------------------------------------------------------------- the authored view, untouched
  const base = await safe(P, `(function(){ __view('normal'); return __read(); })()`);
  chk('with no override the level plays its own view', !base.__threw && base.mode === 'fps', base);

  // ---------------------------------------------------------------- top-down for one room
  const top = await safe(P, `(function(){ __view('top'); return { now: __read(), authoredStill: gameCfg.view }; })()`);
  await page.waitForTimeout(900);
  const topLive = await safe(P, `__read()`);
  chk('a trigger can drop the level to top-down', !top.__threw && top.now.mode === 'top', top);
  chk('...WITHOUT writing the level (gameCfg.view is untouched — a save mid-play must not bake it in)',
    !top.__threw && top.authoredStill === 'fps', top);
  chk('...and the live camera really is overhead',
    !topLive.__threw && topLive.pos[1] > 8 && topLive.dir[1] < -0.5, topLive);

  // ---------------------------------------------------------------- the security camera
  const fixed = await safe(P, `(function(){ __view('fixed','seccam',true); return __read(); })()`);
  await page.waitForTimeout(900);
  const fixedLive = await safe(P, `(function(){
    const r = __read();
    /* is it AT the mount, and LOOKING at the player? */
    const toPlayer = new THREE.Vector3(player.pos.x-camera.position.x, (player.pos.y-0.2)-camera.position.y, player.pos.z-camera.position.z).normalize();
    const d = new THREE.Vector3(); camera.getWorldDirection(d);
    return Object.assign(r, { atMount: [+(camera.position.x-__cam.position.x).toFixed(2),
                                        +(camera.position.y-__cam.position.y).toFixed(2),
                                        +(camera.position.z-__cam.position.z).toFixed(2)],
                              dotToPlayer: +d.dot(toPlayer).toFixed(4) });
  })()`);
  chk('a fixed camera reports its own mode', !fixed.__threw && fixed.mode === 'fixed', fixed);
  chk('...sits exactly on the prop it is mounted to',
    !fixedLive.__threw && fixedLive.atMount && fixedLive.atMount.every(v => Math.abs(v) < 0.01), fixedLive);
  chk('...and TRACKS the player (looking straight at them)',
    !fixedLive.__threw && fixedLive.dotToPlayer > 0.999, fixedLive);

  // it follows the player as they move — a security camera pans
  const pan = await safe(P, `(function(){ player.pos.set(480, 1.7, 512); return 1; })()`);
  await page.waitForTimeout(900);
  const panLive = await safe(P, `(function(){
    const toPlayer = new THREE.Vector3(player.pos.x-camera.position.x, (player.pos.y-0.2)-camera.position.y, player.pos.z-camera.position.z).normalize();
    const d = new THREE.Vector3(); camera.getWorldDirection(d);
    return { dot: +d.dot(toPlayer).toFixed(4), camMoved: +camera.position.distanceTo(__cam.position).toFixed(3) };
  })()`);
  chk('...and keeps tracking as the player walks, without the camera moving',
    !panLive.__threw && panLive.dot > 0.999 && panLive.camMoved < 0.01, panLive);

  // a STATIC mount looks along its own facing instead
  const stat = await safe(P, `(function(){ __view('fixed','seccam',false); return 1; })()`);
  await page.waitForTimeout(900);
  const statLive = await safe(P, `(function(){
    const d = new THREE.Vector3(); camera.getWorldDirection(d);
    const f = new THREE.Vector3(0,0,-1).applyQuaternion(__cam.getWorldQuaternion(new THREE.Quaternion()));
    return { dotToPropFacing: +d.dot(f).toFixed(4), yawDeg: +(Math.atan2(-d.x,-d.z)*180/Math.PI).toFixed(1) };
  })()`);
  chk('an untracked mount looks along the PROP\\u2019s own facing (build 1394\\u2019s -Z convention)',
    !statLive.__threw && statLive.dotToPropFacing > 0.999, statLive);

  // ---------------------------------------------------------------- back to normal
  const back = await safe(P, `(function(){ __view('normal'); return __read(); })()`);
  await page.waitForTimeout(900);
  const backLive = await safe(P, `(function(){
    const r = __read();
    return Object.assign(r, { atPlayer: +camera.position.distanceTo(new THREE.Vector3(player.pos.x,player.pos.y,player.pos.z)).toFixed(2) });
  })()`);
  chk('a second trigger puts it back to normal', !back.__threw && back.mode === 'fps', back);
  chk('...and the camera is back on the player\\u2019s own eye',
    !backLive.__threw && backLive.atPlayer < 0.2, backLive);

  // ---------------------------------------------------------------- the failures
  const bad = await safe(P, `(function(){
    const read = () => { const out=[]; if(logicFailures && logicFailures.forEach) logicFailures.forEach((v,k)=>out.push(String(k))); return out; };
    if(logicFailures && logicFailures.clear) logicFailures.clear();
    __view('fixed','nosuchcam',true);
    const missing = { mode: activeViewMode(), reported: read().filter(m=>/nosuchcam/.test(m)).length };
    if(logicFailures && logicFailures.clear) logicFailures.clear();
    __view('sideways');
    const unknown = { mode: activeViewMode(), reported: read().filter(m=>/sideways/.test(m)).length };
    return { missing, unknown };
  })()`);
  chk('a camera tag nobody carries is REPORTED and the authored view stands',
    !bad.__threw && bad.missing && bad.missing.mode === 'fps' && bad.missing.reported === 1, bad);
  chk('...and so is a view this engine does not have',
    !bad.__threw && bad.unknown && bad.unknown.mode === 'fps' && bad.unknown.reported === 1, bad);

  // ---------------------------------------------------------------- it must not survive a deploy
  const deploy = await safe(P, `(function(){
    __view('top');
    const armed = activeViewMode();
    logicStart();                       /* what a Deploy runs */
    return { armed, afterDeploy: activeViewMode() };
  })()`);
  chk('an override does NOT survive a deploy — the level\\u2019s own camera comes back',
    !deploy.__threw && deploy.armed === 'top' && deploy.afterDeploy === 'fps', deploy);

  // ---------------------------------------------------------------- the editor never sees it
  const ed = await safe(P, `(function(){
    __view('top');
    const inPlay = activeViewMode();
    editorOpen = true;
    const inEditor = { active: activeViewMode(), vcam: _vcamMode() };
    editorOpen = false;
    __view('normal');
    return { inPlay, inEditor };
  })()`);
  chk('the EDITOR is shown the authored view, never the one the graph armed',
    !ed.__threw && ed.inPlay === 'top' && ed.inEditor.active === 'fps' && ed.inEditor.vcam === '', ed);

  const w = Math.max(...R.map(r => r.name.length));
  console.log('\n  CAMERA VIEW VERB — driven through the real dispatcher\n  ' + '='.repeat(w + 10));
  for (const r of R) {
    console.log('    ' + (r.ok ? 'ok  ' : 'FAIL') + '  ' + r.name.padEnd(w));
    if (!r.ok) console.log('           ' + JSON.stringify(r.detail));
  }
  const bad2 = R.filter(r => !r.ok).length;
  console.log('\n  ' + (R.length - bad2) + '/' + R.length + ' verified' + (bad2 ? '   <-- ' + bad2 + ' NOT WORKING' : ''));
}, { settleMs: 9000 });
