// Build 1388: does relief derived from the prop texture's own sample reach the frame — and did the shader
// even compile? A GLSL error in this patch takes every primitive in the level with it, silently, so the
// first thing measured is `glGetError` and the program count, not pixels.
//
// The window is built with `drawnAt` (build 1387's tool): what the RENDERER puts at a pixel, not what a
// raycast hits first. Three rounds of 1387's measurement were taken on pixels a raycast called the floor
// and the renderer was drawing as this very deck.
import { withGame } from './driver.mjs';
import { DRAWN_AT, WHO } from './drawn-at.mjs';

const SETUP = `
  (function(){
    paused = true; _adaptOn = false; _prStepI = 0; _prScale = 1; _applyPixelRatio(); _hiFxOn = true;
    worldCfg.postGrain = 0; worldCfg.autoExp = 0; applyWorldCfg();
    player.pos.set(0, 1.7, 30); player.yaw = 0; player.pitch = -0.28;   // 90% instanced deck by census
    camera.position.set(0, 1.7, 30);
    camera.rotation.set(0, 0, 0, 'YXZ'); camera.rotation.y = 0; camera.rotation.x = -0.28;
    camera.updateMatrixWorld(true);
    return 1;
  })()
`;

// A GLSL failure is the thing this build could get catastrophically wrong, so it is checked first and
// against the real GL, not inferred from the frame.
const HEALTH = `
  (function(){
    renderer.setRenderTarget(null); renderScene(scene, camera);
    const gl = renderer.getContext();
    const info = renderer.info;
    let patched = 0, withN = 0, bad = []; const gated = { tot:0, tangent:0 };
    const seen = new Set();
    scene.traverse(o => {
      if(!o.isMesh) return; const m = o.material; if(!m || seen.has(m.uuid)) return; seen.add(m.uuid);
      const u = m.userData || {};
      if(u._objDetail) patched++;
      if(u._odU && u._odU.uOdTexN) withN++;
      if(u._odTex){ gated.tot++; if(m.normalMap && (m.normalMapType === undefined || m.normalMapType === 0)) gated.tangent++; }
      const props = renderer.properties.get(m);
      if(props && props.currentProgram && props.currentProgram.diagnostics) bad.push(m.type);
    });
    return { glError: gl.getError(), programs: info.programs ? info.programs.length : -1,
             calls: info.render.calls, tris: info.render.triangles,
             patched: patched, withUOdTexN: withN, diagnostics: bad.length,
             odTexMats: gated.tot, ofThoseTangentNormalMapped: gated.tangent };
  })()
`;

const BUILD_WINDOW = `
  (function(){
    const gl = renderer.getContext(); const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const px = []; const tally = {};
    for(let y = 120; y < H - 40; y += 2) for(let x = 12; x < W - 12; x += 3){
      const h = window.__drawnAt(x, y, W, H); if(!h) continue;
      const m = h.object.material;
      const k = window.__who(h).split('@')[0]; tally[k] = (tally[k] || 0) + 1;
      // every pixel proven to be a material this build actually patches
      if(m && m.userData && m.userData._odTex) px.push([x, H - 1 - y]);
    }
    window.__win = px;
    return { n: px.length, drawn: Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,3) };
  })()
`;

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
    return { uniq:uniq.size, lum:+(lum/win.length).toFixed(3), grad:+(grad/gn).toFixed(4) };
  })()
`;

const setN = (v) => `(function(){ _odTexNBase = ${v}; _syncOdBump(); return _odTexNU.value; })()`;

await withGame(async (P) => {
  await P(SETUP); await P(DRAWN_AT); await P(WHO);
  console.log('health ', await P(HEALTH));
  console.log('window ', await P(BUILD_WINDOW));
  const run = async (label, v) => {
    console.log('   uOdTexN =', await P(setN(v)));
    await new Promise(r => setTimeout(r, 400));
    const m = await P(MEASURE);
    console.log(String(label).padEnd(26), JSON.stringify(m));
    return m;
  };
  const off = await run('relief 0 (was)', 0);
  const off2 = await run('relief 0 (control)', 0);
  const on = await run('relief 0.018 (shipped)', 0.018);
  const x4 = await run('relief x4', 0.072);
  const ret = await run('relief 0 (return)', 0);
  const pc = (a,b,k) => (((b[k]-a[k])/a[k])*100).toFixed(2) + '%';
  console.log('\n  control noise   uniq', pc(off,off2,'uniq'), ' grad', pc(off,off2,'grad'));
  console.log('  EFFECT          uniq', pc(off,on,'uniq'), ' grad', pc(off,on,'grad'), ' lum', pc(off,on,'lum'));
  console.log('  x4              uniq', pc(off,x4,'uniq'), ' grad', pc(off,x4,'grad'));
  console.log('  return          uniq', pc(off,ret,'uniq'), ' grad', pc(off,ret,'grad'));
  console.log('  health after   ', await P(HEALTH));
}, { settleMs: 12000 });
