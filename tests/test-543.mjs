import { gameSource, html, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 699: scene lights are signal-controllable. A tagged light reacts to the existing Open/Close/Toggle verbs
// (Open=on, Close=off, Toggle=flip), eases between on/off over a Fade time, and can "start off" until lit by a signal.

// --- executable: _applySignalAction fans Open/Close/Toggle out to tagged lights ---
const fn = new Function('propModels','xaToggle','broadcastXAnim','broadcastAnim','broadcastUnlock','playPropAnimationOnce','NET','lightModels','setLightOn','broadcastLight',
  extractFunction('_applySignalAction') + '\n' + extractFunction('fireSignals') + '\nreturn fireSignals;');
const mk = () => {
  const calls = { bc:[] };
  const lights = [
    { userData:{ tag:'beam', light:{ intensity:8 }, lon:true,  litI:8 } },   // 0 starts on
    { userData:{ tag:'beam', light:{ intensity:0 }, lon:false, litI:8 } },   // 1 starts off (same tag)
    { userData:{ tag:'other', light:{ intensity:5 }, lon:true, litI:5 } },   // 2 untouched tag
  ];
  const f = fn([], ()=>{}, ()=>{}, ()=>{}, ()=>{}, ()=>{}, { mode:'off' },
    lights, (g,on)=>{ g.userData.lon=!!on; }, (i,on)=>calls.bc.push(i+':'+(on?1:0)));
  return { f, lights, calls };
};
{ const { f, lights, calls } = mk();
  f({ userData:{ signals:[{ when:'interacted', do:'open', target:'beam' }] } }, 'interacted');
  assert(lights[0].userData.lon===true && lights[1].userData.lon===true, 'Open turns every tagged light on');
  assert(lights[2].userData.lon===true, 'a different tag is untouched');
  assert(calls.bc.join(',')==='0:1,1:1', 'Open broadcasts each light it lit'); }
{ const { f, lights } = mk();
  f({ userData:{ signals:[{ when:'interacted', do:'close', target:'beam' }] } }, 'interacted');
  assert(lights[0].userData.lon===false && lights[1].userData.lon===false, 'Close turns every tagged light off'); }
{ const { f, lights } = mk();
  f({ userData:{ signals:[{ when:'interacted', do:'toggle', target:'beam' }] } }, 'interacted');
  assert(lights[0].userData.lon===false && lights[1].userData.lon===true, 'Toggle flips each light from its own state'); }

// --- executable: updateLights eases intensity toward the on/off target ---
// build 1338: updateLights gained the placed-light distance budget, so this isolated scope has to supply
// it. Injected INERT (no ranking, factor 1) — every assertion below is about the on/off fade ramp and must
// keep measuring exactly that; the budget's own behaviour is test-1338's job. The last case drives it.
const ul = new Function('lightModels','editorOpen','_plRankF',
  'function _rankPlacedLights(){}\n' + extractFunction('updateLights') + '\nreturn updateLights;');
{ const g={ userData:{ light:{ intensity:0 }, lon:true, litI:8, lfade:0 } };
  ul([g], false, null)(0.1); eq(g.userData.light.intensity, 8, 'fade 0 = instant on'); }
{ const g={ userData:{ light:{ intensity:8 }, lon:false, litI:8, lfade:0 } };
  ul([g], false, null)(0.1); eq(g.userData.light.intensity, 0, 'fade 0 = instant off'); }
{ const g={ userData:{ light:{ intensity:0 }, lon:true, litI:8, lfade:0.4 } };
  ul([g], false, null)(0.1); near(g.userData.light.intensity, 2, 1e-6, 'fade ramps part-way (8/0.4*0.1 = 2)');
  ul([g], false, null)(0.1); near(g.userData.light.intensity, 4, 1e-6, 'and keeps ramping toward full'); }
{ const g={ userData:{ light:{ intensity:8 }, lon:true, litI:8, lfade:0.4 } };
  ul([g], false, null)(0.1); eq(g.userData.light.intensity, 8, 'already at target = no change'); }
{ const g={ userData:{ light:{ intensity:0 }, lon:true, litI:8, lfade:0.4 } };
  ul([g], true, null)(0.1); eq(g.userData.light.intensity, 0, 'editor open = tick is skipped (lights held at full elsewhere)'); }

// --- executable: initSceneLights applies the deploy start state ---
const isl = new Function('lightModels', extractFunction('initSceneLights') + '\nreturn initSceneLights;');
{ const on={ userData:{ light:{ intensity:0 }, litI:8, startOff:false } };
  const off={ userData:{ light:{ intensity:8 }, litI:8, startOff:true } };
  isl([on, off])();
  assert(on.userData.lon===true && on.userData.light.intensity===8, 'a normal light deploys lit');
  assert(off.userData.lon===false && off.userData.light.intensity===0, 'a "start off" light deploys dark'); }

// --- source: buildLight stores the new state, _lightOpts serializes it ---
const bl = extractFunction('buildLight');
assert(/g\.userData\.litI = inten;/.test(bl), 'buildLight remembers the authored "on" brightness');
assert(/if\(opts\.tag\) g\.userData\.tag = String\(opts\.tag\)\.slice\(0,40\);/.test(bl), 'buildLight reads a tag');
assert(/g\.userData\.lfade = \(opts\.fade!=null \? \+opts\.fade : 0\.4\);/.test(bl), 'buildLight reads the fade time');
assert(/g\.userData\.startOff = !!opts\.startOff;/.test(bl), 'buildLight reads the start-off flag');
const lo = extractFunction('_lightOpts');
assert(/if\(g\.userData\.tag\) o\.tag=g\.userData\.tag;/.test(lo), 'tag serialized');
assert(/if\(g\.userData\.startOff\) o\.startOff=true;/.test(lo), 'start-off serialized');
assert(/if\(g\.userData\.lfade!=null && g\.userData\.lfade!==0\.4\) o\.fade=\+g\.userData\.lfade;/.test(lo), 'non-default fade serialized');

// --- wiring: deploy init, editor relight, main-loop tick, net sync ---
assert(/if\(typeof initSceneLights==='function'\) initSceneLights\(\);/.test(extractFunction('startGame')), 'startGame applies light start states');
assert(/if\(typeof _lightsToFull==='function'\) _lightsToFull\(\);/.test(extractFunction('toggleEditor')), 'entering the editor relights every light at full');
assert(/updateLights\(dt\);\s+\/\/ build 699/.test(src), 'updateLights is driven each frame');
assert(/else if\(msg\.t==='lit'\)\{ const g=lightModels\[msg\.i\]; if\(g\) setLightOn\(g, msg\.on\); for\(const cid in NET\.conns\)/.test(src), 'host applies + relays the light toggle');
assert(/else if\(msg\.t==='lit'\)\{ const g=lightModels\[msg\.i\]; if\(g\) setLightOn\(g, msg\.on\); \}/.test(src), 'client applies the light toggle');

// --- editor UI: tag, starts-off, fade, how-to hint ---
assert(/tin\.onchange=\(\)=>\{ pushUndoSnapshot\(\); const v=tin\.value\.trim\(\)\.slice\(0,40\); if\(v\) g0\.userData\.tag=v; else delete g0\.userData\.tag; \};/.test(src), 'light tag input');
assert(/soSp\.textContent='Starts off \(lit by a signal\)';/.test(src), 'starts-off checkbox');
assert(/fsp\.textContent='Fade \(s\)';/.test(src), 'fade-time input');
assert(/<b>Open<\/b> = on, <b>Close<\/b> = off, <b>Toggle<\/b> = flip/.test(src), 'hint explains the Open/Close/Toggle mapping');

done('build 699: signal-controlled scene lights (on/off/toggle + fade + start-off)');

// build 1338: and the budget factor multiplies the TARGET, so an off light stays off whatever its rank.
{ const g={ userData:{ light:{ intensity:8 }, lon:true, litI:8, lfade:0 } };
  ul([g], false, new Map([[g, 0.5]]))(0.1);
  eq(g.userData.light.intensity, 4, 'a half-faded rank targets half the authored brightness'); }
{ const g={ userData:{ light:{ intensity:8 }, lon:false, litI:8, lfade:0 } };
  ul([g], false, new Map([[g, 1]]))(0.1);
  eq(g.userData.light.intensity, 0, 'and a signal-off light stays off at full rank — 0 x 1 is still 0'); }
