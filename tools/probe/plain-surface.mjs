// build 1393: "There needs to be a way to remove the default material and texture of primitives. The user
// may want just a solid color primitive without texture or materials."
//
// What a plain primitive must become is FLAT — one colour, shaded only by the light. So the measurement is
// the number of UNIQUE COLOURS across a primitive's face, which is exactly what four builds of procedural
// detail exist to raise (1379 measured itself the same way, in the other direction).
//
// A CONTROL THAT RETURNS is not optional here: postGrain is stochastic per frame and the scene settles, so
// a single before/after pair proves nothing (build 1152's failure #3, verbatim).
import fs from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { withGame } from './driver.mjs';
import { pngDecode } from '../../tests/albedo.mjs';
import { DRAWN_AT, WHO } from './drawn-at.mjs';

const TMP = fs.mkdtempSync('/tmp/plain-');

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(`(function(){
    /* pinned top rung, paused, grain and auto-exposure off — in a running game the scene is the noise floor */
    _adaptOn=false; _prStepI=0; _prScale=1; _applyPixelRatio(); _hiFxOn=true;
    worldCfg.postGrain=0; worldCfg.autoExp=0; worldCfg.postMotion=0; applyWorldCfg();
    /* one big box filling the view, so the measurement is the SURFACE and not the level behind it */
    const o = propModels.find(p=>p && p.userData && isMatPrimitive(p.userData.src) && !p.userData.phys);
    if(!o) return { err:'no primitive' };
    o.userData._probe = 1;
    o.position.set(0, 0, 34); o.scale.set(8, 8, 1); o.rotation.set(0,0,0);
    applyPropColor(o, 0x8a7f6e); applyPropShine(o, 0.6, 0.1);
    if(typeof refreshPropCollider==='function') refreshPropCollider(o);
    player.pos.set(0, 2.0, 26); player.yaw = Math.PI; player.pitch = 0;
    camera.position.copy(player.pos); camera.rotation.set(0, Math.PI, 0, 'YXZ'); camera.updateMatrixWorld(true);
    paused = true;
    const m = o.children.length ? (o.children[0].material || o.material) : o.material;
    return { src:o.userData.src, hasNormalMap: !!(m&&m.normalMap), hasRoughMap: !!(m&&m.roughnessMap),
             odDetail: m&&m.userData&&m.userData._objDetail, odTex: !!(m&&m.userData&&m.userData._odTex),
             odOn: m&&m.userData?m.userData._odOn:undefined };
  })()`)));

  // Toggling alone is not enough to MEASURE: at deploy an eligible primitive is swept into an
  // InstancedMesh and removed from the scene, so its own material is no longer drawn (the first run of this
  // probe read `inScene:false, batched:true` and a window full of SKY, with every state readout correct).
  // A creator toggles this in the EDITOR, where instancing is off, and the batch is rebuilt on the next
  // deploy from a member's material — so rebuilding here measures the path they actually get, and proves
  // build 1393's `_instKey` change carries the flag into the batch.
  const set = (v) => P(`(function(){
    const o = propModels.find(p=>p&&p.userData&&p.userData._probe);
    teardownInstancing();
    applyPropPlain(o, ${v});
    const m = o.children.length ? (o.children[0].material || o.material) : o.material;
    const own = { plain:!!o.userData.plain, nrm:!!m.normalMap, rgh:!!m.roughnessMap, odOn:m.userData._odOn,
                  uniform: (m.userData._odU && m.userData._odU.uOdOn) ? m.userData._odU.uOdOn.value : 'no-shader-yet',
                  key: _instKey(o) };
    buildInstancing();
    /* and what the BATCH got, if this prop was batched */
    let bm = null;
    scene.traverse(x=>{ if(x.isInstancedMesh && !bm && x.material && x.material.userData && x.material.userData._objDetail) bm = x.material; });
    own.batchOdOn = bm ? bm.userData._odOn : 'not-batched';
    own.batchNrm = bm ? !!bm.normalMap : 'not-batched';
    own.batched = (typeof instancedProps!=='undefined') ? instancedProps.indexOf(o)>=0 : '?';
    return own;
  })()`);

  // A window on the box's own face, derived by PROJECTING it rather than picked by eye (build 1124/1151).
  //
  // AND CAPTURED THROUGH page.screenshot(), not by drawing the canvas into a 2D context: the first run of
  // this probe did the latter and read mean [0,0,0] with ONE unique colour in every condition, control
  // included. `preserveDrawingBuffer` is false, so the drawing buffer is gone by the time page JS can copy
  // it — build 1344's lesson #3, and the control is the only reason it read as an instrument fault rather
  // than as "plain changes nothing".
  const measure = async (label) => {
    // wait on FRAMES, not the wall clock — this sandbox renders ~1.5 fps (build 1344)
    await P(`new Promise(r=>{ let n=0; const t=()=>{ if(++n>10) return r(1); requestAnimationFrame(t); }; requestAnimationFrame(t); })`);
    const win = await P(`(function(){
      const o = propModels.find(p=>p&&p.userData&&p.userData._probe);
      const b = new THREE.Box3().setFromObject(o); const c = b.getCenter(new THREE.Vector3());
      const v = c.clone().project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return { x: Math.round((v.x*0.5+0.5)*r.width), y: Math.round((-v.y*0.5+0.5)*r.height) };
    })()`);
    const file = path.join(TMP, label.replace(/[^a-z0-9]+/gi, '-') + '.png');
    await page.screenshot({ path: file, clip: { x: win.x - 90, y: win.y - 90, width: 180, height: 180 }, timeout: 180000 });
    const { w, h, ch, data } = pngDecode(readFileSync(file));
    const seen = new Set(); let r = 0, g = 0, b2 = 0, n = 0;
    for (let i = 0; i < w * h; i++) {
      const o = i * ch; seen.add((data[o] << 16) | (data[o+1] << 8) | data[o+2]);
      r += data[o]; g += data[o+1]; b2 += data[o+2]; n++;
    }
    const px = { unique: seen.size, mean: [Math.round(r/n), Math.round(g/n), Math.round(b2/n)] };
    /* build 1151's rule: READ WHO. A window derived by projection is still a guess about what the RENDERER
       drew there — and if the prop was swept into an instancing batch it is not in the scene at all, so
       editing its material reaches nothing on screen while every state readout stays perfectly correct. */
    px.who = JSON.parse(await P('(function(){' + DRAWN_AT + WHO + `
      const r = renderer.domElement; const h = __drawnAt(${win.x}, ${win.y}, r.width, r.height);
      const o = propModels.find(p=>p&&p.userData&&p.userData._probe);
      return JSON.stringify({ at: h ? __who(h) : 'sky', d: h ? +h.distance.toFixed(2) : null,
        inScene: !!(o && o.parent),
        instancing: (typeof instancingActive!=='undefined') ? instancingActive : '?',
        batched: (typeof instancedProps!=='undefined') ? instancedProps.indexOf(o)>=0 : '?' });
    })()`));
    console.log(label.padEnd(22), JSON.stringify({ ...win, ...px }));
    return px;
  };

  // one THROWAWAY measurement first: the first read of any run is taken before the scene has settled, and
  // the first version of this probe reported a 20% mean shift that never returned in the control because of
  // exactly that. The A/B/A below is all post-settle.
  console.log('state detailed:', JSON.stringify(await set(false)));
  await measure('warm-up (discarded)');
  const a = await measure('DETAILED (before)');
  console.log('state plain   :', JSON.stringify(await set(true)));
  const b = await measure('PLAIN');
  console.log('state detailed:', JSON.stringify(await set(false)));
  const c = await measure('DETAILED (control)');

  console.log('\nunique colours  detailed', a.unique, '-> plain', b.unique,
    '-> back', c.unique, '  (control returns to', (c.unique / a.unique).toFixed(3) + 'x)');
  console.log('mean            ', JSON.stringify(a.mean), JSON.stringify(b.mean), JSON.stringify(c.mean));

  // ---- the INSTANCING batch, which is where a shipped level actually renders these ------------------
  // A batch clones ONE member's material, so a plain prop and a detailed one sharing an _instKey would give
  // whichever sorted first its surface to both. Four twins, two of them plain, is the smallest set that
  // forms two real batches (a singleton is never instanced).
  console.log('\nbatch:', JSON.stringify(await P(`(function(){
    teardownInstancing();
    const src = propModels.find(p=>p&&p.userData&&p.userData._probe);
    /* real props through the engine's own spawner. Cloning the prop and then its MATERIAL threw inside
       three's Material.copy (it deep-copies userData through JSON, and a patched material's userData holds
       the live shader uniforms) — the engine's own buildInstancing survives that because it re-assigns
       userData shallowly straight afterwards, which is verified separately. Spawn properly instead. */
    const made = [];
    for(let i=0;i<4;i++){
      spawnProp('box', [-20 + i*4, 0, 60, 0,0,0, 8,8,1], (o)=>{ o.userData._twin=1; made.push(o); },
        null, null, { col: 0x8a7f6e, shine: { r:0.6, m:0.1 } });
    }
    const twins = propModels.filter(p=>p&&p.userData&&p.userData._twin);
    if(twins.length < 4) return { err:'spawn is async here', n:twins.length };
    applyPropPlain(twins[0], true); applyPropPlain(twins[1], true);
    const keys = twins.map(o=>_instKey(o));
    buildInstancing();
    const batches = [];
    scene.traverse(x=>{ if(x.isInstancedMesh && x.material && x.material.userData && x.material.userData._objDetail)
      batches.push({ n:x.count, nrm:!!x.material.normalMap, odOn:x.material.userData._odOn }); });
    const r = { distinctKeys: [...new Set(keys)].length, plainKeyHasP: keys[0].endsWith('|P'),
                detailedKeyHasP: keys[3].endsWith('|P'), batches };
    teardownInstancing();
    for(const c of twins){ const i=propModels.indexOf(c); if(i>=0) propModels.splice(i,1); scene.remove(c); }
    return r;
  })()`)));

  // ---- and the round trip, because a flag that does not survive a save is not a setting
  console.log('\nround trip:', JSON.stringify(await P(`(function(){
    const o = propModels.find(p=>p&&p.userData&&p.userData._probe);
    applyPropPlain(o, true);
    const e = propEntry(o);
    const off = (function(){ applyPropPlain(o, false); return propMaterialDesc(o); })();
    applyPropPlain(o, true);
    return { serialized: e.mat && e.mat.pln, whenOff: off && off.pln };
  })()`)));

  console.log('creator texture untouched:', JSON.stringify(await P(`(function(){
    const o = propModels.find(p=>p&&p.userData&&p.userData._probe);
    const m = o.children.length ? (o.children[0].material || o.material) : o.material;
    /* stand in for a creator's own normal map: a texture that is NOT ours */
    const mine = new THREE.Texture(); m.normalMap = mine;
    applyPropPlain(o, true);
    const kept = (m.normalMap === mine);
    applyPropPlain(o, false);
    const stillKept = (m.normalMap === mine);
    m.normalMap = null; applyPropPlain(o, false);
    return { keptWhenPlain: kept, notOverwrittenOnRestore: stillKept, restoredOurs: !!m.normalMap };
  })()`)));
}, { settleMs: 9000 });
