// build 1493 — a box primitive can pinch one end
//
// Reported from play: "I squished a square primitive to a thin rectangle and I wanted one end of it to have
// both corners moved towards the middle, making almost a triangle shape. Right now it isn't possible."
//
// test-1493 executes the geometry maths against the real three build. What only the LIVE game can answer:
// does the collider follow the real shape, does a tapered prop survive serialize/reload, and is a plain box
// byte-identical to what every existing level already contains.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  console.log('settled  ', JSON.stringify(await P(`(function(){ __drive(120); return { gameOn, physWorld: !!physWorld }; })()`)));

  /* THE CONTROL, and it is the whole compatibility claim: an untapered box must be exactly what it was. */
  const control = await P(`(function(){
    spawnProp('box', [40, 0, 40, 0,0,0, 1, 1, 20], (o)=>{ window.__plain = o; });
    const g = __plain.geometry, p = g.attributes.position;
    let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z0=1e9,z1=-1e9;
    for(let i=0;i<p.count;i++){ const a=p.getX(i),b=p.getY(i),c=p.getZ(i);
      if(a<x0)x0=a; if(a>x1)x1=a; if(b<y0)y0=b; if(b>y1)y1=b; if(c<z0)z0=c; if(c>z1)z1=c; }
    return { verts:p.count, taper: __plain.userData.taper||null, box:[x0,x1,y0,y1,z0,z1],
             shape: propShapeInfo(__plain).kind };
  })()`);
  console.log('control  ', JSON.stringify(control), ' <- no taper key, unit box base-at-origin, cuboid collider');

  /* THE REPORT: the +Z end pinched to nothing in x, which is the dart the creator described. */
  const dart = await P(`(function(){
    spawnProp('box', [60, 0, 60, 0,0,0, 1, 1, 20], (o)=>{ window.__d = o; });
    applyPropTaper(window.__d, 'z', 0, 1);
    const p = __d.geometry.attributes.position;
    const at = (zz)=>{ const xs=[]; for(let i=0;i<p.count;i++) if(Math.abs(p.getZ(i)-zz)<1e-6) xs.push(p.getX(i));
                       return +(Math.max.apply(null,xs)-Math.min.apply(null,xs)).toFixed(6); };
    return { taper: __d.userData.taper, widthAtFarEnd: at(0.5), widthAtNearEnd: at(-0.5) };
  })()`);
  console.log('dart     ', JSON.stringify(dart), ' <- 0 at the far end, full width at the near one');

  /* THE COLLIDER FOLLOWS THE REAL SHAPE. A cuboid would be fat exactly where the shape is pinched — an
     invisible wall out at the point of the dart, which is the "bullets hit an invisible wall" class. */
  const coll = await P(`(function(){
    const i = propShapeInfo(window.__d);
    const n = i.pts ? i.pts.length/3 : 0;
    let mx=-1e9, mn=1e9;
    for(let k=0;k<n;k++){ const x=i.pts[k*3]; if(x>mx)mx=x; if(x<mn)mn=x; }
    /* the hull is centred on its own AABB, and off is that same centre — so the cuboid fallback would land
       in exactly the same place rather than half-buried at the body origin */
    return { kind:i.kind, points:n, hullSpanX:+(mx-mn).toFixed(4),
             off:[+i.off.x.toFixed(3), +i.off.y.toFixed(3), +i.off.z.toFixed(3)],
             half:[+i.hx.toFixed(3), +i.hy.toFixed(3), +i.hz.toFixed(3)] };
  })()`);
  console.log('collider ', JSON.stringify(coll), ' <- a hull, offset onto its own centre');

  /* Rapier accepts every shape the taper can actually author — and the FALLBACK is probed rather than
     assumed. The extremes are the ones that could defeat a hull builder: a pyramid whose far end is a
     single point, and a wedge whose far end is a line. */
  const rapier = await P(`(function(){
    const mk = (ax,a,b)=>{ applyPropTaper(window.__d, ax, a, b); return RAPIER.ColliderDesc.convexHull(propShapeInfo(window.__d).pts); };
    const out = { dart: !!mk('z',0,1), pyramid: !!mk('y',0,0), wedge: !!mk('y',1,0), flare: !!mk('y',2,2) };
    /* what DOES defeat it, so the fallback is a measured branch rather than a hopeful one */
    out.collinear = RAPIER.ColliderDesc.convexHull(new Float32Array([0,0,0, 1,0,0, 2,0,0]));
    out.collinearNull = (out.collinear === null || out.collinear === undefined); delete out.collinear;
    out.coplanarNull = (function(){ const d = RAPIER.ColliderDesc.convexHull(new Float32Array([0,0,0, 1,0,0, 0,0,1, 1,0,1])); return d === null || d === undefined; })();
    out.emptyNull = (function(){ try{ const d = RAPIER.ColliderDesc.convexHull(new Float32Array([])); return d === null || d === undefined; }catch(e){ return 'threw'; } })();
    applyPropTaper(window.__d, 'z', 0, 1);   // put the dart back for the rows below
    return out;
  })()`);
  console.log('rapier   ', JSON.stringify(rapier), ' <- every authorable shape builds; the null cases say how reachable the fallback is');

  /* A REAL STATIC BODY, through the engine own path rather than a hand call — for the dart, for the
     pyramid (the most extreme shape the panel can author), and for a FLATTENED prop, which is the only way
     to reach a coplanar point set and therefore the only thing that could ever need the fallback. */
  const body = await P(`(function(){
    const one = (ax,a,b,sy)=>{
      if(__d.userData._physStatic){ physWorld.removeRigidBody(__d.userData._physStatic); __d.userData._physStatic=null; }
      if(sy != null){ __d.scale.y = sy; __d.updateMatrixWorld(true); }
      applyPropTaper(window.__d, ax, a, b);
      let threw = null;
      try{ addStaticColliderFor(window.__d); }catch(e){ threw = String(e && e.message || e).slice(0,60); }
      const rb = __d.userData._physStatic;
      return { body: !!rb, colliders: rb ? rb.numColliders() : 0, threw };
    };
    const out = { dart: one('z',0,1), pyramid: one('y',0,0), flat: one('y',1,1, 0.0000001) };
    __d.scale.y = 1; __d.updateMatrixWorld(true); one('z',0,1);
    return out;
  })()`);
  console.log('body     ', JSON.stringify(body), ' <- the static path takes every one of them');

  /* ROUND TRIP through the real serializer and the real loader. */
  const trip = await P(`(function(){
    const e = propEntry(window.__d);
    const ec = propEntry(window.__plain);
    let back = null;
    spawnProp('box', [90, 0, 90, 0,0,0, 1, 1, 20], (o)=>{ back = o; });
    _applyPropEntry(back, e);
    const p = back.geometry.attributes.position;
    let xs = [];
    for(let i=0;i<p.count;i++) if(Math.abs(p.getZ(i)-0.5)<1e-6) xs.push(p.getX(i));
    return { written: e.tpr, plainWritesNothing: ec.tpr === undefined,
             restored: back.userData.taper,
             widthAtFarEndAfterReload: +(Math.max.apply(null,xs)-Math.min.apply(null,xs)).toFixed(6) };
  })()`);
  console.log('roundtrip', JSON.stringify(trip), ' <- and a plain box grows NO key');

  /* INSTANCING: a batch draws one shared geometry by shape name, so a tapered member would render plain. */
  const inst = await P(`(function(){
    return { plainEligible: instanceEligible(window.__plain), taperedEligible: instanceEligible(window.__d) };
  })()`);
  console.log('instance ', JSON.stringify(inst), ' <- excluded, so a batch can never draw it as a plain box');

  /* the shape really is drawn — a geometry swap that never reaches the renderer is the silent failure */
  const drawn = await P(`(function(){
    const gl = renderer.getContext();
    while(gl.getError() !== gl.NO_ERROR){}
    renderer.render(scene, camera);
    return { glError: gl.getError(), calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
             inScene: !!window.__d.parent, visible: window.__d.visible };
  })()`);
  console.log('drawn    ', JSON.stringify(drawn), ' <- a real frame with the tapered props in it');

  await P(`(function(){ __release(); return 1; })()`);
}, { headless: true });
