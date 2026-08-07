// A KTX2 model's DATA maps arrive sRGB-decoded, and that is the "shattered, faceted" report.
//
// The chain, read in source and confirmed by ktx2-barrel.mjs:
//   KTX2Loader:256   texture.encoding = dfdTransferFn === KHR_DF_TRANSFER_SRGB ? sRGBEncoding : LinearEncoding
//   GLTFLoader:4935  if ( encoding !== undefined ) texture.encoding = encoding;   <- ASSIGNS, never CLEARS
// GLTFLoader passes sRGBEncoding for `map` and `emissiveMap` only, so for normalMap / roughnessMap /
// metalnessMap whatever the CONTAINER declared survives. An encoder that marks every image sRGB — which is
// what the reporter's optimizer emits — therefore hands the renderer a normal map decoded through an
// sRGB->linear curve: the 0.5-centred XY of a flat surface lands near 0.21, so every normal is violently
// skewed and flat faces break into hard facets with a blue-green cast.
//
// This is the A/B. Same camera, same frame, only the three data maps' `encoding` changes. If the diagnosis
// is right the frame moves a lot; if it is another of my wrong guesses, it moves like the control.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(26) + JSON.stringify(v));

await withGame(async (P) => {
  const load = await P(`(async function(){
    paused = true;
    window.__b = null;
    spawnProp('http://127.0.0.1:8899/barrel.glb', [46, 1, 46, 0,0,0, 1,1,1], (o)=>{ window.__b = o; });
    for(let i=0;i<400 && (!window.__b || _glbPending>0);i++) await new Promise(r=>setTimeout(r,50));
    if(!window.__b) return { FAILED:'model never arrived' };
    window.__mats = [];
    __b.traverse(m=>{ if(!m.isMesh) return;
      for(const mt of (Array.isArray(m.material)?m.material:[m.material])) window.__mats.push(mt); });

    /* Pose and render in ONE block: the frame loop rewrites camera.position from the player every frame
       (build 1345's lesson #2), so a pose set in one round trip and measured in the next is not the pose
       that was rendered. And grain is stochastic per frame, so it is zeroed for the pair. */
    /* The first pair I measured had a control that moved 59% of the frame, i.e. no instrument at all.
       Two temporal terms: build 1238's motion blur reprojects against the camera's PREVIOUS rotation, so
       consecutive renders of one pose legitimately differ, and postGrain is stochastic per frame. Both are
       DERIVED into module vars by applyWorldCfg, so writing worldCfg without calling it changes nothing —
       which is why the first attempt's zeroing was itself a no-op. */
    worldCfg.postGrain = 0; worldCfg.postMotion = 0; worldCfg.autoExp = 0; worldCfg.dofAuto = false;
    applyWorldCfg();

    window.__shot = function(){
      camera.position.set(46, 1.35, 48.6); camera.rotation.set(0, 0, 0, 'YXZ');
      camera.lookAt(46, 1.0, 46); camera.updateMatrixWorld(true);
      renderScene(scene, camera);
      const gl = renderer.getContext(), w = 220, h = 160;
      const x = Math.floor(gl.drawingBufferWidth/2 - w/2), y = Math.floor(gl.drawingBufferHeight/2 - h/2);
      const px = new Uint8Array(w*h*4); gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    };
    /* The readback is where five of this repo's measurements have died, so it carries its own control:
       a frame that is uniformly zero means the instrument failed, not that the barrel is black. */
    const p = __shot(); let nz = 0; for(let i=0;i<p.length;i+=4) if(p[i]||p[i+1]||p[i+2]) nz++;
    return { ok:true, mats: __mats.length, nonZeroPx: nz, of: p.length/4 };
  })()`);
  say('loaded', load);
  if (!load.ok) { console.log('\n! cannot proceed'); return; }
  if (!load.nonZeroPx) { console.log('\n! the readback is all zeros — instrument failure, not a finding'); return; }

  console.log('\n--- what the CONTAINER declared, per map ---------------------------------------');
  say('encodings', await P(`__mats.map(m=>({ map:m.map&&m.map.encoding, normalMap:m.normalMap&&m.normalMap.encoding,
      roughnessMap:m.roughnessMap&&m.roughnessMap.encoding, metalnessMap:m.metalnessMap&&m.metalnessMap.encoding,
      emissiveMap:m.emissiveMap&&m.emissiveMap.encoding }))`));
  console.log('  (3001 = sRGBEncoding, 3000 = LinearEncoding. Only map + emissiveMap may be 3001.)');

  console.log('\n--- A/B: same camera, same frame, only the data maps’ encoding changes ---------');
  const ab = await P(`(function(){
    const DATA = ['normalMap','roughnessMap','metalnessMap','aoMap'];
    const diff = (a,b)=>{ let moved=0, sum=0;
      for(let i=0;i<a.length;i+=4){ const d = Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
        if(d>6) moved++; sum += d/3; }
      return { movedPct:+(100*moved/(a.length/4)).toFixed(2), meanDelta:+(sum/(a.length/4)).toFixed(2) }; };
    const mean = (p)=>{ let r=0,g=0,b=0,n=p.length/4;
      for(let i=0;i<p.length;i+=4){ r+=p[i]; g+=p[i+1]; b+=p[i+2]; }
      return [Math.round(r/n), Math.round(g/n), Math.round(b/n)]; };
    /* Most of a 220x160 window is arena, not barrel, so a whole-frame percentage understates this by
       whatever fraction the model covers. The camera looks AT (46,1,46), so a centre patch is barrel —
       build 1151's rule, cheap version: measure the surface you are reasoning about, not the frame. */
    const W = 220, patch = (p)=>{ const o = [];
      for(let y=64;y<96;y++) for(let x=94;x<126;x++){ const i=(y*W+x)*4; o.push(p[i],p[i+1],p[i+2],255); }
      return o; };

    __shot();                                       // warm-up: discard, so nothing is still settling
    const before = __shot();
    const control = __shot();                       // nothing changed between these two
    for(const m of __mats) for(const k of DATA)
      if(m[k] && m[k].encoding !== 3000){ m[k].encoding = 3000; m[k].needsUpdate = true; }
    for(const m of __mats) m.needsUpdate = true;
    const after = __shot();
    return { control: diff(before, control), fixed: diff(before, after),
             barrelControl: diff(patch(before), patch(control)), barrelFixed: diff(patch(before), patch(after)),
             barrelBefore: mean(patch(before)), barrelAfter: mean(patch(after)),
             meanBefore: mean(before), meanAfter: mean(after) };
  })()`);
  say('whole window control', ab.control);
  say('whole window fixed', ab.fixed);
  console.log('');
  say('BARREL control', ab.barrelControl);
  say('BARREL fixed', ab.barrelFixed);
  say('BARREL mean RGB before', ab.barrelBefore);
  say('BARREL mean RGB after', ab.barrelAfter);
}, { settleMs: 5000 });

console.log('');
