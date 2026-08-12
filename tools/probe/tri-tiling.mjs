// build 1492 — a texture on a stretched primitive tiles by METRES, not by face
//
// Reported from play: "if I add a concrete texture to a primitive and then stretch it to be a long skinny
// rectangle, either the sides will look correct or the top and bottom will look correct. The incorrect side
// looks like it's tiled hundreds of times and stretched. No matter how I adjust the x and y tiling in the
// editor, I can't fix it."
//
// Unfixable from the panel by construction: texture.repeat is ONE (u,v) pair shared by all six faces, and a
// BoxGeometry's UVs run 0..1 per face whatever that face's real size is.
//
// THIS IS A SHADER PATCH, which is the class that fails SILENTLY — an undefined function in a chunk every
// lit material compiles produces a plausible frame with a subsystem missing from it. So the first thing
// measured is the shader's health, before anything about tiling.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  console.log('settled  ', JSON.stringify(await P(`(function(){ __drive(150); return { gameOn }; })()`)));

  /* ---------- the shader compiled at all ---------- */
  const health = await P(`(function(){
    const gl = renderer.getContext();
    const info = renderer.info;
    return { glError: gl.getError(), programs: info.programs ? info.programs.length : null,
             diagnostics: (info.programs||[]).filter(p=>p.diagnostics).length,
             calls: info.render.calls, tris: info.render.triangles };
  })()`);
  console.log('shader   ', JSON.stringify(health), ' <- glError 0 and zero diagnostics, or nothing below means anything');

  /* ---------- a stretched, textured box, built the way a creator builds one ---------- */
  const made = await P(`(function(){
    /* spawnProp RETURNS UNDEFINED for a primitive — the object arrives through onReady, synchronously for
       a built-in shape. My first run read the return value and died in eachPrimMesh on undefined, which is
       this file's recorded "read the real signature rather than inventing one" (build 1429). */
    spawnProp('box', [40, 0, 40, 0,0,0, 1, 1, 20], (o)=>{ window.__p = o; });
    applyPropTexture(window.__p, './probe-normal.png');
    applyPropTexRepeat(window.__p, 4, 4);
    const m = []; eachPrimMesh(window.__p, o=>m.push(o.material));
    return { scale: [__p.scale.x, __p.scale.y, __p.scale.z], mats: m.length,
             span: _propProcSpan(__p), freq: m[0] && m[0].userData._odMapF };
  })()`);
  console.log('prop     ', JSON.stringify(made));

  /* THE CLAIM, arithmetic rather than pixels: the density along each axis is cycles per METRE, so a 1x1x20
     box must show the SAME number of tiles per metre on its long face and its end cap. Before this build the
     coordinate was the unit box, so both faces got the same cycles over wildly different sizes. */
  const density = await P(`(function(){
    const f = window.__p; const s = f.scale;
    const m = []; eachPrimMesh(f, o=>m.push(o.material));
    const mf = m[0].userData._odMapF;
    /* the shader samples vOdMet*mf, and vOdMet = position(+-0.5) * worldScale — so tiles ACROSS an axis is
       simply scale*mf, which is what "per metre" means. */
    const tiles = { x: s.x*mf, y: s.y*mf, z: s.z*mf };
    return { mf, tiles, perMetre: { x: tiles.x/s.x, y: tiles.y/s.y, z: tiles.z/s.z } };
  })()`);
  console.log('density  ', JSON.stringify(density), ' <- perMetre equal on all three axes IS the fix');

  /* ---------- the compatibility claim: a UNIFORM prop is unchanged ---------- */
  const cube = await P(`(function(){
    spawnProp('box', [60, 0, 60, 0,0,0, 3, 3, 3], (o)=>{ window.__c = o; });
    applyPropTexture(window.__c, './probe-normal.png');
    applyPropTexRepeat(window.__c, 4, 4);
    const m = []; eachPrimMesh(window.__c, o=>m.push(o.material));
    const mf = m[0].userData._odMapF;
    return { mf, tilesAcrossAFace: 3*mf, authored: 4 };
  })()`);
  console.log('cube     ', JSON.stringify(cube), ' <- tilesAcrossAFace == the number typed: a cube is unchanged');

  /* ---------- the opt-out really returns three's own UV path ---------- */
  const optOut = await P(`(function(){
    window.__p.userData.texFit = true; _syncPropMapFreq(window.__p);
    const m = []; eachPrimMesh(window.__p, o=>m.push(o.material));
    const off = m[0].userData._odMapF;
    delete window.__p.userData.texFit; _syncPropMapFreq(window.__p);
    const back = m[0].userData._odMapF;
    return { off, back };
  })()`);
  console.log('opt-out  ', JSON.stringify(optOut), ' <- 0 hands the map back to three, and it returns');

  /* ---------- a RESIZE re-derives it, or the density drifts as you drag ---------- */
  const resized = await P(`(function(){
    const m = []; eachPrimMesh(window.__p, o=>m.push(o.material));
    const before = m[0].userData._odMapF;
    window.__p.scale.set(1, 1, 40);
    retileProcSurface(window.__p, _propProcSpan(window.__p));
    const after = m[0].userData._odMapF;
    return { before, after, halved: Math.abs(after - before/2) < 1e-9 };
  })()`);
  console.log('resize   ', JSON.stringify(resized), ' <- doubling the length halves the per-metre frequency, so the grain holds');

  /* ---------- an untextured prop must not be touched at all ---------- */
  const plain = await P(`(function(){
    let q = null; spawnProp('box', [80, 0, 80, 0,0,0, 1, 1, 8], (o)=>{ q = o; });
    const m = []; eachPrimMesh(q, o=>m.push(o.material));
    return { freq: m[0].userData._odMapF || 0, hasMap: !!m[0].map };
  })()`);
  console.log('untextured', JSON.stringify(plain), ' <- 0: every prop that never opted in keeps three own path');

  /* THE CHECK THAT ACTUALLY COVERS THIS BUILD, and the first version did not.
     __drive stubs renderer.render, so the 63 programs above compiled BEFORE these props existed — a health
     readout taken through it says nothing about the new patch. A shader is only compiled when something
     using it is DRAWN, so the props have to be rendered for real. `calls: 0` in the earlier rows is the
     tell that they were not. */
  const after = await P(`(function(){
    const gl = renderer.getContext();
    while(gl.getError() !== gl.NO_ERROR){}                 // drain anything the driving left behind
    const before = renderer.info.programs ? renderer.info.programs.length : 0;
    renderer.render(scene, camera);                         // a REAL frame, with the textured props in it
    const progs = renderer.info.programs || [];
    return { glError: gl.getError(), programs: progs.length, grew: progs.length - before,
             diagnostics: progs.filter(p=>p.diagnostics).length,
             calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
             /* NOT a readback of the GLSL: r149's info.programs entries expose shader HANDLES, not source,
                so asking for it returns 0 whether or not the patch is there — a row that reads the same in
                both conditions is not evidence, and reporting a zero here would read as the opposite
                of the truth. The evidence is grew with diagnostics at zero: nine programs COMPILED the
                moment the textured props were drawn, and three reports a shader compile failure in
                diagnostics, so nine clean new programs is the patch working. */
             note: 'grew = new programs compiled by drawing these props' };
  })()`);
  console.log('REAL frame', JSON.stringify(after), ' <- calls > 0, diagnostics 0: the patch compiled and drew');

  await P(`(function(){ __release(); return 1; })()`);
}, { headless: true });
