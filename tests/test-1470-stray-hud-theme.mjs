// build 1470 — the authored FONTS reach the HUD elements that live outside #hud.
//
// THE HYPOTHESIS WAS MOSTLY WRONG AND THE PROBE SAID SO, which is why this test is a fifth the size of the
// one first written. The reasoning was: build 665's global variables are set on `#hud`, four HUD elements
// are not descendants of it (the dialogue box and the goal banner are built in JS on `document.body`; the
// interact prompt and the grab hint are markup siblings), therefore the accent, the fonts and the panel
// opacity all fall through to the engine's `:root` defaults on them.
//
// Measured, with the stray stamp removed so the run reproduces build 1469 exactly: the dialogue border
// already read rgba(255,204,51,0.4) — the level's gold — the speaker name already gold, the panel already at
// the authored 0.32 opacity. Build 701 had ALREADY mirrored `--hud-panel-op`, `--accent` and `--accent-rgb`
// onto `<body>` for exactly this reason, and named these four elements in its comment while doing it.
//
// What it did NOT mirror is the two FONTS. That is the whole defect and the whole build: a level that chose
// Orbitron got Orbitron on every panel inside #hud and Rajdhani on the box its NPCs speak out of.

import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. what build 701 already did
// If this stops being true the fix is in the wrong place, so it is asserted rather than assumed.
{
  const ap = extractFunction('applyHudCfg', src);
  const tail = ap.slice(ap.indexOf('const body = document.body'));
  assert(/body\.style\.setProperty\('--accent', c\.accent\)/.test(tail),
    'build 701 mirrors the accent onto <body>, so the strays already had it');
  assert(/body\.style\.setProperty\('--accent-rgb'/.test(tail), '...and the rgb triplet the borders read');
  assert(/body\.style\.setProperty\('--hud-panel-op'/.test(tail), '...and the panel opacity');
}

// ---------------------------------------------------------------- 2. the two it left behind
{
  const ap = extractFunction('applyHudCfg', src);
  const tail = ap.slice(ap.indexOf('const body = document.body'));
  assert(/body\.style\.setProperty\('--hud-font', "'"\+c\.uiFont\+"'"\)/.test(tail),
    'THE FIX: the authored UI font is mirrored too');
  assert(/body\.style\.setProperty\('--hud-display-font', "'"\+c\.displayFont\+"'"\)/.test(tail),
    '...and the display font, which the speaker name and the objective banner both ask for');

  // the same expression #hud is given — one derivation, so the two halves cannot disagree about a font
  const head = ap.slice(0, ap.indexOf('const body = document.body'));
  for (const v of ['--hud-font', '--hud-display-font']) {
    const onHud = new RegExp("hud\\.style\\.setProperty\\('" + v + "', \"'\"\\+c\\.(uiFont|displayFont)\\+\"'\"\\)").exec(head);
    const onBody = new RegExp("body\\.style\\.setProperty\\('" + v + "', \"'\"\\+c\\.(uiFont|displayFont)\\+\"'\"\\)").exec(tail);
    assert(onHud && onBody && onHud[1] === onBody[1],
      v + ' is built from the SAME field on both hosts (' + (onHud && onHud[1]) + ')');
  }
}

// ---------------------------------------------------------------- 3. it reaches those four and nothing else
// The reason a body-level mirror is safe here is not "probably fine" — it is that every consumer of these
// two variables is either inside #hud or one of the four elements this exists for. Checked, in the real
// stylesheet, rather than trusted.
{
  const users = [];
  const re = /--hud-(?:display-)?font/g;
  for (const line of html.split('\n')) {
    if (!re.test(line)) { re.lastIndex = 0; continue; }
    re.lastIndex = 0;
    if (/setProperty/.test(line)) continue;              // the applier itself
    const sel = line.trim().split('{')[0].trim();
    if (sel) users.push(sel);
  }
  assert(users.length >= 6, 'the stylesheet really does read these (' + users.length + ' rules)');
  const OK = /(^|,)\s*(#hud\b|#goalBanner\b|#dialogue\b|#prompt\b|#grabHint\b)/;
  for (const u of users)
    assert(OK.test(u) || /^\s*(font-family|font):/.test(u),
      'every consumer is #hud or one of the four body-level HUD elements — this mirror reaches nothing ' +
      'else, and in particular not the editor, whose chrome reads --ui-font: ' + u);

  // the editor's own chrome is untouched, which is the scoping argument build 1469 rested on
  assert(!/#editor[^{]*\{[^}]*--hud-font/.test(html), 'no editor rule reads --hud-font');
  assert(/:root\{[^}]*--ui-font:'Rajdhani'/.test(html), '...it reads --ui-font, which this build never writes');
}

// ---------------------------------------------------------------- 4. the four really are outside #hud
{
  const i = html.indexOf('<div id="hud"');
  assert(i > 0, '#hud exists in the markup');
  let j = i, depth = 0, end = -1;
  for (;;) {
    const m = /<\/?div\b/.exec(html.slice(j));
    if (!m) break;
    const at = j + m.index;
    if (html.slice(at, at + 5) === '</div') { depth--; if (depth === 0) { end = at; break; } }
    else depth++;
    j = at + m[0].length;
  }
  assert(end > i, 'and its subtree can be walked');

  const inHud = (tag) => { const k = html.indexOf(tag); return k > 0 && k > i && k < end; };
  eq(inHud('id="ammoPanel"'), true, 'the ammo panel IS inside #hud — the control, and it never needed this');
  eq(inHud('id="grabHint"'), false, 'the grab hint is outside');
  eq(html.indexOf('id="goalBanner"'), -1, 'the goal banner is not in the markup at all...');
  eq(html.indexOf('id="dialogue"'), -1, '...nor the dialogue box — both are built in JS');
  assert(/document\.body\.appendChild\(el\)/.test(extractFunction('_ensureGoalBanner', src)),
    '...on document.body, which is exactly why a body-level mirror reaches them however late they appear');
  assert(/document\.body\.appendChild\(el\)/.test(extractFunction('_ensureDialogueEl', src)));
}

// ---------------------------------------------------------------- 5. nothing else moved
{
  const ap = extractFunction('applyHudCfg', src);
  assert(/dom\.style\.setProperty\('--el-'\+e\.k\+'-s'/.test(ap), 'build 696\'s per-element stamp is intact');
  assert(/if\(o\.accent\)\{ dom\.style\.setProperty\('--accent', o\.accent\)/.test(ap),
    '...including its per-element tint, untouched — a body-level default is a FALLBACK, and a tint on the ' +
    'node itself still outranks it');
  assert(/_hpBarLastKey=''/.test(ap), 'build 1365\'s latch reset is intact');
  assert(/_menuVars\(_invEl\)/.test(ap), 'build 1469\'s live menu re-theme is intact');
  assert(!/_hudGlobalVars/.test(src),
    'and the per-element stamp this build first shipped is GONE — build 701\'s body mirror already covered ' +
    'three of the five, so a second mechanism beside it would be two writers of one thing');
}

done('build 1470: THE AUTHORED FONTS REACH THE HUD ELEMENTS OUTSIDE #hud — and the interesting part is how much smaller this is than the hypothesis. The reasoning was that build 665\'s global variables live on `#hud`, four HUD elements are not descendants of it (the dialogue box and the goal banner are built in JS on `document.body`; the interact prompt and the grab hint are markup siblings), and therefore the accent, the fonts and the panel opacity all fell through to the engine\'s `:root` defaults there. Measured on a real frame with the stamp removed so the run reproduces build 1469 exactly: the dialogue border ALREADY read rgba(255,204,51,0.4) — the level\'s gold — the speaker name already gold, the panel already at the authored 0.32 opacity. Build 701 had already mirrored `--hud-panel-op`, `--accent` and `--accent-rgb` onto `<body>` for exactly this reason, and named these four elements while doing it. What it did not mirror is the two FONTS, and that is the entire defect: measured, `Rajdhani -> Orbitron` on the dialogue box against an ammo-panel control that read Orbitron in both conditions, so a level that chose a font got it on every panel inside the HUD and the engine\'s default on the box its NPCs speak out of. So the build is two lines rather than a new mechanism, and the first version — a derived per-element stamp — was thrown away, because a second writer beside build 701\'s mirror is two implementations of one thing. Safe by check rather than by assumption: every rule in the stylesheet that reads these two variables is either inside #hud or one of those four elements, so the mirror reaches nothing else, and in particular not the editor\'s own chrome, which reads `--ui-font` and is never written here');
