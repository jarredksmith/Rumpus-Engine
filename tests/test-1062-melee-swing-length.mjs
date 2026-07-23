// (build 1062) MELEE PLAYS THE FULL SWING — author: "the animations don't play all the way
// through... the full swing of a punch doesn't play out because it cuts it short and goes back
// to idle." meleeAttack pinned the third-person body's one-shot window to a fixed 360ms, so any
// swing clip longer than that reverted to idle mid-swing. The window is now sized to the OWN
// avatar's ACTUAL resolved melee/attack clip (speed-adjusted), clamped to a sane [250,1500]ms —
// and only a real combat clip extends it, so a model whose melee falls back down to idle keeps
// the safe default instead of freezing the body in the idle pose.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- the duration helper, executed against a stubbed avatar ----
// _stateActionKey walks the fallback chain; give the helper its real dependency.
const glue = extractFunction('_stateActionKey', src) + '\n'
  + 'const _ANIM_FALLBACK = ' + (src.match(/const _ANIM_FALLBACK\s*=\s*\{[\s\S]*?\};/) || [])[0].replace(/^const _ANIM_FALLBACK\s*=\s*/, '') + '\n'
  + extractFunction('_ownSlotDurMs', src);
function makeEnv(actions, animCfg) {
  const _ownAvatar = { userData: { visual: { userData: { stateActions: actions, animCfg } } } };
  return new Function('_ownAvatar',
    glue + '\nreturn _ownSlotDurMs;')(_ownAvatar);
}
const clip = (ms) => ({ getClip: () => ({ duration: ms / 1000 }) });
{
  // model HAS a dedicated melee clip of 900ms
  const f = makeEnv({ meleeLight: clip(900), idle: clip(3000) }, null);
  eq(f('meleeLight'), 900, 'a real melee clip reports its own length');
}
{
  // no meleeLight, but an attack clip exists (fallback meleeLight -> attack)
  const f = makeEnv({ attack: clip(700), idle: clip(3000) }, null);
  eq(f('meleeLight'), 700, 'the fallback to a real attack clip still measures a combat clip');
}
{
  // no combat clip at all -> resolves to idle -> MUST return 0 (keep the safe default, never freeze on idle)
  const f = makeEnv({ idle: clip(4000) }, null);
  eq(f('meleeLight'), 0, 'falling back to idle does NOT extend the window (0 -> caller keeps its default)');
}
{
  // clipSpeed 2x halves the effective duration
  const f = makeEnv({ meleeHeavy: clip(1000), idle: clip(3000) }, { clipSpeed: { meleeHeavy: 2 } });
  eq(f('meleeHeavy'), 500, 'a sped-up clip reports its shortened effective length');
}
{
  const f = makeEnv(null, null);
  eq(f('meleeLight'), 0, 'no avatar/actions is a safe 0');
}

// ---- meleeAttack consumes it, clamped, with the fixed 360 gone ----
const m = extractFunction('meleeAttack', src);
assert(/const _mms = \(typeof _ownSlotDurMs==='function' && _ownSlotDurMs\(_mslot\)\) \|\| 360;/.test(m),
  'meleeAttack asks for the real clip length, defaulting to 360 only when unknown');
assert(/playOwnAnim\(_mslot, Math\.max\(250, Math\.min\(1500, _mms\)\)\);/.test(m),
  'the window is the clip length, clamped to a sane [250,1500]ms');
assert(!/playOwnAnim\(wep \? \(wep\.dmg>=50\?'meleeHeavy':'meleeCombo'\) : 'meleeLight', 360\)/.test(src),
  'the old fixed-360ms window is gone');
assert(/const _mslot = wep \? \(wep\.dmg>=50\?'meleeHeavy':'meleeCombo'\) : 'meleeLight';/.test(m),
  'the per-weapon slot choice (heavy / combo / light) is preserved');

done('build 1062: the melee window matches the swing clip — punches play all the way through instead of snapping back to idle');
