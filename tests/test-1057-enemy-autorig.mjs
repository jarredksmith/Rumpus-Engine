// (build 1057) AUTO-RIG FOR ENEMIES — the rigging PIPELINE always worked for enemies (their
// cfgs carry autoRig markers, serialize them, and the shared load path applies them), but the
// marker MODAL was hardwired to playerModelCfg, so a static unrigged model dropped into an
// enemy slot was a dead end. The modal now serves any character cfg: _arOpen(url, cfg, refresh)
// stores the target, _arFinish writes markers/animLib into IT and refreshes through the
// caller's rebuild — and the Enemies tab gets the same Auto-rig button (with rig-state label
// and Clear) above its Animation editor row. Roster characters were already covered by the
// Player-tab snapshot flow (_snapshotPlayerCharCfg copies autoRig; Load restores it).
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- the modal is target-aware ----
const open_ = extractFunction('_arOpen', src);
assert(/function _arOpen\(url, cfg, refresh\)\{/.test(open_), 'the modal takes a target cfg and a refresh callback');
assert(/_arCfg=cfg\|\|playerModelCfg; _arRefresh=refresh\|\|null;/.test(open_),
  'omitting them keeps the Player-tab behavior byte-for-byte (its call site is unchanged)');
assert(/const prev=_sanitizeAutoRig\(_arCfg\.autoRig\);/.test(open_),
  're-opening pre-seeds the TARGET cfg’s saved markers, not the player’s');

const fin = extractFunction('_arFinish', src);
assert(/const cfg=_arCfg\|\|playerModelCfg;/.test(fin) && /cfg\.autoRig=mk;/.test(fin),
  'AUTO-RIG saves the markers into whichever cfg opened the modal');
assert(/if\(!cfg\.animLib\)\{ cfg\.animLib='ual1';/.test(fin),
  'a fresh rig still defaults that character’s animation library ON');
assert(/if\(_arRefresh\) _arRefresh\(\); else if\(typeof rebuildAvatars==='function'\) rebuildAvatars\(\);/.test(fin),
  'the caller’s own rebuild runs (enemies refresh enemies; the player path still rebuilds avatars)');

// ---- the Enemies tab entry ----
assert(/arB\.textContent=mc\.autoRig \? '\\u2713 Auto-rigged \\u2014 edit markers' : 'Auto-rig model \(T-pose\)'/.test(src),
  'the Enemies tab button exists and reflects the enemy type’s rig state');
assert(/arB\.onclick=\(\)=>\{ if\(typeof _arOpen==='function'\) _arOpen\(\(mc\.url\|\|''\)\.trim\(\), mc, refreshEnemyVisuals\); \};/.test(src),
  'it opens the modal ON the enemy cfg and refreshes enemy visuals on save');
assert(/cx\.onclick=\(\)=>\{ pushUndoSnapshot\(\); mc\.autoRig=null;/.test(src),
  'enemy markers clear (undoable), same as the player’s');

// ---- the pipeline behind it was already generic; pin the load-path seam it relies on ----
assert(/if\(cfg && cfg\.autoRig && typeof _autoRigApply==='function'\)/.test(src),
  'the shared load path applies whichever cfg’s markers arrive (player, enemy, roster)');
assert(/autoRig: \(typeof _sanitizeAutoRig==='function'\)\?_sanitizeAutoRig\(src\.autoRig\):null/.test(src),
  'enemy cfgs sanitize their markers on level load');
assert(/autoRig:m\.autoRig\|\|undefined/.test(src), 'and serialize them with the level');

// ---- the dead-end messages point at both tabs now ----
assert(/use Auto-rig on the Player or Enemies tab \(for static models\)/.test(src),
  'the no-humanoid-bones toast names both entry points');
assert(/rig it first \(Auto-rig on the Player or Enemies tab works for static humanoids\)/.test(src),
  'the animation editor’s unrigged-model message does too');

done('build 1057: static models auto-rig straight from the Enemies tab — one modal, any character cfg');
