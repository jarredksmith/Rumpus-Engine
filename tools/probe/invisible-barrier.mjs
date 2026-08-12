// build 1495 — an invisible barrier
//
// Reported from play: "is there a way to create an invisible barrier so players can't walk into certain
// areas? Primitive opacity doesn't go totally transparent."
//
// It did not: Math.max(0.15, ...) clamped every opacity to a 15% floor, in two places. The floor is 0 now,
// and 0 means barrier. What only the live game can answer: is it really not drawn, is it really still solid,
// does it come back in the editor, and does it survive a save.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  console.log('settled  ', JSON.stringify(await P(`(function(){ __drive(120); return { gameOn, editorOpen }; })()`)));

  /* Two identical walls far from the stock level's own geometry (build 1323's rule), one of them a barrier.
     The ordinary one is the control for every row below. */
  const made = await P(`(function(){
    spawnProp('box', [300, 0, 300, 0,0,0, 8, 4, 0.5], (o)=>{ window.__wall = o; });
    spawnProp('box', [320, 0, 300, 0,0,0, 8, 4, 0.5], (o)=>{ window.__bar  = o; });
    applyPropOpacity(window.__bar, 0);
    const mat = (o)=>{ let m=null; eachPrimMesh(o, x=>{ m = x.material; }); return m; };
    window.__mat = mat;
    return { barOp: __bar.userData.op, wallOp: __wall.userData.op == null ? 'unset' : __wall.userData.op,
             barVisible: mat(__bar).visible, wallVisible: mat(__wall).visible };
  })()`);
  console.log('made     ', JSON.stringify(made), ' <- opacity really reaches 0, and the barrier is not drawn');

  /* STILL SOLID. The engine's own collider list and the walk query are what decide whether a player can
     pass, so they are what is asked — not the material. */
  const solid = await P(`(function(){
    const boxes = (o)=> (o.userData.boxes||[]).length;
    const inList = (o)=> colliders.indexOf(o) >= 0;
    /* a point INSIDE each wall: insideSolid is the query the movement code uses */
    const at = (x)=> (typeof insideSolid==='function') ? insideSolid(x, 300, 1.0) : null;
    return { barBoxes: boxes(__bar), wallBoxes: boxes(__wall),
             barInColliders: inList(__bar), wallInColliders: inList(__wall),
             insideBarrier: at(320), insideWall: at(300), insideOpenGround: at(340) };
  })()`);
  console.log('solid    ', JSON.stringify(solid), ' <- identical to the visible wall, and open ground says false');

  /* A REAL PHYSICS BODY too, so a dynamic crate cannot roll through it either. */
  const body = await P(`(function(){
    addStaticColliderFor(window.__bar); addStaticColliderFor(window.__wall);
    return { barBody: !!__bar.userData._physStatic, wallBody: !!__wall.userData._physStatic };
  })()`);
  console.log('body     ', JSON.stringify(body));

  /* NOT DRAWN, measured on the renderer rather than on the flag — and ALTERNATED, because the first draft
     read 274 / 352 / 429 with the control climbing monotonically. Draw calls here are still settling for
     many frames (shadow-map refreshes, the culling ladder), so a single before/after measures the settling
     and not the barrier. Twenty warm renders first, then hidden/shown/hidden, and the two hidden readings
     have to agree or the row means nothing (build 1430's rule). */
  const drawn = await P(`(function(){
    const gl = renderer.getContext();
    camera.position.set(310, 3, 330); camera.lookAt(310, 2, 300); camera.updateMatrixWorld(true);
    while(gl.getError() !== gl.NO_ERROR){}
    /* renderer.info.autoReset is FALSE in this engine (it accumulates across the multi-pass frame), so a
       raw read of .calls is a running total — which is what made the first draft climb 274/352/429 and the
       second 1605/1965/2320 at ~72 a render. Reset per sample, exactly as build 1414's probe had to. */
    const shot = ()=>{ renderer.info.reset(); renderer.render(scene, camera); return renderer.info.render.calls; };
    for(let i=0;i<20;i++) shot();
    const a = shot();
    __mat(__bar).visible = true;  for(let i=0;i<4;i++) shot(); const on = shot();
    __mat(__bar).visible = false; for(let i=0;i<4;i++) shot(); const b = shot();
    return { glError: gl.getError(), hidden: a, shown: on, hiddenAgain: b,
             controlReturns: a === b, costsExactlyOneDraw: (on - a) === 1 };
  })()`);
  console.log('drawn    ', JSON.stringify(drawn), ' <- controlReturns, and the barrier is worth exactly one draw call');

  /* NO SHADOW. r149 copies material.visible onto the depth material and gates the shadow pass on it. */
  const shadow = await P(`(function(){
    let castsA = null, castsB = null;
    eachPrimMesh(__bar,  o=>{ castsA = o.castShadow; });
    eachPrimMesh(__wall, o=>{ castsB = o.castShadow; });
    return { barMeshCastShadow: castsA, wallMeshCastShadow: castsB,
             barMaterialVisible: __mat(__bar).visible,
             note: 'the mesh flag is untouched; the DEPTH pass is gated on material.visible' };
  })()`);
  console.log('shadow   ', JSON.stringify(shadow));

  /* SELECTABLE WHILE AUTHORING — the thing that would make this feature unusable if it were missing. */
  const editor = await P(`(function(){
    if(!editorOpen) toggleEditor();
    const inEd = { visible: __mat(__bar).visible, opacity: +__mat(__bar).opacity.toFixed(3),
                   transparent: __mat(__bar).transparent };
    toggleEditor();
    const inPlay = { visible: __mat(__bar).visible, opacity: +__mat(__bar).opacity.toFixed(3) };
    return { inEd, inPlay };
  })()`);
  console.log('editor   ', JSON.stringify(editor), ' <- a ghost you can see and click, then gone again');

  /* ROUND TRIP: the zero must survive the serializer AND the loader — `+op||1` turned it into 1. */
  const trip = await P(`(function(){
    const e = propEntry(window.__bar), ew = propEntry(window.__wall);
    let back = null;
    spawnProp('box', [340, 0, 300, 0,0,0, 8, 4, 0.5], (o)=>{ back = o; });
    _applyPropEntry(back, e);
    if(e.mat) applyStoredMaterial(back, e.mat);
    return { written: e.mat ? e.mat.op : undefined, plainWritesNothing: !ew.mat || ew.mat.op === undefined,
             restoredOp: back.userData.op, restoredVisible: __mat(back).visible,
             restoredBoxes: (back.userData.boxes||[]).length };
  })()`);
  console.log('roundtrip', JSON.stringify(trip), ' <- 0 out, 0 back, still solid');

  /* AND A SHOT PASSES THROUGH, by build 1236's own rule rather than a special case. */
  const shot = await P(`(function(){
    let barGhost = null, wallGhost = null;
    eachPrimMesh(__bar,  o=>{ barGhost  = _shotGhost(o, null); });
    eachPrimMesh(__wall, o=>{ wallGhost = _shotGhost(o, null); });
    return { barrierIsAGhostToShots: barGhost, ordinaryWallIsNot: wallGhost };
  })()`);
  console.log('shots    ', JSON.stringify(shot));

  await P(`(function(){ __release(); return 1; })()`);
}, { headless: true });
