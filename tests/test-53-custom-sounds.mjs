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
assert(/shoot\(\)\{ if\(playSample\(\(curSounds\(\)\.shoot\|\|\{\}\)\[curWep\]\)\) return;/.test(src), 'per-weapon shoot sample overrides the synth');
// build 748: reload is per-weapon now (with _all legacy fallback)
assert(/reload\(\)\{ const r=curSounds\(\)\.reload; const u=\(r&&typeof r==='object'\)\?\(r\[curWep\]\|\|r\._all\):r; if\(playSample\(u\)\) return;/.test(src), 'per-weapon reload sample overrides the synth');
for(const ev of ['explode','coin','hit','kill','hurt'])
  assert(new RegExp(ev+'\\(\\)\\{ if\\(playSample\\(curSounds\\(\\)\\.'+ev+'\\)\\) return;').test(src), ev+' sample overrides the synth');

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
assert(/pickup\(\)\{ if\(playSample\(curSounds\(\)\.pickup\)\) return; this\.power\(\); \}/.test(src), 'pickup plays a custom clip, else the power chime');
assert(/function giveItem[\s\S]*?SFX\.pickup\(\)/.test(src), 'item pickups use the pickup sound');
assert(/function applyHealth\(\)\{[\s\S]*?SFX\.pickup\(\)/.test(src), 'powerups use the pickup sound');

done('custom sound samples');
