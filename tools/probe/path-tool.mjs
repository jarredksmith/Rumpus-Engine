// build 1324 (editor audit 4.10, second leg) — the path tool: rails and WIRES.
//
// The maths is checked in test-1324. This asks what only the live engine can:
//   1. the panel and the + menu entry
//   2. a wire really hangs between two poles — anchored at the tops, sagging in the middle
//   3. it is NOT SOLID (the whole reason `noCol` exists), and that survives a save/load
//   4. a rail follows the path upright and IS solid
//   5. orientation is right — a segment's drawn endpoints must land on the maths' endpoints
import { withGame } from './driver.mjs';

const POLES = `(function(){
  /* two poles 20 m apart on empty ground, selected in order */
  const made=[];
  for(const x of [-10, 10]){
    spawnProp('cylinder', [300+x, 0, 300, 0,0,0, 0.4, 6, 0.4], (o)=>{ o.userData.name='pole'; made.push(o); });
  }
  selProps = made.slice(); editorActive='props';
  return { poles: made.length, tops: made.map(o=>+o.userData.box.max.y.toFixed(2)) };
})()`;

await withGame(async (P, page) => {
  console.log('open editor:', JSON.stringify(await P(`(function(){ if(!editorOpen) toggleEditor(); return { editorOpen }; })()`)));
  await page.waitForTimeout(900);

  console.log('\n--- 1. THE PANEL AND THE + MENU ---');
  console.log(JSON.stringify(await P(`(function(){
    const btn=document.getElementById('edAdd'), menu=document.getElementById('edAddMenu');
    menu.style.display='none'; btn.click();
    const row=[...menu.children].find(e=>/Wire/i.test(e.textContent));
    if(!row) return { noEntry:true };
    row.click();
    return { entry: row.textContent, mode: editorMode, target: editorActive };
  })()`)));
  await page.waitForTimeout(300);
  console.log('panel (nothing selected):', JSON.stringify(await P(`(function(){
    selProps=[]; renderEditorFields();
    const h=document.getElementById('edPath');
    const b=[...h.querySelectorAll('button')].pop();
    return { built:h.children.length>0, lastButton:b?b.textContent:null, disabled:b?b.disabled:null };
  })()`)));

  console.log('\n--- 2. A WIRE BETWEEN TWO POLES ---');
  console.log('poles:', JSON.stringify(await P(POLES)));
  console.log('panel now:', JSON.stringify(await P(`(function(){
    renderEditorFields();
    const b=[...document.getElementById('edPath').querySelectorAll('button')].pop();
    return { label:b.textContent, disabled:b.disabled };
  })()`)));
  console.log('built:', JSON.stringify(await P(`(function(){
    const pts = pathAnchors('wire', pathDraft.rise);
    const made = buildPathFrom(pts, pathDraft);
    const ys = made.map(o=>+o.position.y.toFixed(3));
    const xs = made.map(o=>+o.position.x.toFixed(2));
    return { anchors: pts.map(p=>[+p[0].toFixed(1), +p[1].toFixed(2), +p[2].toFixed(1)]),
             segments: made.length, oneGroup: new Set(made.map(o=>o.userData.groupId)).size===1,
             firstX: xs[0], lastX: xs[xs.length-1],
             highestY: Math.max(...ys), lowestY: Math.min(...ys), sagSetting: pathDraft.sag };
  })()`)));
  console.log('  (the ends must sit at the pole tops + rise; the middle must hang `sag` below the chord)');
  console.log('endpoints land on the maths:', JSON.stringify(await P(`(function(){
    /* The LAST segment's far end, computed from its own transform, must equal the second POLE anchor.
       The first run of this probe called pathAnchors() AFTER building, by which time buildPathFrom had
       replaced the selection with the wire segments — so it compared the wire against itself and reported
       a 2 m error that did not exist. Capture the anchors from the poles. */
    const poles = propModels.filter(o=>o&&o.userData&&o.userData.name==='pole');
    const want = [poles[1].position.x, poles[1].userData.box.max.y + pathDraft.rise, poles[1].position.z];
    const made = selProps.slice();
    const last = made[made.length-1];
    const dir = new THREE.Vector3(0,1,0).applyEuler(last.rotation);
    const end = last.position.clone().addScaledVector(dir, last.scale.y);
    return { drawnEnd:[+end.x.toFixed(2), +end.y.toFixed(2), +end.z.toFixed(2)],
             wantedEnd:[+want[0].toFixed(2), +want[1].toFixed(2), +want[2].toFixed(2)],
             errorMetres: +end.distanceTo(new THREE.Vector3(want[0],want[1],want[2])).toFixed(4) };
  })()`)));

  console.log('\n--- 3. A WIRE IS NOT SOLID, AND STAYS THAT WAY ---');
  console.log(JSON.stringify(await P(`(function(){
    const wires = selProps.slice();
    const mid = wires[Math.floor(wires.length/2)];
    return { noColFlag: !!mid.userData.noCol,
             colliderBoxes: (mid.userData.boxes||[]).length,
             CONTROL_poleHasBoxes: (propModels.filter(o=>o.userData.name==='pole')[0].userData.boxes||[]).length,
             solidAtTheWire: insideSolid(mid.position.x, mid.position.z, mid.position.y-1.0) };
  })()`)));
  console.log('after save/load:', JSON.stringify(await P(`(function(){
    const lvl = serializeLevel();
    const ser = (lvl.props||[]).filter(p=>p.nm==='wire');
    restoreLevel(lvl);
    const back = propModels.filter(o=>o&&o.userData&&o.userData.name==='wire');
    return { serializedWithNc: ser.filter(p=>p.nc===1).length, ofTotal: ser.length,
             backNoCol: back.filter(o=>o.userData.noCol).length,
             backWithNoColliderBoxes: back.filter(o=>(o.userData.boxes||[]).length===0).length };
  })()`)));

  console.log('\n--- 4. A RAIL FOLLOWS THE PATH, UPRIGHT AND SOLID ---');
  console.log(JSON.stringify(await P(`(function(){
    const made=[];
    for(const [x,z] of [[-10,0],[0,8],[10,0]])
      spawnProp('box', [400+x, 0, 400+z, 0,0,0, 0.5,0.5,0.5], (o)=>{ o.userData.name='marker'; made.push(o); });
    selProps = made.slice();
    pathDraft.mode='rail';
    const pts = pathAnchors('rail', 0);
    const rails = buildPathFrom(pts, pathDraft);
    const up = new THREE.Vector3(0,1,0);
    const worst = Math.max(...rails.map(o=>{
      const u = new THREE.Vector3(0,1,0).applyEuler(o.rotation);
      return Math.acos(Math.max(-1,Math.min(1,u.dot(up)))) * 180/Math.PI;
    }));
    return { segments: rails.length, oneGroup: new Set(rails.map(o=>o.userData.groupId)).size===1,
             worstTiltFromUprightDeg: +worst.toFixed(2),
             hasColliders: rails.every(o=>(o.userData.boxes||[]).length>0),
             noColFlagSet: rails.some(o=>o.userData.noCol) };
  })()`)));
  console.log('  (a flat path should give 0.00 deg of tilt — the rail must not roll around its own run)');
}, { settleMs: 9000 });
