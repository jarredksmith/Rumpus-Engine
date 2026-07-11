// (build 937) THE HOLD IK RESPECTS WHAT THE AUTHOR TUNED. Live report: a grip set up "perfect" in
// the editor came out wonky in play — the Player-tab preview never ran the hold IK while play
// relocated the trigger hand (and the authored gun with it) to a synthetic chest-centerline point.
// Now: (1) minimal motion — the trigger hand stays EXACTLY where the pose+grip put it whenever the
// support hand can already reach the forestock from there; an unreachable gun pulls it toward the
// chest only to the 0.85*reach shell; (2) the editor preview applies the SAME hold, so what you tune
// is what you get; (3) a per-character "Two-handed weapon hold (IK)" checkbox (default on) turns it
// off entirely, plumbed through sanitize/serialize/restore like animLib.
// Verified live on the UAL rig: in play the support hand landed on the forestock (err 0.009) with
// the trigger hand pulled only to 0.451 (= 0.85*0.531) from the pose's 0.695; with ikHold=false both
// arms stayed exactly as animated (0.695 untouched); the editor preview measured identical to play.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();
const hold = extractFunction('_weaponHoldIK', src);

// 1) minimal motion: reachability test first, pull only when needed, and only to the reach shell
assert(/const t0 = disc0>0 \? -B0 \+ Math\.sqrt\(disc0\) : -1;[\s\S]{0,80}if\(t0 < 0\.05\)\{/.test(hold),
  'the trigger hand moves ONLY when the forestock is unreachable from the authored pose');
assert(/_ikP\.multiplyScalar\(\(maxD\*0\.85\)\/_ikP\.length\(\)\);/.test(hold),
  'and then only minimally — toward the chest to the 0.85*reach shell, not to a synthetic stance point');

// 1b) crossed-arms class (live report: "arms crossed behind their back on some models"): the elbow
// pole is deterministic — down + outward — instead of inheriting the per-model animated pose, and
// mirrored exports (bones NAMED left sitting on the body's geometric right) are detected and swapped
assert(/_ikP\.set\(\(ox\|\|0\)\*0\.35, -1, \(oz\|\|0\)\*0\.35\); _ikP\.addScaledVector\(_ikD, -_ikP\.dot\(_ikD\)\);/.test(extractFunction('_armPinTo', src)),
  'elbows point down+outward on every rig (the animated hint varied per model and wrapped arms behind the back)');
assert(/if\(_ikE\.sub\(_ikS\)\.dot\(_ikD\.set\(Math\.cos\(yaw\),0,-Math\.sin\(yaw\)\)\) > 0\)\{ vis\.userData\._rArm=_la; vis\.userData\._lArm=_ra; \}/.test(hold),
  'mirrored exports get their arms un-crossed: geometry beats bone names');

// 2) WYSIWYG: the Player-tab preview runs the same hold
assert(/_weaponHoldIK\(previewAvatar, previewAvatar\.rotation\.y\|\|0, 0\);   \/\/ build 937/.test(src),
  'the editor preview applies the SAME two-handed hold play applies');

// 3) authorial off switch, default on, persisted everywhere a character cfg lives
assert(/const _hc=vis\.userData\.animCfg; if\(_hc && _hc\.ikHold===false\) return;/.test(hold),
  'ikHold:false stands the IK down for that character');
assert(/ikHold:\(c\.ikHold===false\)\?false:true/.test(extractFunction('_sanitizeCharCfg', src)),
  'sanitize keeps the flag (absence = on)');
assert(/ikHold:\(c\.ikHold===false\)\?false:true/.test(extractFunction('myCharCfg', src)),
  'the in-play body carries it');
assert(/ikHold:\(playerModelCfg\.ikHold===false\)\?false:true/.test(src),
  'serialized with the level player block');
assert(/playerModelCfg\.ikHold=\(pl\.ikHold===false\)\?false:true;/.test(src),
  'restored on level load');
assert(/textContent='Two-handed weapon hold \(IK\)'/.test(src) && /playerModelCfg\.ikHold=ik\.checked/.test(src),
  'the Player tab has the checkbox');

done('build 937: the hold IK respects authored grips — minimal motion, WYSIWYG preview, per-character off switch');
