// (build 916) On mobile the build-908 action buttons (BUILD, LIGHT, CROUCH, MELEE, BAG, CHAT)
// lingered on top of the level editor: the `body.editing` hide rule that clears the touch combat
// cluster (tFire/tAim/tJump/tReload/tNade/tWeapon/tUse) was never extended when those buttons were
// added, so they sat over the editor panel. This pins that every touch action button is hidden
// while editing.
import { html, assert, done } from './harness.mjs';

// the single CSS rule that hides the touch action cluster when the level editor is open
const m = html.match(/body\.editing #tFire[^{]*\{ display:none !important; \}/);
assert(m, 'the body.editing touch-hide rule exists');
const rule = m[0];

for(const id of ['tFire','tAim','tJump','tReload','tNade','tWeapon','tUse','tCrouch','tMelee','tBuild','tFlash','tInv','tChat']){
  assert(rule.includes('body.editing #'+id), '#'+id+' is hidden while the editor is open');
}

done('build 916: every touch action button is cleared off the level editor');
