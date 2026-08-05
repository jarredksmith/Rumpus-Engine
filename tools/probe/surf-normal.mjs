// Build 1387: does an authored normal map reach the frame, on a surface at roughness 0.95?
//
// A rough surface spreads its specular lobe until relief mostly shows in the DIFFUSE N·L term, so the
// honest measurand is not "is it brighter" — it is "does the surface carry per-pixel variation it did not
// carry before". Hence unique colours and local contrast, not the mean.
//
// The A/B swaps `floorMat.normalMap` between the loaded texture and the procedural fallback that shipped
// before this build, which is the real comparison: the slot was never empty, it held uncorrelated
// micro-noise. Same-condition control first, and a 4x normalScale overdrive to prove the instrument fires.
import { withGame } from './driver.mjs';
import { DRAWN_AT, WHO } from './drawn-at.mjs';

const SETUP = `
  (function(){
    paused = true; _adaptOn = false; _prStepI = 0; _prScale = 1; _applyPixelRatio(); _hiFxOn = true;
    worldCfg.postGrain = 0; worldCfg.autoExp = 0; applyWorldCfg();
    player.pos.set(40, 1.7, 40); player.yaw = 2.4; player.pitch = -0.30;   // 89.6% FLOOR-PLANE by census
    camera.position.set(40, 1.7, 40);
    camera.rotation.set(0, 0, 0, 'YXZ'); camera.rotation.y = 2.4; camera.rotation.x = -0.30;
    camera.updateMatrixWorld(true);
    window.__auth = floorMat.normalMap;                              // the authored map, once loaded
    window.__proc = (floorMat.userData && floorMat.userData.procSurf && floorMat.userData.procSurf.normalMap) || null;
    return { authored: !!window.__auth, authoredUrl: floorMat._normalMapUrl || '',
             proc: !!window.__proc, same: window.__auth === window.__proc,
             rough: floorMat.roughness, scale: floorMat.normalScale.toArray() };
  })()
`;

// Window derived by projection + raycast, exactly as build 1386's: every pixel proven to be the floor mesh.
const BUILD_WINDOW = `
  (function(){
    // WHAT THE RENDERER DRAWS, not what a raycast hits first. Three earlier rounds of this measurement
    // were taken on pixels a raycast called the floor and the renderer was drawing as an instanced deck:
    // r149 reports a batch hit against the SHARED unit-box geometry (build 1139), so a near-distance cut
    // threw those hits away and the floor behind won.
    const gl = renderer.getContext(); const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const px = []; const tally = {};
    for(let y = 90; y < H - 30; y += 2) for(let x = 12; x < W - 12; x += 3){
      const h = window.__drawnAt(x, y, W, H);
      const k = window.__who(h).split('@')[0]; tally[k] = (tally[k] || 0) + 1;
      if(h && h.object === floor) px.push([x, H - 1 - y]);
    }
    window.__win = px;
    return { W:W, H:H, n:px.length,
             drawn: Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,4) };
  })()
`;

// unique colours + mean |neighbour difference| along the row — relief is LOCAL variation, not a level shift
const MEASURE = `
  (function(){
    renderer.setRenderTarget(null); renderScene(scene, camera);
    const gl = renderer.getContext(); const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W*H*4); gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,buf);
    const win = window.__win, uniq = new Set(); let lum = 0, grad = 0, gn = 0;
    const L = (x,y) => { const i = (y*W+x)*4; return 0.2126*buf[i]+0.7152*buf[i+1]+0.0722*buf[i+2]; };
    for(const p of win){
      const i = (p[1]*W+p[0])*4;
      uniq.add((buf[i]<<16)|(buf[i+1]<<8)|buf[i+2]); lum += L(p[0], p[1]);
      if(p[0] > 1 && p[0] < W-2){ grad += Math.abs(L(p[0]+1,p[1]) - L(p[0]-1,p[1])); gn++; }
    }
    return { n:win.length, uniq:uniq.size, lum:+(lum/win.length).toFixed(3), grad:+(grad/gn).toFixed(4) };
  })()
`;

const use = (what, scale) => `(function(){
  floorMat.normalMap = ${what === 'auth' ? 'window.__auth' : (what === 'none' ? 'null' : 'window.__proc')};
  floorMat.normalScale.set(${scale}, ${scale});
  floorMat.needsUpdate = true;
  return [!!floorMat.normalMap, floorMat.normalMap === window.__auth, floorMat.normalScale.x]; })()`;

await withGame(async (P) => {
  console.log('setup  ', await P(SETUP));
  await P(DRAWN_AT); await P(WHO);
  console.log('window ', await P(BUILD_WINDOW));
  const run = async (label, what, scale) => {
    console.log('   ->', await P(use(what, scale)));
    await new Promise(r => setTimeout(r, 500));
    const m = await P(MEASURE);
    console.log(String(label).padEnd(28), JSON.stringify(m));
    return m;
  };
  const n0 = await run('NO normal map at all', 'none', 1);
  const p1 = await run('procedural (shipped pre)', 'proc', 1);
  const p2 = await run('procedural (control)', 'proc', 1);
  const a1 = await run('authored (this build)', 'auth', 1);
  const a4 = await run('authored x4', 'auth', 4);
  const a40 = await run('authored x40 (absurd)', 'auth', 40);
  const p3 = await run('procedural (return)', 'proc', 1);
  const pc = (a, b, k) => (((b[k]-a[k])/a[k])*100).toFixed(2) + '%';
  console.log('\n  is relief worth anything here?');
  console.log('    none -> procedural   uniq', pc(n0,p1,'uniq'), ' grad', pc(n0,p1,'grad'));
  console.log('    none -> authored     uniq', pc(n0,a1,'uniq'), ' grad', pc(n0,a1,'grad'));
  console.log('  control noise          uniq', pc(p1,p2,'uniq'), ' grad', pc(p1,p2,'grad'));
  console.log('  proc -> authored       uniq', pc(p1,a1,'uniq'), ' grad', pc(p1,a1,'grad'), ' lum', pc(p1,a1,'lum'));
  console.log('  can the probe fire?    x4', pc(p1,a4,'grad'), '   x40', pc(p1,a40,'grad'),
              '  (uniq x40', pc(p1,a40,'uniq') + ')');
  console.log('  return                 uniq', pc(p1,p3,'uniq'), ' grad', pc(p1,p3,'grad'));
}, { settleMs: 12000 });
