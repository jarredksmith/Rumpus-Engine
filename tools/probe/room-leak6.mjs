// The leak is the NEAR cascade (turning it off gives a clean zero; turning the far one off changes
// nothing), and it is insensitive to normalBias, shadow radius and map resolution across their whole
// ranges. So it is not a sampling or bias failure. Two possibilities remain, and one raycast separates
// them: from each leaking surface point, fire a ray AT THE SUN.
//   * nothing in the way  -> the room is not actually sealed along that direction: a geometry gap.
//   * something in the way -> the occluder exists and the shadow map is not seeing it, so ask whether it
//     is even in the map (castShadow, or dropped from the shadow pass).
import { withGame } from './driver.mjs';

await withGame(async (P) => {
  await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; worldCfg.postMotion=0;
    worldCfg.sun=1.5; worldCfg.sky=0; worldCfg.bounce=0; worldCfg.ambient=0;
    worldCfg.sunDir=63; worldCfg.sunEl=34; worldCfg.ssao=0; worldCfg.baked=false; worldCfg.shadowDist=60;
    applyWorldCfg(); editorOpen=false; _adaptOn=false; _prStepI=0; _hiFxOn=true; _applyPixelRatio(); 1`);
  await P(`player.pos.set(60, 2, 60); if(player.vel) player.vel.set(0,0,0); 1`);
  await new Promise(r => setTimeout(r, 1800));
  const pp = JSON.parse(await P(`JSON.stringify([+player.pos.x.toFixed(2),+player.pos.y.toFixed(2),+player.pos.z.toFixed(2)])`));
  const [cx, , cz] = pp;
  const room = JSON.parse(await P(`(function(){
    const made = buildRoomAt(${cx}, ${cz}, { w:8, d:6, h:3, t:0.3, floor:true, ceiling:true, openings:[] });
    let top=-1e9; const box=new THREE.Box3();
    for(const o of made){ box.setFromObject(o); if(box.max.y < 2) top=Math.max(top, box.max.y); }
    window.__room = made;
    return JSON.stringify({ pieces:made.length, floorTop:+top.toFixed(3) }); })()`));
  const eye = +(room.floorTop + 1.4).toFixed(3);
  console.log('player ' + JSON.stringify(pp) + '  room ' + JSON.stringify(room) + '  eye y=' + eye);
  await new Promise(r => setTimeout(r, 2000));

  console.log('\ndo the room pieces cast and receive shadows at all?');
  console.log('  ' + await P(`(function(){
    let n=0, cast=0, recv=0, lodOff=0; const names={};
    for(const o of window.__room) o.traverse(m=>{ if(!m.isMesh) return; n++;
      if(m.castShadow) cast++; if(m.receiveShadow) recv++;
      if(o.userData && o.userData._lodCull) lodOff++;
      names[m.geometry.type]=(names[m.geometry.type]||0)+1; });
    return JSON.stringify({ meshes:n, castShadow:cast, receiveShadow:recv, lodCulled:lodOff, geo:names,
      lodPx: (typeof worldCfg!=='undefined')?worldCfg.lodPx:null }); })()`));

  console.log('\nthe leaking pixels: fire a ray AT THE SUN from each surface point');
  console.log(await P(`(function(){
    camera.position.set(${cx}, ${eye}, ${cz}); camera.rotation.set(-0.25, 2.3, 0, 'YXZ'); camera.updateMatrixWorld(true);
    scene.environment = null;
    const W=320,H=180;
    const rt=new THREE.WebGLRenderTarget(W,H,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,type:THREE.FloatType});
    const tm=renderer.toneMapping, ex=renderer.toneMappingExposure, prev=renderer.getRenderTarget();
    renderer.toneMapping=THREE.NoToneMapping; renderer.toneMappingExposure=1;
    renderer.setRenderTarget(rt); renderer.render(scene,camera);
    const b=new Float32Array(W*H*4); renderer.readRenderTargetPixels(rt,0,0,W,H,b);
    renderer.setRenderTarget(prev); renderer.toneMapping=tm; renderer.toneMappingExposure=ex; rt.dispose();
    // brightest pixels, spread out so they are not all one spot
    const cand=[];
    for(let yy=0;yy<H;yy++) for(let xx=0;xx<W;xx++){ const i=(yy*W+xx)*4;
      const Y=0.2126*b[i]+0.7152*b[i+1]+0.0722*b[i+2]; if(Y>0.02) cand.push([Y,xx,yy]); }
    cand.sort((p,q)=>q[0]-p[0]);
    const picked=[]; for(const c of cand){ if(picked.length>=6) break;
      if(picked.every(p=>Math.abs(p[1]-c[1])>18 || Math.abs(p[2]-c[2])>18)) picked.push(c); }
    // the sun direction: from the light toward the scene, so the way BACK to the sun is its negation
    /* _sunDir() returns an ARRAY [x,y,z], and it already points FROM the target TO the light — i.e. it is
       already the direction toward the sun. The first version read .x/.y/.z off an array (undefined -> NaN)
       AND negated it, so the ray had no direction and every point reported "nothing in the way". NdotL came
       back null in the JSON, which is NaN, and that was the tell. */
    const sd = _sunDir();
    const toSun = new THREE.Vector3(sd[0], sd[1], sd[2]).normalize();
    if(!isFinite(toSun.x+toSun.y+toSun.z)) return JSON.stringify({ ERROR:'sun direction is not finite', sd });
    const rc=new THREE.Raycaster(); const out=[];
    for(const [Y,xx,yy] of picked){
      rc.setFromCamera({ x:(xx+0.5)/W*2-1, y:(yy+0.5)/H*2-1 }, camera);
      const hs=rc.intersectObjects(scene.children,true).filter(h=>h.object.isMesh && h.object!==_skyMesh);
      if(!hs.length){ out.push({ Y:+Y.toFixed(3), surface:'MISS' }); continue; }
      const h=hs[0], nrm=h.face?h.face.normal.clone().transformDirection(h.object.matrixWorld):null;
      const org=h.point.clone().addScaledVector(toSun, 0.01);
      const rc2=new THREE.Raycaster(org, toSun);
      const occ=rc2.intersectObjects(scene.children,true).filter(o=>o.object.isMesh && o.object!==_skyMesh);
      out.push({ Y:+Y.toFixed(3),
        pt:[+h.point.x.toFixed(2),+h.point.y.toFixed(2),+h.point.z.toFixed(2)],
        n: nrm?[+nrm.x.toFixed(2),+nrm.y.toFixed(2),+nrm.z.toFixed(2)]:null,
        NdotL:+(nrm?nrm.dot(toSun):0).toFixed(3),
        OCCLUDERS_TOWARD_SUN: occ.length,
        firstOccluder: occ.length ? (occ[0].object.geometry.type+'@'+occ[0].distance.toFixed(3)) : 'NOTHING — the sun really can see this point' });
    }
    return JSON.stringify({ toSun:[+toSun.x.toFixed(3),+toSun.y.toFixed(3),+toSun.z.toFixed(3)], hits: out }, null, 1);
  })()`));
}, { settleMs: 6000 });
