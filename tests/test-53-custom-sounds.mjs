// (build 76) Custom sound samples: load mp3/wav/ogg per event and play it instead of the synth.
import { gameSource, html, extractFunction, done, assert, eq } from './harness.mjs';
const src = gameSource();

// wiring + persistence
assert(/subSec\('Audio','audio'/.test(src), 'audio lives in a Scene sub-section now');
assert(/_sndRow\('Music track \(loops\)'/.test(src), 'music sound row wired in Scene Audio');
assert(!/id="soundBtn"/.test(html), 'the launch-menu Custom sounds button is gone');
assert(/sounds:_sanitizeSounds\(j\.sounds\)/.test(src) && /sounds:_emptySounds\(\)/.test(src), 'sounds persist via audioSettings');
assert(/preloadCustomSounds\(\);/.test(src) && /buildAudioBuses\(\); preloadCustomSounds/.test(src), 'configured samples preload on audio init');

// SFX override hooks (sample first, else synth)
assert(/shoot\(\)\{ if\(playSample\(\(curSounds\(\)\.shoot\|\|\{\}\)\[curWep\], \{vary:0\.04\}\)\) return;/.test(src), 'per-weapon shoot sample overrides the synth (with pitch wobble, build 752)');
// build 748: reload is per-weapon now (with _all legacy fallback)
assert(/reload\(\)\{ const r=curSounds\(\)\.reload; const u=\(r&&typeof r==='object'\)\?\(r\[curWep\]\|\|r\._all\):r; if\(playSample\(u\)\) return;/.test(src), 'per-weapon reload sample overrides the synth');
assert(/coin\(\)\{ if\(playSample\(curSounds\(\)\.coin\)\) return;/.test(src), 'coin sample overrides the synth');
assert(/explode\(at\)\{ if\(playSample\(curSounds\(\)\.explode, \{at\}\)\) return;/.test(src), 'explode sample overrides the synth (build 1208: positioned)');
// build 752: hit/hurt get a pitch wobble, kill is per-enemy-type + wobble
assert(/hit\(at\)\{ if\(playSample\(curSounds\(\)\.hit, \{vary:0\.06, at\}\)\) return;/.test(src), 'hit sample overrides the synth (pitch wobble; positioned since 1208)');
assert(/hurt\(\)\{ if\(playSample\(curSounds\(\)\.hurt, \{vary:0\.05\}\)\) return;/.test(src), 'hurt sample overrides the synth (pitch wobble)');
assert(/kill\(type, at\)\{ const ek=curSounds\(\)\.enemyKill\|\|\{\}; if\(playSample\(\(type&&ek\[type\]\)\|\|curSounds\(\)\.kill, \{vary:0\.05, at\}\)\) return;/.test(src), 'kill plays the per-enemy-type clip (else shared), with a wobble; positioned since 1208');
assert(/SFX\.kill\(en\.type, en\.mesh\.position\)/.test(src), 'the kill site passes the enemy type and its position (build 1208)');
// build 752: playSample picks a random clip from an array + applies the pitch wobble
assert(/if\(Array\.isArray\(url\)\)\{ if\(!url\.length\) return false; url=url\[Math\.floor\(Math\.random\(\)\*url\.length\)\]; \}/.test(src), 'a slot may hold several clips, picked at random');
assert(/if\(vary>0\) src\.playbackRate\.value = Math\.max\(0\.5, 1 \+ \(Math\.random\(\)\*2-1\)\*vary\);/.test(src), 'playSample applies the pitch wobble');

// --- runnable: loader + player against a stubbed WebAudio ---
const made = [];
function FakeBuffer(){ this.duration = 0.5; }
const actxStub = {
  decodeAudioData(ab, res){ res(new FakeBuffer()); },
  createBufferSource(){ const o={ buffer:null, connect(){return o;}, start(){ made.push('played'); } }; return o; },
};
globalThis.fetch = async (u)=> u.includes('bad') ? { ok:false } : { ok:true, arrayBuffer:async()=>new ArrayBuffer(8) };

const env = new Function('actx','sfxBus','initAudio', `
  const _soundBuffers = {};
  const _SND_MAXDIST = 55;   // build 1208: playSample now routes through _spatialOut
  ${extractFunction('_spatialOut')}
  ${extractFunction('loadSound')}
  ${extractFunction('playSample')}
  return { loadSound, playSample, buffers:_soundBuffers };
`)(actxStub, {}, ()=>{});

// not loaded yet -> playSample falls back (returns false) and kicks off a load
eq(env.playSample('https://x/s.mp3'), false, 'unloaded url falls back to synth');
await new Promise(r=>setTimeout(r,5));
eq(env.buffers['https://x/s.mp3'].duration, 0.5, 'url decodes into a buffer');
// now it plays from the sample
eq(env.playSample('https://x/s.mp3'), true, 'loaded url plays the sample');
eq(made.length, 1, 'a buffer source actually started');
// a failing fetch marks the url errored (and never crashes)
await new Promise((res)=> env.loadSound('https://bad/s.mp3', (st)=>{ if(st==='error'||st==='loading'){} res(); }));
await new Promise(r=>setTimeout(r,5));
eq(env.buffers['https://bad/s.mp3'], 'error', 'a 404 marks the url errored');
eq(env.playSample('https://bad/s.mp3'), false, 'errored url falls back to synth');
eq(env.playSample(''), false, 'empty url is a no-op');
// build 751: pickup + jump sounds
assert(/jump\(\)\{ if\(playSample\(curSounds\(\)\.jump\)\) return;/.test(src), 'jump uses a custom jump sample');
assert(/pickup\(\)\{ if\(playSample\(curSounds\(\)\.pickup\)\) return; tone\(\{freq:520/.test(src), 'pickup plays a custom clip, else the chime');
assert(/function giveItem[\s\S]*?SFX\.pickup\(\)/.test(src), 'item pickups use the pickup sound');
assert(/function applyHealth\(\)\{[\s\S]*?SFX\.pickup\(\)/.test(src), 'powerups use the pickup sound');

// build 753: the LIVE Scene>Audio editor panel exposes the new rows (car SFX + per-enemy-type kill)
assert(/subSec\('Audio','audio',true\)/.test(src), 'there is a live Scene > Audio editor subsection');
assert(/\['Car engine \(loops\)','carEngine'\],\['Car brake','carBrake'\],\['Car skid \/ slide','carSkid'\],\['Car boost','carBoost'\]/.test(src), 'the audio panel lists the car SFX rows');
assert(/for\(const _ek of ENEMY_TYPE_KEYS\)\{[\s\S]*?audioSettings\.sounds\.enemyKill\[_ek\]/.test(src), 'the audio panel lists per-enemy-type kill rows');

done('custom sound samples');
