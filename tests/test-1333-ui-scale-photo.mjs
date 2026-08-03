import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1333 — the platform audit's accessibility census, verbatim: `aria-label` 47, `role="` 0, `tabindex`
// 0, colour-blind modes 0, UI/font scale 0, photosensitivity warning 0. Re-verified against the tree before
// building — `grep -ci "uiScale|fontScale"` was 0 and the only "photosens|epilep" hits were prose in
// comments about z-fighting. Two of those are closed here; the colour-blind census entry is its own build.
//
// Both settings are per DEVICE for build 1313's reason: a property of the person, not of the content, so it
// has to follow the player into levels other people made.
//
// Measured live (tools/probe/ui-scale.mjs, viewport 640x360), x1 / x0.75 / x1.75 / back to x1:
//   hud box      [0,0,640,360]  [0,0,640,360]  [0,0,640,360]  [0,0,640,360]   <- always ONE viewport
//   ammo panel        167.4 px       126.0 px       291.4 px       167.4 px   <- x0.753 / x1.741
//   render canvas [0,0,640,360] unchanged at every scale
//   #tStick      [26,202,132,132] byte-identical at every scale               <- the exemption
//   crosshair offset from centre [0,0] at every scale
// and (tools/probe/photo-warning.mjs): a new browser gets the dialog with both buttons; "Reduce flashing"
// takes a11y {1,1,1,1,1} -> {shake 0, flash 0.35, blur 0, sway 0, hitstop 0} and stores the ack; a
// returning browser gets NOTHING and its a11y is untouched; the pause button forces it back up.

// ---------------------------------------------------------------- the scale is one CSS variable
{
  assert(/--uiS:1;/.test(html), ':root declares the scale variable');
  const hud = html.match(/#hud \{ zoom: var\(--uiS\);([^}]*)\}/);
  assert(hud, '#hud is zoomed');
  // The compensation is the whole trick: #hud is `position:fixed; inset:0`, so zoom alone would make its
  // BOX 100vw*S and walk every corner-anchored panel off screen.
  assert(/width: calc\(100vw \/ var\(--uiS\)\)/.test(hud[1]) && /height: calc\(100vh \/ var\(--uiS\)\)/.test(hud[1]),
    '…and its own size is divided by the same factor, so the zoomed box is exactly one viewport');
  assert(/right:auto; bottom:auto;/.test(hud[1]), 'with inset:0’s right/bottom released, or width would not apply');

  // `zoom`, not `transform` — this is load-bearing and cheap to lose to a "cleanup".
  assert(/scales LAYOUT AND HIT-TESTING together/.test(html), 'the reason zoom was chosen is recorded');
  assert(!/#hud \{ transform: *scale/.test(html), 'and it is not a transform, which would move pixels and leave clicks behind');
}

// ---------------------------------------------------------------- the touch controls are exempt, on purpose
{
  const t = html.match(/#touchUI \{ zoom: calc\(1 \/ var\(--uiS\)\);([^}]*)\}/);
  assert(t, '#touchUI counter-zooms — effective scale S * 1/S = 1');
  assert(/width: 100vw; height: 100vh;/.test(t[1]),
    'and takes viewport units, which are unaffected by an ancestor zoom, so it covers the real viewport');
  assert(/already have their own layout editor/.test(html), 'with the reason: they have their own layout editor');
}

// ---------------------------------------------------------------- cards, not backdrops
{
  assert(/#pauseMenu \.pauseCard, \.modalCard, \.uiDlgCard \{ zoom: var\(--uiS\); \}/.test(html),
    'the pause card, modals and dialogs scale');
  assert(/card\.className='uiDlgCard';/.test(src), '…and _uiDialog’s card carries the class, or dialogs would not follow');
  assert(/a backdrop is a full-viewport wash and has nothing to read/.test(html), 'with the reason backdrops are excluded');
}

// ---------------------------------------------------------------- clamped, persisted, and NOT in the a11y blob
{
  assert(/const UI_SCALE_MIN = 0\.75, UI_SCALE_MAX = 1\.75, UI_SCALE_KEY = 'breach_uiscale';/.test(src), 'the range is named');
  const f = extractFunction('applyUiScale');
  assert(/Math\.max\(UI_SCALE_MIN, Math\.min\(UI_SCALE_MAX, \+uiScale \|\| 1\)\)/.test(f), 'apply clamps every time…');
  assert(/setProperty\('--uiS', String\(uiScale\)\)/.test(f), '…and writes the one variable');
  // executable: the clamp, including the NaN route a corrupt localStorage value takes
  const run = new Function('UI_SCALE_MIN','UI_SCALE_MAX','v', `
    let uiScale = v; const document = { documentElement: { style: { setProperty(){} } } };
    ${f}
    applyUiScale(); return uiScale;`);
  eq(run(0.75, 1.75, 1), 1, 'x1 passes through');
  eq(run(0.75, 1.75, 9), 1.75, 'a huge value clamps to the max');
  eq(run(0.75, 1.75, 0.1), 0.75, 'a tiny one clamps to the min');
  eq(run(0.75, 1.75, NaN), 1, 'NaN falls back to 1 rather than writing "NaN" into the stylesheet');

  // It is deliberately outside `a11y`, whose loader clamps EVERY key to 0..1 — a scale that must reach
  // 1.75 cannot live there without a special case inside a loop whose whole point is that it has none.
  const la = extractFunction('loadA11y');
  assert(/Math\.max\(0, Math\.min\(1,/.test(la), 'loadA11y still clamps its own keys to 0..1');
  assert(!/uiScale/.test(la), 'and knows nothing about the interface size');
  assert(/A11Y_DEFAULT = \{ shake:1, flash:1, blur:1, sway:1, hitstop:1 \}/.test(src), 'the motion blob is unchanged');
  // but the fold's own "Restore defaults" covers the row that sits in it
  assert(/uiScale = 1; applyUiScale\(\); saveUiScale\(\);/.test(extractFunction('a11yRestoreAll')),
    'Restore defaults restores the size too — the row is in that fold');
}

// ---------------------------------------------------------------- the photosensitivity warning
{
  const f = extractFunction('photosensitivityWarning');
  assert(/localStorage\.getItem\(PHOTO_WARN_KEY\) === '1'\) return false;/.test(f), 'once per browser…');
  assert(/function photosensitivityWarning\(force\)/.test(src) && /!force &&/.test(f),
    '…unless forced, which is how the pause button shows it again');
  assert(/PHOTOSENSITIVITY WARNING/.test(f) && /seizures/.test(f), 'it says what it is');
  // it offers the FIX, not only the fact — and the fix is build 1313's own function, not a second copy
  assert(/fn:\(\)=>\{ ack\(\); a11yReduceAll\(\);/.test(f), 'Reduce flashing drives build 1313’s own sliders');
  assert(/label:'Continue', primary:true, fn:ack/.test(f), 'and continuing acknowledges it');
  // both exits store the ack, or a player who reduced flashing would be asked again next launch
  // both exits acknowledge, but only one of them CALLS ack — the other passes it as the handler. Asserting
  // a call count would have been asserting one spelling of the same behaviour.
  assert(/ack\(\); a11yReduceAll\(\)/.test(f) && /primary:true, fn:ack/.test(f),
    'BOTH buttons acknowledge — one calls ack, the other IS ack');
  // a player who already told their OS is not asked to say it twice
  assert(/_a11yOsReduced\(\)/.test(f), 'it reads the OS preference…');
  assert(/already been turned down/.test(f), '…and says so instead of repeating the instruction');
}

// ---------------------------------------------------------------- and it is called where it cannot TDZ
{
  const call = src.indexOf('\nphotosensitivityWarning(false);');
  const key = src.indexOf("const PHOTO_WARN_KEY = 'breach_photowarn';");
  assert(key > 0 && call > key, 'the boot call is AFTER the const it reads — `typeof` does not guard a TDZ (1127/1331)');
  assert(/`typeof` does not guard a temporal dead zone/.test(src), 'with the reason recorded at the call');
  // one call site, so no future path has to remember it
  eq((src.match(/photosensitivityWarning\(/g) || []).length, 3,
    'exactly three mentions: the declaration, the one boot call, and the pause button that forces it');
}

// ---------------------------------------------------------------- the panel row exists and is wired
{
  assert(/id="a11yUiScale" min="75" max="175"/.test(html), 'the slider spans the clamped range in percent');
  assert(/id="a11yPhotoWarn"/.test(html), 'and the warning is reachable again from the fold');
  assert(/ur\.oninput=\(\)=>\{ uiScale=\(\+ur\.value\|\|100\)\/100; applyUiScale\(\); saveUiScale\(\);/.test(src),
    'it applies LIVE while dragging — a size you cannot see while choosing it is a size you guess at');
  assert(/pw\.onclick=\(\)=>\{ photosensitivityWarning\(true\); \}/.test(src), 'the button forces the dialog');
}

done('build 1333 (platform audit 9 — accessibility): the census read "UI/font scale 0" and "photosensitivity warning 0", both re-verified open before building. INTERFACE SIZE is one CSS variable driving `zoom`, which is the only property that scales layout AND hit-testing together — a transform moves the pixels and leaves every click where it was. #hud is position:fixed inset:0, so zoom alone would make its BOX 100vw*S and walk the corner panels off screen; dividing its own size by the same factor keeps the zoomed box exactly one viewport, measured [0,0,640,360] at x0.75, x1 and x1.75 while the ammo panel goes 126 / 167 / 291 px. The on-screen touch controls counter-zoom back to 1 and measure byte-identical at every scale, because they already have their own layout editor and silently resizing a stick somebody placed by thumb-reach is a different setting wearing this one\'s name; the render canvas is untouched and the crosshair stays at offset [0,0]. It lives outside the `a11y` blob on purpose — that loader clamps every key to 0..1, which is right for an effect multiplier and wrong for a scale that reaches 1.75 — but the fold\'s Restore defaults still covers it. The PHOTOSENSITIVITY WARNING shows once per browser at boot rather than at the first Play, because startGame is reached from the menu, a share link, the gallery, a campaign step and the editor test run, and a warning five callers must remember is one that a caller will forget; it offers the fix rather than only the fact, driving build 1313\'s own a11yReduceAll (measured: {1,1,1,1,1} -> {0, 0.35, 0, 0, 0}), both exits store the acknowledgement, an OS reduce-motion preference is honoured rather than re-asked, and the boot call sits after the const it reads because typeof does not guard a temporal dead zone');
