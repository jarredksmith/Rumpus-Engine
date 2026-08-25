// build 1506 — painted floor keeps the BASE texture's bump (the report: dirt painted over cobblestone
// still shows the cobblestone lines). Measured as relief SHADING under the stock sun: paint the whole
// splat full-weight with the default white layer, so the albedo is uniform and every remaining pixel
// gradient in the painted render is the normal/roughness maps talking. Run on the pre-fix tree for the
// defect's number, then on the fixed tree — same instrument, same camera, same sun.
import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  await P(`(function(){ __drive(30); return 1; })()`);

  /* the floor's authored normal map must have LANDED or both conditions measure a flat floor */
  for (let i = 0; i < 40; i++) {
    const ok = await P(`(function(){
      const n = floorMat.normalMap;
      return !!(n && n.image && n.image.width > 0);
    })()`);
    if (ok) break;
    await new Promise(r => setTimeout(r, 500));
    if (i === 39) { console.log('FLOOR NORMAL MAP NEVER LOADED — every row below measures a flat floor'); }
  }

  const out = await P(`(function(){
    paused = true;
    /* one eval: paint, pose, render, read — the frame loop cannot rewrite the camera mid-measure */
    const rt = new THREE.WebGLRenderTarget(320, 320, { type: THREE.FloatType, depthBuffer: true });
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    cam.position.set(40, 18, 40); cam.lookAt(40, 0, 40); cam.updateMatrixWorld(true);
    const N = 320, buf = new Float32Array(N*N*4);
    const shoot = ()=>{
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
      renderer.readRenderTargetPixels(rt, 0, 0, N, N, buf);
      /* mean |dL| between horizontal neighbours over the centre 120x120 block — pure relief metric */
      let g = 0, n = 0;
      for(let y = 100; y < 220; y++) for(let x = 100; x < 219; x++){
        const i = (y*N + x)*4, j = i + 4;
        const a = 0.2126*buf[i]+0.7152*buf[i+1]+0.0722*buf[i+2];
        const b = 0.2126*buf[j]+0.7152*buf[j+1]+0.0722*buf[j+2];
        g += Math.abs(b - a); n++;
      }
      let m = 0, c = 0;
      for(let y = 100; y < 220; y++) for(let x = 100; x < 220; x++){
        const i = (y*N + x)*4; m += 0.2126*buf[i]+0.7152*buf[i+1]+0.0722*buf[i+2]; c++;
      }
      return { grad: g/n, mean: m/c };
    };
    /* A: full-weight paint everywhere, default WHITE layer — albedo uniform, relief is the only signal */
    for(let i = 0; i < _paintData.length; i += 4){ _paintData[i] = 255; _paintData[i+1] = 0; _paintData[i+2] = 0; }
    _paintCtx.putImageData(_paintImg, 0, 0); _paintTex.needsUpdate = true;
    _paintU.uPHas.value.set(1, 0, 0);
    const painted = shoot();
    /* B: paint off — the cross-run control (cobble albedo + bump, must match between trees) */
    _paintU.uPHas.value.set(0, 0, 0);
    const bare = shoot();
    /* restore */
    for(let i = 0; i < _paintData.length; i += 4){ _paintData[i] = 0; _paintData[i+1] = 0; _paintData[i+2] = 0; }
    _paintCtx.putImageData(_paintImg, 0, 0); _paintTex.needsUpdate = true;
    rt.dispose(); paused = false;
    return { painted, bare,
             nrm: !!floorMat.normalMap, rgh: !!floorMat.roughnessMap,
             expo: +renderer.toneMappingExposure.toFixed(4),
             diag: (renderer.info.programs||[]).filter(p=>p.diagnostics).length };
  })()`);
  console.log('PAINTED (white, full weight)  grad', out.painted.grad.toFixed(5), ' mean', out.painted.mean.toFixed(4));
  console.log('BARE    (cross-run control)   grad', out.bare.grad.toFixed(5),    ' mean', out.bare.mean.toFixed(4));
  console.log('state', JSON.stringify({ nrm: out.nrm, rgh: out.rgh, expo: out.expo, shaderDiagnostics: out.diag }));

  await P(`(function(){ __release(); return 1; })()`);
}, { headless: true });
