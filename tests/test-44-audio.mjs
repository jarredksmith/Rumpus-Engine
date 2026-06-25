// (build 67) Audio system: master/sfx/music buses, persisted volume settings + mute, and adaptive
// procedural music whose intensity tracks the live threat. SFX route through the sfx bus.
import { gameSource, html, extractFunction, done, assert, eq, near } from './harness.mjs';
const src = gameSource();

// buses + routing
assert(/masterBus=actx\.createGain\(\); masterBus\.connect\(actx\.destination\)/.test(src), 'master bus -> destination');
assert(/sfxBus=actx\.createGain\(\); sfxBus\.connect\(masterBus\)/.test(src) && /musicBus=actx\.createGain\(\); musicBus\.connect\(masterBus\)/.test(src), 'sfx + music buses feed master');
assert(/osc\.connect\(g\)\.connect\(sfxBus\|\|actx\.destination\)/.test(src) && /src\.connect\(filt\)\.connect\(g\)\.connect\(sfxBus\|\|actx\.destination\)/.test(src), 'SFX route through the sfx bus');
assert(/function initAudio\(\)\{[^}]*buildAudioBuses\(\);/.test(src), 'initAudio builds the buses');

// lifecycle
// build 555: world music no longer starts during loading. It starts in reveal() (when the loader finishes) or
// at the end of startGame when no loader/cover is up — never behind the loading screen.
assert(/const reveal=\(\)=>\{[\s\S]*?hideLevelLoader\(\); try\{ startMusic\(\); \}catch\(e\)\{\} \};/.test(src), 'world music starts when the loader reveals (loading complete)');
assert(/if\(!_levelLoaderActive\)\{ try\{ startMusic\(\); \}catch\(e\)\{\} \}/.test(src), 'with no loader/cover up, music starts at the end of startGame');
assert(!/initAudio\(\);\n  startMusic\(\);/.test(src), 'music no longer starts during loading (was right after initAudio in startGame)');
assert(/function gameWon\(\)\{\n  if\(!gameOn\) return;[\s\S]*?stopMusic\(\);/.test(src) && /function endGame\(\)\{\n  releaseHeld\(\); closeRadial\(false\);\n[\s\S]*?stopMusic\(\);/.test(src), 'music stops on win/death');
assert(/if\(_musicOn\) setMusicIntensity\(musicTargetFor\(\{ enemies: enemies\.length, toSpawn, wave \}\)\)/.test(src), 'loop feeds live threat into music intensity');

// controls
assert(/id="muteCb"/.test(html) && /id="volMaster"/.test(html) && /id="volMusic"/.test(html), 'launch menu has mute + volume sliders');
assert(/audioSettings\.muted=mc\.checked; applyAudioSettings\(\); saveAudioSettings\(\)/.test(src), 'mute persists + applies live');
assert(/if\(e\.code==='KeyM' && !e\.repeat\)\{ if\(gameOn[\s\S]*?openBigMap\(\)/.test(src), 'M now opens the tactical map (build 500; mute moved to the settings checkbox)');

// --- runnable: settings load/clamp + intensity mapping ---
const S = new Function('localStorage', `
  let actx=null, masterBus=null, sfxBus=null, musicBus=null;
  const AUDIO_KEY='breach_audio';
  ${extractFunction('_clamp01')}
  ${extractFunction('_emptySounds')}
  ${extractFunction('_sanitizeSounds')}
  ${extractFunction('loadAudioSettings')}
  ${extractFunction('musicTargetFor')}
  return { _clamp01, loadAudioSettings, musicTargetFor };
`);
const store = {}; const ls = { getItem:k=>k in store?store[k]:null, setItem:(k,v)=>{store[k]=String(v);} };
const api = S(ls);

eq(api._clamp01(1.5), 1, 'clamp over 1'); eq(api._clamp01(-2), 0, 'clamp under 0'); eq(api._clamp01('x'), 0, 'non-number -> 0');
let def = api.loadAudioSettings();
eq(def.master, 0.8, 'default master'); eq(def.music, 0.6, 'default music'); eq(def.muted, false, 'default unmuted');
store[ 'breach_audio' ] = JSON.stringify({ master:0.5, music:0.2, sfx:0.9, muted:true });
let saved = api.loadAudioSettings();
eq(saved.master, 0.5, 'loads saved master'); eq(saved.muted, true, 'loads saved mute');
store['breach_audio'] = JSON.stringify({ master:9 });   // out of range
eq(api.loadAudioSettings().master, 1, 'clamps loaded values');

// intensity: calm when empty, hotter under threat, ramps with wave
near(api.musicTargetFor({ enemies:0, toSpawn:0, wave:1 }), 0.15, 1e-9, 'calm between waves');
assert(api.musicTargetFor({ enemies:8, toSpawn:0, wave:1 }) > 0.65, 'tense under heavy threat');
assert(api.musicTargetFor({ enemies:0, toSpawn:0, wave:11 }) > api.musicTargetFor({ enemies:0, toSpawn:0, wave:1 }), 'later waves push intensity up');
eq(api.musicTargetFor({ enemies:50, toSpawn:50, wave:99 }), 1, 'intensity caps at 1');
done('audio system (buses / settings / mute / adaptive music)');
