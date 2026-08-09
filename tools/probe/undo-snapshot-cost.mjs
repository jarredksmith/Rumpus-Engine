// What does a focus cost the creator?
//
// `pushUndoSnapshot` is called from 412 places and every one of them runs a full `serializeLevel()` +
// `JSON.stringify`. Build 1163's rule is one snapshot per GESTURE, so it fires on field FOCUS and on
// slider grab — which means tabbing through the inspector, or clicking into a field and changing your mind,
// costs a whole level serialization each time. And the identical-to-last check that throws the result away
// runs AFTER the expensive part.
//
// Build 1291 measured serializeLevel at 5.8 ms on the stock 56-prop level. Measure it here at real scale,
// and measure how many of a real gesture sequence's snapshots are redundant.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(30) + JSON.stringify(v));

await withGame(async (P) => {
  say('settled', await P(`(function(){
    if(!editorOpen) toggleEditor();
    return { build: BUILD_VERSION, props: propModels.length, editorOpen };
  })()`));

  const cost = `(function(){
    /* warm the JIT before believing a clock (build 1451's lesson), then five batches so the spread is
       visible rather than hidden behind one number */
    for(let i=0;i<20;i++) JSON.stringify(serializeLevel());
    const out = [];
    for(let b=0;b<5;b++){
      const t0 = performance.now();
      for(let i=0;i<20;i++) JSON.stringify(serializeLevel());
      out.push(+(((performance.now()-t0)/20)).toFixed(2));
    }
    const bytes = JSON.stringify(serializeLevel()).length;
    return { msPerSnapshot: out, bytes, props: propModels.length };
  })()`;

  console.log('\\n--- the stock level -------------------------------------------------------------------');
  say('one snapshot', await P(cost));

  console.log('\\n--- at gauntlet scale -----------------------------------------------------------------');
  await P(`(function(){
    for(let i=0;i<600;i++){
      const a=(i/600)*Math.PI*2, r=20+(i%7)*3;
      spawnProp('box', [40+Math.cos(a)*r, 0, 40+Math.sin(a)*r, 0, 0, 0, 1, 1, 1]);
      const o=propModels[propModels.length-1]; if(o) o.userData.__probeFix=1;
    }
    return propModels.length;
  })()`);
  say('one snapshot', await P(cost));

  console.log('\\n--- how many are REDUNDANT -----------------------------------------------------------');
  say('a gesture sequence', await P(`(function(){
    /* what a creator does: click a prop, tab through six fields touching none of them, then change one.
       Every focus fires pushUndoSnapshot (build 1163's one-per-gesture rule). */
    editorUndo.length = 0; editorRedo.length = 0;
    const o = propModels.find(p => p && p.userData.__probeFix);
    selProps = [o]; editorTargets.props.idx = propModels.indexOf(o);
    let pushed = 0, calls = 0;
    const before = editorUndo.length;
    for(let i=0;i<6;i++){ calls++; const n0 = editorUndo.length; pushUndoSnapshot(); if(editorUndo.length > n0) pushed++; }
    const afterNoop = { calls, pushed, stackDepth: editorUndo.length };
    o.position.x += 1;                       // now a real edit
    calls++; const n1 = editorUndo.length; pushUndoSnapshot(); if(editorUndo.length > n1) pushed++;
    return { afterNoop, withEdit: { calls, pushed, stackDepth: editorUndo.length },
             note: 'every call paid a full serialize; only the ones that CHANGED something kept it' };
  })()`));

  say('cost of the redundant ones', await P(`(function(){
    editorUndo.length = 0;
    pushUndoSnapshot();                       // seed the stack
    for(let i=0;i<10;i++) pushUndoSnapshot(); // warm
    const t0 = performance.now();
    for(let i=0;i<20;i++) pushUndoSnapshot(); // all identical -> all discarded
    const ms = (performance.now()-t0)/20;
    return { msPerDiscardedSnapshot: +ms.toFixed(2), stackDepth: editorUndo.length,
             note: 'the stack did not grow — every one of these was thrown away after being computed' };
  })()`));

  console.log('\\n--- what the 60-deep stack HOLDS -----------------------------------------------------');
  say('a full history', await P(`(function(){
    editorUndo.length = 0; editorRedo.length = 0;
    const o = propModels.find(p => p && p.userData.__probeFix);
    /* fill it the way a creator does: 60 real edits */
    for(let i=0;i<70;i++){ o.position.x += 0.01; pushUndoSnapshot(); }
    let bytes = 0; for(const s of editorUndo) bytes += s.length;
    return { depth: editorUndo.length, cap: 60, totalBytes: bytes,
             megabytes: +(bytes/1048576).toFixed(2), perSnapshot: Math.round(bytes/editorUndo.length) };
  })()`));
  say('...on the stock level', await P(`(function(){
    const n = JSON.stringify(serializeLevel()).length;
    return { perSnapshot: n, at60: +((n*60)/1048576).toFixed(2), note: 'megabytes if the history fills' };
  })()`));

  console.log('\\n--- where the check happens ----------------------------------------------------------');
  say('order in the function', await P(`(function(){
    const f = pushUndoSnapshot.toString();
    return { serializeAt: f.indexOf('serializeLevel'), dedupAt: f.indexOf('editorUndo[editorUndo.length-1] === snap'),
             dedupAfterSerialize: f.indexOf('editorUndo[editorUndo.length-1] === snap') > f.indexOf('serializeLevel') };
  })()`));

  console.log('\\n--- build 1452: the byte cap, on the REAL stacks -------------------------------------');
  say('659 props, 70 real edits', await P(`(function(){
    editorUndo.length = 0; editorRedo.length = 0;
    const o = propModels.find(p => p && p.userData.__probeFix);
    /* the engine snapshots BEFORE the edit — build 1163 takes it at focus/mousedown, so editorUndo[n] is
       the state to RETURN to. Pushing after the mutation (as this probe first did) makes the first undo
       restore the current state and read as "nothing moved". */
    for(let i=0;i<70;i++){ pushUndoSnapshot(); o.position.x += 0.01; }
    let b=0; for(const x of editorUndo) b+=x.length;
    return { depth: editorUndo.length, megabytes: +(b/1048576).toFixed(2), budget: +(UNDO_MAX_BYTES/1048576).toFixed(0),
             underBudget: b <= UNDO_MAX_BYTES,
             note: 'the count cap still binds here — this build changes nothing for a level this size' };
  })()`));
  say('a level ~5x larger', await P(`(function(){
    /* grow the SNAPSHOT rather than the scene: a long tag on every prop is level data the serializer
       carries, so this is a real level file getting bigger, not a fake string */
    const pad = 'T'.repeat(400);
    let k=0; for(const p of propModels) if(p && p.userData.__probeFix){ p.userData.tag = pad + (k++); }
    editorUndo.length = 0; editorRedo.length = 0;
    const o = propModels.find(p => p && p.userData.__probeFix);
    for(let i=0;i<70;i++){ pushUndoSnapshot(); o.position.x += 0.01; }
    let b=0; for(const x of editorUndo) b+=x.length;
    return { perSnapshot: editorUndo.length ? Math.round(b/editorUndo.length) : 0,
             depth: editorUndo.length, megabytes: +(b/1048576).toFixed(2),
             underBudget: b <= UNDO_MAX_BYTES, floor: UNDO_MIN_DEPTH,
             aboveFloor: editorUndo.length >= UNDO_MIN_DEPTH };
  })()`));
  say('and undo still WORKS', await P(`(function(){
    /* read the LEVEL, not a held object: performUndo can restore through a full reload, which replaces
       propModels — so a reference taken before it is stale and reads "nothing moved" either way */
    const nidOf = (p) => p && p.userData && p.userData.nid;
    const target = propModels.find(p => p && p.userData.__probeFix);
    const nid = nidOf(target), x0 = target.position.x;
    const ok = performUndo();
    const after = propModels.find(p => nidOf(p) === nid) || propModels.find(p => p && p.userData.__probeFix);
    return { undoRan: !!ok, sameObject: after === target,
             moved: after ? +Math.abs(after.position.x - x0).toFixed(4) : null,
             depthLeft: editorUndo.length, redoDepth: editorRedo.length };
  })()`));

  say('cleanup', await P(`(function(){
    let n=0; for(let i=propModels.length-1;i>=0;i--) if(propModels[i]&&propModels[i].userData.__probeFix){ removeProp(i); n++; }
    editorUndo.length = 0; editorRedo.length = 0;
    return { removed: n, left: propModels.length };
  })()`));
}, { settleMs: 6000 });

console.log('');
