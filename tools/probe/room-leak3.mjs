// room-leak2 located it: inside a SEALED room, with every unoccluded ambient term zeroed, the sun still
// lands on the wall/ceiling and wall/floor junctions — peak 0.14 against a mean of 0.0005. Sun off gives a
// clean zero, so it is the sun; and normalBias 0 / 0.05 / 0.15 / 0.6 barely moves it, so it is NOT the
// parameter build 1341 changed. This sweeps what a corner leak can actually depend on.
import { withGame } from './driver.mjs';

const ROOM = (t) => `(function(){
  const made = buildRoomAt(200, 200, { w:8, d:6, h:3, t:${t}, floor:true, ceiling:true, openings:[] });
  let top=-1e9; const box=new THREE.Box3();
  for(const o of made){ box.setFromObject(o); if(box.max.y<2) top=Math.max(top, box.max.y); }
  return JSON.stringify({ pieces:made.length, floorTop:+top.toFixed(3), props:propModels.length });
})()`;

const HOT = (y, yaw) => `(function(){
  camera.position.set(200, ${y}, 200); camera.rotation.set(-0.25, ${yaw}, 0, 'YXZ'); camera.updateMatrixWorld(true);
  const W=320,H=180;
  const rt=new THREE.WebGLRenderTarget(W,H,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,type:THREE.FloatType});
  const tm=renderer.toneMapping, ex=renderer.toneMappingExposure, prev=renderer.getRenderTarget();
  renderer.toneMapping=THREE.NoToneMapping; renderer.toneMappingExposure=1;
  renderer.setRenderTarget(rt); renderer.render(scene,camera);
  const b=new Float32Array(W*H*4); renderer.readRenderTargetPixels(rt,0,0,W,H,b);
  renderer.setRenderTarget(prev); renderer.toneMapping=tm; renderer.toneMappingExposure=ex; rt.dispose();
  let sum=0,n=0,peak=0;
  for(let i=0;i<b.length;i+=4){ const Y=0.2126*b[i]+0.7152*b[i+1]+0.0722*b[i+2]; sum+=Y; n++; if(Y>peak)peak=Y; }
  const mean=sum/n, thr=0.02; let hot=0;
  for(let i=0;i<b.length;i+=4){ const Y=0.2126*b[i]+0.7152*b[i+1]+0.0722*b[i+2]; if(Y>thr) hot++; }
  return JSON.stringify({ mean:+mean.toFixed(5), peak:+peak.toFixed(4), hotPx:hot });
})()`;

await withGame(async (P) => {
  await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0;
    worldCfg.sun=1.5; worldCfg.sky=0; worldCfg.bounce=0; worldCfg.ambient=0;
    worldCfg.sunDir=63; worldCfg.sunEl=34; worldCfg.ssao=0; worldCfg.baked=false;
    applyWorldCfg(); scene.environment=null; editorOpen=false;
    _adaptOn=false; _prStepI=0; _hiFxOn=true; _applyPixelRatio(); 1`);
  const room = JSON.parse(await P(ROOM(0.3)));
  const eye = +(room.floorTop + 1.4).toFixed(3);
  console.log('room ' + JSON.stringify(room) + '  eye y=' + eye + '   (ambient fully zeroed: the sun alone)');

  const shot = async (tag, js) => {
    if (js) { await P(js + ' 1'); await new Promise(r => setTimeout(r, 700)); }
    console.log('  ' + tag.padEnd(30) + await P(HOT(eye, 2.3)));
  };

  console.log('\nbaseline');
  await shot('as shipped', 'scene.environment=null;');

  console.log('\nthe engine has TWO cascades (build 1185) — is the leak in the coarse one?');
  await shot('far cascade shadows off', `if(typeof moonFar!=='undefined'&&moonFar){ moonFar.castShadow=false; } _dirtyShadows(2); scene.environment=null;`);
  await shot('far cascade back on', `if(typeof moonFar!=='undefined'&&moonFar){ moonFar.castShadow=true; } _dirtyShadows(2); scene.environment=null;`);

  console.log('\nshadow map RESOLUTION — a sampling problem shrinks with texels');
  for (const px of [1024, 4096])
    await shot('map ' + px, `moon.shadow.mapSize.set(${px},${px}); if(moon.shadow.map){moon.shadow.map.dispose(); moon.shadow.map=null;} _dirtyShadows(2); scene.environment=null;`);
  await shot('map back to 2048', `moon.shadow.mapSize.set(2048,2048); if(moon.shadow.map){moon.shadow.map.dispose(); moon.shadow.map=null;} _dirtyShadows(2); scene.environment=null;`);

  console.log('\nshadowDist — the volume, hence the texel size in WORLD units');
  for (const d of [20, 200])
    await shot('shadowDist ' + d, `worldCfg.shadowDist=${d}; applyWorldCfg(); _dirtyShadows(2); scene.environment=null;`);
  await shot('back to default', `worldCfg.shadowDist=60; applyWorldCfg(); _dirtyShadows(2); scene.environment=null;`);

  console.log('\nPCF radius, and the depth bias (as opposed to the NORMAL bias already ruled out)');
  await shot('shadowRadius 0', `moon.shadow.radius=0; _dirtyShadows(2); scene.environment=null;`);
  await shot('shadow.bias -0.0005', `moon.shadow.radius=1; moon.shadow.bias=-0.0005; _dirtyShadows(2); scene.environment=null;`);
  await shot('shadow.bias 0', `moon.shadow.bias=0; _dirtyShadows(2); scene.environment=null;`);

  console.log('\nWALL THICKNESS — a geometric leak scales with how thin the occluder is');
  await P(`for(let i=propModels.length-1;i>=0;i--) if(Math.abs(propModels[i].position.x-200)<12 && Math.abs(propModels[i].position.z-200)<12) removeProp(propModels[i]); 1`);
  for (const t of [1.0]) {
    const r2 = JSON.parse(await P(ROOM(t)));
    await new Promise(r => setTimeout(r, 900));
    await shot('wall thickness ' + t, `_dirtyShadows(2); scene.environment=null;`);
    console.log('      (' + JSON.stringify(r2) + ')');
  }
}, { settleMs: 6000 });
