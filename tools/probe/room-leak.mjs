// Reported from play, twice: light leaking into CLOSED ROOMS and along corners. Build 1341 cut the shadow
// normalBias from 0.45 m to 0.15 m for exactly this and the reporter still sees it — so before touching the
// shadow map a third time, decompose where an interior's light ACTUALLY comes from.
//
// Method: build 1136/1142's — zero ONE term at a time and measure, rather than reason about which is loud.
// The engine's terms for an interior are the sun (through the shadow map), the hemisphere fill, the
// environment probe, the one-bounce ambient and the creator's flat lift, and only the SUN is occluded by a
// wall. If a sealed room barely dims when the sun is switched off, the "leak" is not the shadow map.
//
// THREE ways this probe was wrong before it measured anything, all of them build 1124's rule:
//   1. camera y = 201.4 instead of 1.4 — 200 m in the air, photographing open sky.
//   2. the pose was set in one P() and measured in the next; the FRAME LOOP rewrites camera.position from
//      the player every frame, so the reading was the player's view. Pose and render must be ONE block.
//   3. the floor was found by casting down from above, which hits the ROOF first — the camera then stood
//      on top of the room. The floor comes from the room's own pieces now.
// Hence SEALED, checked and printed before any light reading is believed.
import { withGame } from './driver.mjs';

const ROOM = `(function(){
  const spec = { w:8, d:6, h:3, t:0.3, floor:true, ceiling:true, openings:[] };   // sealed box, no openings
  const made = buildRoomAt(200, 200, spec);
  let top = -1e9; const box = new THREE.Box3();
  for(const o of made){ box.setFromObject(o); if(box.max.y < 2) top = Math.max(top, box.max.y); }   // the floor slab
  return JSON.stringify({ pieces: made.length, floorTop: +top.toFixed(3) });
})()`;

const POSE = (y) => `camera.position.set(200, ${y}, 200);
  camera.rotation.set(-0.25, 2.3, 0, 'YXZ'); camera.updateMatrixWorld(true);`;

// Scene-linear radiance, read before ACES and before the encode (build 1151's method) — a byte screenshot
// cannot answer "how much light" with a tone curve in the way. Posed and rendered in ONE block.
const MEASURE = (y) => `(function(){
  ${POSE(y)}
  const rt = new THREE.WebGLRenderTarget(320, 180, { minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter, type:THREE.FloatType });
  const tm = renderer.toneMapping, ex = renderer.toneMappingExposure, prev = renderer.getRenderTarget();
  renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1;
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  const b = new Float32Array(320*180*4);
  renderer.readRenderTargetPixels(rt, 0, 0, 320, 180, b);
  renderer.setRenderTarget(prev); renderer.toneMapping = tm; renderer.toneMappingExposure = ex; rt.dispose();
  let r=0,g=0,bl=0,n=0,mx=0;
  for(let i=0;i<b.length;i+=4){ r+=b[i]; g+=b[i+1]; bl+=b[i+2]; n++;
    const y2=0.2126*b[i]+0.7152*b[i+1]+0.0722*b[i+2]; if(y2>mx) mx=y2; }
  return JSON.stringify({ r:+(r/n).toFixed(4), g:+(g/n).toFixed(4), b:+(bl/n).toFixed(4),
    Y:+((0.2126*r+0.7152*g+0.0722*bl)/n).toFixed(4), peak:+mx.toFixed(3) });
})()`;

await withGame(async (P) => {
  console.log('setup   ' + await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0;
    worldCfg.sun=1.5; worldCfg.sky=1.3; worldCfg.bounce=0.5; worldCfg.ambient=0;
    worldCfg.sunDir=63; worldCfg.sunEl=34; worldCfg.ssao=0; worldCfg.baked=false;
    applyWorldCfg(); editorOpen=false; _adaptOn=false; _prStepI=0; _hiFxOn=true; _applyPixelRatio();
    JSON.stringify({ sun:worldCfg.sun, sky:worldCfg.sky, bounce:worldCfg.bounce, baked:!!worldCfg.baked, ssao:worldCfg.ssao })`));

  const room = JSON.parse(await P(ROOM));
  console.log('room    ' + JSON.stringify(room));
  const eye = +(room.floorTop + 1.4).toFixed(3);
  console.log('eye     y=' + eye);

  const seal = JSON.parse(await P(`(function(){
    ${POSE(eye)}
    const rc = new THREE.Raycaster(); const view = [];
    for(const p of [[0,0],[-0.4,0.2],[0.4,0.2],[0,-0.35],[-0.5,-0.4]]){
      rc.setFromCamera({x:p[0],y:p[1]}, camera);
      const hs = rc.intersectObjects(scene.children,true).filter(h=>h.object.isMesh && h.object!==_skyMesh);
      view.push(hs.length ? (hs[0].object.userData.src||hs[0].object.geometry.type)+'@'+hs[0].distance.toFixed(1) : 'MISS(sky)');
    }
    const open = []; let far = 0;
    const dirs = { '+x':[1,0,0], '-x':[-1,0,0], 'up':[0,1,0], 'down':[0,-1,0], '+z':[0,0,1], '-z':[0,0,-1] };
    for(const k in dirs){ const d = dirs[k];
      rc.set(camera.position, new THREE.Vector3(d[0],d[1],d[2]));
      const hs = rc.intersectObjects(scene.children,true).filter(h=>h.object.isMesh && h.object!==_skyMesh);
      if(!hs.length || hs[0].distance > 8) open.push(k + (hs.length ? '@'+hs[0].distance.toFixed(1) : ':NOTHING'));
      else far = Math.max(far, hs[0].distance);
    }
    return JSON.stringify({ view, SEALED: open.length===0, openDirections: open, farthestWall:+far.toFixed(2) });
  })()`));
  console.log('sealed  ' + JSON.stringify(seal));
  if (!seal.SEALED) { console.log('\n!! NOT SEALED — stop, no light reading below would mean anything.'); return; }

  const M = async (tag, js) => {
    await P(js + ' 1'); await new Promise(r => setTimeout(r, 350));
    console.log('  ' + tag.padEnd(32) + await P(MEASURE(eye)));
  };

  console.log('\nINSIDE the sealed room — zero one term at a time. Only the SUN is occluded by a wall:');
  await M('everything on (as reported)', '');
  await M('sun 0       [IS occluded]', 'worldCfg.sun=0; applyWorldCfg();');
  await M('  restore', 'worldCfg.sun=1.5; applyWorldCfg();');
  await M('sky fill 0  [NOT occluded]', 'worldCfg.sky=0; applyWorldCfg();');
  await M('  restore', 'worldCfg.sky=1.3; applyWorldCfg();');
  await M('bounce 0    [NOT occluded]', 'worldCfg.bounce=0; applyWorldCfg();');
  await M('  restore', 'worldCfg.bounce=0.5; applyWorldCfg();');
  await M('env probe   [NOT occluded]', 'window.__env=scene.environment; scene.environment=null;');
  await M('  restore', 'scene.environment=window.__env;');
  await M('ALL unoccluded terms off', 'worldCfg.sky=0; worldCfg.bounce=0; applyWorldCfg(); scene.environment=null;');
  await M('  ...and the sun too', 'worldCfg.sun=0; applyWorldCfg();');
  await P('worldCfg.sun=1.5; worldCfg.sky=1.3; worldCfg.bounce=0.5; applyWorldCfg(); scene.environment=window.__env; 1');

  console.log('\nthe engine DOES have occlusion terms, and the reporter has both switched off:');
  await M('baked per-vertex AO on', 'worldCfg.baked=true; applyWorldCfg();');
  await new Promise(r => setTimeout(r, 9000));
  await M('  after the bake settles', '');
  await M('SSAO 0.9 as well', 'worldCfg.ssao=0.9; applyWorldCfg();');
}, { settleMs: 6000 });
