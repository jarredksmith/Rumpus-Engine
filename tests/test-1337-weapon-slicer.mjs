import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1337 — asked for immediately after 1336: "I really need it in the weapon tab for each weapon."
//
// The thing that had to change is not the button. A weapon does NOT animate on the character: the viewmodel
// gun carries its own AnimationMixer and its own three-slot mapping (idle / shoot / reload, or the fists'
// punch R / punch L / grab), built by playGunStates. Slicing a gun against the character rig would have
// shown the player standing still while the numbers changed — the same "you cannot see what you are
// cutting" the panel exists to remove. So the rig is resolved per KIND instead of being found by looking
// around, and the two kinds are handed back differently.
//
// Measured live in the real editor (tools/probe/weapon-slicer.mjs), a synthesized 3s take whose slide
// travels z 0->3, loaded through the engine's own showWeaponModel:
//   editor           editorActive "gun", _vmWanted() true, the button rendered in the panel
//   rig              { kind:"weapon", wep:"rifle", obj: THE VIEWMODEL GUN, madeMixer:false }
//   scrub            t 0/1/2/3  ->  the GUN's slide at z 0/1/2/3
//   after Add        clips ["allanim","Reload"], _gunClipNames.rifle ["allanim","Reload"], serialized
//   map to reload    gunStates ["reload"], playing clip "Reload", duration 1.0000
//   after close      panel gone, rig null, gunStates rebuilt, the gun's mixer still live

// ---------------------------------------------------------------- the rig is chosen, not discovered
{
  const f = extractFunction('_sliceRigFor');
  assert(/if\(kind === 'weapon'\)/.test(f), 'a weapon resolves its own rig…');
  assert(/gunModelByWep\[wep\]/.test(f), '…which is the viewmodel gun for THAT weapon, not the current one by luck');
  assert(/previewAvatar/.test(f) && /previewEnemy/.test(f), 'and a character still resolves the preview avatar');
  // a gun whose clips name-matched nothing has no mixer at all; the panel makes one and must take it back
  assert(/mixer = new THREE\.AnimationMixer\(m\); m\.userData\.mixer = mixer; mixers\.push\(mixer\); made = true;/.test(f),
    'a gun with no mixer gets one for the scrub…');
  const rel = extractFunction('_sliceRelease');
  assert(/if\(rig\.made && rig\.mixer\)/.test(rel), '…and only a mixer this panel INVENTED is removed on close');
  assert(/mixers\.indexOf\(rig\.mixer\); if\(i>=0\) mixers\.splice\(i,1\)/.test(rel),
    'out of the frame loop, or it would keep updating an object nothing else drives');
}

// ---------------------------------------------------------------- the two kinds are handed back differently
{
  const rel = extractFunction('_sliceRelease');
  assert(/_rebuildGunStates\(rig\.wep\)/.test(rel),
    'a weapon is REBUILT — its actions are constructed once from the clip list, so a new slice is only playable after that');
  assert(/setEnemyAnimState\(rig\.obj, 'idle', true\)/.test(rel), 'a character returns to its state machine');
  // and the weapon path returns before the character path, so a gun is never handed to setEnemyAnimState
  const w = rel.indexOf('_rebuildGunStates'), c = rel.indexOf('setEnemyAnimState'), r = rel.indexOf('return;', w);
  assert(w > 0 && r > w && r < c, 'the weapon branch RETURNS, so a gun never falls through to the character path');
}

// ---------------------------------------------------------------- the scrub silences what would blend with it
{
  const f = extractFunction('_slicePose');
  assert(/const rig = _sliceRig; if\(!rig\) return false;/.test(f), 'it poses the resolved rig rather than searching');
  assert(/stateActions\)/.test(f) && /gunStates\)/.test(f),
    'BOTH action sets are silenced — a character’s stateActions and a weapon’s gunStates');
  assert(/gs\[k\]\.setEffectiveWeight\(0\); gs\[k\]\.paused = true;/.test(f),
    'a gun’s idle is paused as well as zeroed, or it keeps advancing under the scrub');
}

// ---------------------------------------------------------------- an edit reaches the weapon tab
{
  const f = extractFunction('refreshAnimCuts');
  assert(/_gunClipNames\[k\] = \(g\.animations\|\|\[\]\)\.map/.test(f),
    'the weapon dropdowns read _gunClipNames, so a new slice has to land there or it is unselectable');
  assert(/_rebuildGunStates\(k\)/.test(f), 'and the gun’s actions are rebuilt so the slice is playable');
  assert(/const wu = wepModelUrl\(k\); if\(url && wu !== url\) continue;/.test(f),
    'EVERY weapon pointing at that model is refreshed — several can share one');
  assert(/renderEditorFields/.test(f),
    'and the panel redraws, because the weapon tab builds its dropdowns there rather than refreshing them in place');
}

// ---------------------------------------------------------------- the button, in the weapon block
{
  // it sits under that weapon's own three slots, inside the editorActive==='gun' block — which is per
  // curWep, so it is per weapon by construction rather than by a list that has to be kept in step
  const i = src.indexOf("sb.onclick=()=>{ const u=(typeof wepModelUrl==='function')");
  assert(i > 0, 'the weapon button exists');
  const near = src.slice(i, i + 400);
  assert(/wepModelUrl\(curWep\)/.test(near), 'it slices the CURRENT weapon’s model url…');
  assert(/\{ kind:'weapon', wep:curWep \}/.test(near), '…and tells the panel to preview on the gun');
  assert(/toast\('Give this weapon a model first'\)/.test(near), 'with a reason when there is no model');
  // the gun block is keyed on the weapon being edited, so there is exactly one such button
  eq((src.match(/kind:'weapon', wep:curWep/g) || []).length, 1, 'one weapon entry point, not a per-weapon list');
  // and the two character entry points now name their kind rather than relying on a default
  eq((src.match(/\{ kind:'char' \}/g) || []).length, 2, 'the player and enemy buttons both state their kind');
}

// ---------------------------------------------------------------- reopening cannot strand the previous rig
{
  const f = extractFunction('showClipSlicer');
  assert(/const old = document\.getElementById\('clipSlicer'\); if\(old\)\{ _sliceRelease\(\); old\.remove\(\); \}/.test(f),
    'opening the slicer for a second model releases the first rig — otherwise a gun would be left mid-scrub');
}

done('build 1337: the slicer, per weapon, in the weapon tab. The button was the easy half — the thing that had to change is WHICH rig the scrub poses. A weapon does not animate on the character: the viewmodel gun carries its own mixer and its own three-slot mapping built by playGunStates, so slicing a gun against the character rig would have shown the player standing still while the numbers changed, which is the exact "you cannot see what you are cutting" the panel exists to remove. The rig is resolved per kind now, and the two kinds are handed back differently — a character returns to its state machine, a weapon is REBUILT, because a gun\'s actions are constructed once out of the clip list and a new slice is not playable until they are built again. A gun that name-matched nothing has no mixer at all, so the panel makes one and takes it back out of the frame loop on close, and only if it was the one that made it. An edit also has to reach _gunClipNames, which is what the weapon tab\'s dropdowns read, for every weapon sharing that model — without it the slice would exist and be unselectable. Measured live in the real editor: the rig bound to the viewmodel gun, scrubbing t 0/1/2/3 moved the GUN\'s slide to z 0/1/2/3, Add put "Reload" into the clip list and the dropdown list and the save file, mapping it to the reload slot built a real action on that clip at duration 1.0, and closing handed the gun back with its states rebuilt');
