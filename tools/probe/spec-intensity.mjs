// Does `specularIntensity = metalness` (breach.html 21004/21016) cost the frame its lit look?
//
// The window is DERIVED, never picked by eye: two floor points at fixed forward distances are projected
// through the real camera, and every candidate pixel is then RAYCAST to prove it lands on the floor mesh
// and that a second ray toward the sun leaves it unoccluded. A specular term is a LIT-surface term, so a
// shadowed sample cannot show it.
//
// Controls, in order, because in this engine the instrument is wrong more often than the code:
//   * same-condition pair          -> the noise floor
//   * a 10x overdrive              -> the measurement can produce a positive at all
//   * return to the start          -> nothing drifted
import { withGame } from './driver.mjs';

const SETUP = `
  (function(){
    paused = true; _adaptOn = false; _prStepI = 0; _prScale = 1; _applyPixelRatio(); _hiFxOn = true;
    // grain is stochastic per frame and auto-exposure would COMPENSATE the very energy being measured.
    worldCfg.postGrain = 0; worldCfg.autoExp = 0; applyWorldCfg();
    // stand on the ground looking just below the horizon: the floor then fills the lower frame at the
    // grazing angles where F90 lives.
    player.pos.set(0, 1.7, 30); player.yaw = 0; player.pitch = -0.10;
    camera.position.set(0, 1.7, 30);
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;
    camera.updateMatrixWorld(true);
    return 1;
  })()
`;

const BUILD_WINDOW = `
  (function(){
    const fwd = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    const eye = camera.position.clone();
    const sun = _sunDir(); const sv = new THREE.Vector3(sun[0], sun[1], sun[2]).normalize();
    const rc = new THREE.Raycaster(); rc.far = 400;
    // Two things win every ray and are not world geometry (build 1139): the sky dome, a ShaderMaterial box
    // ~1 unit from the camera, and the player's own capsule proxy, which the camera stands INSIDE — six hits
    // at distance 0.00 before anything real. Both are excluded by material class plus a near cut.
    const real = (h) => {
      if(h.distance < 2.0) return false;
      const m = h.object.material; const t = (m && (m.type || (m[0] && m[0].type))) || '';
      return t === 'MeshStandardMaterial' || t === 'MeshPhysicalMaterial';
    };
    const gl = renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    // project two ground points at fixed forward distance -> the band's rows
    const rows = [];
    for(const d of [8, 40]){
      const p = eye.clone().addScaledVector(fwd, d); p.y = 0;
      const q = p.clone().project(camera);
      rows.push(Math.round((1 - (q.y * 0.5 + 0.5)) * H));
    }
    const y0 = Math.min(rows[0], rows[1]), y1 = Math.max(rows[0], rows[1]);
    const px = [];
    for(let y = y0; y <= y1; y += 3){
      for(let x = 20; x < W - 20; x += 5){
        const ndc = new THREE.Vector2((x / W) * 2 - 1, -((y / H) * 2 - 1));
        rc.setFromCamera(ndc, camera);
        const hits = rc.intersectObjects(scene.children, true).filter(real);
        if(!hits.length) continue;
        const h0 = hits[0];
        if(h0.object !== floor) continue;                       // WHO: the engine ground plane, nothing else
        // sun-lit? a specular term is a LIT-surface term, so a shadowed sample cannot show it.
        const o = h0.point.clone().addScaledVector(sv, 0.05);
        const r2 = new THREE.Raycaster(o, sv, 0, 300);
        const occ = r2.intersectObjects(scene.children, true)
          .filter(h => h.distance > 0.02 && h.object !== floor && real({ distance: 9, object: h.object }));
        if(occ.length) continue;
        px.push([x, H - 1 - y, h0.distance]);                   // readPixels is bottom-left origin
      }
    }
    window.__win = px;
    return { W:W, H:H, rowTop:y0, rowBot:y1, n:px.length,
             nearD:+px.reduce((a,p)=>Math.min(a,p[2]), 1e9).toFixed(2),
             farD:+px.reduce((a,p)=>Math.max(a,p[2]), 0).toFixed(2) };
  })()
`;

const MEASURE = `
  (function(){
    renderer.setRenderTarget(null);
    renderScene(scene, camera);
    const gl = renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let r = 0, g = 0, b = 0, lum = 0; const win = window.__win;
    let near = 0, nearN = 0, far = 0, farN = 0;
    const dm = win.reduce((a,p)=>a+p[2],0) / win.length;
    for(const p of win){
      const i = (p[1] * W + p[0]) * 4;
      const L = 0.2126*buf[i] + 0.7152*buf[i+1] + 0.0722*buf[i+2];
      r += buf[i]; g += buf[i+1]; b += buf[i+2]; lum += L;
      if(p[2] < dm){ near += L; nearN++; } else { far += L; farN++; }
    }
    const n = win.length;
    return { r:+(r/n).toFixed(3), g:+(g/n).toFixed(3), b:+(b/n).toFixed(3), lum:+(lum/n).toFixed(3),
             near:+(near/nearN).toFixed(3), far:+(far/farN).toFixed(3) };
  })()
`;

const set = (v) => `(function(){ floorMat.specularIntensity = ${v}; wallMat.specularIntensity = ${v};
  floorMat.needsUpdate = true; wallMat.needsUpdate = true;
  return [floorMat.specularIntensity, floorMat.metalness, wallMat.specularIntensity, wallMat.metalness]; })()`;

await withGame(async (P) => {
  console.log('setup   ', await P(SETUP));
  console.log('shipped ', await P('[floorMat.specularIntensity, floorMat.metalness, wallMat.specularIntensity, wallMat.metalness, floorMat.type]'));
  console.log('window  ', await P(BUILD_WINDOW));

  const run = async (label, v) => {
    await P(set(v));
    await new Promise(r => setTimeout(r, 400));
    const m = await P(MEASURE);
    console.log(String(label).padEnd(22), JSON.stringify(m));
    return m;
  };

  const a = await run('specInt 0.1 (shipped)', 0.1);
  const a2 = await run('specInt 0.1 (control)', 0.1);
  const b = await run('specInt 1.0 (physical)', 1.0);
  const c = await run('specInt 10 (overdrive)', 10);
  const d = await run('specInt 0.1 (return)', 0.1);

  const pc = (x, y) => (((y.lum - x.lum) / x.lum) * 100).toFixed(2) + '%';
  console.log('\n  control noise floor   ', pc(a, a2));
  console.log('  shipped -> physical   ', pc(a, b), ' near', pc({lum:a.near}, {lum:b.near}), ' far', pc({lum:a.far}, {lum:b.far}));
  console.log('  shipped -> 10x        ', pc(a, c));
  console.log('  return                ', pc(a, d));
}, { settleMs: 9000 });
