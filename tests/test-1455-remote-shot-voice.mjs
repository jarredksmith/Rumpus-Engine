// build 1455 — EVERY OTHER PLAYER'S GUN SOUNDED THE SAME.
//
// `SFX.shootAt(pos)` was one hardcoded square-plus-noise blip, weapon-agnostic, and it is the voice of
// every relayed shot: other players, bots, the host's guns on a client. So build 1363's six tuned
// per-weapon patches — and a creator's own `curSounds().shoot[wep]` samples — reached NOBODY but the
// person pulling the trigger. Its only caller (`remoteFire`) already had `wep` in scope: it reads it
// two lines earlier for `noMuzzle`, and passed only a position.
//
// In this genre, telling an enemy's weapon by ear is a primary information channel. It was unavailable.
//
// The fix is structural rather than a second synth: ONE `_shotVoice(wep, at, first)` plays the layer
// table, called by the local gun with `at = null` and by the remote path with a position. `_spatialOut`
// returns the bus for a falsy position, so "unpositioned" is the same code path, not a parallel one.
//
// THREE DELIBERATE DIFFERENCES from SFX.shoot, each a defect the other way:
//   - no music duck (a four-player firefight would hold the score down permanently — the duck is
//     feedback on YOUR trigger, not on the room);
//   - its own first-shot clock (a teammate opening up must not steal the brightening from the first
//     round out of your gun);
//   - an unknown or absent weapon falls back to the RIFLE patch, exactly as SFX.shoot does for an
//     unknown curWep. This is a STATED deviation from "reproduce the old blip byte-for-byte": keeping
//     that blip would mean keeping a second voice nothing else in the engine uses, which is the very
//     thing this build removes.

import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the rig
function mkRig({ samples = {}, weapons = {}, now = 0 } = {}) {
  const layersSrc = src.slice(src.indexOf('const _SHOT_LAYERS = {'),
                              src.indexOf('};', src.indexOf('const _SHOT_LAYERS = {')) + 2);
  const voice = extractFunction('_shotVoice');
  const first = extractFunction('_shotFirst');
  // lifted from source, never restated — a rig that restates a declaration keeps passing against a stale copy
  const remoteStamp = (src.match(/let _shotSndAtR = -?[\d.]+;/) || [])[0];
  assert(remoteStamp, 'the remote first-shot clock is declared beside _shotFirst');
  const jit = (src.match(/const _sndJit = [^;]+;/) || [])[0];
  assert(jit, 'the per-shot jitter helper is declared');
  // shootAt is an object METHOD, so brace-matching by name will not reach it — slice it and re-head it.
  const m = src.match(/ {2}shootAt\(pos, wep\)\{[\s\S]*?_shotVoice\(w, pos, _shotFirst\(true\)\); \},/);
  assert(m, 'the shootAt method could not be sliced — has its signature changed?');
  const shootAtSrc = 'function shootAt(pos, wep)' + m[0].slice(m[0].indexOf('{'), m[0].length - 1);

  return new Function('SAMPLES', 'WEAPONS', 'NOW', `
    const log = [];
    let _clock = NOW;
    const actx = { get currentTime(){ return _clock; } };
    const sfxBus = {};
    let _shotSndAt = -9;
    const tone  = (o) => log.push({ kind:'tone',  ...o });
    const noise = (o) => log.push({ kind:'noise', ...o });
    const setTimeout = (fn) => { log.push({ kind:'tail-scheduled' }); fn(); };
    const playSample = (url, opts) => { if(!url) return false; log.push({ kind:'sample', url, at:opts&&opts.at, vary:opts&&opts.vary }); return true; };
    const curSounds = () => ({ shoot: SAMPLES });
    let _duckCalls = 0; const _duckMusic = () => { _duckCalls++; };
    ${jit}
    ${layersSrc}
    ${voice}
    ${remoteStamp}
    ${first}
    ${shootAtSrc}
    return {
      layers: _SHOT_LAYERS,
      voice: (w, at, f) => { log.length = 0; _shotVoice(w, at, f); return log.slice(); },
      shootAt: (pos, wep) => { log.length = 0; shootAt(pos, wep); return log.slice(); },
      firstLocal:  () => _shotFirst(false),
      firstRemote: () => _shotFirst(true),
      tick: (dt) => { _clock += dt; },
      ducks: () => _duckCalls,
      localStamp: () => _shotSndAt,
    };`)(samples, weapons, now);
}

// ---------------------------------------------------------------- 1. two weapons are tellable apart
{
  const r = mkRig();
  const pos = { x: 10, y: 2, z: -5 };
  const sniper = r.shootAt(pos, 'sniper');
  const smg    = r.shootAt(pos, 'smg');

  const bodyOf = (log) => log.filter(e => e.kind === 'tone')[1];   // sub, then body
  const crackOf = (log) => log.find(e => e.kind === 'noise');

  assert(bodyOf(sniper).freq < bodyOf(smg).freq * 0.5,
    'a sniper at the same spot has a far deeper body than an SMG (' + bodyOf(sniper).freq.toFixed(0) + ' vs ' + bodyOf(smg).freq.toFixed(0) + ' Hz)');
  assert(crackOf(sniper).type !== crackOf(smg).type,
    '...and a different crack filter entirely (lowpass vs highpass) — the thing an ear identifies a weapon by');
  assert(crackOf(sniper).dur > crackOf(smg).dur * 3,
    '...over a much longer crack');

  // every one of the six patches must produce a distinguishable body
  const freqs = new Set();
  for (const w of ['pistol', 'rifle', 'smg', 'shotgun', 'sniper', 'launcher'])
    freqs.add(Math.round(bodyOf(r.shootAt(pos, w)).freq / 10));
  eq(freqs.size, 6, 'all six tuned patches reach the remote path, each distinguishable');
}

// ---------------------------------------------------------------- 2. it is POSITIONED
{
  const r = mkRig();
  const pos = { x: 40, y: 1, z: 3 };
  const log = r.shootAt(pos, 'rifle');
  const voiced = log.filter(e => e.kind === 'tone' || e.kind === 'noise');
  eq(voiced.length, 4, 'sub + body + crack + tail');
  for (const e of voiced) assert(e.at === pos, 'every layer carries the position — a shot to your left reads to your left');

  // the local gun stays unpositioned, which is what routes it to the plain bus
  const local = r.voice('rifle', null, false);
  for (const e of local.filter(e => e.kind !== 'tail-scheduled'))
    assert(e.at === null, 'the local gun passes at=null, which _spatialOut resolves to the bus');
}

// ---------------------------------------------------------------- 3. ONE voice, not two
{
  eq((src.match(/function _shotVoice\(wep, at, first\)\{/g) || []).length, 1, '_shotVoice is declared once');
  eq((src.match(/_shotVoice\(/g) || []).length, 3, '...and has exactly two callers besides its declaration');
  assert(/_shotVoice\(curWep, null, _shotFirst\(false\)\)/.test(src), 'the local gun calls it unpositioned');
  assert(/_shotVoice\(w, pos, _shotFirst\(true\)\)/.test(src), 'the remote path calls it positioned');
  // the old blip must be gone, or there are two voices again
  assert(!/o\.frequency\.exponentialRampToValueAtTime\(110,t\+0\.08\)/.test(src),
    'the hardcoded weapon-agnostic blip is gone');
  // and the layer table is read in exactly one place
  eq((src.match(/_SHOT_LAYERS\[/g) || []).length, 2,
    'the table is indexed only by the voice and by shootAt\'s own fallback test');
}

// ---------------------------------------------------------------- 4. separate first-shot clocks
// A teammate firing beside you must not flatten the first round out of your own gun.
{
  const r = mkRig({ now: 100 });
  eq(r.firstLocal(), true, 'the first local shot of an engagement is bright');
  eq(r.firstLocal(), false, '...and the next one, 0 s later, is not');
  r.tick(1.0);
  eq(r.firstLocal(), true, 'after a 1 s gap it is bright again');

  // now the interaction that matters
  const stamp = r.localStamp();
  eq(r.firstRemote(), true, 'a remote shot has its own first-shot state');
  eq(r.localStamp(), stamp, '...and does NOT touch the local clock');
  eq(r.firstLocal(), false, 'so your own next shot is still mid-burst, exactly as it was');
  // and the reverse
  r.tick(1.0);
  eq(r.firstRemote(), true, 'the remote clock re-arms on its own gap');
  eq(r.firstRemote(), false, '...and runs on its own');
}

// ---------------------------------------------------------------- 5. no music duck on the remote path
{
  const r = mkRig();
  r.shootAt({ x: 1, y: 1, z: 1 }, 'shotgun');
  r.shootAt({ x: 2, y: 1, z: 1 }, 'rifle');
  r.shootAt({ x: 3, y: 1, z: 1 }, 'smg');
  eq(r.ducks(), 0, 'three relayed shots duck the music zero times — a firefight must not hold the score down');
  // and the LOCAL one still does (build 1374), asserted at its own site
  assert(/shoot\(\)\{ _duckMusic\(\);/.test(src), 'while your own trigger still ducks it');
}

// ---------------------------------------------------------------- 6. a creator's own clip wins, positioned
{
  const r = mkRig({ samples: { sniper: 'boom.mp3' } });
  const pos = { x: 7, y: 0, z: 7 };
  const log = r.shootAt(pos, 'sniper');
  eq(log.length, 1, 'the authored clip plays INSTEAD of the synth, not on top of it');
  eq(log[0].kind, 'sample', '...as a sample');
  eq(log[0].url, 'boom.mp3', '...the one authored for that weapon');
  eq(log[0].at, pos, '...positioned');
  assert(log[0].vary > 0, '...with the pitch wobble, so repeated shots are not identical');

  // a weapon with no authored clip still gets its synth patch
  const smg = r.shootAt(pos, 'smg');
  assert(smg.some(e => e.kind === 'tone'), 'a weapon the creator did not author falls through to its own patch');
  assert(!smg.some(e => e.kind === 'sample'), '...and never borrows another weapon\'s clip');
}

// ---------------------------------------------------------------- 7. a suppressed weapon is quiet to you too
{
  const r = mkRig({ weapons: { pistol: { suppressed: true } } });
  const pos = { x: 5, y: 1, z: 5 };
  const log = r.shootAt(pos, 'pistol');
  eq(log.length, 2, 'the phut is two layers, not the full patch');
  eq(log[0].freq, 210, '...the suppressed body');
  assert(log.every(e => e.at === pos), '...still positioned');
  assert(!log.some(e => e.kind === 'tail-scheduled'), '...and deliberately tail-less, which is what a suppressor is for');

  const loud = r.shootAt(pos, 'rifle');
  assert(loud.some(e => e.kind === 'tail-scheduled'), 'an unsuppressed weapon keeps its tail');
}

// ---------------------------------------------------------------- 8. the fallback (stated deviation)
{
  const r = mkRig();
  const pos = { x: 0, y: 0, z: 9 };
  const rifle = r.shootAt(pos, 'rifle');
  const unknown = r.shootAt(pos, 'trebuchet');
  const absent = r.shootAt(pos, undefined);
  const bodyF = (log) => log.filter(e => e.kind === 'tone')[1].freq;
  // jitter is +-3%, so compare within band rather than exactly
  assert(Math.abs(bodyF(unknown) - bodyF(rifle)) / bodyF(rifle) < 0.10,
    'an unknown weapon takes the RIFLE patch, as SFX.shoot does for an unknown curWep');
  assert(Math.abs(bodyF(absent) - bodyF(rifle)) / bodyF(rifle) < 0.10,
    '...and so does an absent one, so a pre-1455 caller is never silent');
  assert(!absent.some(e => e.kind === 'sample'), 'an absent weapon cannot index a creator sample by undefined');
}

// ---------------------------------------------------------------- 9. the caller passes the weapon
{
  const rf = extractFunction('remoteFire');
  assert(/SFX\.shootAt\(from, wep\)/.test(rf), 'remoteFire passes the weapon it already had in scope');
  assert(/WEAPONS\[wep\] && WEAPONS\[wep\]\.noMuzzle/.test(rf),
    '...the same `wep` it reads two lines earlier for the muzzle flash, which is why this was one argument');
  eq((src.match(/SFX\.shootAt\(/g) || []).length, 1, 'and there is exactly one call site to keep in step');
}

done('build 1455 (audio audit): SFX.shootAt was ONE hardcoded square-plus-noise blip, weapon-agnostic — and it is the voice of every relayed shot, so build 1363\'s six tuned per-weapon patches and every creator sample reached nobody but the person pulling the trigger, in a genre where identifying a weapon by ear is a primary information channel. Its only caller already had `wep` in scope (it reads it two lines earlier for noMuzzle). The fix is ONE `_shotVoice(wep, at, first)` played by the local gun with at=null and by the remote path with a position — `_spatialOut` resolves a falsy position to the bus, so unpositioned is the same code path rather than a parallel one, and the two can no longer disagree about what a shotgun sounds like. Executed: all six patches arrive distinguishable at an identical position (sniper 95 Hz lowpass against SMG 380 Hz highpass), every layer carries the position, an authored clip for that weapon wins and is positioned while a weapon the creator did not author never borrows another\'s, a suppressed remote weapon phuts tail-lessly, and three deliberate differences from SFX.shoot hold — no music duck (a four-player firefight would hold the score down permanently), a SEPARATE first-shot clock proven not to touch the local one (a teammate firing must not flatten the first round out of your gun), and an unknown or absent weapon falling back to the rifle patch rather than preserving a second voice nothing else uses');
