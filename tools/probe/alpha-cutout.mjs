// build 1340 — alpha cutout. The flags being set is not the finding; HOLES IN THE FRAME are. So a prop is
// given a texture that is half transparent in vertical stripes, stood in front of the camera against the
// sky, and the frame is screenshot and counted: with the cutout off the whole card is solid, with it on
// roughly half of it is sky.
import { withGame } from './driver.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'probe-out');

const SETUP = `(function(){
  // a 64x64 texture: vertical stripes, alternately opaque white and FULLY transparent
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d');
  cx.clearRect(0,0,64,64); cx.fillStyle = '#ffffff';
  for(let i=0;i<64;i+=8) cx.fillRect(i,0,4,64);
  const tex = new THREE.CanvasTexture(cv);

  // stand a thin box card in front of the player, facing them, with nothing behind it but sky
  player.pos.set(0, 40, 0); camera.position.set(0, 40, 0);
  player.yaw = Math.PI; player.pitch = 0;
  camera.rotation.set(0, Math.PI, 0);
  // spawnProp returns nothing for a primitive — it hands the object to onReady, and takes a 9-tuple
  // (position, rotation, scale), not an options object. Two probe faults in one line on the first run.
  let card = null;
  spawnProp('box', [0, 38, 6, 0, 0, 0, 4, 4, 0.05], (o)=>{ card = o; });
  if(!card) return { err:'no card' };
  card.position.set(0, 38, 6);
  applyPropColor(card, 0xffffff);
  eachPrimMesh(card, o=>{ o.material.map = tex; o.material.needsUpdate = true; });
  window.__card = card;
  return { src: card.userData.src, matPrim: isMatPrimitive(card.userData.src) };
})()`;

const FLAGS = `(function(){
  const out = [];
  eachPrimMesh(window.__card, o=>out.push({ alphaTest:o.material.alphaTest, transparent:o.material.transparent,
    opacity:+o.material.opacity.toFixed(2), depthWrite:o.material.depthWrite,
    side:(o.material.side===THREE.DoubleSide?'double':o.material.side===THREE.FrontSide?'front':'back') }));
  return out[0];
})()`;

await withGame(async (P, page) => {
  console.log('card             ' + JSON.stringify(await P(SETUP)));
  // build 1124's rule: know what is in the frame before judging a pixel. The first two runs of this probe
  // sampled the middle scanline and produced numbers that were the OPPOSITE of the prediction — because the
  // card was not on that scanline at all. Project it and confirm, then sample through IT.
  const where = await P(`(function(){
    camera.updateMatrixWorld(true);
    const v = new THREE.Vector3(); window.__card.getWorldPosition(v); v.project(camera);
    const r = new THREE.Raycaster(); r.setFromCamera({x:v.x, y:v.y}, camera);
    const hit = r.intersectObject(window.__card, true)[0];
    return { ndc:[+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)], onScreen: Math.abs(v.x)<1 && Math.abs(v.y)<1 && v.z<1,
             raycastHitsCard: !!hit, dist: hit ? +hit.distance.toFixed(2) : null };
  })()`);
  console.log('where            ' + JSON.stringify(where));
  if(!where.onScreen || !where.raycastHitsCard){ console.log('\n*** the card is not in shot — every pixel below would be meaningless'); }
  const cardY = where.ndc[1];

  const shot = async (label) => {
    const file = path.join(DIR, 'cut.png');
    fs.writeFileSync(file, await page.screenshot());
    return page.evaluate(async (NDCY) => {
      const img = new Image(); img.src = '/cut.png?' + Math.random(); await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      const d = c.getContext('2d').getImageData(0, 0, img.width, img.height).data;
      // the scanline through the CARD's own projected centre, not the middle of the frame
      const y = Math.round((1 - (NDCY + 1) / 2) * img.height);
      // Don't threshold on a number picked blind. Read the scanline, report its RUN STRUCTURE: a striped
      // cutout has many alternating runs, a solid card has one. That is the property, and it needs no
      // guess about what the card's lit colour happens to be.
      const lum = [];
      for (let x = (img.width * 0.25) | 0; x < (img.width * 0.75) | 0; x++) {
        const o = (y * img.width + x) * 4;
        lum.push((d[o] + d[o + 1] + d[o + 2]) / 3);
      }
      const lo = Math.min(...lum), hi = Math.max(...lum), mid = (lo + hi) / 2;
      let runs = 1;
      for (let i = 1; i < lum.length; i++) if ((lum[i] > mid) !== (lum[i - 1] > mid)) runs++;
      const bright = lum.filter(v => v > mid).length;
      return { px: lum.length, min: Math.round(lo), max: Math.round(hi), runs,
               pctBright: +(100 * bright / lum.length).toFixed(1), scanY: y };
    }, cardY);
  };

  for (const cut of [0, 0.5]) {
    await P(`applyPropCutout(window.__card, ${cut}); 1`);
    await new Promise(r => setTimeout(r, 500));
    console.log('\ncutout ' + cut);
    console.log('  material       ' + JSON.stringify(await P(FLAGS)));
    console.log('  scanline       ' + JSON.stringify(await shot()) + '   (a FLAT range = a solid card; alternating = holes)');
  }

  // the one-writer property: nudging opacity must not un-cut the leaves
  console.log('\nONE WRITER');
  console.log('  cutout 0.5, then applyPropOpacity(0.4):');
  await P('applyPropCutout(window.__card, 0.5); applyPropOpacity(window.__card, 0.4); 1');
  console.log('    ' + JSON.stringify(await P(FLAGS)));
  console.log('  ...then cutout 0 — the stored opacity comes back:');
  await P('applyPropCutout(window.__card, 0); 1');
  console.log('    ' + JSON.stringify(await P(FLAGS)));

  console.log('\nROUND TRIP');
  console.log('  ' + JSON.stringify(await P(`(function(){
    applyPropCutout(window.__card, 0.5);
    const d = propMaterialDesc(window.__card);
    applyPropCutout(window.__card, 0);
    // the mesh is not children[0] — go through the engine's own walker
    let at = null; eachPrimMesh(window.__card, o=>{ if(at===null) at = o.material.alphaTest; });
    const off = { cut: window.__card.userData.cut, alphaTest: at };
    applyStoredMaterial(window.__card, d);
    let back = null; eachPrimMesh(window.__card, o=>{ if(back===null) back = o.material.alphaTest; });
    return { serialized: d.cut, whileOff: off, restored: +back };
  })()`)));
}, { settleMs: 4500 });
