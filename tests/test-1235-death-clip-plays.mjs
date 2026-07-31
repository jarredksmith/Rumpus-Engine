// build 1235: enemies with a death clip PLAY it — reported from play with a screenshot of a corpse
// standing on its head: "Enemies go stiff and bob up and get stuck in the floor on death. They aren't
// playing their death animation." The machinery existed all along (the die-clip taxonomy, LoopOnce +
// clamp, directional variants the bots have used since 21719) — but killEnemy's no-ragdoll branch
// spliced the mixer, BAKED the die clip's last frame in zero seconds, then stacked the generic
// 86-degree topple on top: a clip that already lies the body down ended ~180 degrees over, and 1175's
// bind-pose bbox solve placed a height for a pose the body wasn't in (the bob, the burial). Now a
// model that ships a die-family clip plays it — mixer alive, no quaternion, no height solve — then
// lingers, sinks and fades; models without one keep 994/1175's topple byte-identically.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the gate + the clip path, executed
const CORE = extractFunction('_clipDeath');
const drive = (acts, hasMixer, sx) => {
  const calls = { state: null, corpses: [], removed: 0 };
  const body =
    'const _fadeCorpses = calls.corpses; const FADE_CORPSE_MAX = 24;\n' +
    'const _removeFadeCorpse = () => calls.removed++;\n' +
    'const _fcCloneMats = () => ["m"];\n' +
    'const setEnemyAnimState = (m, st) => { calls.state = st; };\n' +
    'const _stateActionKey = (a, st) => (a[st] ? st : (a.die ? "die" : "idle"));\n' +
    'const _reactDir = (dx, dz, yaw) => (dz < 0 ? "Front" : "Back");\n' +
    'const mesh = { position: { x: 0, y: 1.4, z: 0 }, rotation: { y: 0 },\n' +
    '  userData: { mixer: ' + (hasMixer ? '{ id: 7 }' : 'null') + ', visual: { userData: { stateActions: acts } } } };\n' +
    CORE + '\nreturn { ok: _clipDeath(mesh, ' + sx + ', -5), calls };';
  return new Function('acts', 'calls', body)(acts, calls);
};
{
  const acts = { idle: {}, run: {}, die: { getClip: () => ({ duration: 1.8 }) } };
  const r = drive(acts, true, 2);
  eq(r.ok, true, 'a model with a die clip takes the clip path');
  assert(r.calls.state === 'die' || /^die/.test(r.calls.state), '...and plays a die-family state');
  eq(r.calls.corpses.length, 1, '...as a corpse entry');
  eq(r.calls.corpses[0].clip, true, '...flagged CLIP: no topple, no height solve — the animation owns the pose');
  near(r.calls.corpses[0].dur, 1.8, 1e-9, '...holding for the clip\'s real duration');
  assert(r.calls.corpses[0].mixer, '...with the mixer KEPT so the clip actually plays over time (the report\'s exact words: "they aren\'t playing their death animation")');
}
{
  const r = drive({ idle: {}, run: {} }, true, 2);
  eq(r.ok, false, 'a model with NO die clip refuses the clip path — the 994/1175 topple runs unchanged');
  eq(r.calls.corpses.length, 0, '...and nothing was pushed');
}
{ // THE TRAP this gate exists to avoid: _stateActionKey walks die -> idle, so asking it "is there a
  // die clip" answers yes for any model that can stand
  const g = extractFunction('_clipDeath');
  assert(/acts\.die \|\| acts\.dieFront \|\| acts\.dieBack/.test(g),
    'the gate reads the die-family keys DIRECTLY, never through the fallback walker (die falls back to IDLE)');
}

// ---------------------------------------------------------------- the corpse updater's clip branch, executed
{
  const fn = extractFunction('updateFadeCorpses');
  const run = () => {
    const body =
      'const _fadeCorpses = []; const _fcQ = { setFromAxisAngle(){} };\n' +
      'let removedMixer = false;\n' +
      'const mixers = [{ id: 7 }];\n' +
      'const _removeFadeCorpse = (c) => { if(c.mixer){ const mi = mixers.indexOf(c.mixer); if(mi >= 0){ mixers.splice(mi, 1); removedMixer = true; } } };\n' +
      'const mats = [{ opacity: 1 }];\n' +
      'const c = { mesh: { position: { y: 1.4 }, quaternion: { copy(){ return this; }, premultiply(){ return this; } } }, mats, t: 0, y0: 1.4, clip: true, dur: 1.8, mixer: mixers[0] };\n' +
      '_fadeCorpses.push(c);\n' +
      fn + '\n' +
      'updateFadeCorpses(1.0);\nconst during = { y: c.mesh.position.y, op: mats[0].opacity };\n' +   // t=1.0: mid-clip
      'updateFadeCorpses(2.0);\nconst linger = { y: c.mesh.position.y, op: mats[0].opacity };\n' +   // t=3.0: clip done, lingering
      'updateFadeCorpses(0.85);\nconst sinking = { y: c.mesh.position.y, op: mats[0].opacity };\n' + // t=3.85: sinking + fading
      'updateFadeCorpses(2.0);\n' +                                                                  // t=5.85: gone
      'return { during, linger, sinking, left: _fadeCorpses.length, removedMixer };';
    return new Function(body)();
  };
  const r = run();
  near(r.during.y, 1.4, 1e-9, 'while the clip plays the body is NOT moved — no bob, no burial');
  eq(r.during.op, 1, '...and not fading');
  near(r.linger.y, 1.4, 1e-9, 'after the clip it lingers clamped on the last frame, still in place');
  assert(r.sinking.y < 1.4 && r.sinking.op < 1, 'then it sinks and fades together');
  eq(r.left, 0, 'and leaves');
  eq(r.removedMixer, true, '...releasing its mixer on the way out — every exit path, or each death leaks a mixer update forever');
}

// ---------------------------------------------------------------- the wiring
{
  const ke = extractFunction('killEnemy');
  assert(/if\(typeof _clipDeath==='function' && _clipDeath\(en\.mesh, sx, sz\)\)/.test(ke),
    'killEnemy tries the clip path first, passing the shot direction (shot from the front falls backward — the bots\' rule)');
  assert(/else \{ if\(en\.mesh\.userData\.mixer\)\{ const mi=mixers\.indexOf/.test(ke),
    '...and only the no-clip road splices the mixer and takes 994/1175\'s topple');
  assert(/function _fcCloneMats\(mesh\)/.test(src) && /const mats=_fcCloneMats\(mesh\);/.test(src),
    'both roads share the one material-clone helper (the fade must never dim a live enemy sharing materials)');
  assert(/if\(c\.mixer\)\{ const mi=mixers\.indexOf\(c\.mixer\); if\(mi>=0\) mixers\.splice\(mi, ?1\); \}/.test(extractFunction('_removeFadeCorpse')),
    '_removeFadeCorpse releases the mixer — the cap-shift exit is covered too, not just the natural end');
}

done('build 1235: a death animation finally plays — the gate executed (die-family keys read directly, never the fallback walker whose die->idle chain answers yes for any model that can stand; no-clip models refuse and keep the 994/1175 topple), the clip corpse executed through its whole life (body unmoved while the clip plays — no bob, no burial — linger, sink+fade, mixer released on every exit), and killEnemy tries the clip road first with the shot direction driving the directional variants');
