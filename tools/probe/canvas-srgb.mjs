// Does the sRGB tag on a canvas texture reach the frame, and by how much?
//
// The arithmetic says a bullet decal's core arrives ~13x too bright untagged and a sign ~2.3x. Both are
// claims about the DECODE, so the honest A/B is to flip `encoding` on the shipped texture and re-render the
// same frame — the pixels either move by the transfer or the tag is reaching nothing.
//
// Every row has a control that must return EXACTLY. Grain and auto-exposure are stochastic per frame
// (build 1152's failure #3), so both are off and the world is paused before anything is read.
import { withGame } from './driver.mjs';
import { DRAWN_AT } from './drawn-at.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(34) + JSON.stringify(v));

await withGame(async (P) => {
  say('settled', await P(`(function(){
    paused = true;
    worldCfg.postGrain = 0; worldCfg.autoExp = 0; applyWorldCfg();
    return { build: BUILD_VERSION, paused:true };
  })()`));

  /* ---- 1. the tag is actually on the textures ------------------------------------------------------ */
  say('decal texture', await P(`(function(){
    const t = _getDecalTex();
    return { enc: t.encoding, sRGB: t.encoding === 3001, hasColorSpace: ('colorSpace' in t) };
  })()`));

  say('flipbook sheets', await P(`(function(){
    const out = {};
    for(const k of ['muzzle','explosion','smoke']){
      _seedProcVfx(k);
      const e = _vfxTex[k] && _vfxTex[k].tex;
      out[k] = e ? e.encoding : null;
    }
    return out;
  })()`));

  /* The data maps must NOT have moved — build 1429's defect in the mirror, and the direction that would
     have quietly ruined every generated level's interior bake. */
  say('procedural detail maps (DATA)', await P(`(function(){
    const p = _procSurface();
    return { normal: p && p.normalMap && p.normalMap.encoding,
             rough:  p && p.roughnessMap && p.roughnessMap.encoding,
             linear3000: !!(p && p.normalMap && p.normalMap.encoding === 3000) };
  })()`));

  /* ---- 2. what it is worth on real pixels ---------------------------------------------------------- */
  // A sign is UNLIT, so its board colour reaches the frame with nothing in between — it is the cleanest
  // surface in the engine to read a decode off. Build it away from the stock geometry (build 1323).
  const shot = `(function(enc){
    for(const o of propModels){
      if(o && o.userData && o.userData.sign && o.material && o.material.map){
        o.material.map.encoding = enc; o.material.map.needsUpdate = true; o.material.needsUpdate = true;
      }
    }
    /* The board is a PlaneGeometry(1,1) translated so its BASE sits at y=0 (build 871), scaled [4,2,1] —
       so it spans y 0..2 and its middle is y=1. The probe's first run aimed at y=2, i.e. exactly the top
       EDGE, and read a window that was half sky: the effect measured 1.16x against a predicted 2.3x.
       Build 1151's rule, for the fifth time — read WHO the renderer draws there before believing a number. */
    camera.position.set(200, 1.0, 205); camera.up.set(0,1,0);
    camera.lookAt(200, 1.0, 200); camera.updateMatrixWorld(true);
    for(let i=0;i<12;i++) renderScene(scene, camera);
    const gl = renderer.getContext();
    const w = renderer.domElement.width, h = renderer.domElement.height;
    const px = new Uint8Array(4*64*64);
    gl.readPixels((w>>1)-32, (h>>1)-32, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let r=0,g=0,b=0; for(let i=0;i<64*64;i++){ r+=px[i*4]; g+=px[i*4+1]; b+=px[i*4+2]; }
    const n = 64*64;
    return { enc, r:+(r/n).toFixed(1), g:+(g/n).toFixed(1), b:+(b/n).toFixed(1) };
  })`;

  const made = await P(`(function(){
    let made = 0;
    spawnProp('sign', [200, 0, 200, 0, 0, 0, 4, 2, 1], (o)=>{ if(o){
      o.userData.sign = { text:' ', size:100, color:'#808080', bg:'#808080', bga:1, align:'center' };
      if(typeof _signRender === 'function') _signRender(o);
      /* a sign ships noCol (build 1411), which neutralises its raycast — restore the prototype method so
         the WHO check below can see it at all */
      delete o.raycast;
      made++;
    }});
    return { made, props: propModels.length };
  })()`);
  say('sign fixture', made);

  /* IS THE WINDOW ON THE BOARD? Build 1387 settled the same question by painting the surface and watching
     whether the window followed — a raycast answers a different question from the renderer, and the first
     run of this probe read a window that was half sky while every state readout beside it was correct. */
  const paint = `(function(hex){
    /* propModels carries NULL HOLES — build 1389's asset-failure path leaves one where a model url 404s */
    for(const o of propModels) if(o && o.userData && o.userData.sign) o.material.color.setHex(hex);
    camera.position.set(200, 1.0, 205); camera.up.set(0,1,0);
    camera.lookAt(200, 1.0, 200); camera.updateMatrixWorld(true);
    for(let i=0;i<10;i++) renderScene(scene, camera);
    const gl = renderer.getContext(), w = renderer.domElement.width, h = renderer.domElement.height;
    const px = new Uint8Array(4*64*64);
    gl.readPixels((w>>1)-32, (h>>1)-32, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let r=0,g=0,b=0; for(let i=0;i<64*64;i++){ r+=px[i*4]; g+=px[i*4+1]; b+=px[i*4+2]; }
    const n=64*64; return { r:+(r/n).toFixed(1), g:+(g/n).toFixed(1), b:+(b/n).toFixed(1) };
  })`;
  const white = await P(paint + `(0xffffff)`);
  const red   = await P(paint + `(0xff0000)`);
  const backW = await P(paint + `(0xffffff)`);
  say('board painted white', white);
  say('board painted RED', red);
  say('control, white again', backW);
  /* The verdict is the COLLAPSE plus a returning control. An earlier draft demanded the control come back
     byte-identical and called a real positive a failure over 2 code values of settling — a control returns
     within the noise floor, and the noise floor has to be stated rather than assumed to be zero. */
  const collapse = white.g > 0 ? red.g / white.g : 1;
  say('green under red paint', +collapse.toFixed(3));
  say('control drift (code values)', +Math.abs(backW.g - white.g).toFixed(1));
  say('window is on the board', (collapse < 0.25 && Math.abs(backW.g - white.g) < 4)
      ? 'YES — it follows the paint, and the control comes back'
      : 'NO — the window is not the surface being measured');

  console.log('\n--- the same sign, only the decode changed ------------------------------------------');
  await P(shot + `(3001)`);                                   // warm
  const tagged = await P(shot + `(3001)`);   say('tagged   sRGB (3001)', tagged);
  const bare   = await P(shot + `(3000)`);   say('untagged linear (3000)', bare);
  const back   = await P(shot + `(3001)`);   say('control, back to 3001', back);

  const ok = back.r === tagged.r && back.g === tagged.g && back.b === tagged.b;
  say('control returns', ok ? 'EXACTLY' : 'NO — instrument, not a finding');
  if (ok && tagged.g > 0) say('untagged / tagged (green)', +(bare.g / tagged.g).toFixed(2));
}, { settleMs: 5000 });

console.log('');
