// room-leak.mjs answered the general question (93% of a sealed room's light is unoccludable ambient) and
// then its PEAK column answered the reported one: inside a sealed, ceilinged, windowless room the sun
// produces a spike of 0.145 scene-linear against a frame mean of 0.0012 — 120x, i.e. concentrated into a
// thin feature, which is exactly what "light leaking along the corner" looks like. Turning the sun off
// takes the peak to 0.021 and it is gone.
//
// So: WHERE is it, WHAT surface is it on, and is it the shadow map? Sun off is the control throughout.
import { withGame } from './driver.mjs';

const ROOM = `(function(){
  const made = buildRoomAt(200, 200, { w:8, d:6, h:3, t:0.3, floor:true, ceiling:true, openings:[] });
  let top=-1e9; const box=new THREE.Box3();
  for(const o of made){ box.setFromObject(o); if(box.max.y<2) top=Math.max(top, box.max.y); }
  return JSON.stringify({ pieces:made.length, floorTop:+top.toFixed(3) });
})()`;

const POSE = (y, yaw) => `camera.position.set(200, ${y}, 200);
  camera.rotation.set(-0.25, ${yaw}, 0, 'YXZ'); camera.updateMatrixWorld(true);`;

// find the bright pixels, then ask WHAT they are — build 1151's rule, applied to a highlight
const HOT = (y, yaw) => `(function(){
  ${POSE(y, yaw)}
  const W=320,H=180;
  const rt=new THREE.WebGLRenderTarget(W,H,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,type:THREE.FloatType});
  const tm=renderer.toneMapping, ex=renderer.toneMappingExposure, prev=renderer.getRenderTarget();
  renderer.toneMapping=THREE.NoToneMapping; renderer.toneMappingExposure=1;
  renderer.setRenderTarget(rt); renderer.render(scene,camera);
  const b=new Float32Array(W*H*4);
  renderer.readRenderTargetPixels(rt,0,0,W,H,b);
  renderer.setRenderTarget(prev); renderer.toneMapping=tm; renderer.toneMappingExposure=ex; rt.dispose();
  let sum=0,n=0,peak=0,px=-1,py=-1;
  for(let yy=0;yy<H;yy++) for(let xx=0;xx<W;xx++){
    const i=(yy*W+xx)*4, Y=0.2126*b[i]+0.7152*b[i+1]+0.0722*b[i+2];
    sum+=Y; n++; if(Y>peak){ peak=Y; px=xx; py=yy; }
  }
  const mean=sum/n, thr=Math.max(mean*6, 0.02);
  let hot=0; const rows={}, cols={};
  for(let yy=0;yy<H;yy++) for(let xx=0;xx<W;xx++){
    const i=(yy*W+xx)*4, Y=0.2126*b[i]+0.7152*b[i+1]+0.0722*b[i+2];
    if(Y>thr){ hot++; rows[yy]=(rows[yy]||0)+1; cols[xx]=(cols[xx]||0)+1; }
  }
  // what surface is the single brightest pixel on? (readRenderTargetPixels is bottom-up)
  const rc=new THREE.Raycaster();
  rc.setFromCamera({ x: (px+0.5)/W*2-1, y: (py+0.5)/H*2-1 }, camera);
  const hs=rc.intersectObjects(scene.children,true).filter(h=>h.object.isMesh && h.object!==_skyMesh);
  const who = hs.length ? { src:hs[0].object.userData.src||hs[0].object.geometry.type,
    dist:+hs[0].distance.toFixed(2), pt:[+hs[0].point.x.toFixed(2),+hs[0].point.y.toFixed(2),+hs[0].point.z.toFixed(2)],
    n:hs[0].face?[+hs[0].face.normal.x.toFixed(2),+hs[0].face.normal.y.toFixed(2),+hs[0].face.normal.z.toFixed(2)]:null } : 'MISS';
  const spanR = Object.keys(rows).length, spanC = Object.keys(cols).length;
  return JSON.stringify({ mean:+mean.toFixed(5), peak:+peak.toFixed(4), ratio:+(peak/mean).toFixed(1),
    hotPixels:hot, pctHot:+(100*hot/n).toFixed(2), rowsTouched:spanR, colsTouched:spanC,
    brightestAt:[px,py], brightestOn:who });
})()`;

await withGame(async (P) => {
  console.log('setup ' + await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0;
    worldCfg.sun=1.5; worldCfg.sky=1.3; worldCfg.bounce=0.5; worldCfg.ambient=0;
    worldCfg.sunDir=63; worldCfg.sunEl=34; worldCfg.ssao=0; worldCfg.baked=false;
    applyWorldCfg(); editorOpen=false; _adaptOn=false; _prStepI=0; _hiFxOn=true; _applyPixelRatio(); 1`));
  const room = JSON.parse(await P(ROOM));
  const eye = +(room.floorTop + 1.4).toFixed(3);
  console.log('room  ' + JSON.stringify(room) + '  eye y=' + eye);

  // ambient off throughout: the leak is a SUN feature and the ambient only buries it
  await P(`worldCfg.sky=0; worldCfg.bounce=0; applyWorldCfg(); window.__env=scene.environment; scene.environment=null; 1`);
  console.log('(sky fill, bounce and env probe all zeroed — isolating the sun)');

  for (const yaw of [2.3, 0.8, -0.9, 4.0]) {
    console.log('\nyaw ' + yaw);
    await P(`worldCfg.sun=1.5; applyWorldCfg(); scene.environment=null; 1`);
    console.log('  sun 1.5  ' + await P(HOT(eye, yaw)));
    await P(`worldCfg.sun=0; applyWorldCfg(); scene.environment=null; 1`);
    console.log('  sun 0    ' + await P(HOT(eye, yaw)));
  }

  // Is it the shadow map? Zero the bias entirely — build 1124's "zero the suspect parameter" discriminator.
  console.log('\nis it the shadow bias? (yaw 2.3, sun 1.5)');
  await P(`worldCfg.sun=1.5; applyWorldCfg(); scene.environment=null; 1`);
  for (const nb of [null, 0, 0.05, 0.6]) {
    if (nb === null) { console.log('  as shipped        ' + await P(HOT(eye, 2.3))); continue; }
    await P(`moon.shadow.normalBias=${nb}; if(typeof moonFar!=='undefined'&&moonFar) moonFar.shadow.normalBias=${nb};
      _dirtyShadows(2); 1`);
    await new Promise(r => setTimeout(r, 600));
    console.log('  normalBias ' + String(nb).padEnd(6) + await P(HOT(eye, 2.3)));
  }
  // and with the sun's shadow switched off entirely: if the spike SURVIVES, the shadow map is innocent
  await P(`moon.castShadow=false; _dirtyShadows(2); 1`); await new Promise(r => setTimeout(r, 600));
  console.log('  castShadow off    ' + await P(HOT(eye, 2.3)));
  await P(`moon.castShadow=true; _dirtyShadows(2); scene.environment=window.__env;
    worldCfg.sky=1.3; worldCfg.bounce=0.5; applyWorldCfg(); 1`);
}, { settleMs: 6000 });
