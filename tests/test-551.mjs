import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 708: the "Needs N" counter gate now counts DISTINCT senders, not raw signal events. Fixes the pressure-plate
// bug where one plate (a dropped physics prop settling/bouncing, or being re-placed) re-fired its contact signal and
// satisfied "Needs 2" by itself — so water flowed from a single pot on a single plate.

// --- executable: distinct-sender gate ---
const fn = new Function('propModels','xaToggle','broadcastXAnim','broadcastAnim','broadcastUnlock','playPropAnimationOnce','NET','lightModels','setLightOn','broadcastLight',
  extractFunction('_applySignalAction') + '\nreturn _applySignalAction;');
const mk = () => {
  const calls = { opened:[] };
  const water = { userData:{ tag:'waterFlow', sigNeed:2, xa:{ on:true, dest:0 } } };
  const apply = fn([water], ()=>{}, i=>calls.opened.push(i), ()=>{}, ()=>{}, ()=>{}, { mode:'off' }, [], ()=>{}, ()=>{});
  return { apply, water, calls };
};
const sig = { do:'open', target:'waterFlow' };
const plateA = { uuid:'A', userData:{ nid:'plateA' } };
const plateB = { uuid:'B', userData:{ nid:'plateB' } };

// the SAME plate firing twice (the settling-pot double-fire) must NOT open it
{ const { apply, water } = mk();
  apply(sig, plateA); apply(sig, plateA); apply(sig, plateA);
  assert(water.userData.xa.dest === 0, 'one plate re-firing three times still does not reach Needs 2');
  eq(water.userData._sigSrc.size, 1, 'the same sender only counts once'); }

// two DIFFERENT plates open it
{ const { apply, water, calls } = mk();
  apply(sig, plateA);
  assert(water.userData.xa.dest === 0, 'first plate alone is absorbed');
  apply(sig, plateB);
  assert(water.userData.xa.dest === 1 && calls.opened.length === 1, 'the second DISTINCT plate opens it'); }

// a sender with no nid falls back to its object uuid (still a stable distinct identity)
{ const { apply, water } = mk();
  const p1={ uuid:'u1', userData:{} }, p2={ uuid:'u2', userData:{} };
  apply(sig, p1); apply(sig, p1);
  assert(water.userData.xa.dest === 0, 'no-nid sender still de-dupes by uuid');
  apply(sig, p2);
  assert(water.userData.xa.dest === 1, 'a second distinct no-nid sender opens it'); }

// --- source pins: gate logic + threading + reset ---
const asa = extractFunction('_applySignalAction');
assert(/const _set = t\.userData\._sigSrc \|\| \(t\.userData\._sigSrc = new Set\(\)\);/.test(asa), 'the gate uses a Set of senders');
assert(/const _sk = \(src && src\.userData\) \? \(src\.userData\.nid \|\| src\.uuid\)/.test(asa), 'sender identity = nid (or uuid fallback)');
assert(/if\(_set\.size < t\.userData\.sigNeed\) continue;/.test(asa), 'absorbs until enough DISTINCT senders arrive');
assert(/_applySignalAction\(s, o\);/.test(extractFunction('fireSignals')), 'fireSignals passes the source prop');
assert(/_applySignalAction\(s, o\);/.test(extractFunction('tickContactSignals')), 'contact tick passes the detector as the source');
assert(/delete o\.userData\._sigSrc; delete o\.userData\._sigEvt;/.test(extractFunction('startGame')), 'the sender set resets each deploy');

done('build 708: "Needs N" counts distinct senders (fixes the single-plate double-fire)');
