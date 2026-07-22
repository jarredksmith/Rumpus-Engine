// (build 1035) INTERACTABLE = ONE CHECKBOX; SIGNALS TARGET "this" — field report from the
// author: making a prop respond to E was buried inside the mechanism trigger dropdown, and
// self-targeting required tagging the prop and typing its own tag back. Now: an
// "Interactable (E)" checkbox beside the Tag at the top of Object & selection (prompts
// Activate, fires On-E signals, no mechanism), and a signal's target can be the reserved word
// "this" — the prop the signal lives on.
import { readFileSync } from 'node:fs';
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
const manual = readFileSync(new URL('../breach-help.html', import.meta.url), 'utf8');

// ---- executable: the "this" target applies the verb to the SOURCE prop, no fanout ----
const asa = extractFunction('_applySignalAction', src);
function run(sig, srcProp, world){
  const calls = { xaToggle:0, anims:[], fanout:0, bx:[], ba:[], bu:[] };
  const props = world || [];
  new Function('s','src','propModels','lightModels','xaToggle','broadcastXAnim','broadcastAnim','broadcastUnlock','playPropAnimationOnce','setLightOn','broadcastLight','gameWon','NET','cutsceneByName','setGoal','setCheckpoint','playSample','loadSound','logicEvent',
    asa + '\n_applySignalAction(s, src);')(
    sig, srcProp, props, [],
    ()=>calls.xaToggle++, (i)=>calls.bx.push(i), (i,c)=>calls.ba.push([i,c]), (i)=>calls.bu.push(i),
    (o,c)=>calls.anims.push([o,c]), ()=>{}, ()=>{}, ()=>{}, { mode:'off' }, ()=>null, ()=>{}, ()=>{}, ()=>true, ()=>{}, ()=>{});
  return calls;
}
const door = { userData:{ tag:'door1', xa:{ on:true, dest:0 } } };
const other = { userData:{ tag:'door1', xa:{ on:true, dest:0 } } };
{ // toggle 'this': only the source prop moves, even when another prop shares its tag
  const c = run({ do:'toggle', target:'this' }, door, [other, door]);
  eq(c.xaToggle, 1, "target 'this' toggles the source prop's mechanism");
  eq(c.bx.join(','), '1', '...broadcasting with the right prop index');
  eq(other.userData.xa.dest, 0, 'the same-tagged OTHER prop is untouched (no fanout)');
}
{ // open drives dest directly
  const d2 = { userData:{ xa:{ on:true, dest:0 } } };
  run({ do:'open', target:'this' }, d2, [d2]);
  eq(d2.userData.xa.dest, 1, "'open' on this");
}
{ // anim + unlock on this
  const d3 = { userData:{ lockId:'gold' } };
  const c = run({ do:'anim', target:'this', clip:'Wave' }, d3, [d3]);
  eq(c.anims.length, 1, "'anim' plays on the source");
  eq(c.anims[0][1], 'Wave', '...with the chosen clip');
  const c2 = run({ do:'unlock', target:'this' }, d3, [d3]);
  eq(d3.userData.unlocked, true, "'unlock' opens the source's own lock");
  eq(c2.bu.join(','), '0', '...and broadcasts it');
}
{ // a detached src (no world entry) stays safe; win still needs no target at all
  const c = run({ do:'toggle', target:'this' }, null, []);
  eq(c.xaToggle, 0, "no source, no crash, no action");
}

// ---- the Interactable flag: serialize + all four entry-apply sites ----
assert(/if\(o\.userData\.interact\) e\.itr=1;/.test(src), 'the flag rides propEntry (saves, share codes, prefabs, MP)');
eq(src.split('if(p.itr) obj.userData.interact=true;').length - 1, 4, 'restored at all four entry-apply sites (boot / net / restore / prefab spawn)');

// ---- the checkbox beside the Tag ----
assert(/iw\.appendChild\(document\.createTextNode\('Interactable \(E\)'\)\)/.test(src), 'the checkbox exists, labeled plainly');
assert(/row\.appendChild\(spn\); row\.appendChild\(tin\); row\.appendChild\(iw\);/.test(src), '...in the SAME top row as the Tag field');
assert(/if\(icb\.checked\) tagObj\.userData\.interact=true; else delete tagObj\.userData\.interact;/.test(src), 'it writes the flag directly');

// ---- runtime: prompt + E ----
const prox = extractFunction('checkProximity', src);
assert(/if\(!o \|\| !o\.userData \|\| !o\.userData\.interact\) continue;/.test(prox), 'flagged props are scanned for proximity');
assert(/nearTarget = \{ type:'use', obj:best \};/.test(prox), '...and become a use target');
assert(/nearTarget\.type==='anim' \|\| nearTarget\.type==='xanim' \|\| nearTarget\.type==='use'/.test(prox),
  'the prompt shows Activate (and the lock text) for them');
const inter = extractFunction('interact', src);
assert(/nearTarget\.type==='use'/.test(inter) && /fireSignals\(o, 'interacted'\);/.test(inter), 'E fires the On-E signals');
assert(/if\(!tryUnlockProp\(o\)\) return;   \/\/ locked and no key -> deny\n    fireSignals/.test(inter), 'locks still gate it');

// ---- pickers + validation + docs ----
assert(/op\.value='this'; op\.label='this object';/.test(src), "'this object' leads the Signals target drop-down");
assert(/ti\.placeholder='target tag \(or: this\)'/.test(src), 'the placeholder teaches it');
assert(/s\.target!=='this' && !tags\.has\(s\.target\)/.test(src), "the Issues panel never flags 'this' as a missing tag");
assert(/Making a prop usable with E is one checkbox now<\/b>/.test(manual) && /On E → Toggle → this<\/i>/.test(manual),
  'the manual documents the checkbox and the this-target recipe');

done('build 1035: Interactable is one visible checkbox; signals can target this — the two-step door is two clicks');
