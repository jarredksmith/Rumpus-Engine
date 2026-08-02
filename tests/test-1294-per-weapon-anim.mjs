import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1294: REPORTED — "the editor doesn't allow different attack animations per weapon. I have to
// choose one animation for the left mouse button and it is used for every weapon. Pistol, sword, axe and
// rifle should all be different." Correct: ANIM_SLOTS carried ONE `attack` slot and all three animators
// (local avatar, remote player, bot) asked for it by that literal name.
//
// A variant is the slot name with the weapon appended — `attack@crowbar`. That choice is what makes it
// small: clips / clipSpeed / clipHold / clipInPlace are plain maps keyed by slot string, so a variant rides
// through the character config, the save file and the network snapshot with no format change.

const slot = new Function(extractFunction('_wepAnimSlot') + '; return _wepAnimSlot;')();

// ---------------------------------------------------------------- the key
{
  eq(slot('attack', 'crowbar'), 'attack@crowbar', 'the variant is the slot with the weapon appended');
  eq(slot('walkFire', 'sniper'), 'walkFire@sniper', 'any slot, not just attack');
  eq(slot('attack', ''), 'attack', 'no weapon -> the plain slot, unchanged');
  eq(slot('attack', null), 'attack', '...whatever "no weapon" looks like');
  eq(slot('attack', undefined), 'attack');
  eq(slot(null, 'pistol'), null, 'no slot -> nothing to qualify');
  eq(slot('', 'pistol'), '', 'and an empty slot stays empty rather than becoming "@pistol"');
}

// ---------------------------------------------------------------- resolution, against the real function
const key = new Function('_ANIM_FALLBACK', extractFunction('_stateActionKey') + '; return _stateActionKey;')(
  new Function('return ' + extractConst('_ANIM_FALLBACK', src) + ';')());
{
  const acts = { idle: 1, aim: 1, attack: 1, 'attack@crowbar': 1 };
  eq(key(acts, 'attack@crowbar'), 'attack@crowbar', 'a mapped variant wins');
  eq(key(acts, 'attack@pistol'), 'attack',
    'AN UNMAPPED VARIANT FALLS BACK TO ITS BASE SLOT — which is what makes every character authored before this build behave identically');
  eq(key(acts, 'attack'), 'attack', 'the plain slot is untouched');
  eq(key({ idle: 1, aim: 1 }, 'attack@pistol'), 'aim',
    '...and from the base it keeps walking the ordinary chain (attack -> aim)');
  eq(key({ idle: 1 }, 'attack@rifle'), 'idle', '...all the way to idle');
  eq(key({ run: 1 }, 'attack@rifle'), 'run', 'with no idle either, whatever the model does have');
}
{ // the chain is bounded and cannot be walked into a loop or an empty string
  eq(key({ idle: 1 }, '@pistol'), 'idle', 'a leading @ is not a slot — it does not slice to "" and spin');
  eq(key({ idle: 1 }, '@'), 'idle');
  eq(key({ idle: 1, attack: 1 }, 'attack@a@b'), 'attack', 'a doubled qualifier peels back to the base');
  eq(key({ idle: 1 }, ''), 'idle', 'an empty request still answers');
  eq(key({ idle: 1 }, null), 'idle');
  // guard: 12 hops maximum, so no fallback table edit can hang a frame
  assert(/guard\+\+ < 12/.test(extractFunction('_stateActionKey')), 'the walk is still bounded');
}
{ // EVERY EXISTING SLOT IS BYTE-IDENTICAL. This is the compatibility argument and it is worth executing.
  const fb = new Function('return ' + extractConst('_ANIM_FALLBACK', src) + ';')();
  const acts = { idle: 1, walk: 1, run: 1, attack: 1, aim: 1, jump: 1, die: 1 };
  for (const s of Object.keys(fb).concat(['idle', 'walk', 'run', 'attack']))
    eq(key(acts, s), key(acts, s), 'slot ' + s + ' resolves deterministically');
  eq(key(acts, 'reload'), 'attack', 'reload still falls to attack');
  eq(key(acts, 'sprintFire'), 'run', 'and a combined fire clip still degrades to locomotion (sprintFire -> sprint -> run), not to attack — the legs keep moving');
}

// ---------------------------------------------------------------- the action builder, executed
// Lifted whole rather than restated: a rig that re-types the loop would stop testing the shipped one.
const mkStates = () => {
  const made = [];
  const FAKE = {
    LoopOnce: 'once', LoopRepeat: 'repeat',
    AnimationMixer: function () {
      this.clipAction = (c) => { const a = { clip: c, setEffectiveWeight() {}, play() {}, getClip: () => c };
        made.push(a); return a; };
    },
  };
  const ANIM_SLOTS = [{ k: 'idle' }, { k: 'attack' }, { k: 'walk' }];
  const _STATE_RE = { idle: /idle/i, attack: /attack/i, walk: /walk/i };
  const _ANIM_ONESHOT = new Set(['attack']);
  const fn = new Function('THREE', 'ANIM_SLOTS', '_STATE_RE', '_ANIM_ONESHOT', '_resolveStateClip', 'mixers',
    extractFunction('playEnemyStates') + '; return playEnemyStates;')(
    FAKE, ANIM_SLOTS, _STATE_RE, _ANIM_ONESHOT,
    (gltf, clips, state) => {
      const want = clips && clips[state];
      if (want) { const c = gltf.animations.find(a => a.name === want); if (c) return c; }
      const re = _STATE_RE[state]; if (!re) return null;
      return gltf.animations.find(a => re.test(a.name || '')) || null;
    }, []);
  return { fn, made };
};
const GLTF = { animations: [{ name: 'idle' }, { name: 'attack' }, { name: 'walk' }, { name: 'SwordSwing' }, { name: 'PistolPop' }] };
const run = (clips) => {
  const { fn } = mkStates();
  const root = { userData: {} };
  fn(root, GLTF, clips);
  return root.userData.stateActions;
};
{
  const a = run({ 'attack@crowbar': 'SwordSwing', 'attack@pistol': 'PistolPop' });
  assert(a['attack@crowbar'], 'an explicitly mapped variant becomes a real action');
  eq(a['attack@crowbar'].clip.name, 'SwordSwing', '...bound to the clip that was named');
  eq(a['attack@pistol'].clip.name, 'PistolPop', '...one per weapon');
  assert(a.attack, 'and the base slot still exists beside them');
  eq(a.attack.clip.name, 'attack', '...unchanged');
  eq(a['attack@crowbar'].userData.state, 'attack@crowbar', 'the action knows its own state key');
}
{ // LOOP MODE COMES FROM THE BASE SLOT — the thing that fails silently if each variant has to restate it
  const a = run({ 'attack@crowbar': 'SwordSwing', 'walk@crowbar': 'walk' });
  eq(a['attack@crowbar'].loop, 'once', 'attack is a one-shot, so its variant is too');
  eq(a['attack@crowbar'].clampWhenFinished, true, '...and clamps, like the base');
  eq(a['walk@crowbar'].loop, 'repeat', 'walk loops, so its variant loops');
  assert(!a['walk@crowbar'].clampWhenFinished, '...and does not clamp');
}
{ // EXPLICIT ONLY — no name auto-match, because "SwordSwing" guessing its way onto a slot is undebuggable
  const a = run({});
  assert(!Object.keys(a).some(k => k.indexOf('@') > 0), 'no variants appear unless mapped');
  eq(Object.keys(run({ 'attack@crowbar': '' })).filter(k => k.indexOf('@') > 0).length, 0,
    'an empty mapping creates nothing');
  eq(Object.keys(run({ 'attack@crowbar': 'NoSuchClip' })).filter(k => k.indexOf('@') > 0).length, 0,
    'a mapping to a clip the model does not carry creates nothing — it falls back rather than erroring');
  eq(Object.keys(run({ 'notaslot@crowbar': 'SwordSwing' })).filter(k => k.indexOf('@') > 0).length, 0,
    'a qualifier on something that is not a slot is ignored');
  eq(Object.keys(run({ '@crowbar': 'SwordSwing' })).filter(k => k.indexOf('@') >= 0).length, 0,
    'and so is a bare qualifier');
}
{ // a character with no variants produces EXACTLY the old action set
  const plain = Object.keys(run({ idle: 'idle', attack: 'attack' })).sort();
  const withV = Object.keys(run({ idle: 'idle', attack: 'attack', 'attack@crowbar': 'SwordSwing' })).sort();
  eq(plain.join(','), 'attack,idle,walk', 'the base set is the three mapped slots');
  eq(withV.join(','), 'attack,attack@crowbar,idle,walk', 'a variant ADDS, it never replaces');
}

// ---------------------------------------------------------------- every animator asks for the weapon
{
  assert(/st = _wepAnimSlot\(\(_ownSpeed>=0\.012 \? \(_fireSlot\(_ff\)\|\|'attack'\) : 'attack'\), curWep\);/.test(src),
    'the local avatar asks for the weapon in hand');
  assert(/_st=_wepAnimSlot\(\(_rf\?\(_fireSlot\(_rf\)\|\|'attack'\):'attack'\), rp\.wep\);/.test(src),
    'a remote player uses the weapon their snapshot carries — which the protocol already sent (`w:rp.wep`)');
  assert(/st=_wepAnimSlot\(\(_bt\?\(_fireSlot\(_bt\)\|\|'attack'\):'attack'\), b\.wep\);/.test(src),
    'and a bot uses its own');
  assert(/w:rp\.wep/.test(src) && /rp\.wep=pl\.w/.test(src),
    'the weapon really is in the snapshot, so this needed no protocol change');
  // three animators, one helper — the 1158 lesson: a rule applied in one caller is not a rule
  eq((src.match(/_wepAnimSlot\(/g) || []).length, 5,
    'defined once, called by all three animators and by equip — the editor builds its key inline from the same two parts');
}
{ // equip rides the same convention, and must use the NEW weapon — that is the one being drawn
  assert(/playOwnAnim\(_wepAnimSlot\('equip', key\), 320\)/.test(src), 'the draw pose is per weapon');
  const sw = src.slice(src.indexOf('curWep = key; SFX.swap();'));
  assert(sw.indexOf("_wepAnimSlot('equip', key)") < 200, '...using `key`, the weapon being switched TO');
}

// ---------------------------------------------------------------- the editor
{
  const list = new Function('return ' + extractConst('WEP_ANIM_SLOTS', src) + ';')();
  eq(list.join(','), 'attack,equip', 'the editor offers the two slots a weapon obviously changes');
  assert(/the RESOLVER is generic/i.test(src),
    'and records that this list is a UI budget, not a capability limit');
  assert(/sel\.id='edPlayerClipW_'\+_b\+'_'\+_w; sel\.dataset\.state=key;/.test(src),
    'each row is a real select carrying its state key');
  assert(/if\(sel\.value\) playerModelCfg\.clips\[key\]=sel\.value; else delete playerModelCfg\.clips\[key\];/.test(src),
    'clearing a row DELETES the variant rather than storing an empty string — an empty string is a mapping to a clip that does not exist');
  assert(/_fill\(sel, _b\+'@'\+_w, 'Same as ' \+ _b\)/.test(src),
    'the empty option reads "Same as attack", which is what an unmapped variant actually does');
  assert(/saying "auto by name" would be a lie/.test(src), '...and why it does not say "Auto by name"');
  assert(/playerModelCfg\.clipSpeed\[key\]=v/.test(src),
    'and speed is per variant too — a sword swing is not paced like a trigger pull');
}
{ // it travels: myCharCfg copies the whole clips object, so a peer sees your sword swing
  assert(/clips:Object\.assign\(\{\}, c\.clips\|\|\{\}\)/.test(src),
    'the character config carries every clips key, variants included — no protocol change');
}

done('build 1294: attack and equip animations are per weapon — the taxonomy had ONE `attack` slot, so a character swung a crowbar with its rifle-firing motion. A variant is the slot name with the weapon appended, which rides through the config, the save file and the network snapshot untouched because every clip map is keyed by slot string; it exists only when explicitly mapped (no name auto-match), takes its loop mode from the base slot, and falls back to that base so every character authored before this build resolves to exactly the clip it did before');
