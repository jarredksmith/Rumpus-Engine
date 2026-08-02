import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1314 — REPORTED FROM PLAY, three things in one message:
//
//   "There seems to be a default coded sound for when pressing the fire button and impact on props,
//    especially for melee. It plays the default AND the custom sound at the same time. Can we remove the
//    default sounds if there is a custom sound loaded? Also need the option to search freesounds for prop
//    impact noises. I'd also like a slot per-prop for a custom explosion or breaking sound."
//
// The doubling is two independent systems arriving at the same instant: build 1305 gave the PROP its own
// impact clip, while the generic `SFX.hit()` at the end of the swing and after every pellet has fired since
// long before that. Neither knew about the other — and a creator who authors a wood-crate sound is SAYING
// what the crate sounds like, so layering the engine's 600 Hz sine on top is the engine talking over them.
//
// Measured live (tools/probe/prop-sound-dedupe.mjs — every sound start recorded, sample path and synth path):
//
//   melee swing at a prop   no custom clip -> 1 sound      with custom -> 1 sound (the custom one)
//   shooting a prop         no custom clip -> 1 sound      with custom -> 1 sound (the custom one)
//   breaking a prop         no break clip  -> synth 220Hz  with break  -> the custom clip, alone

// ---------------------------------------------------------------- the latch
{
  const rig = new Function('ST',
    'const performance = { now: () => ST.t };\nlet _propSndAt = -1e9;\n' +
    extractFunction('_propSndFresh') + '; return { fresh:_propSndFresh, mark:(t)=>{ _propSndAt = t; } };');
  const ST = { t: 10000 }, r = rig(ST);
  eq(r.fresh(), false, 'nothing has played: the generic hit sound is free to fire');
  r.mark(ST.t);
  eq(r.fresh(), true, '...and stands down the instant a prop clip plays');
  ST.t += 79; eq(r.fresh(), true, 'still, a frame later');
  ST.t += 2; eq(r.fresh(), false, 'and past the window it is free again — 80 ms is far shorter than two deliberate hits');
  assert(/The latch is a TIMESTAMP rather than a return value threaded through six call sites/.test(src),
    'why a timestamp rather than a return value is recorded');
  assert(/the host and\n\/\/ a co-op client reach the sound by different routes/.test(src),
    '...which is the co-op reason, not a convenience');
}
{ // it is SET by a successful play, and only by one
  const ph = extractFunction('playPropHitSound');
  assert(/const ok = playSample\(obj\.userData\.hitSnd, \{ at: pt \|\| obj\.position, vary: 0\.08 \}\);/.test(ph),
    'the clip is played…');
  assert(/if\(ok\) _propSndAt = now;/.test(ph),
    '…and the latch is set only when it ACTUALLY played — a url that has not decoded yet must not silence the fallback');
  // every early return leaves the latch alone, so a prop with no clip never suppresses anything
  assert(ph.indexOf('if(!obj || !obj.userData || !obj.userData.hitSnd) return false;') < ph.indexOf('_propSndAt = now'),
    'a prop with no clip returns before the latch');
}

// ---------------------------------------------------------------- the default stands down
{
  const ms = extractFunction('_meleeStrike');
  assert(/if\(hit && SFX\.hit && !_propSndFresh\(\)\) SFX\.hit\(\);/.test(ms),
    'the swing plays the generic hit sound only when the prop did not supply one');
  assert(/spark\(hit\.point, 0xffd166\); if\(p===0\)\{ showHitmarker\(\); if\(!_propSndFresh\(\)\) SFX\.hit\(\); \}/.test(src),
    '...and so does a bullet landing on a prop');
  // the HITMARKER is deliberately untouched: it is information, not decoration
  assert(/showHitmarker\(\); if\(!_propSndFresh\(\)\)/.test(src),
    'the hitmarker still fires either way — the report is about the sound, and the marker tells you the shot connected');
  // and every OTHER SFX.hit — enemies, players, bots, the turret — is untouched
  const total = (src.match(/SFX\.hit\(\)/g) || []).length;
  const guarded = (src.match(/!_propSndFresh\(\)\) SFX\.hit\(\)/g) || []).length;
  eq(guarded, 2, 'exactly the two prop paths are guarded');
  assert(total - guarded >= 5, 'the ' + (total - guarded) + ' other hit sounds (enemies, players, bots, the turret) are untouched');
}

// ---------------------------------------------------------------- the break slot
{
  const pb = extractFunction('playPropBreakSound');
  assert(/const u = obj && obj\.userData; if\(!u \|\| !u\.breakSnd\) return false;/.test(pb),
    'a prop with no break clip answers false, so the engine sound still plays');
  assert(/return playSample\(u\.breakSnd, \{ at: at \|\| \(obj\.position \|\| null\), vary: 0\.05 \}\);/.test(pb),
    '...and one with a clip plays it positionally');
  const sp = extractFunction('shatterProp');
  assert(/if\(!playPropBreakSound\(obj, _shCtr\) && typeof SFX!=='undefined' && SFX\.shatter\) SFX\.shatter\(_shCtr\);/.test(sp),
    'the shatter style tries the prop’s own clip FIRST and falls back to the engine’s');
  assert(/if\(!playPropBreakSound\(obj, _shCtr\) && typeof SFX!=='undefined' && SFX\.puff\) SFX\.puff\(\);/.test(sp),
    '...and so does the puff style');
  assert(/ONE slot serves both, because for an explosive prop the break IS\n\/\/ the explosion/.test(src),
    'and why it is ONE slot rather than a separate explosion slot is recorded');
  // no debounce here, unlike the impact sound: a prop breaks exactly once
  assert(!/_hitSndT/.test(pb), 'the break needs no rate limit — a prop is destroyed once');
}

// ---------------------------------------------------------------- both slots travel, and are warmed
{
  assert(/if\(o\.userData\.breakSnd\) e\.bsn = String\(o\.userData\.breakSnd\)\.slice\(0,300\);/.test(src), 'serialized as `bsn`');
  assert(/if\(p\.bsn\) obj\.userData\.breakSnd = String\(p\.bsn\)\.slice\(0,300\);/.test(src), '...and re-read, length-capped');
  const pl = extractFunction('preloadPropHitSounds');
  assert(/if\(u\.hitSnd\) loadSound\(u\.hitSnd\); if\(u\.breakSnd\) loadSound\(u\.breakSnd\);/.test(pl),
    'BOTH are warmed at deploy');
  assert(/it fires exactly once per prop, so a cold first play would be silent for the one hit that matters most/.test(src),
    'and the break clip especially, because it gets one chance');
}

// ---------------------------------------------------------------- the search, where the field is
{
  assert(/const _propSndSlot = \(label, key, hintHtml, fsLabel, fsQuery\)=>\{/.test(src),
    'the two slots are one builder rather than two copies');
  eq((src.match(/_propSndSlot\('/g) || []).length, 2, '...called twice: impact and break');
  assert(/fsBox=renderFreesoundBrowser\(pdBody, \(\)=>renderEditorFields\(\), \{ label:fsLabel,/.test(src),
    'each slot opens the existing Freesound browser rather than a second search UI');
  assert(/if\(!fsLastQuery\) fsLastQuery=fsQuery;/.test(src),
    '...seeded with the search the creator came here to run');
  assert(/set:v=>\{ const u=String\(v\|\|''\)\.trim\(\)\.slice\(0,300\); _selApply\(o=>\{ if\(u\) o\.userData\[key\]=u; else delete o\.userData\[key\]; \}\); if\(u && typeof loadSound==='function'\) loadSound\(u\); \}/.test(src),
    'a picked sound applies to the WHOLE selection, exactly as typing one does');
  assert(/otherwise the\n                   two ways of filling the same field would disagree about what they act on/.test(src),
    'which is stated, because a picker that acts on one prop while the field acts on thirty is a trap');
  assert(/It replaces the engine\\u2019s default hit sound/.test(src),
    'and the hint tells the creator the default stands down, so the change is visible in the UI and not just in the audio');
}

done('build 1314: a custom prop sound replaces the engine’s, and props gain a break slot — reported as "it plays the default and the custom sound at the same time, especially for melee". Two systems that did not know about each other: build 1305\'s per-prop impact clip and the generic SFX.hit that has fired after every swing and pellet since long before it. A short timestamp latch (a timestamp, not a return value, because the host and a co-op client reach the sound by different routes) stands the generic one down for exactly the two prop paths, leaving enemy, player, bot and turret hits alone — and leaving the hitmarker alone, because that is information rather than decoration. A second per-prop slot covers the moment it breaks, one slot for both break and explosion since for an explosive prop they are the same event, and it replaces the engine’s shatter/puff the same way. Both slots carry a Freesound search seeded with the right query, applying to the whole selection exactly as typing a url does. Measured live: one sound per hit and one per break, in every combination');
