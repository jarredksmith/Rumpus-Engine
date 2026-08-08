// The editor's selection box: does it show a STALE outline when there is nothing to outline?
//
// Reported from play alongside the decal ghost: "if I press 'p' and open the editor, it shows a huge
// bounding box on the prop. If I drag one of the gizmo handles, after a second it resizes to the correct
// size." Build 1434 measured `userData.box` and found it exact at load and unchanged by a refresh, so the
// collider is not it. The outline is a THREE.BoxHelper, and three's own update() reads:
//
//     if ( _box.isEmpty() ) return;
//
// — it KEEPS ITS PREVIOUS GEOMETRY rather than clearing, and the caller then sets .visible = true. So a
// selection with nothing to measure yet (a prop whose model has not landed) is outlined with whatever the
// helper was last pointed at. For the POOLED helpers that is worse still: `ensureSelBoxes` builds them as
// `new THREE.BoxHelper(scene)`, so their previous geometry is THE WHOLE SCENE.
//
// An empty Group is exactly what an un-landed model prop looks like to Box3, so the mechanism is isolated
// without racing the loader — and a fully loaded prop is the control in the same run.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(26) + JSON.stringify(v));

await withGame(async (P) => {
  const r = await P(`(async function(){
    paused = true;
    const rnd = v => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
    const boxOf = (o) => { const b = new THREE.Box3().setFromObject(o), s = new THREE.Vector3();
      if(b.isEmpty()) return 'EMPTY'; b.getSize(s); return { size: rnd(s), min: rnd(b.min) }; };
    /* what a helper is actually DRAWING: its own 8 corners, in world space */
    const drawn = (b) => { if(!b) return null;
      const pa = b.geometry.attributes.position, bb = new THREE.Box3();
      for(let i=0;i<pa.count;i++) bb.expandByPoint(new THREE.Vector3(pa.getX(i), pa.getY(i), pa.getZ(i)));
      const s = new THREE.Vector3(); bb.getSize(s);
      return { size: rnd(s), min: rnd(bb.min) }; };

    window.__a = null;
    spawnProp('http://127.0.0.1:8899/arch.glb', [40, 0, 40, 0,0,0, 8,8,8], (o)=>{ window.__a = o; });
    for(let i=0;i<400 && (!window.__a || _glbPending>0);i++) await new Promise(r=>setTimeout(r,50));
    if(!__a) return { FAILED:'no model' };
    __a.updateMatrixWorld(true);

    if(!editorOpen) toggleEditor();
    editorActive = 'props';
    /* the PRIMARY selection is an index into propModels — selProps is the multi-selection */
    const sel = (o) => { selProps.length = 0; editorTargets.props.idx = propModels.indexOf(o);
                         updateSelectionHighlight(); };

    /* ---- the control: a fully loaded prop ------------------------------------------------------- */
    sel(__a);
    const loaded = drawn(selBox), trueA = boxOf(__a);

    /* ---- a prop with nothing in it yet, which is what an un-landed model is --------------------- */
    const ghost = new THREE.Group(); ghost.position.set(-40, 0, -40);
    ghost.userData.src = 'pending.glb'; scene.add(ghost); propModels.push(ghost);
    ghost.updateMatrixWorld(true);
    const ghostBox = boxOf(ghost);
    sel(ghost);
    const whileEmpty = drawn(selBox), visibleWhileEmpty = !!(selBox && selBox.visible);

    /* ---- and the POOLED helpers, whose stale geometry is the entire scene ----------------------- */
    ensureSelBoxes(2);
    const poolSeed = drawn(selBoxes[selBoxes.length-1]);
    selProps.length = 0; selProps.push(ghost, __a);       /* a group selection, ghost first */
    updateSelectionHighlight();
    const poolOnEmpty = drawn(selBoxes[0]), poolVisible = !!(selBoxes[0] && selBoxes[0].visible);

    /* ---- and once there IS something, the outline is right (the "drag fixes it" half) ----------- */
    sel(__a);
    const backOnReal = drawn(selBox);

    for(let i=propModels.length-1;i>=0;i--) if(propModels[i]===ghost) propModels.splice(i,1);
    scene.remove(ghost);

    return { ok:true,
      trueA, loaded, controlCorrect: JSON.stringify(loaded) === JSON.stringify(trueA),
      ghostBox, whileEmpty, visibleWhileEmpty,
      /* the defect is DRAWING a box that is not this object's — stale geometry nobody shows is harmless */
      DRAWS_PREVIOUS_PROP: visibleWhileEmpty && JSON.stringify(whileEmpty) === JSON.stringify(loaded),
      poolSeed, poolOnEmpty, poolVisible,
      POOL_DRAWS_WHOLE_SCENE: poolVisible && JSON.stringify(poolOnEmpty) === JSON.stringify(poolSeed),
      backOnReal, recovers: JSON.stringify(backOnReal) === JSON.stringify(trueA) };
  })()`);
  for (const k of Object.keys(r)) say(k, r[k]);
}, { settleMs: 5000 });

console.log('');
