// Does one walk still prompt for the same things — and does it cost less?
//
// The test proves equivalence against a reconstruction. This drives the REAL `checkProximity` in the running
// game, against real props built by the real spawner, and measures the cost at gauntlet scale.
//
// Wall-clock under SwiftShader has a noise floor bigger than most effects (build 1414), so the COST is
// measured as iterations — a counter incremented inside the loop via a patched `_interDist` plus a prop
// count, which are integers and cannot drift. The control is the same scene measured twice.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(28) + JSON.stringify(v));

await withGame(async (P) => {
  say('settled', await P(`(function(){ return { build: BUILD_VERSION, props: propModels.length }; })()`));

  console.log('\n--- the prompt still appears for each kind --------------------------------------------');
  const at = (ud) => `(function(){
    for(let i=propModels.length-1;i>=0;i--) if(propModels[i] && propModels[i].userData.__probeFix) removeProp(i);
    spawnProp('box', [40, 0, 40, 0, 0, 0, 1, 1, 1]);
    const o = propModels[propModels.length-1];
    o.userData.__probeFix = 1;
    Object.assign(o.userData, ${ud});
    refreshPropCollider(o);
    player.pos.set(41, EYE, 40);
    shopOpen = false; nearTarget = null;
    checkProximity();
    return { type: nearTarget ? nearTarget.type : null,
             isOurs: !!(nearTarget && nearTarget.obj && nearTarget.obj.userData.__probeFix),
             prompt: (document.getElementById('prompt').textContent || '').slice(0, 40) };
  })()`;

  say('an interactable prop', await P(at(`{ interact: true }`)));
  say('an NPC', await P(at(`{ dialogue: ['hi'], npcName: 'Vendor' }`)));
  say('a trigger mechanism', await P(at(`{ xa: { on: true, trig: 'interact', mode: 'toggle' } }`)));
  say('a spent Once mechanism', await P(at(`{ xa: { on: true, trig: 'interact', mode: 'once', dest: 1 } }`)));
  say('a plain box (CONTROL)', await P(at(`{}`)));

  console.log('\n--- priority: an NPC and an interactable at the same spot ------------------------------');
  say('npc outranks interact', await P(`(function(){
    for(let i=propModels.length-1;i>=0;i--) if(propModels[i] && propModels[i].userData.__probeFix) removeProp(i);
    spawnProp('box', [40, 0, 40, 0, 0, 0, 1, 1, 1]);
    const a = propModels[propModels.length-1]; a.userData.__probeFix = 1;
    a.userData.dialogue = ['hi']; refreshPropCollider(a);
    spawnProp('box', [40.5, 0, 40, 0, 0, 0, 1, 1, 1]);
    const b = propModels[propModels.length-1]; b.userData.__probeFix = 1;
    b.userData.interact = true; refreshPropCollider(b);
    player.pos.set(40.5, EYE, 40); nearTarget = null; checkProximity();
    return { type: nearTarget && nearTarget.type, closerIsTheInteractable: true };
  })()`));

  console.log('\n--- and it is walked ONCE ------------------------------------------------------------');
  say('build the crowd', await P(`(function(){
    for(let i=propModels.length-1;i>=0;i--) if(propModels[i] && propModels[i].userData.__probeFix) removeProp(i);
    const N = 600;
    for(let i=0;i<N;i++){
      const a = (i/N)*Math.PI*2, r = 20 + (i%7)*3;
      spawnProp('box', [40 + Math.cos(a)*r, 0, 40 + Math.sin(a)*r, 0, 0, 0, 1, 1, 1]);
      const o = propModels[propModels.length-1]; if(o) o.userData.__probeFix = 1;
    }
    player.pos.set(40, EYE, 40); nearTarget = null;
    for(let i=0;i<400;i++){ nearTarget = null; checkProximity(); }   // warm the JIT before believing a clock
    return { props: propModels.length, nearTarget };
  })()`));

  /* THE TRUSTWORTHY MEASURE IS THE COUNT, not the clock: SwiftShader's noise floor here exceeds the effect
     (build 1414), and the first run of this probe proved it — two runs of the SAME scene read 0.072 and
     0.032 ms/call, a 2.25x spread with nothing changed. So the distance-call count is what is reported, and
     the timings are printed with their own repeat spread beside them rather than as a claim. */
  say('distance calls, 659 plain props', await P(`(function(){
    const real = _interDist; let n = 0;
    /* count through the engine's own function: the loop calls it at most ONCE per prop, where the old form
       computed the same clamp in each of four separate traversals */
    window.__realID = real;
    const patched = function(){ n++; return real.apply(null, arguments); };
    try { eval('_interDist = patched'); } catch(e){ return { err: 'cannot rebind (const)' , note:'counting by source instead' }; }
    nearTarget = null; checkProximity();
    const out = { calls: n, props: propModels.length, perProp: +(n/propModels.length).toFixed(4),
                  note: 'a prop matching no category never pays for a distance at all' };
    eval('_interDist = real');
    return out;
  })()`));

  say('...and with 40 that DO match', await P(`(function(){
    let m = 0;
    for(const o of propModels){ if(o && o.userData.__probeFix && m < 40){ o.userData.interact = true; m++; } }
    const real = _interDist; let n = 0;
    eval('_interDist = function(){ n++; return real.apply(null, arguments); }');
    nearTarget = null; checkProximity();
    eval('_interDist = real');
    /* one per MATCHING prop — the old form recomputed the same clamp in each of four separate traversals,
       so a prop that was both an NPC and interactable paid for it twice and the list was walked 4x */
    return { matching: m, calls: n, perMatch: +(n/m).toFixed(3) };
  })()`));

  const batch = `(function(){
    player.pos.set(40, EYE, 40);
    const t0 = performance.now();
    for(let i=0;i<200;i++){ nearTarget = null; checkProximity(); }
    return +(((performance.now() - t0) / 200) * 1000).toFixed(1);
  })()`;
  const us = [];
  for (let i = 0; i < 5; i++) us.push(await P(batch));
  say('us/call x5 (warm)', us);
  say('repeat spread', { min: Math.min(...us), max: Math.max(...us),
                         ratio: +(Math.max(...us) / Math.min(...us)).toFixed(2),
                         note: 'the spread IS the noise floor — read the count, not the clock' });

  console.log('\n--- with one interactable among them, the answer is still right -----------------------');
  say('finds it in the crowd', await P(`(function(){
    const o = propModels[propModels.length - 1];
    o.position.set(41, 0, 40); o.userData.interact = true; refreshPropCollider(o);
    player.pos.set(40, EYE, 40); nearTarget = null; checkProximity();
    return { type: nearTarget && nearTarget.type, isTheOne: nearTarget && nearTarget.obj === o };
  })()`));

  say('cleanup', await P(`(function(){
    let n = 0;
    for(let i=propModels.length-1;i>=0;i--) if(propModels[i] && propModels[i].userData.__probeFix){ removeProp(i); n++; }
    return { removed: n, left: propModels.length };
  })()`));
}, { settleMs: 6000 });

console.log('');
