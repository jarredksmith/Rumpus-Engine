import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1305 — REPORTED FROM PLAY, with build 1303's timing fix:
//
//   "There also needs to be a way to add a per prop hit sound, so if I'm hitting a wooden crate with an axe,
//    it sounds like the box is hit with an axe; if I hit a metal barrel, it should sound like metal hitting
//    metal. It would also be nice to have some sort of visual that the blow landed, maybe with some small
//    particles etc."
//
// One url per prop (`userData.hitSnd`), and it is LEVEL data rather than a device setting — the material of
// a crate belongs to the crate and has to travel to whoever plays the level. Verified live against the real
// game (tools/probe/prop-hitsound.mjs): a real crowbar swing at a real crate played the authored url at the
// contact point [0, 1.70, 31.50] with vary 0.08 and drew one spark at the same point; eight pellets in one
// frame played it ONCE; twelve props in one explosion played it four times at four distinct positions; the
// url survived a full serializeLevel() round trip; and a prop with no url played nothing.

const PS = 'const PROP_SND_GAP = 55;';
assert(src.indexOf(PS) > 0, 'the per-prop gap is a named constant');
const GAP = +src.match(/const PROP_SND_GAP = (\d+);/)[1];
const BURST = +src.match(/const PROP_SND_BURST = (\d+);/)[1];
const WINDOW = +src.match(/const PROP_SND_WINDOW = (\d+);/)[1];

// ---------------------------------------------------------------- the real function, on a stub clock
const rig = () => {
  const st = { now: 1000, played: [] };
  const fn = new Function('ST',
    'let _propSndT = 0, _propSndN = 0;\n' +
    'const PROP_SND_GAP = ' + GAP + ', PROP_SND_BURST = ' + BURST + ', PROP_SND_WINDOW = ' + WINDOW + ';\n' +
    'const performance = { now: () => ST.now };\n' +
    'const playSample = (url, opts) => { ST.played.push({ url, at: opts && opts.at, vary: opts && opts.vary }); return true; };\n' +
    extractFunction('playPropHitSound') + '; return playPropHitSound;')(st);
  return { fn, st };
};
const crate = (url) => ({ userData: url === undefined ? {} : { hitSnd: url }, position: { x: 1, y: 2, z: 3 } });

{ // the plain case
  const { fn, st } = rig();
  const c = crate('wood.mp3');
  eq(fn(c, { x: 9, y: 8, z: 7 }), true, 'a prop with an authored url plays it');
  eq(st.played.length, 1);
  eq(st.played[0].url, 'wood.mp3');
  eq(st.played[0].at.x, 9, '...AT THE CONTACT POINT, so it pans and fades with distance (build 1208)');
  assert(st.played[0].vary > 0, '...with a pitch wobble, so twenty axe blows are not one sample twenty times');
}
{ // no url is the default, and must cost nothing
  const { fn, st } = rig();
  eq(fn(crate(), { x: 0, y: 0, z: 0 }), false, 'a prop with no url plays nothing');
  eq(fn(crate(''), null), false, 'an empty url is not a url');
  eq(fn(null, null), false, 'and neither is a missing prop');
  eq(fn({}, null), false, '...or one with no userData');
  eq(st.played.length, 0);
}
{ // an unbreakable prop takes no damage, so nothing landed on it
  const { fn, st } = rig();
  const c = crate('wood.mp3'); c.userData.breakable = false;
  eq(fn(c, null), false, 'an unbreakable prop is silent — damageProp returns before it takes a point of damage');
  eq(st.played.length, 0);
}
{ // AN EXPLOSION PASSES NO CONTACT POINT
  const { fn, st } = rig();
  eq(fn(crate('wood.mp3'), null), true, 'a hit with no point still plays');
  eq(st.played[0].at.x, 1, "...at the PROP'S OWN position — null would put it flat in both ears");
  eq(st.played[0].at.z, 3);
}

// ---------------------------------------------------------------- one hit is one sound
{
  const { fn, st } = rig();
  const c = crate('wood.mp3');
  // A SHOTGUN LANDS EVERY PELLET IN ONE FRAME. Eight copies of one buffer starting on the same sample is
  // not eight hits — it is one hit ~18 dB louder, with comb filtering.
  for (let i = 0; i < 8; i++) fn(c, null);
  eq(st.played.length, 1, 'eight pellets in one frame are ONE sound');
  st.now += GAP - 1;
  fn(c, null);
  eq(st.played.length, 1, '...and still one just under the gap');
  st.now += 2;
  fn(c, null);
  eq(st.played.length, 2, 'past the gap it sounds again — this is a debounce, not a mute');
  assert(GAP < 120, 'and the gap is shorter than any weapon’s fire rate, so an axe at one swing a second is never swallowed (' + GAP + 'ms)');
}
{ // an SMG at its real cadence still sounds on most shots rather than being throttled to silence
  const { fn, st } = rig();
  const c = crate('wood.mp3');
  for (let i = 0; i < 20; i++) { fn(c, null); st.now += 90; }   // ~90 ms is the engine's fastest automatic
  eq(st.played.length, 20, 'twenty SMG rounds at 90 ms are twenty sounds — the gap only catches the same FRAME');
}

// ---------------------------------------------------------------- the burst across DIFFERENT props
{
  const { fn, st } = rig();
  // explodeAt damages every breakable prop in the radius in one pass. A warehouse of thirty crates would
  // start thirty buffers on one frame — the per-prop gap cannot see that, because they are different props.
  const many = Array.from({ length: 30 }, () => crate('wood.mp3'));
  for (const c of many) fn(c, null);
  eq(st.played.length, BURST, 'thirty props in one explosion play ' + BURST + ' sounds, not thirty');
  st.now += WINDOW + 1;
  for (const c of many) fn(c, null);
  eq(st.played.length, BURST * 2, '...and the budget refills, so a second explosion is heard');
  assert(BURST >= 3, 'the cap is high enough that a real chain of two or three barrels still reads as several');
}
{ // the cap must not be a per-prop mute: a single prop hit repeatedly is governed by the GAP alone
  const { fn, st } = rig();
  const c = crate('wood.mp3');
  for (let i = 0; i < 12; i++) { fn(c, null); st.now += GAP + 1; }
  eq(st.played.length, 12, 'twelve spaced hits on one prop all sound — the burst window resets between them');
}

// ---------------------------------------------------------------- where it is called from
{
  const dp = extractFunction('damageProp');
  assert(/playPropHitSound\(obj, point\);/.test(dp),
    'damageProp is the chokepoint — a bullet, a swing, an explosion and a client’s relayed propHit all pass through it');
  assert(dp.indexOf('obj.userData.hp -= dmg;') < dp.indexOf('playPropHitSound'),
    '...and it sounds only once the prop has actually taken the damage');
  // A GUEST'S SHOT IS RELAYED, so damageProp runs on the HOST and the guest would never hear its own hit.
  assert(/\}catch\(e\)\{\} playPropHitSound\(dprop, hp\); \}/.test(src),
    'the client predicts its own SHOT impact locally');
  assert(/\}catch\(e\)\{\} playPropHitSound\(o, pt\); \}/.test(src),
    '...and its own SWING');
  eq((src.match(/playPropHitSound\(/g) || []).length, 4,
    'the definition plus exactly three call sites — the host chokepoint and the two client predictions');
  assert(/a guest predicts its own impact sound or never hears the crate it just hit/.test(src),
    'and why the client needs its own call is recorded');
}

// ---------------------------------------------------------------- the visual the report also asked for
{
  const ma = extractFunction('_meleeStrike');
  assert(/spark\(pt, 0xffd166\);/.test(ma), 'a swing that lands on a prop now sparks at the contact point');
  assert(ma.indexOf('spark(pt, 0xffd166);') > ma.indexOf("if(NET.mode==='client')"),
    '...on the client’s predicted hit as well as the host’s, or a guest’s swing would look like a miss');
  // it must NOT go inside damageProp, where the bullet path would double it
  assert(!/spark\(/.test(extractFunction('damageProp')),
    'and NOT inside damageProp — the shot already sparks at its own hit point and would draw two');
  assert(/spark\(hit\.point, 0xffd166\); if\(p===0\)\{ showHitmarker\(\); if\(!_propSndFresh\(\)\) SFX\.hit\(\); \}/.test(src),
    '...which is the spark it would have doubled');   /* build 1314 guarded the SOUND on this same line; the spark is unchanged */
  assert(/The BULLET\n           path has sparked at its hit point since long before this; the swing never did/.test(src),
    'the asymmetry that made this invisible is written down');
}

// ---------------------------------------------------------------- it travels with the level
{
  assert(/if\(o\.userData\.hitSnd\) e\.hsn = String\(o\.userData\.hitSnd\)\.slice\(0,300\);/.test(src),
    'serialized as `hsn`, length-capped on the way out');
  assert(/if\(p\.hsn\) obj\.userData\.hitSnd = String\(p\.hsn\)\.slice\(0,300\);/.test(src),
    '...and re-read, capped again — a hostile level file cannot post a novel here');
  // _pfEntryOf deep-copies propEntry, so duplicate, Alt-drag, copy/paste and prefabs inherit it for free
  assert(/const e=JSON\.parse\(JSON\.stringify\(propEntry\(o\)\)\);/.test(extractFunction('_pfEntryOf')),
    'duplicate/paste/prefab derive from propEntry (build 1162), so the sound rides along with no extra wiring');
}
{ // playSample returns FALSE until the buffer decodes, so the first hit on every prop would be silent
  const pl = extractFunction('preloadPropHitSounds');
  assert(/for\(const o of propModels\)/.test(pl), 'every prop in the level is warmed');
  assert(/if\(u\.hitSnd\) loadSound\(u\.hitSnd\)/.test(pl),
    'and its clip is warmed (build 1314 warms the break clip on the same pass)');
  assert(/if\(typeof preloadPropHitSounds==='function'\) preloadPropHitSounds\(\);/.test(src),
    '...at deploy, beside the signal clips build 750 warms for the same reason');
  const i = src.indexOf("preloadSignalSounds();   // build 750"), j = src.indexOf('preloadPropHitSounds();   // build 1305');
  assert(i > 0 && j > i, 'the two sit together, so a third kind of clip has an obvious home');
}

// ---------------------------------------------------------------- the field
{
  /* build 1314 turned the row into a builder called twice (impact + break), so the label is an ARGUMENT
     and the userData key is a variable. Same row, same group-wide behaviour — assert the call and the apply. */
  assert(/_propSndSlot\('Impact sound \\u2014 played on every hit', 'hitSnd',/.test(src), 'the row is in the prop inspector');
  assert(/_selApply\(o=>\{ if\(v\) o\.userData\[key\]=v; else delete o\.userData\[key\]; \}\);/.test(src),
    'and it is GROUP-WIDE — a level has thirty wooden crates and one wood sound');
  assert(/_selBanner\(pdBody, _selTargets\(\)\.length, true\);/.test(src),
    '...announced, by build 1299’s rule that every field states which one it follows');
  eq((src.match(/_selBanner\(/g) || []).length, 5, 'four folds announce their rule, plus the definition (1314 added a second row inside the SAME announced fold)');
  // _sndRow was device-scoped: every existing caller writes audioSettings, which a LEVEL field must not
  const sr = extractFunction('_sndRow');
  assert(/function _sndRow\(label, get, set, save\)\{/.test(sr), '_sndRow takes who to save to');
  assert(/const _save = save \|\| saveAudioSettings;/.test(sr), '...defaulting to the device settings, which is every other caller');
  assert(!/saveAudioSettings\(\)/.test(sr.replace('const _save = save || saveAudioSettings;', '')),
    '...and nothing in the row calls it directly any more — the upload path went the same way');
  assert(/saved with the level<\/b>, so everyone who plays it hears it/.test(src),
    'and the hint says how it differs from the Sounds tab, which is the thing a creator would otherwise assume');
}

done('build 1305: props get their own impact sound and a swing finally shows a hit. One url per prop (userData.hitSnd, serialized as hsn) plays at the contact point through the positional path, from the damageProp chokepoint every damage source passes — with a per-prop debounce so a shotgun’s eight pellets in one frame are one sound rather than one hit 18 dB louder, and a cap across props so an explosion in a warehouse of thirty crates is not thirty simultaneous buffers. A guest predicts its own hit locally because damageProp runs on the host. The melee path now sparks at the contact point, which the bullet path always did and the swing never had. Measured live: a real crowbar swing at a real crate played the authored url at [0,1.70,31.50], drew one spark there, eight pellets played once, twelve props in one blast played four times at four positions, and the url survived a full serializeLevel round trip');
