// FIFTH correction, and the previous sweep was void for a reason worth naming: `_fitSunShadow` REWRITES
// normalBias (and the fit) every frame, so a parameter set in one P() and measured in the next has already
// been reset. Every "no effect" row in room-leak4 was measuring the shipped value. Same class as the camera
// pose two runs earlier: the frame loop owns these, so an override has to happen in the SAME synchronous
// block as the render.
//
// It also teleported the player to (200,200) and the engine CLAMPED it to (68.5, 68.5) — so the room is
// built where the player actually ends up, not where I asked for it.
//
// What room-leak4 did establish, and it is the lead: the room sat in the FAR cascade only (near 0/8,
// far 8/8), whose texel is 23.4 cm and whose normalBias is 0.3516 m — LARGER THAN THE 0.3 m WALL. That is
// build 1341's exact defect ("the shadow bias was wider than a wall"), surviving in the far cascade because
// 1341's 1.5-texel FLOOR outvotes its 0.15 m cap once a texel is bigger than 10 cm.
import { withGame } from './driver.mjs';

const FIT = (bb) => `(function(){
  const out = {};
  for(const [k, L] of [['near', moon], ['far', (typeof moonFar!=='undefined')?moonFar:null]]){
    if(!L || !L.castShadow){ out[k]='off'; continue; }
    L.shadow.camera.updateMatrixWorld(true); L.shadow.camera.updateProjectionMatrix();
    const m = new THREE.Matrix4().multiplyMatrices(L.shadow.camera.projectionMatrix, L.shadow.camera.matrixWorldInverse);
    let inside = 0; const v = new THREE.Vector3();
    for(const x of [${bb[0]}, ${bb[3]}]) for(const y of [${bb[1]}, ${bb[4]}]) for(const z of [${bb[2]}, ${bb[5]}]){
      v.set(x,y,z).applyMatrix4(m);
      if(Math.abs(v.x)<=1 && Math.abs(v.y)<=1 && Math.abs(v.z)<=1) inside++;
    }
    const c = L.shadow.camera;
    out[k] = { inside: inside+'/8', extent:+((c.right-c.left)/2).toFixed(1),
      texelCm:+(100*(c.right-c.left)/L.shadow.mapSize.x).toFixed(2), normalBias:+L.shadow.normalBias.toFixed(4),
      biasInTexels:+(L.shadow.normalBias/((c.right-c.left)/L.shadow.mapSize.x)).toFixed(2) };
  }
  return JSON.stringify(out);
})()`;

// override, refresh the map, pose and render — ALL in one block, so the frame loop cannot undo any of it
const HOT = (cx, cz, y, over) => `(function(){
  ${over || ''}
  renderer.shadowMap.needsUpdate = true;
  camera.position.set(${cx}, ${y}, ${cz}); camera.rotation.set(-0.25, 2.3, 0, 'YXZ'); camera.updateMatrixWorld(true);
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
  return JSON.stringify({ mean:+(sum/n).toFixed(5), peak:+peak.toFixed(4), hotPx:hot, pctHot:+(100*hot/n).toFixed(2),
    nbNear:+moon.shadow.normalBias.toFixed(4),
    nbFar:(typeof moonFar!=='undefined'&&moonFar)?+moonFar.shadow.normalBias.toFixed(4):null });
})()`;

await withGame(async (P) => {
  await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0;
    worldCfg.sun=1.5; worldCfg.sky=0; worldCfg.bounce=0; worldCfg.ambient=0;
    worldCfg.sunDir=63; worldCfg.sunEl=34; worldCfg.ssao=0; worldCfg.baked=false; worldCfg.shadowDist=60;
    applyWorldCfg(); editorOpen=false; _adaptOn=false; _prStepI=0; _hiFxOn=true; _applyPixelRatio(); 1`);

  // put the player somewhere legal FIRST, then build the room around wherever it actually landed
  await P(`player.pos.set(60, 2, 60); if(player.vel) player.vel.set(0,0,0); 1`);
  await new Promise(r => setTimeout(r, 1800));
  const pp = JSON.parse(await P(`JSON.stringify([+player.pos.x.toFixed(2),+player.pos.y.toFixed(2),+player.pos.z.toFixed(2)])`));
  console.log('player  ' + JSON.stringify(pp));
  const [cx, , cz] = pp;

  const room = JSON.parse(await P(`(function(){
    const made = buildRoomAt(${cx}, ${cz}, { w:8, d:6, h:3, t:0.3, floor:true, ceiling:true, openings:[] });
    let top=-1e9; const box=new THREE.Box3(), all=new THREE.Box3(); all.makeEmpty();
    for(const o of made){ box.setFromObject(o); all.union(box); if(box.max.y < ${pp[1]}) top=Math.max(top, box.max.y); }
    return JSON.stringify({ pieces:made.length, floorTop:+top.toFixed(3),
      bbox:[+all.min.x.toFixed(1),+all.min.y.toFixed(1),+all.min.z.toFixed(1),
            +all.max.x.toFixed(1),+all.max.y.toFixed(1),+all.max.z.toFixed(1)] }); })()`));
  const eye = +(room.floorTop + 1.4).toFixed(3);
  console.log('room    ' + JSON.stringify(room) + '  eye y=' + eye);
  await new Promise(r => setTimeout(r, 2000));
  console.log('fit     ' + await P(FIT(room.bbox)));

  // EVERY row states BOTH biases and BOTH intensities explicitly. The previous run set one and left it set,
  // so rows 4-7 silently measured the override from row 3 — their own nbNear/nbFar readout said so.
  const shot = async (tag, nbN, nbF, iN, iF) => {
    const over = `moon.shadow.normalBias=${nbN}; moon.intensity=${iN};`
      + ` if(typeof moonFar!=='undefined'&&moonFar){ moonFar.shadow.normalBias=${nbF}; moonFar.intensity=${iF}; }`
      + ' scene.environment=null;';
    await P('scene.environment=null; 1');
    console.log('  ' + tag.padEnd(30) + await P(HOT(cx, cz, eye, over)));
  };

  console.log('\n(ambient fully zeroed — every reading is the SUN alone in a sealed room)');
  const I = 1.5, IF = 1.5;   // both cascades at the shipped sun intensity unless a row says otherwise
  await shot('as shipped', 0.15, 0.3516, I, IF);
  await shot('sun 0 [control]', 0.15, 0.3516, 0, 0);

  console.log('\nnormalBias, each row stating BOTH values:');
  await shot('near 0     far 0', 0, 0, I, IF);
  await shot('near 0.15  far 0', 0.15, 0, I, IF);
  await shot('near 0     far 0.3516', 0, 0.3516, I, IF);
  await shot('near 0.05  far 0.05', 0.05, 0.05, I, IF);
  await shot('near 0.10  far 0.10', 0.10, 0.10, I, IF);
  await shot('near 0.15  far 0.15', 0.15, 0.15, I, IF);
  await shot('near 0.45  far 1.80  (pre-1341)', 0.45, 1.805, I, IF);

  console.log('\nwhich cascade is actually lighting those pixels?');
  await shot('far cascade off', 0.15, 0.3516, I, 0);
  await shot('near cascade off', 0.15, 0.3516, 0, IF);
}, { settleMs: 6000 });
