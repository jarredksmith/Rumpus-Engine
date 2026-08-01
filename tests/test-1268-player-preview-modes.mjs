import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1268: reported from play, the THIRD round on this one — "I can't visually see where the held gun
// grip (third-person) is changing until I play the live game. I need to make those adjustments live, in
// the editor."
//
// Build 1266 fixed the model URL, which was genuinely broken, and it was feeding a call site that never
// ran. `attachAvatarGun(previewAvatar, ...)` lived inside the Player tab's ORBIT CAMERA branch — the third
// arm of a chain whose second arm is `else if(editorOpen && editorFreeFly)` — and opening the editor sets
// editorFreeFly = true EVERY time. So on the default camera the branch never executed: no held gun, no
// joint tweaks (942), no two-handed hold preview (937). The grip sliders wrote values with nothing on
// screen to show them.
//
// The lesson is 1264's, one level further: a fix verified through a probe that never enters the real path
// proves the mechanism, not the feature. My 1266 probe set `editorOpen=true` directly and never went
// through setEditorMode, so it landed in a camera mode the creator never sees.
//
// Probed through the REAL editor path this time (toggleEditor, then setEditorMode('player')):
//   editor : editorOpen true, mode "build", active "props", fly TRUE   <- the cause, in one field
//   tab    : active "player", fly false                                <- 1268 drops into the orbit camera
//   report : HAS_GUN true, gunVisible true, gunOnScreen true, NDC (0.04, 0.06), cam (0, 1.7, 10.5)
//   grip   : x/y 0.28,1.15 -> 0.75,1.25 via refreshAvatarGunGrips      <- the sliders move it LIVE
//   fly    : gun cleared + editorFreeFly=true -> re-attached within 4 s <- posing survives every mode

// --- the posing is no longer a camera concern -------------------------------------------------------
const tick = extractFunction('_edPlayerPreviewTick');
{
  assert(/editorActive!=='player'/.test(tick), 'it runs only on the Player tab');
  assert(/attachAvatarGun\(previewAvatar,/.test(tick), 'it attaches the held gun (the reported symptom)');
  assert(/_applyJointFix\(previewAvatar,/.test(tick), '...applies the authored joint tweaks (build 942)');
  assert(/_weaponHoldIK\(previewAvatar,/.test(tick), '...and previews the two-handed hold (build 937)');
  assert(!/editorFreeFly|editorTopView/.test(tick),
    'THE FIX: it names no camera mode at all — posing a preview is not a camera concern');
}
{ // executed: the three gates, and that it never throws when the editor is elsewhere
  const calls = [];
  const mk = (env) => new Function('editorOpen', 'editorActive', 'previewAvatar', 'curWep',
    'attachAvatarGun', '_applyJointFix', '_weaponHoldIK', '_myJointFix',
    tick + '; return _edPlayerPreviewTick;')(
      env.open, env.active, env.avatar, 'rifle',
      (g, k) => calls.push(['gun', k]), () => calls.push(['joint']), () => calls.push(['ik']), () => ({}));
  const avatar = { rotation: { y: 0 }, userData: {} };

  calls.length = 0; mk({ open: true, active: 'player', avatar })();
  eq(calls.length, 3, 'on the Player tab with an avatar, all three run');
  eq(calls[0][1], 'rifle', '...and the gun is attached for the active weapon');

  calls.length = 0; mk({ open: false, active: 'player', avatar })();
  eq(calls.length, 0, 'closed editor: nothing');
  calls.length = 0; mk({ open: true, active: 'props', avatar })();
  eq(calls.length, 0, 'a different tab: nothing');
  calls.length = 0; mk({ open: true, active: 'player', avatar: null })();
  eq(calls.length, 0, 'no preview avatar yet: nothing, and no throw');
}
{ // the frame loop drives it, and NOT from inside the camera chain
  assert(/if\(typeof _edPlayerPreviewTick==='function'\) _edPlayerPreviewTick\(\);/.test(src),
    'the loop calls it every frame');
  const loopSrc = src.slice(src.indexOf('function loop(){'));
  const callAt = loopSrc.indexOf('_edPlayerPreviewTick();');
  const chainAt = loopSrc.indexOf('} else if(editorOpen && editorTopView){');
  assert(callAt > 0 && chainAt > 0 && callAt < chainAt,
    'and calls it BEFORE the camera branch chain, so no camera mode can gate it');
}
{ // the orbit branch kept its camera work and gave up the posing
  const loopSrc = src.slice(src.indexOf('} else if(editorOpen && editorActive===\'player\' && previewAvatar){'));
  const branch = loopSrc.slice(0, loopSrc.indexOf('} else {'));
  assert(!/attachAvatarGun/.test(branch), 'the orbit branch no longer attaches the gun itself');
  assert(/camera\.position\.set/.test(branch), '...but still frames the avatar, which is its actual job');
}

// --- entering the Player area lands on the camera built to frame it ----------------------------------
{
  const sem = extractFunction('setEditorMode');
  assert(/if\(mode==='player' && !fromSelection\)\{ editorFreeFly=false; editorTopView=false; \}/.test(sem),
    'switching to the Player area drops into the orbit preview — the camera that exists only to frame this avatar');
  const guard = /!fromSelection/.test(sem);
  assert(guard, 'but NEVER when the switch came from clicking an object in the scene: that must not move the creator’s viewpoint');
  // one-shot on the mode change, not per frame — so F still flies afterwards. Exactly ONE site in the
  // whole file writes it, and the assertion above proved that site is setEditorMode.
  eq((src.match(/mode==='player' && !fromSelection/g) || []).length, 1,
    'and it is a one-shot on the mode change, never re-asserted per frame (F must keep working)');
}
{ // executed: the camera switch fires for the player mode and for nothing else
  const run = (mode, fromSelection) => {
    const env = { fly: true, top: true };
    new Function('mode', 'fromSelection', 'env',
      "if(mode==='player' && !fromSelection){ env.fly=false; env.top=false; }")(mode, fromSelection, env);
    return env;
  };
  eq(run('player', false).fly, false, 'entering the Player area leaves free-fly');
  eq(run('player', false).top, false, '...and top view');
  eq(run('player', true).fly, true, 'a scene-click into the Player area does not move the camera');
  eq(run('build', false).fly, true, 'and every other area is untouched');
}

// --- the report’s own surfaces still stand -----------------------------------------------------------
assert(/Held gun grip \(third-person\)/.test(src), 'the grip panel is still there');
{
  const ref = extractFunction('refreshAvatarGunGrips');
  assert(/previewAvatar/.test(ref), 'and dragging a grip slider re-applies to the PREVIEW avatar, live');
}

done('build 1268: the Player tab poses its preview in every editor camera mode — the held gun, joint tweaks and two-handed hold were trapped inside the orbit-camera branch while the editor always opens in free-fly, so the grip sliders had nothing on screen to move; executed gates, loop ordering proven ahead of the camera chain, and entering the Player area now lands on the camera built to frame it (never on a scene-click)');
