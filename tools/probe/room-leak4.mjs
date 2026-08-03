// FOURTH correction to this probe, and the same class as the first three: I do not control the thing I am
// measuring against. `_fitSunShadow` fits the shadow volume around the PLAYER, and the player was at the
// origin while my room stood at (200,200) — 283 m away. So "shadowDist 200" and "far cascade off" both
// returned exactly 36387 hot pixels (63% of the frame, i.e. saturated): I was measuring a room standing
// OUTSIDE the shadow map, not a leak inside it.
//
// So the player is teleported into the room, the fit is given frames to settle, and the shadow camera's
// own bounds are read back and CHECKED against the room's bbox before any light reading is believed.
import { withGame } from './driver.mjs';

const ROOM = (t) => `(function(){
  const made = buildRoomAt(200, 200, { w:8, d:6, h:3, t:${t}, floor:true, ceiling:true, openings:[] });
  let top=-1e9; const box=new THREE.Box3(), all=new THREE.Box3();
  all.makeEmpty();
  for(const o of made){ box.setFromObject(o); all.union(box); if(box.max.y<2) top=Math.max(top, box.max.y); }
  return JSON.stringify({ pieces:made.length, floorTop:+top.toFixed(3),
    bbox:[+all.min.x.toFixed(1),+all.min.y.toFixed(1),+all.min.z.toFixed(1),
          +all.max.x.toFixed(1),+all.max.y.toFixed(1),+all.max.z.toFixed(1)] });
})()`;

// Does the shadow volume actually CONTAIN the room? Project the room's 8 corners into the light's own
// clip space; every one must land inside [-1,1] or the map never had a chance to shadow it.
const FIT = (bb) => `(function(){
  const cams = [['near', moon], ['far', (typeof moonFar!=='undefined')?moonFar:null]];
  const out = {};
  for(const [k, L] of cams){
    if(!L || !L.castShadow){ out[k] = 'off'; continue; }
    L.shadow.camera.updateMatrixWorld(true); L.shadow.camera.updateProjectionMatrix();
    const m = new THREE.Matrix4().multiplyMatrices(L.shadow.camera.projectionMatrix, L.shadow.camera.matrixWorldInverse);
    let inside = 0; const v = new THREE.Vector3();
    for(const x of [${bb[0]}, ${bb[3]}]) for(const y of [${bb[1]}, ${bb[4]}]) for(const z of [${bb[2]}, ${bb[5]}]){
      v.set(x,y,z).applyMatrix4(m);
      if(Math.abs(v.x)<=1 && Math.abs(v.y)<=1 && Math.abs(v.z)<=1) inside++;
    }
    const c = L.shadow.camera;
    out[k] = { cornersInside: inside + '/8', extent:+((c.right-c.left)/2).toFixed(1),
               texelCm:+(100*(c.right-c.left)/L.shadow.mapSize.x).toFixed(2),
               normalBias:+L.shadow.normalBias.toFixed(4) };
  }
  return JSON.stringify(out);
})()`;

const HOT = (y) => `(function(){
  camera.position.set(200, ${y}, 200); camera.rotation.set(-0.25, 2.3, 0, 'YXZ'); camera.updateMatrixWorld(true);
  const W=320,H=180;
  const rt=new THREE.WebGLRenderTarget(W,H,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,type:THREE.FloatType});
  const tm=renderer.toneMapping, ex=renderer.toneMappingExposure, prev=renderer.getRenderTarget();
  renderer.toneMapping=THREE.NoToneMapping; renderer.toneMappingExposure=1;
  renderer.setRenderTarget(rt); renderer.render(scene,camera);
  const b=new Float32Array(W*H*4); renderer.readRenderTargetPixels(rt,0,0,W,H,b);
  renderer.setRenderTarget(prev); renderer.toneMapping=tm; renderer.toneMappingExposure=ex; rt.dispose();
  let sum=0,n=0,peak=0,hot=0;
  for(let i=0;i<b.length;i+=4){ const Y=0.2126*b[i]+0.7152*b[i+1]+0.0722*b[i+2];
    sum+=Y; n++; if(Y>peak)peak=Y; if(Y>0.02) hot++; }
  return JSON.stringify({ mean:+(sum/n).toFixed(5), peak:+peak.toFixed(4), hotPx:hot, pctHot:+(100*hot/n).toFixed(2) });
})()`;

await withGame(async (P) => {
  await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0;
    worldCfg.sun=1.5; worldCfg.sky=0; worldCfg.bounce=0; worldCfg.ambient=0;
    worldCfg.sunDir=63; worldCfg.sunEl=34; worldCfg.ssao=0; worldCfg.baked=false; worldCfg.shadowDist=60;
    applyWorldCfg(); editorOpen=false; _adaptOn=false; _prStepI=0; _hiFxOn=true; _applyPixelRatio(); 1`);
  const room = JSON.parse(await P(ROOM(0.3)));
  const eye = +(room.floorTop + 1.4).toFixed(3);
  console.log('room ' + JSON.stringify(room));

  // THE CORRECTION: put the PLAYER in the room, so _fitSunShadow fits the volume around it
  await P(`player.pos.set(200, ${eye}, 200); if(player.vel) player.vel.set(0,0,0); player.yaw=2.3; player.pitch=-0.25; 1`);
  await new Promise(r => setTimeout(r, 2500));
  console.log('player at ' + await P(`JSON.stringify([+player.pos.x.toFixed(1),+player.pos.y.toFixed(2),+player.pos.z.toFixed(1)])`));

  const fit = await P(FIT(room.bbox));
  console.log('shadow fit ' + fit);
  if (!/8\/8/.test(fit)) { console.log('\n!! the room is not inside a shadow volume — nothing below is a leak measurement.'); return; }
  await P('scene.environment=null; 1');

  const shot = async (tag, js) => {
    if (js) { await P(js + ' 1'); await new Promise(r => setTimeout(r, 900)); }
    await P('scene.environment=null; 1');
    console.log('  ' + tag.padEnd(28) + await P(HOT(eye)));
  };

  console.log('\n(ambient fully zeroed — every reading below is the SUN alone in a sealed room)');
  await shot('as shipped', null);
  await shot('sun 0  [the control]', 'worldCfg.sun=0; applyWorldCfg();');
  await shot('  restore', 'worldCfg.sun=1.5; applyWorldCfg();');

  console.log('\nwhat does it depend on?');
  await shot('normalBias 0', 'moon.shadow.normalBias=0; if(typeof moonFar!==\'undefined\'&&moonFar) moonFar.shadow.normalBias=0; _dirtyShadows(2);');
  await shot('normalBias 0.6 (pre-1341)', 'moon.shadow.normalBias=0.6; if(typeof moonFar!==\'undefined\'&&moonFar) moonFar.shadow.normalBias=0.6; _dirtyShadows(2);');
  await shot('  back to shipped', 'applyWorldCfg(); _dirtyShadows(2);');
  await shot('map 4096', 'moon.shadow.mapSize.set(4096,4096); if(moon.shadow.map){moon.shadow.map.dispose(); moon.shadow.map=null;} _dirtyShadows(2);');
  await shot('map 512', 'moon.shadow.mapSize.set(512,512); if(moon.shadow.map){moon.shadow.map.dispose(); moon.shadow.map=null;} _dirtyShadows(2);');
  await shot('  back to 2048', 'moon.shadow.mapSize.set(2048,2048); if(moon.shadow.map){moon.shadow.map.dispose(); moon.shadow.map=null;} _dirtyShadows(2);');
  await shot('shadowRadius 0', 'moon.shadow.radius=0; _dirtyShadows(2);');
  await shot('  restore', 'moon.shadow.radius=1; _dirtyShadows(2);');
  await shot('sun straight down (el 89)', 'worldCfg.sunEl=89; applyWorldCfg(); _dirtyShadows(2);');
  await shot('sun low (el 10)', 'worldCfg.sunEl=10; applyWorldCfg(); _dirtyShadows(2);');
  await shot('  back to 34', 'worldCfg.sunEl=34; applyWorldCfg(); _dirtyShadows(2);');
}, { settleMs: 6000 });
