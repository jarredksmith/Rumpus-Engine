// What a HALF-MILLION-TRIANGLE prop costs this engine — reported from play as "the FPS is all over the
// place, and if you jump over, or land on, or come in contact with one of these props, the game basically
// freezes".
//
// The reported model is a wooden ramp: 497,912 triangles, 280,990 vertices, Draco-compressed to 1.72 MB.
// The FILE SIZE is the trap — it looks like nothing and decompresses to half a million triangles.
//
// The player's own HUD had already ruled out rendering: `render 1.5 ms` against `other 13.0 ms`, so 13 of a
// 14.6 ms frame was going somewhere in the loop that is not the renderer. This finds where.
//
// The exact .glb cannot be loaded here (Draco needs a decoder from a CDN this sandbox blocks), so the mesh
// is SYNTHESIZED at the same triangle count. That is the right measurand anyway: the question is what the
// engine does with half a million triangles, not what it does with this particular ramp.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + k.padEnd(36) + JSON.stringify(v));

await withGame(async (P) => {
  const build = (tris) => `(function(){
    paused = true;
    /* build 1323: somewhere nothing else lives */
    const N = ${tris};
    const pos = new Float32Array(N * 9);
    /* a ramp-shaped slab, finely tessellated — the geometry a sculpt/photogrammetry export produces */
    const W = 6, D = 10, H = 3, S = Math.ceil(Math.sqrt(N / 2));
    let k = 0;
    for(let i = 0; i < S && k < N * 9; i++) for(let j = 0; j < S && k < N * 9; j++){
      const x0 = -W/2 + W * i / S,     x1 = -W/2 + W * (i+1) / S;
      const z0 = -D/2 + D * j / S,     z1 = -D/2 + D * (j+1) / S;
      const y0 = H * (j / S),          y1 = H * ((j+1) / S);
      pos[k++]=x0; pos[k++]=y0; pos[k++]=z0;  pos[k++]=x1; pos[k++]=y0; pos[k++]=z0;  pos[k++]=x1; pos[k++]=y1; pos[k++]=z1;
      if(k >= N*9) break;
      pos[k++]=x0; pos[k++]=y0; pos[k++]=z0;  pos[k++]=x1; pos[k++]=y1; pos[k++]=z1;  pos[k++]=x0; pos[k++]=y1; pos[k++]=z1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x8a6a44 }));
    const grp = new THREE.Group(); grp.add(mesh);
    grp.position.set(400, 0, 400);
    grp.userData = { src: 'synth://ramp', nid: 'heavy1' };
    scene.add(grp); propModels.push(grp);
    window.__ramp = grp;
    return { triangles: N };
  })()`;

  for (const TRIS of [497912, 40000, 2000]) {
    console.log('\n================ ' + TRIS.toLocaleString() + ' triangles ================');
    say('built', await P(build(TRIS)));

    const grid = await P(`(function(){
      const o = __ramp;
      const t0 = performance.now(); refreshPropCollider(o);
      const ms = +(performance.now()-t0).toFixed(1);
      return { firstCallMs: ms, boxes: (o.userData.boxes||[]).length, offThreadPast: MGRID_SYNC_TRIS };
    })()`);
    say('refreshPropCollider, first call (ms)', grid.firstCallMs);

    const settled = await P(`(async function(){
      for(let i=0;i<300;i++){ await new Promise(r=>setTimeout(r,50)); if((__ramp.userData.boxes||[]).length > 1) break; }
      return { boxes: (__ramp.userData.boxes||[]).length };
    })()`);
    say('COLLIDER BOXES it derives', settled.boxes);

    // clearAt / insideSolid / groundHeightAt run every frame, per actor. Each walks the candidate
    // colliders' box lists (builds 1148, 1188) — so standing ON the prop is the worst case.
    const q = await P(`(function(){
      const o = __ramp, N = 300;
      const at = (x,z) => { const t0 = performance.now();
        for(let i=0;i<N;i++){ clearAt(x, 1.2, z, 0.4); insideSolid(x, 1.2, z); groundHeightAt(x, z); }
        return +((performance.now()-t0)/N).toFixed(4); };
      const on = at(o.position.x, o.position.z), away = at(0, 0);
      return { onMs: on, awayMs: away, ratio: away>0 ? +(on/away).toFixed(1) : null,
               perFrameEstimate: +(on*3).toFixed(2) };
    })()`);
    say('one query triple ON it (ms)', q.onMs);
    say('...at the origin (ms)', q.awayMs);
    say('ON THE PROP IS N x SLOWER', q.ratio);

    const phys = await P(`(function(){
      if(!physWorld) return 'no physics world';
      const o = __ramp;
      const t0 = performance.now(); addStaticColliderFor(o);
      return { trimeshBuildMs: +(performance.now()-t0).toFixed(1), body: !!o.userData._physStatic };
    })()`);
    say('Rapier static trimesh build (ms)', phys);

    await P(`(function(){ const i = propModels.indexOf(__ramp); if(i>=0) removeProp(i); return 1; })()`);
  }

  console.log('\n================ control ================');
  say('same queries, nothing there', await P(`(function(){
    const N = 300, t0 = performance.now();
    for(let i=0;i<N;i++){ clearAt(400, 1.2, 400, 0.4); insideSolid(400, 1.2, 400); groundHeightAt(400, 400); }
    return { perTripleMs: +((performance.now()-t0)/N).toFixed(4), colliders: colliders.length };
  })()`));
}, { settleMs: 6000 });

console.log('');
