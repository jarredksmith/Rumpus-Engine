// The reporter is on 1345 and says the corner line looks unchanged. Build 1345 measured a real 2.3x
// improvement in a SEALED room, so either the residue is still visible (likely — 151 px of a bright line is
// still a bright line), or the thing in their screenshot is not the thing I measured.
//
// Their shot shows a bright, DASHED line along the top edge of a wall, in a room with a doorway. Two
// completely different explanations, with opposite answers:
//   A) a shadow leak on a side face  -> a bug, and the sub-texel residue 1345 left behind
//   B) the sunlit TOP FACE of the wall, seen nearly edge-on -> CORRECT rendering, and no shadow setting
//      can or should change it. A one-pixel sliver of a lit horizontal face aliases into exactly a dashed
//      bright line at a grazing angle.
// The face NORMAL at the bright pixels settles it, and an occluder test says whether the sun should be
// reaching them at all.
import { withGame } from './driver.mjs';

const LOOK = (cx, cz, y, yaw, pitch) => `camera.position.set(${cx}, ${y}, ${cz});
  camera.rotation.set(${pitch}, ${yaw}, 0, 'YXZ'); camera.updateMatrixWorld(true);`;

const ANALYSE = (pose) => `(function(){
  ${pose}
  scene.environment = null;
  const W=320,H=180;
  const rt=new THREE.WebGLRenderTarget(W,H,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,type:THREE.FloatType});
  const tm=renderer.toneMapping, ex=renderer.toneMappingExposure, prev=renderer.getRenderTarget();
  renderer.toneMapping=THREE.NoToneMapping; renderer.toneMappingExposure=1;
  renderer.setRenderTarget(rt); renderer.render(scene,camera);
  const b=new Float32Array(W*H*4); renderer.readRenderTargetPixels(rt,0,0,W,H,b);
  renderer.setRenderTarget(prev); renderer.toneMapping=tm; renderer.toneMappingExposure=ex; rt.dispose();
  const Y=[]; for(let i=0;i<b.length;i+=4) Y.push(0.2126*b[i]+0.7152*b[i+1]+0.0722*b[i+2]);
  const s=Y.slice().sort((p,q)=>p-q), p50=s[s.length>>1];
  /* with the reporter's ambient on, the median interior radiance is ~0.012 and the leak peaks ~0.085 —
     about 7x the surrounding surface, so an 8x gate found nothing. 3x is still unambiguously "a bright
     line against its own wall" and is what the eye is reacting to. */
  const thr=Math.max(0.02, p50*3);
  const maxY=s[s.length-1];
  const cand=[]; for(let yy=0;yy<H;yy++) for(let xx=0;xx<W;xx++){ const v=Y[yy*W+xx]; if(v>thr) cand.push([v,xx,yy]); }
  cand.sort((p,q)=>q[0]-p[0]);
  const picked=[]; for(const c of cand){ if(picked.length>=8) break;
    if(picked.every(p=>Math.abs(p[1]-c[1])>14 || Math.abs(p[2]-c[2])>10)) picked.push(c); }
  const sd=_sunDir(); const toSun=new THREE.Vector3(sd[0],sd[1],sd[2]).normalize();
  const rc=new THREE.Raycaster(); let up=0, side=0, unoccluded=0, occluded=0; const rows=[];
  for(const [v,xx,yy] of picked){
    rc.setFromCamera({x:(xx+0.5)/W*2-1, y:(yy+0.5)/H*2-1}, camera);
    const hs=rc.intersectObjects(scene.children,true).filter(h=>h.object.isMesh && h.object!==_skyMesh);
    if(!hs.length){ rows.push({Y:+v.toFixed(3), surface:'SKY (through the doorway)'}); continue; }
    const h=hs[0], nr=h.face?h.face.normal.clone().transformDirection(h.object.matrixWorld):null;
    const upFace = nr ? nr.y > 0.7 : false;
    if(upFace) up++; else side++;
    const org=h.point.clone().addScaledVector(toSun,0.01);
    const occ=new THREE.Raycaster(org,toSun).intersectObjects(scene.children,true)
      .filter(o=>o.object.isMesh && o.object!==_skyMesh);
    if(occ.length) occluded++; else unoccluded++;
    rows.push({ Y:+v.toFixed(3), pt:[+h.point.x.toFixed(2),+h.point.y.toFixed(2),+h.point.z.toFixed(2)],
      n:[+nr.x.toFixed(2),+nr.y.toFixed(2),+nr.z.toFixed(2)], face: upFace?'UP (a top face)':'side/floor',
      NdotL:+nr.dot(toSun).toFixed(3),
      sun: occ.length ? ('BLOCKED by '+occ[0].object.geometry.type+' @'+occ[0].distance.toFixed(3)+' m -> LEAK')
                      : 'reaches it -> correct' });
  }
  return JSON.stringify({ medianY:+p50.toFixed(5), maxY:+maxY.toFixed(4), threshold:+thr.toFixed(4),
    ratioMaxToMedian:+(maxY/p50).toFixed(1), brightSampled:picked.length,
    upFaces:up, sideFaces:side, sunReaches:unoccluded, sunBlocked_LEAK:occluded, rows }, null, 1);
})()`;

await withGame(async (P) => {
  await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0;
    worldCfg.sun=1.5; worldCfg.sky=1.3; worldCfg.bounce=0.5; worldCfg.ambient=0;
    worldCfg.sunAzim=63; worldCfg.sunElev=34; worldCfg.ssao=0; worldCfg.baked=false;
    applyWorldCfg(); editorOpen=false; _adaptOn=false; _prStepI=0; _hiFxOn=true; _applyPixelRatio(); 1`);
  await P(`player.pos.set(60, 2, 60); if(player.vel) player.vel.set(0,0,0); 1`);
  await new Promise(r => setTimeout(r, 1800));
  const pp = JSON.parse(await P(`JSON.stringify([+player.pos.x.toFixed(2),+player.pos.z.toFixed(2)])`));
  const [cx, cz] = pp;

  // the reporter's room has a DOORWAY — real sun enters, which the sealed probe deliberately excluded
  console.log('room ' + await P(`(function(){
    const made = buildRoomAt(${cx}, ${cz}, { w:8, d:6, h:3, t:0.3, floor:true, ceiling:true,
      openings:[{ wall:'n', at:0, width:2.0, sill:0, height:2.1 }] });
    return JSON.stringify({ pieces: made.length }); })()`));
  await new Promise(r => setTimeout(r, 2200));

  // stand near a wall and look UP at the wall/ceiling edge, which is what their screenshot frames
  for (const [tag, yaw, pitch, y] of [
      ['looking up at the wall/ceiling edge', 2.3,  0.35, 1.4],
      ['level at the far corner          ', 2.3, -0.10, 1.4],
      ['down at the wall/floor edge      ', 2.3, -0.55, 1.4]]) {
    console.log('\n' + tag);
    console.log(await P(ANALYSE(LOOK(cx, cz, y, yaw, pitch))));
  }
}, { settleMs: 6000 });
