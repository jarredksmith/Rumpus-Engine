import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 626: spark() pools its Mesh + Material per geometry and recycles them on death, instead of new/dispose
// per particle on every impact. The shared geometry was already reused; this kills the per-particle GC churn.

// --- wiring ---
assert(/const _sparkPool = \[\], _flashPool = \[\];/.test(src), 'spark pools declared');
const sp = extractFunction('spark');
assert(/_getSpark\(_sparkPool, _sparkGeo, col, !!fx\.glow/.test(sp), 'debris sparks come from the pool');
assert(/_getSpark\(_flashPool, _sparkFlashGeo, col, true/.test(sp), 'the flash sprite comes from its own pool');
assert(/pool:_sparkPool/.test(sp) && /pool:_flashPool/.test(sp), 'each spark record remembers its pool for recycling');
assert(!/new THREE\.MeshBasicMaterial/.test(sp), 'spark() no longer allocates a material per particle');
// death path recycles pooled sparks, still disposes unpooled (death-fx) ones
assert(/if\(s\.pool\)\{ s\.mesh\.visible=false; s\.pool\.push\(s\.mesh\); \}/.test(src), 'a dead pooled spark is recycled, not disposed');
assert(/else if\(s\.mesh\.material&&s\.mesh\.material\.dispose\)\{ s\.mesh\.material\.dispose\(\); \}/.test(src), 'unpooled death-fx sparks still dispose their material');

// --- executable: _getSpark reuses a pooled mesh and reconfigures the material (no stale glow state) ---
const deps = `
  const _added=[];
  const THREE={ AdditiveBlending:2, NormalBlending:1,
    Mesh:function(geo,mat){ this.geometry=geo; this.material=mat; this.visible=false;
      this.scale={ setScalar:(v)=>{ this._s=v; } }; this.position={ copy:(p)=>{ this.px=p.x; } }; },
    MeshBasicMaterial:function(o){ this.transparent=!!(o&&o.transparent); this.opacity=1; this.blending=0; this.depthWrite=true;
      this.color={ _v:0, set:(c)=>{ this.color._v=c; } }; } };
  const scene={ add:(m)=>_added.push(m) };
`;
const api = new Function(deps + '\n' + extractFunction('_getSpark') + '\n return { _getSpark, added:()=>_added.length };')();

const pool = [];
const m1 = api._getSpark(pool, {}, 0xff0000, true, 0.1, { x:1, y:2, z:3 });   // glow spark
assert(m1.material.blending === 2 && m1.material.depthWrite === false, 'a glow spark is additive + no depth write');
assert(m1.material.color._v === 0xff0000 && m1.material.opacity === 1 && m1.visible === true, 'spark configured + shown');
assert(api.added() === 1, 'the spark was added to the scene');

pool.push(m1);   // simulate the mesh being recycled on death
const m2 = api._getSpark(pool, {}, 0x00ff00, false, 0.2, { x:0, y:0, z:0 });   // non-glow reuse
assert(m2 === m1, 'the pooled mesh is reused (no new allocation)');
assert(m2.material.blending === 1 && m2.material.depthWrite === true && m2.material.color._v === 0x00ff00, 'the reused material is fully reconfigured (no leftover glow state)');

done('spark mesh/material pooling: no per-particle new/dispose churn on impacts (build 626)');
