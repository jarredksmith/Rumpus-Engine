// Does a "decoration only" prop still get a PHYSICS BODY?
//
// Build 1324 gave props `noCol` — a real, serialized "decoration only" so a bush cannot block a doorway.
// It empties the collider box list and neutralises the raycast. But `addStaticColliderFor` tests `fx`,
// `vehicle`, `phys` and the build-1194 stamps, and NOT `noCol` — so the Rapier trimesh may still be built.
//
// If it is, two things follow, and they are different sizes:
//   1. the prop costs its full physics build at load (~1.3 ms per 1,000 triangles, measured in
//      tools/probe/heavy-model.mjs) for a body nothing should ever touch;
//   2. worse, DYNAMIC props would bounce off an intangible bush — which is build 1194's own recorded bug
//      ("hideprop removed a static prop's collider from the query list but left its Rapier body — an
//      invisible physics wall") arriving by a second door.
//
// The control is an identical prop WITHOUT the flag: if neither gets a body the rig is broken, and if both
// do then noCol simply does not reach this path.
import { withGame } from './driver.mjs';

const out = [];
const P_ = (ok, what, detail) => out.push({ ok, what, detail });

await withGame(async (P) => {
  const r = await P(`(function(){
    paused = false;
    const B = 46;
    const mk = (tag, noCol) => { let o=null;
      spawnProp('box', [B + (noCol?4:-4), 1, B, 0,0,0, 1,2,1], (b)=>{o=b;});
      o.userData.tag = tag;
      if(noCol){ o.userData.noCol = true; if(typeof applyPropNoCollide==='function') applyPropNoCollide(o); }
      if(typeof refreshPropCollider==='function') refreshPropCollider(o);
      if(typeof addStaticColliderFor==='function') addStaticColliderFor(o);
      return o;
    };
    const bush = mk('bush', true), post = mk('post', false);
    return {
      physicsWorld: !!physWorld,
      bush: { noCol:!!bush.userData.noCol, boxes:(bush.userData.boxes||[]).length,
              body: !!bush.userData._physStatic },
      post: { noCol:!!post.userData.noCol, boxes:(post.userData.boxes||[]).length,
              body: !!post.userData._physStatic },
    };
  })()`);
  console.log('\n', JSON.stringify(r, null, 1));

  P_(r.physicsWorld, 'the probe has a real physics world, or nothing below means anything', r.physicsWorld);
  P_(r.post.body, 'CONTROL: an ordinary prop gets a static body', r.post);
  P_(r.bush.boxes === 0, 'the decoration has no collider boxes, which is build 1324 working', r.bush);
  P_(!r.bush.body,
    'and it gets NO physics body either — otherwise an intangible bush is solid to every dynamic prop, ' +
    'and pays a trimesh build for a body nothing should touch',
    r.bush);

  // the load cost, if the body is being built
  if (r.bush.body) {
    const cost = await P(`(function(){
      const B = 46; let o=null;
      spawnProp('box', [B, 1, B+8, 0,0,0, 1,2,1], (b)=>{o=b;});
      o.userData.noCol = true;
      if(typeof applyPropNoCollide==='function') applyPropNoCollide(o);
      refreshPropCollider(o);
      const t0 = _pnow(); addStaticColliderFor(o);
      return { ms:+(_pnow()-t0).toFixed(2), body:!!o.userData._physStatic };
    })()`);
    console.log('  a decoration prop still costs', JSON.stringify(cost));
  }

  // ---- THE CASE THAT DECIDES IT: a MODEL, where the trimesh path runs ----------------------------
  // The bush above is a primitive, and the primitive path builds a cuboid from `_psize` — which build 1324
  // has emptied, so the collider comes out degenerate and nothing touches it. A non-primitive goes through
  // `trimeshDescFor`, which reads the MESH TRIANGLES and knows nothing about noCol.
  const model = await P(`(async function(){
    const B = 46;
    const mkModel = (tag, noCol, z) => {
      const N = 4000, pos = new Float32Array(N*9);
      for(let i=0;i<N;i++){ const a=i*9, u=(i%40)*0.05-1, v=Math.floor(i/40)*0.05;
        pos[a]=u; pos[a+1]=v*0.05; pos[a+2]=-0.5; pos[a+3]=u+0.05; pos[a+4]=v*0.05; pos[a+5]=-0.5;
        pos[a+6]=u; pos[a+7]=v*0.05+2; pos[a+8]=0.5; }
      const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos,3));
      g.computeVertexNormals();
      const grp=new THREE.Group(); grp.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial()));
      grp.position.set(B, 0, z);
      grp.userData={ src:'https://example.invalid/bush.glb', nid:tag, tag:tag };
      if(noCol){ grp.userData.noCol = true; if(typeof applyPropNoCollide==='function') applyPropNoCollide(grp); }
      scene.add(grp); propModels.push(grp);
      refreshPropCollider(grp);
      const t0=_pnow(); addStaticColliderFor(grp);
      return { tag, ms:+(_pnow()-t0).toFixed(2), body:!!grp.userData._physStatic,
               boxes:(grp.userData.boxes||[]).length };
    };
    const deco = mkModel('decoModel', true, B+14);
    const wall = mkModel('wallModel', false, B+20);
    return { deco, wall };
  })()`);
  console.log('\n  a 4,000-triangle MODEL:', JSON.stringify(model));
  P_(model.wall.body, 'CONTROL: an ordinary model gets a body', model.wall);
  P_(!model.deco.body,
    'a MODEL marked decoration-only gets no physics body — this is the case where it matters, because a ' +
    'non-primitive builds a real trimesh of its triangles and would be genuinely solid',
    model.deco);

  // ...and the question that decides whether this is a footnote or a defect: is that body SOLID?
  const modelSolid = await P(`(async function(){
    const B = 46;
    const drop = async (z) => { let c=null;
      spawnProp('box', [B, 7, z, 0,0,0, 0.5,0.5,0.5], (b)=>{c=b;});
      setPropDynamic(c, true); if(typeof addStaticColliderFor==='function') addStaticColliderFor(c);
      for(let i=0;i<160;i++) await new Promise(r=>requestAnimationFrame(r));
      return +c.position.y.toFixed(2); };
    const onDeco = await drop(B+14);
    const onWall = await drop(B+20);
    return { onDeco, onWall };
  })()`);
  /* REPORTED, NOT ASSERTED. This rig cannot tell solid from not: the CONTROL (an ordinary wall model)
     also let its crate fall through, and a second run had the primitive case not fall at all. A null with
     a failed control is an instrument, not a finding — so the solidity half of this question is left OPEN
     and the build rests on what IS directly readable: the body is created, and every branch that creates
     it attaches a real collider. */
  console.log('  crates dropped on each model rest at', JSON.stringify(modelSolid),
              '  <- NOT asserted: the control fell through too, so this rig cannot tell solid from not');

  // and the one that actually matters in play: does a falling crate land ON the bush?
  const solid = await P(`(async function(){
    const B = 46;
    const bush = propModels.find(o=>o&&o.userData&&o.userData.tag==='bush');
    let crate=null; spawnProp('box', [bush.position.x, 6, bush.position.z, 0,0,0, 0.6,0.6,0.6], (b)=>{crate=b;});
    setPropDynamic(crate, true);
    if(typeof addStaticColliderFor==='function') addStaticColliderFor(crate);
    for(let i=0;i<140;i++) await new Promise(r=>requestAnimationFrame(r));
    return { restedY:+crate.position.y.toFixed(2), bushTop:+(bush.position.y+1).toFixed(2) };
  })()`);
  console.log('  a crate dropped onto the primitive rests at', JSON.stringify(solid),
              '  <- also not asserted; two runs disagreed (0 then 6)');
}, { settleMs: 5000 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   ' + String(JSON.stringify(o.detail)).slice(0, 150) : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
