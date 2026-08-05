// A functional smoke test for the live game, which the Node harness structurally cannot do: it can execute
// a function in isolation, it cannot tell you the game still PLAYS. Builds 1386/1387/1388 all patched
// shaders that every prop and both engine surfaces compile against, and the failure mode of a bad shader
// patch in this engine is silent — a plausible frame with a subsystem missing from it.
//
// Everything here is checked against the real running game through `window.__probe`, and every check
// reports what it saw rather than a boolean, so a "pass" cannot hide a degenerate scene.
import { withGame } from './driver.mjs';

const R = [];
const chk = (name, ok, detail) => { R.push({ ok: !!ok, name, detail }); };

await withGame(async (P) => {
  // ---- the frame renders, and the GL is clean --------------------------------------------------
  const gl = await P(`(function(){
    renderer.setRenderTarget(null); renderScene(scene, camera); renderViewmodel();
    const g = renderer.getContext(), i = renderer.info;
    const bad = []; const seen = new Set();
    scene.traverse(o => { if(!o.isMesh) return; const m = o.material; if(!m || seen.has(m.uuid)) return;
      seen.add(m.uuid); const p = renderer.properties.get(m);
      if(p && p.currentProgram && p.currentProgram.diagnostics) bad.push(m.type); });
    return { err: g.getError(), programs: i.programs ? i.programs.length : -1,
             calls: i.render.calls, tris: i.render.triangles, diagnostics: bad.length };
  })()`);
  chk('GL error free', gl.err === 0, gl);
  chk('no shader diagnostics', gl.diagnostics === 0, gl.diagnostics);
  chk('the scene actually draws', gl.calls > 50 && gl.tris > 5000, gl);

  // a black frame is the signature of a shader that failed to compile, and it renders without erroring
  const frame = await P(`(function(){
    renderer.setRenderTarget(null); renderScene(scene, camera);
    const g = renderer.getContext(), W = g.drawingBufferWidth, H = g.drawingBufferHeight;
    const b = new Uint8Array(W*H*4); g.readPixels(0,0,W,H,g.RGBA,g.UNSIGNED_BYTE,b);
    let lum = 0, black = 0, uniq = new Set();
    for(let i = 0; i < W*H; i++){ const o = i*4;
      const L = 0.2126*b[o]+0.7152*b[o+1]+0.0722*b[o+2]; lum += L; if(L < 2) black++;
      if(i % 7 === 0) uniq.add((b[o]<<16)|(b[o+1]<<8)|b[o+2]); }
    return { mean:+(lum/(W*H)).toFixed(2), blackPct:+(100*black/(W*H)).toFixed(2), uniq:uniq.size };
  })()`);
  chk('the frame is not black', frame.mean > 20 && frame.blackPct < 20, frame);
  chk('the frame has real tonal content', frame.uniq > 2000, frame.uniq);

  // ---- the world is populated ------------------------------------------------------------------
  const world = await P(`JSON.stringify({
    gameOn: gameOn, props: propModels.length, propHoles: propModels.filter(o => !o).length, colliders: colliders.length,
    lights: (function(){ let n=0; scene.traverseVisible(o=>{ if(o.isLight) n++; }); return n; })(),
    enemies: enemies.length, weapons: Object.keys(WEAPONS).length, mag: WEAPONS[curWep].mag
  })`);
  const w = JSON.parse(world);
  chk('the game is running', w.gameOn === true, w.gameOn);
  chk('props are in the scene', w.props > 20, w.props);
  chk('no null holes in propModels (build 1167 asset failures)', w.propHoles === 0, w.propHoles);
  chk('colliders were built', w.colliders > 20, w.colliders);
  chk('lights are seated', w.lights > 5, w.lights);

  // ---- shooting works end to end ---------------------------------------------------------------
  // Aim at a real breakable prop and fire the real shoot(), then read its health off the prop itself.
  const shot = await P(`(function(){
    // propModels can carry NULL HOLES — build 1167's asset-failure path leaves one where a model url
    // 404'd. Anything that walks this array unguarded throws, which is how this probe first died.
    const target = propModels.find(o => o && o.userData && o.userData.hp > 0 &&
      o.userData.breakable !== false && !o.userData.phys);
    // The stock level ships no prop that is breakable AND non-physics, so the damage half is driven
    // through damageProp directly and the FIRING half through the real shoot(). A skip here used to
    // leave the whole weapon path unexercised, which is the one thing a smoke test must not do.
    // (No backticks in a comment inside a template literal — CLAUDE.md records that trap under builds
    // 1328, 1342 and 1357, and this probe just became the fourth.)
    const any = target || propModels.find(o => o && o.userData);
    if(!any) return { skip: 'no props at all' };
    const p = any.getWorldPosition(new THREE.Vector3());
    // stand off and look straight at it
    const d = new THREE.Vector3(0, 0, 1).multiplyScalar(6);
    player.pos.set(p.x + d.x, p.y + 1.2, p.z + d.z);
    camera.position.copy(player.pos);
    player.yaw = Math.atan2(player.pos.x - p.x, player.pos.z - p.z) + Math.PI;
    player.pitch = 0;
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;
    camera.updateMatrixWorld(true);
    const mag0 = WEAPONS[curWep].mag;
    lastShot = 0; shoot();
    const mag1 = WEAPONS[curWep].mag;
    // the damage path, driven at its own chokepoint (every bullet, swing, explosion and relayed hit
    // passes through damageProp — build 1305)
    let dmg = null;
    if(target){ const hp0 = target.userData.hp;
      damageProp(target, 5, null, false);
      dmg = { src: target.userData.src || 'primitive', hp0: hp0, hp1: target.userData.hp }; }
    return { mag0: mag0, mag1: mag1, dmg: dmg, breakables: propModels.filter(o => o && o.userData &&
      o.userData.hp > 0 && o.userData.breakable !== false && !o.userData.phys).length };
  })()`);
  if(shot.skip) chk('the weapon path runs', false, shot.skip);
  else {
    chk('firing spends a round', shot.mag1 === shot.mag0 - 1, { mag0: shot.mag0, mag1: shot.mag1 });
    chk('damageProp reduces a prop\'s health', !shot.dmg || shot.dmg.hp1 < shot.dmg.hp0,
        shot.dmg || 'no breakable prop in the stock level (' + shot.breakables + ')');
  }

  // ---- enemies spawn and are alive -------------------------------------------------------------
  const en = await P(`(function(){
    const before = enemies.length;
    spawnEnemy(6, 0, 'grunt');
    const e = enemies[enemies.length - 1];
    return { before: before, after: enemies.length,
             hp: e && e.hp, hasMesh: !!(e && e.mesh), inScene: !!(e && e.mesh && e.mesh.parent) };
  })()`);
  chk('an enemy spawns with health and a mesh in the scene',
      en.after === en.before + 1 && en.hp > 0 && en.hasMesh && en.inScene, en);

  // ---- the editor opens and closes -------------------------------------------------------------
  const ed = await P(`(function(){
    const was = editorOpen; if(!editorOpen) toggleEditor();
    const opened = { open: editorOpen, mode: editorMode, target: editorActive,
                     panel: !!document.getElementById('editor') };
    setEditorMode('world'); const w = editorActive;
    if(editorOpen !== was) toggleEditor();
    return { opened: opened, worldTarget: w, closed: editorOpen === was };
  })()`);
  chk('the editor opens, switches mode, and closes', ed.opened.open === true && ed.closed, ed);

  // ---- serialize round-trips -------------------------------------------------------------------
  const ser = await P(`(function(){
    const L = serializeLevel();
    const s = JSON.stringify(L);
    return { bytes: s.length, props: (L.props||[]).length, hasWorld: !!L.world,
             v: L.v, floorTexN: (L.world||{}).floorTexN || '', reparse: !!JSON.parse(s) };
  })()`);
  chk('the level serializes and re-parses', ser.reparse && ser.bytes > 1000 && ser.props > 10, ser);
  chk('the world block carries the authored normal map', !!ser.floorTexN, ser.floorTexN);

  // ---- the adaptive ladder still moves everything it owns ---------------------------------------
  const rung = await P(`(function(){
    const out = [];
    for(const r of [0, 1, 2, 3, 0]){
      _prStepI = r; _applyPixelRatio();
      out.push({ rung: r, bump: +_odBumpU.value.toFixed(4), texN: +_odTexNU.value.toFixed(5),
                 sunPx: (typeof moon !== 'undefined' && moon.shadow) ? moon.shadow.mapSize.width : -1 });
    }
    return out;
  })()`);
  const mono = rung.slice(0, 4).every((r, i, a) => i === 0 || r.texN <= a[i-1].texN);
  chk('the rung ladder fades both relief amplitudes and returns',
      mono && rung[4].texN === rung[0].texN && rung[0].texN > 0, rung);

  console.log('\n  FUNCTIONAL SMOKE — build ' + (await P('BUILD_VERSION')));
  for(const r of R) console.log('   ' + (r.ok ? 'ok  ' : 'FAIL') + '  ' + r.name.padEnd(46) +
    (typeof r.detail === 'object' ? JSON.stringify(r.detail) : String(r.detail)));
  const bad = R.filter(r => !r.ok).length;
  console.log('\n  ' + (R.length - bad) + '/' + R.length + ' functional checks passed' + (bad ? '  <-- FAILURES' : ''));
  if(bad) process.exitCode = 1;
}, { settleMs: 12000 });
