// (build 925) ARMED / MOVE-FIRE COMPOSITES + THE SLIDE FIX.
// The UAL packs ship no move+fire or weapon-hold locomotion, so those slots defaulted to the
// full-body Pistol_Shoot: feet froze mid-run ("missing" animations). _composePackClips now
// synthesizes them at attach time — locomotion tracks below the hips + weapon-pose tracks above,
// split by the canonical bone mapper, pose looped across the locomotion duration: Walk/Jog/Sprint/
// Crouch(+walk)_Fire from Pistol_Shoot and five *_Armed hold variants from Pistol_Idle_Loop. They
// retarget like any clip, appear in the pickers, and are the packs' living defaults for the four
// fire slots (the attach path re-applies pack defaults; hand-picked overrides survive).
// SLIDE: starting a slide forces crouching=true and the crouch-edge stab (an event, which outranks
// states) ate the 550ms slide window. Stabs are now suppressed during and right after a slide.
// Verified live: in-play avatar resolved walkFire=Walk_Fire, runFire=Jog_Fire, sprintFire=
// Sprint_Fire, crouchFire=Crouch_Fire (63 actions); composite legs tracks byte-equal to the
// locomotion source while arm tracks differ (pose-sourced), duration matched (0.93s); a forced
// slide held the 'slide' state exclusively across the whole window.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// the compositor: canon-keyed upper/lower split, pose looped over the loco duration, idempotent
const cp = extractFunction('_composePackClips', src);
assert(/_canonBoneKey\(node\)/.test(cp), 'the split rides the canonical bone mapper (works for any pack)');
assert(/k==='head' \|\| k\.indexOf\('neck@'\)===0 \|\| k\.indexOf\('spine@'\)===0/.test(cp), 'spine/neck/head go to the weapon pose');
assert(/if\(byName\[outName\]\) return;/.test(cp), 'idempotent per pack');
assert(/tt % Math\.max\(1e-4, B\.duration-1e-5\)/.test(cp), 'the pose clip loops across the locomotion duration');
for(const n of ['Walk_Fire','Jog_Fire','Sprint_Fire','Crouch_Fire','CrouchWalk_Fire','Idle_Armed','Walk_Armed','Jog_Armed','Crouch_Armed','CrouchWalk_Armed']){
  assert(cp.indexOf("'"+n+"'")>=0, 'composite '+n+' is synthesized');
}
assert(/_composePackClips\(pk\.animations\);/.test(src), 'composition runs at pack attach, before retargeting');

// both packs default the four fire slots to the composites
eq((src.match(/walkFire:'Walk_Fire', runFire:'Jog_Fire', crouchFire:'Crouch_Fire', sprintFire:'Sprint_Fire'/g)||[]).length, 2,
  'Standard AND Pro point the fire slots at the composites');

// living defaults: the attach path re-applies pack picks (customs survive via _animLibApplyPicks)
assert(/try\{ _animLibApplyPicks\(cfg, packId\); \}catch\(e\)\{\}/.test(src),
  'attach re-applies pack defaults so saved models pick up new composites');

// slide: the crouch-transition stab no longer eats the slide window
assert(/if\(!dead && !sliding && !\(slideCD>0\.35\)\)\{ if\(crouching && !_ownPrevCrouch\) playOwnAnim\('standToCrouch', 300\)/.test(src),
  'crouch stabs are suppressed during and right after a slide (they outrank states and ate it)');

done('build 925: firing while moving keeps the legs moving, weapon-hold variants exist, and sliding finally animates');
