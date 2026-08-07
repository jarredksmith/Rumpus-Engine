// Why does a KTX2 model render with shattered, faceted shading in Rumpus when every preview shows it right?
//
// Reported with the file. I offered two explanations from READING it and both were wrong; the reporter's
// own control killed the second — they re-exported with a different compression (ktx2/MIX instead of
// ETC1S-everything) and the artifact was IDENTICAL. Same artifact across different texture data rules the
// texture data out. So this stops guessing and reads the material the engine actually built.
//
// Needs `node tools/probe/stage-ktx2.mjs` first: the KTX2 loader and the Basis transcoder come from CDNs
// the headless browser cannot reach, which is why this was unmeasurable until now.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(30) + JSON.stringify(v));

await withGame(async (P) => {
  console.log('\n--- does KTX2 even transcode here? ---------------------------------------------');
  const load = await P(`(async function(){
    paused = true;
    window.__b = null;
    spawnProp('http://127.0.0.1:8899/barrel.glb', [46, 1, 46, 0,0,0, 1,1,1], (o)=>{ window.__b = o; });
    for(let i=0;i<400 && (!window.__b || _glbPending>0);i++) await new Promise(r=>setTimeout(r,50));
    if(!window.__b) return { FAILED:'model never arrived', ktx2Unavailable: !!window.__KTX2_UNAVAILABLE,
                             fails: (typeof _assetFailures!=='undefined') ? _assetFailures.slice(0,2) : null };
    let mats = [], tris = 0;
    __b.traverse(m=>{ if(!m.isMesh) return;
      const g = m.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count)/3;
      const ms = Array.isArray(m.material) ? m.material : [m.material];
      for(const mt of ms) mats.push(mt);
      window.__mesh = m; });
    return { ok:true, tris, mats: mats.length, ktx2Unavailable: !!window.__KTX2_UNAVAILABLE };
  })()`);
  say('loaded', load);
  if (!load.ok) { console.log('\n! cannot proceed — the model did not load'); return; }

  console.log('\n--- the MATERIAL the engine built ----------------------------------------------');
  const mat = await P(`(function(){
    const m = __mesh, mt = Array.isArray(m.material) ? m.material[0] : m.material;
    const tex = (t)=> t ? { type:t.constructor.name, w:t.image&&t.image.width, h:t.image&&t.image.height,
                            fmt:t.format, encoding:t.encoding, flipY:t.flipY, mips:(t.mipmaps||[]).length,
                            aniso:t.anisotropy, gen:t.generateMipmaps } : null;
    return {
      material: mt.constructor.name,
      vertexColors: mt.vertexColors,
      hasColorAttr: !!m.geometry.attributes.color,
      attrs: Object.keys(m.geometry.attributes),
      side: mt.side, flatShading: mt.flatShading,
      emissive: mt.emissive && mt.emissive.getHexString(), emissiveIntensity: mt.emissiveIntensity,
      normalScale: mt.normalScale && [mt.normalScale.x, mt.normalScale.y],
      metalness: mt.metalness, roughness: mt.roughness, envMapIntensity: mt.envMapIntensity,
      /* the two detail systems that patch a standard material (builds 1145, 1379) — both are supposed to
         refuse a mesh that has UVs and authored maps, which this one does */
      patched: Object.prototype.hasOwnProperty.call(mt, 'onBeforeCompile'),
      odSpan: mt.userData && mt.userData._odSpan, procSurf: !!(mt.userData && mt.userData.procSurf),
      maps: { map:tex(mt.map), normalMap:tex(mt.normalMap), roughnessMap:tex(mt.roughnessMap),
              metalnessMap:tex(mt.metalnessMap), emissiveMap:tex(mt.emissiveMap), aoMap:tex(mt.aoMap),
              lightMap:tex(mt.lightMap) },
    };
  })()`);
  for (const k of Object.keys(mat)) if (k !== 'maps') say(k, mat[k]);
  console.log('\n  MAPS:');
  for (const [k, v] of Object.entries(mat.maps)) if (v) say('    ' + k, v);
  for (const [k, v] of Object.entries(mat.maps)) if (!v) console.log('    ' + k.padEnd(28) + 'null');

  console.log('\n--- and what the ENGINE does to it after load -----------------------------------');
  const after = await P(`(function(){
    const m = __mesh, mt = Array.isArray(m.material) ? m.material[0] : m.material;
    return {
      bakedWorld: !!(typeof worldCfg!=='undefined' && worldCfg.baked),
      bakeRan: !!(m.geometry.attributes.color),
      objDetailWanted: (typeof objDetailWanted==='function') ? objDetailWanted(mt, m) : 'n/a',
      albedoDetailWanted: (typeof albedoDetailWanted==='function') ? albedoDetailWanted(mt, m) : 'n/a',
      uvSets: Object.keys(m.geometry.attributes).filter(k=>/^uv/.test(k)),
      cacheKey: typeof mt.customProgramCacheKey==='function' ? String(mt.customProgramCacheKey()).slice(0,60) : null,
    };
  })()`);
  for (const k of Object.keys(after)) say(k, after[k]);
}, { settleMs: 5000, console: true });

console.log('');
