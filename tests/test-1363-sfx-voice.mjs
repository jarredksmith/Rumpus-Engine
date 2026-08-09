// build 1363: the SFX object finds its voice — per-shot variation, a physical distance curve with a
// front/back spectral cue, pistol/launcher patches, UI sound, victory/defeat stings, and a varied footstep.
//
// The audio critic, verified at the lines: every synth gunshot was bit-identical (playSample pitch-wobbles
// only custom URL clips); the distance curve was INVERTED vs physics (g=(1-d/55)^2 — 1.3 dB from 1 m to
// 5 m, then a cliff, and no distance filtering, so a rifle at 50 m had the spectrum of one at 1 m); ZERO
// menu handlers called SFX; gameWon/endGame called stopMusic and nothing else; pistol and launcher fell
// through _SHOT_LAYERS to the rifle patch; SFX.step was ONE unvaried burst; and a StereoPanner projects
// ahead/behind identically, so there was no front/back cue at all.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- fake WebAudio graph (test-1208's pattern + a filter)
function mkNode(tag){ const n={ tag, connect:(d)=>{ n._to=d; return d; }, pan:{value:0}, gain:{value:1}, frequency:{value:0}, type:'' }; return n; }
function mkCtx(o={}){ const c={ currentTime:0,
  createStereoPanner: ()=>mkNode('panner'), createGain: ()=>mkNode('gain'), destination:{tag:'dest'} };
  if(o.filter) c.createBiquadFilter = ()=>mkNode('filter');
  return c; }
const IDENTITY=[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function spat(at, o={}){
  const ctx = mkCtx(o);
  const camera = o.noCam ? undefined : { matrixWorld:{ elements:(o.cam||IDENTITY) } };
  const body = 'const actx=ctx, sfxBus={tag:"sfxBus"};\n' + (o.noPanner ? 'delete actx.createStereoPanner;\n' : '') +
    'const camera=camObj;\nconst _SND_MAXDIST=55;\n' + extractFunction('_spatialOut') + '\nreturn _spatialOut(at);';
  return new Function('ctx','camObj','at',body)(ctx, camera, at);
}

// ---------------------------------------------------------------- 3a. the distance curve is 1/d, monotone, null past 55
{
  const g = (d)=>{ const p = spat({x:d, y:0, z:0}); return p._to.gain.value; };   // x-axis: behind-ness 0, no trim
  const ds=[1,2,4,5,8,12,20,40,53], gs=ds.map(g);
  for(let i=1;i<gs.length;i++) assert(gs[i] <= gs[i-1]+1e-12, 'the curve is monotone non-increasing ('+ds[i-1]+'m '+gs[i-1].toFixed(3)+' -> '+ds[i]+'m '+gs[i].toFixed(3)+')');
  for(let i=4;i<gs.length;i++) assert(gs[i] < gs[i-1], '...and strictly decreasing beyond REF');
  near(g(10)*10, 4, 1e-9, 'beyond REF the law is exactly inverse-distance: g(d)*d = REF = 4');
  near(20*Math.log10(g(4)/g(20)), 13.98, 0.05, '14 dB per 5x distance in the rolloff (4 m -> 20 m) — the physical 1/d law; the OLD curve gave 1.3 dB from 1 to 5 m and then a cliff');
  assert(g(1) === 1 && g(4) === 1, 'full volume inside the first REF metres (nothing near-field got quieter)');
  eq(spat({x:60, y:0, z:0}), null, 'past 55 m the helper still returns null — the build-1208 caller contract, kept exactly');
  eq(spat({x:54.5, y:0, z:0}), null, '...including the same 2% guard band');
}

// ---------------------------------------------------------------- 3b. distance + behind-ness drive ONE lowpass
{
  const ahead  = spat({x:0, y:0, z:-10}, {filter:true});
  const behind = spat({x:0, y:0, z: 10}, {filter:true});
  eq(ahead._to.tag, 'filter', 'with createBiquadFilter present the chain is panner -> lowpass -> gain -> bus');
  const fA = ahead._to.frequency.value, fB = behind._to.frequency.value;
  assert(fB < fA, 'at EQUAL distance a behind source filters darker than an ahead one ('+Math.round(fB)+' vs '+Math.round(fA)+' Hz) — the front/back cue a StereoPanner cannot give');
  near(fB/fA, 0.175, 1e-6, '...scaled by the fully-behind factor (20k -> ~3.5k cap)');
  const gA = ahead._to._to.gain.value, gB = behind._to._to.gain.value;
  near(gB/gA, 0.84, 1e-6, 'a fully-behind source also trims ~1.5 dB of gain');
  const cap = spat({x:0, y:0, z:0.5}, {filter:true});
  assert(cap._to.frequency.value > 3200 && cap._to.frequency.value < 3600, 'a fully-behind source at point-blank caps around 3.5 kHz ('+Math.round(cap._to.frequency.value)+' Hz)');
  const far = spat({x:53, y:0, z:0}, {filter:true});
  assert(far._to.frequency.value > 2000 && far._to.frequency.value < 3000, 'at ~53 m the air has eaten the top end (~2.7 kHz) — a rifle at range finally sounds far away');
  const mid = spat({x:20, y:0, z:0}, {filter:true});
  assert(far._to.frequency.value < mid._to.frequency.value && mid._to.frequency.value < 20000, '...and the absorption is monotone in distance');
}

// ---------------------------------------------------------------- 3c. every fallback still returns sfxBus (or skips the filter)
{
  eq(spat(null).tag, 'sfxBus', 'no position -> plain sfxBus');
  eq(spat({x:5, y:0, z:0}, {noCam:true}).tag, 'sfxBus', 'no camera yet -> plain sfxBus');
  eq(spat({x:5, y:0, z:0}, {noPanner:true}).tag, 'sfxBus', 'no createStereoPanner -> plain sfxBus, byte-identical to before');
  const noFilt = spat({x:5, y:0, z:0});
  eq(noFilt.tag, 'panner', 'no createBiquadFilter -> the panner chain still builds');
  eq(noFilt._to.tag, 'gain', '...just without the filter node (old browsers keep pan + gain)');
}

// ---------------------------------------------------------------- 1. per-shot variation, executed through the real shoot()
const layersTable = src.match(/const _SHOT_LAYERS = \{[\s\S]*?\n\};/)[0];
const jitLine   = src.match(/const _sndJit = [^\n]+\n/)[0];
const stateLine = src.match(/let _shotSndAt = [^\n]+\n/)[0];
function shootRig(rnd, times){
  const shootSrc = src.slice(src.indexOf('shoot(){ _duckMusic(); if(playSample'), src.indexOf('enemyShot(at)'));
  const body =
    'const Math=Object.create(globalThis.Math); if(rnd!=null) Math.random=()=>rnd;\n' +
    'const playSample=()=>false, curSounds=()=>({}), WEAPONS={rifle:{}}, curWep="rifle", _duckMusic=()=>{};\n' +
    'const calls=[];\n' +
    'const tone=(o)=>calls.push({k:"tone",freq:o.freq,vol:o.vol,dur:o.dur,attack:o.attack,_at:_dly});\n' +
    'const noise=(o)=>calls.push({k:"noise",vol:o.vol,dur:o.dur,filterFreq:o.filterFreq,_at:_dly});\n' +
    'let _dly=0; const setTimeout=(fn,ms)=>{ _dly=ms; fn(); _dly=0; };\n' +
    // build 1455: the layer playback moved out of SFX.shoot into the shared _shotVoice (one voice for
    // the local gun and every relayed shot). This rig's subject is the per-shot VARIATION, so the new
    // dependencies are lifted from source rather than restated — a rig that restates a helper keeps
    // passing against a stale copy.
    layersTable + '\n' + stateLine + jitLine +
    (src.match(/let _shotSndAtR = -?[\d.]+;/) || [''])[0] + '\n' +
    extractFunction('_shotVoice') + '\n' + extractFunction('_shotFirst') + '\n' +
    'const actx={currentTime:0};\n' +
    'const SFXt={' + shootSrc + '};\n' +
    'for(const t of times){ actx.currentTime=t; SFXt.shoot(); }\n' +
    'return calls;';
  return new Function('rnd','times',body)(rnd, times);
}
{ // deterministic (Math.random = 0.5 -> jitter exactly 0): the table values are untouched by the machinery
  const c = shootRig(0.5, [0, 0.1, 5]);   // shot 1 first (long gap), shot 2 inside 400 ms, shot 3 first again
  eq(c.length, 12, 'each shot is still four layers');
  eq(c[0].freq, 60, 'zero jitter reproduces the rifle sub at exactly 60 Hz — the table is the truth, the jitter only multiplies');
  eq(c[1].freq, 320, '...and the body at exactly 320 Hz');
  near(c[2].vol, 0.18*1.2, 1e-9, 'the FIRST shot after a >400 ms gap gets the brighter crack (+20%)');
  near(c[6].vol, 0.18, 1e-9, 'a follow-up shot 100 ms later does not — mag dumps stay level');
  near(c[10].vol, 0.18*1.2, 1e-9, 'and after a 4.9 s pause the brightening re-arms');
  eq(c[3]._at, 90, 'zero jitter lands the tail at exactly the authored 90 ms delay');
  eq(c[0].attack, 0.002, 'the sub attack default is unchanged (subA only slows the launcher)');
}
{ // stochastic: two consecutive shots are no longer bit-identical, and the jitter respects its bounds
  const c = shootRig(null, [0, 0.1]);
  assert(c[1].freq !== c[5].freq, 'two consecutive shots differ (body freq ' + c[1].freq.toFixed(2) + ' vs ' + c[5].freq.toFixed(2) + ') — the synth path was bit-identical before');
  for(const i of [0, 4]) assert(c[i].freq >= 60*0.97 - 1e-9 && c[i].freq <= 60*1.03 + 1e-9, 'sub freq jitter stays inside +-3%');
  for(const i of [1, 5]) assert(c[i].freq >= 320*0.97 - 1e-9 && c[i].freq <= 320*1.03 + 1e-9, 'body freq jitter stays inside +-3%');
  for(const i of [3, 7]) assert(c[i]._at >= 75 && c[i]._at <= 105, 'the tail delay wanders at most +-15 ms');
}

// ---------------------------------------------------------------- 2. pistol !== launcher !== rifle
{
  const L = new Function(layersTable + '\nreturn _SHOT_LAYERS;')();
  assert(('pistol' in L) && ('launcher' in L), 'pistol and launcher no longer fall through to the rifle patch');
  eq(L.pistol.body.freq, 700, 'the pistol is a snappy ~700 Hz mid-crack');
  assert(L.pistol.tail[0] < L.rifle.tail[0] && L.pistol.tail[3] < L.rifle.tail[3], '...with a shorter, closer tail than the rifle');
  assert(L.launcher.sub[0] >= 45 && L.launcher.sub[0] <= 55, 'the launcher thumps at 45-55 Hz');
  assert(L.launcher.tail[0] >= 2*L.rifle.tail[0] && L.launcher.tail[2] < L.rifle.tail[2], '...with a long, lowpassed rumble tail');
  assert((L.launcher.subA||0) > 0.002 && (L.launcher.body.attack||0) > 0.005, '...and a slower attack than any gun');
  eq(new Set([L.pistol.body.freq, L.launcher.body.freq, L.rifle.body.freq]).size, 3, 'three distinct voices, not one patch worn three ways');
}

// ---------------------------------------------------------------- 5. victory/defeat stings, executed
function stingRun(name){
  const vi = src.indexOf('victory(){ const r=MUSIC_ROOT*2;');
  const di = src.indexOf('defeat(){ const r=MUSIC_ROOT;');
  const si = src.indexOf('slide(){', di);
  const slice = (name==='victory') ? src.slice(vi, di) : src.slice(di, si);
  const body = 'const MUSIC_ROOT=110; const calls=[];\n' +
    'const tone=(o)=>calls.push({f:o.freq, dur:o.dur, at:_dly});\n' +
    'let _dly=0; const setTimeout=(fn,ms)=>{ _dly=ms; fn(); _dly=0; };\n' +
    'const S={' + slice + '};\nS.' + name + '(); return calls;';
  return new Function(body)();
}
{
  const v = stingRun('victory');
  eq(v.length, 3, 'the victory sting is three tones');
  assert(v[0].f < v[1].f && v[1].f < v[2].f, '...rising');
  near(v[1].f / v[0].f, 1.25, 1e-9, '...a major third above the root');
  near(v[2].f / v[0].f, 1.5, 1e-9, '...and the fifth — a major triad on MUSIC_ROOT');
  eq(v[0].f, 220, 'rooted on MUSIC_ROOT (an octave up for audibility)');
  const span = v[2].at + v[2].dur*1000;
  assert(span > 1000 && span < 1400, 'about 1.2 s end to end (' + span + ' ms) — a sting, not a fanfare');
  const d = stingRun('defeat');
  eq(d.length, 3, 'the defeat sting is three tones');
  assert(d[1].f < d[0].f, '...falling');
  near(d[1].f / d[0].f, Math.pow(2, -1/12), 1e-3, '...by a minor second');
  eq(d[2].f, 110, 'then a low sustain on MUSIC_ROOT itself');
  assert(d[2].dur >= 1.8, '...held about 2 s');
}
{ // the call sites: right where stopMusic is called, on the right screens
  const gw = extractFunction('gameWon'), eg = extractFunction('endGame');
  eq((gw.match(/SFX\.victory\(\)/g)||[]).length, 2, 'gameWon plays the victory sting on BOTH win paths (mid-campaign advance AND the final win screen)');
  assert(/stopMusic\(\); SFX\.victory\(\);/.test(gw), '...beside the stopMusic that used to be the whole of winning');
  assert(/stopMusic\(\); SFX\.defeat\(\);/.test(eg), 'endGame — the lose screen — plays the defeat sting beside its stopMusic');
  assert(!/SFX\.victory/.test(eg) && !/SFX\.defeat/.test(gw), 'and neither screen can play the other one');
}

// ---------------------------------------------------------------- 4. the UI voice: one delegated listener, menu-gated
function menuCtx(doc, pausedV){
  const body = 'const document=doc; const paused=pausedV;\n' + extractFunction('_uiMenuCtx') + '\nreturn _uiMenuCtx();';
  return new Function('doc','pausedV',body)(doc, pausedV);
}
const mkDoc = (o={}) => ({
  pointerLockElement: o.lock || null,
  getElementById: (id)=> id==='overlay' ? { classList:{ contains:()=> !o.overlayShown } } : null,
  querySelector: (s)=> o.modal ? {} : null,
});
{
  eq(menuCtx(mkDoc({lock:{}, overlayShown:true, modal:true}), true), false, 'pointer-locked play NEVER counts as a menu, whatever else is up — UI sound cannot fire during combat');
  eq(menuCtx(mkDoc({}), true), true, 'paused is a menu context');
  eq(menuCtx(mkDoc({overlayShown:true}), false), true, 'the start/end overlay is a menu context');
  eq(menuCtx(mkDoc({modal:true}), false), true, 'an open .modalBack is a menu context');
  eq(menuCtx(mkDoc({}), false), false, 'unlocked but in-world with nothing up -> silent');
}
{ // the delegated listener: one site, capture phase, gated
  const li = src.indexOf("document.addEventListener('click', (ev)=>{");
  assert(li > 0, 'the delegated UI-click listener exists');
  const block = src.slice(li, li + 700);
  assert(block.includes("closest('button, .mpBtn, .pBtnGhost, .modalClose')"), 'it targets the four button classes the product actually uses');
  assert(block.includes('if(!el || !_uiMenuCtx() || !actx) return;'), 'and is gated on the menu context AND a live audio context');
  assert(/\}, true\);/.test(block), 'capture phase, so a stopPropagation in a menu handler cannot starve it');
  assert(li > src.indexOf('function _uiMenuCtx()'), 'the gate is declared above the listener that calls it');
}
{ // openModal/closeModal voice themselves — state-checked, executed
  function modalRun(fn, startHidden){
    const body =
      'const snd=[]; const cls={ _h:h0, contains:(c)=> c==="hidden" ? cls._h : false, add:()=>{cls._h=true;}, remove:()=>{cls._h=false;} };\n' +
      'const document={ getElementById:()=>({ classList:cls }) };\n' +
      'const SFX={ uiOpen:()=>snd.push("open"), uiClose:()=>snd.push("close") };\n' +
      extractFunction(fn) + '\n' + fn + '("x"); return { snd, hidden: cls._h };';
    return new Function('h0', body)(startHidden);
  }
  let r = modalRun('openModal', true);  eq(r.snd.join(','), 'open',  'opening a hidden modal voices uiOpen'); eq(r.hidden, false, '...and shows it');
  r = modalRun('openModal', false);     eq(r.snd.length, 0, 're-opening an already-open modal is SILENT');
  r = modalRun('closeModal', false);    eq(r.snd.join(','), 'close', 'closing a visible modal voices uiClose'); eq(r.hidden, true, '...and hides it');
  r = modalRun('closeModal', true);     eq(r.snd.length, 0, 'the defensive closes at boot/startGame stay silent');
}
{ // the pause path + the UI set itself
  assert(/paused = true; firing = false; ads = false;\n  SFX\.uiOpen\(\);/.test(src), 'openPause voices uiOpen');
  assert(/paused = false; SFX\.uiClose\(\);/.test(src), 'resumeGame voices uiClose');
  assert(/uiMove\(\)\{ tone\(\{freq:900, type:'sine', dur:0\.035, vol:0\.05, attack:0\.002\}\); \},/.test(src), 'uiMove is a tiny 2 ms-attack ~900 Hz blip at vol 0.05');
  assert(/uiSelect\(\)\{ tone\(\{freq:660[^}]*vol:0\.06/.test(src) && /uiBack\(\)\{ tone\(\{freq:520/.test(src), 'uiSelect rises, uiBack falls — two-tone pairs');
  assert(/uiOpen\(\)\{ noise\(\{dur:0\.12, vol:0\.045[^}]*bandpass/.test(src) && /uiClose\(\)\{ noise\(\{dur:0\.12, vol:0\.045[^}]*bandpass/.test(src), 'uiOpen/uiClose are soft filtered swishes');
  assert(/uiDeny\(\)\{ SFX\.deny\(\); \},/.test(src), 'uiDeny reuses the existing deny');
}

// ---------------------------------------------------------------- 6. the footstep, executed
function stepRig(rnd, n){
  const stepSrc = src.slice(src.indexOf('step(){ const f=[420,520,640]'), src.indexOf('/* ---- build 1315'));
  const body =
    'const Math=Object.create(globalThis.Math); if(rnd!=null) Math.random=()=>rnd;\n' +
    'const calls=[]; const noise=(o)=>calls.push(o);\n' + stateLine +
    'const S={' + stepSrc + '};\n' +
    'for(let i=0;i<n;i++) S.step();\nreturn calls;';
  return new Function('rnd','n',body)(rnd, n);
}
{
  const det = stepRig(0.5, 6);   // zero jitter -> the pure rotation
  eq(det.map(c=>c.filterFreq).join(','), '520,640,420,520,640,420', 'three variants rotate — the most-repeated sound in the game is no longer one sample');
  for(const c of det) near(c.vol, 0.07, 1e-9, '...at the authored base volume');
  const rnd = stepRig(null, 12);
  for(const c of rnd){
    assert(c.filterFreq >= 420*0.88 - 1e-9 && c.filterFreq <= 640*1.12 + 1e-9, 'pitch jitter stays inside +-12% of its variant');
    assert(c.vol >= 0.07*0.80 - 1e-9 && c.vol <= 0.07*1.20 + 1e-9, 'volume jitter stays inside +-20%');
  }
  const stepSrc = src.slice(src.indexOf('step(){ const f=[420,520,640]'), src.indexOf('/* ---- build 1315'));
  assert(!stepSrc.includes('at:') && !stepSrc.includes(', at'), 'the player step stays FLAT — no `at` (build 1315 separation intact)');
}

done('build 1363: the SFX voice — _spatialOut executed (inverse-distance g*d=REF, 14 dB per 5x beyond the 4 m reference, null past 55 kept, behind-ness darkens the lowpass 0.175x and trims 1.5 dB, ~3.5 kHz fully-behind cap, ~2.7 kHz at 53 m, every fallback still sfxBus/panner-only); shoot() executed with zero-jitter control proving the table values and the first-shot +20% crack, and with live jitter proving two consecutive shots differ inside +-3%/+-15 ms bounds; pistol and launcher are distinct patches; victory (rising major triad, ~1.2 s) and defeat (falling minor second + 2 s low sustain) executed and pinned beside both gameWon stopMusic sites and endGame; the delegated UI listener is menu-gated (pointer lock always wins, executed five ways) with openModal/closeModal state-checked (executed) and the pause path voiced; and the footstep rotates 420/520/640 with bounded jitter, still flat');
