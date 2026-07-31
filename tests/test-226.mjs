import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 318: a cutscene can carry its own one-shot audio track
assert(/let cineCfg = \{ on:false,[^}]*audio:'', shots2:\[\] \}/.test(src), 'cineCfg has an audio field (one track spans all shots)');

// persistence: applied on load (both branches) and serialized
const ac = extractFunction('_applyCine');
assert(/cineCfg\.audio=\(typeof lc\.audio==='string'\)\?lc\.audio:''/.test(ac), 'audio restored from a saved cinematic');
assert(/cineCfg\.audio=''/.test(ac), 'audio cleared when there is no cinematic');
assert(/look: cineCfg\.look, interp: cineCfg\.interp, dofRange: cineCfg\.dofRange, dofStrength: cineCfg\.dofStrength, dofStrengthTo: cineCfg\.dofStrengthTo, roll: cineCfg\.roll, rollTo: cineCfg\.rollTo, ease: cineCfg\.ease, holdStart: cineCfg\.holdStart, holdEnd: cineCfg\.holdEnd, ev: cineCfg\.ev\|\|undefined, audio: cineCfg\.audio\|\|''/.test(src), 'audio serialized with the level');

// play/stop helpers
const start = extractFunction('_startCineAudio');
assert(/const url=\(typeof _cineAudioUrl==='string' && _cineAudioUrl!==''\) \? _cineAudioUrl : cineCfg\.audio; if\(!url\) return;/.test(src), 'plays the RUNNING cutscene\'s track, falling back to #1; no-op when none set (build 356)');
assert(/if\(typeof initAudio==='function'\) initAudio\(\)/.test(start), 'ensures the audio context exists');
assert(/loadSound\(url,/.test(start), 'loads via the shared decoder');
assert(/g\.connect\(masterBus\)/.test(start), 'routed to the master bus (independent of music/sfx volume)');
assert(/tok!==_cineAudioTok \|\| !_cineActive\) return/.test(start), 'stale-load guard');
const stop = extractFunction('_stopCineAudio');
assert(/_cineAudioTok\+\+/.test(stop) && /_cineAudioSrc\.stop\(\)/.test(stop), 'stop kills the source + bumps the token');

// lifecycle hooks
assert(/_showCineAvatar\(\);\s*_startCineAudio\(\);/.test(src), 'startCinematic starts the track');
assert(/_hideCineAvatar\(\);\s*_stopCineAudio\(\);/.test(src), 'endCinematic stops the track');
assert(/_clearInterstitial\(\); if\(typeof _stopCineAudio==='function'\) _stopCineAudio\(\)/.test(extractFunction('exitToMenu')), 'bailing to menu stops the track');
done();
