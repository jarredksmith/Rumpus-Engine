// build 1469 — the level's theme reaches the panels outside the HUD.
//
// Asked for from play, the fifth and last item of one request: "more customizable controls for creators
// that want to control how the inventory screens look".
//
// VERIFIED BEFORE BUILDING: build 665's theme is real and complete, and every variable it sets is scoped to
// `#hud` — deliberately, because the editor's own chrome must not take the level's colours. The inventory
// and the item inspector are `position:fixed` panels appended to `document.body`, so they were outside it
// ENTIRELY: a creator who themed their level gold-and-black opened the inventory and got the engine's teal,
// with no control anywhere in the product. The same scoping trick applies one level out — the theme is
// stamped ON THE PANEL, and the panel's own styles read it.

import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. the defaults ARE what was hardcoded
// This is the compatibility argument and it is checkable rather than hopeful: a level that never touches
// the new fields must render byte-identically to build 1468.
{
  const D = new Function('return ' + extractConst('DEFAULT_HUD', src) + ';')();
  eq(D.menuBg, '#0b141a', 'the card colour is the hex the inventory card was hardcoded with');
  eq(D.menuEdge, '#2a3a42', '...and the border');
  eq(D.menuText, '#cfeee2', '...and the body text');
  eq(D.menuDim, '#7fa99c', '...and the secondary text');

  const san = new Function('DEFAULT_HUD', 'HUD_FONTS', 'HUD_TOGGLES', 'HUD_ELEMENTS',
    extractFunction('_sanitizeHud', src) + '; return _sanitizeHud;')(
    D, ['Rajdhani'], [], []);
  const d = san(null);
  eq(d.menuBg, D.menuBg, 'an unthemed level takes the defaults...');
  eq(san({ menuBg:'#ff0000' }).menuBg, '#ff0000', '...an authored colour survives...');
  eq(san({ menuBg:'javascript:alert(1)' }).menuBg, D.menuBg,
    '...and anything that is not a hex is DISCARDED — these go straight into a style property, and a ' +
    'level file is untrusted input');
  eq(san({ menuEdge:'#abc' }).menuEdge, '#abc', 'the three-digit form is a real hex and is kept');
  eq(san({ menuText:{} }).menuText, D.menuText, 'an object cannot become a colour');

  // it rides the level for free — hudCfg is sanitized whole on the way out and in
  assert(/hud: _sanitizeHud\(hudCfg\)/.test(src), 'the serializer writes the theme whole, so no serializer change was needed');
  assert(/hudCfg = _sanitizeHud\(level\.hud\)/.test(src), '...and the loader reads it whole');
}

// ---------------------------------------------------------------- 2. the derivation
{
  const mix = new Function(extractFunction('_hexMix', src) + '; return _hexMix;')();
  eq(mix('#000000', '#ffffff', 0), '#000000', 't=0 is the first colour exactly');
  eq(mix('#000000', '#ffffff', 1), '#ffffff', 't=1 is the second');
  eq(mix('#000000', '#ffffff', 0.5), '#808080', '...and it interpolates per channel');
  eq(mix('#abc', '#abc', 0.5), '#aabbcc', 'the three-digit form expands rather than parsing as garbage');
  eq(mix('nonsense', '#ffffff', 0), '#000000', 'a bad colour degrades to black rather than to NaN in a style');
  eq(mix('#010203', '#010203', 0.28), '#010203', 'mixing a colour with itself is that colour — no drift');
  // every output is a valid 6-digit hex, which is what a CSS property needs
  for (const t of [0, 0.13, 0.28, 0.5, 0.77, 1])
    assert(/^#[0-9a-f]{6}$/.test(mix('#0b141a', '#2a3a42', t)), 'the output is always a valid hex (t=' + t + ')');
}

// ---------------------------------------------------------------- 3. what a panel is stamped with
{
  const run = (cfg) => {
    const set = {};
    const el = { style: { setProperty: (k, v) => { set[k] = v; } } };
    new Function('el', 'hudCfg', 'DEFAULT_HUD', '_hexToRgbTriplet',
      extractFunction('_hexMix', src) + '\n' + extractFunction('_menuVars', src) + '\n_menuVars(el);')(
      el, cfg, { menuBg:'#0b141a', menuEdge:'#2a3a42', menuText:'#cfeee2', menuDim:'#7fa99c',
                 accent:'#38f5b5', score:'#ffd166', shape:'angular', uiFont:'Rajdhani', displayFont:'Rajdhani' },
      (h) => { const n = parseInt(String(h).replace('#',''), 16); return [(n>>16)&255,(n>>8)&255,n&255].join(','); });
    return set;
  };

  const gold = run({ menuBg:'#1a1206', menuEdge:'#6b4f16', menuText:'#f4e3b8', menuDim:'#9c8a5e',
                     accent:'#ffcc33', score:'#ffe680', shape:'rounded', uiFont:'Orbitron', displayFont:'Orbitron' });
  eq(gold['--mn-bg'], '#1a1206', 'the authored panel colour lands');
  eq(gold['--mn-edge'], '#6b4f16');
  eq(gold['--mn-text'], '#f4e3b8');
  eq(gold['--mn-accent'], '#ffcc33', 'the ACCENT comes from the existing HUD theme rather than a fifth field');
  eq(gold['--mn-title'], '#ffe680', '...and the heading colour from Score, which is what it already meant');
  eq(gold['--mn-font'], "'Orbitron'", 'the authored UI font reaches the panel...');
  eq(gold['--mn-display'], "'Orbitron'", '...and the display font, which had NEVER reached it before this build');
  eq(gold['--mn-r'], '18px', 'the card radius follows the existing Shape setting');
  eq(gold['--mn-r2'], '12px', '...and so does the cell radius');
  assert(/^#[0-9a-f]{6}$/.test(gold['--mn-cell']), 'the inset colour is derived, not authored — four colours is already the most to keep in one head');
  assert(gold['--mn-cell'] !== gold['--mn-bg'], '...and it is genuinely distinct from the card behind it');
  assert(/^rgba\(26,18,6,0\.78\)$/.test(gold['--mn-scrim']),
    'the SCRIM is the panel colour at low alpha, so a light theme dims to light rather than to the engine\'s ' +
    'near-black — which would read as a bug on any level that is not dark');

  eq(run({ menuBg:'#0b141a', menuEdge:'#2a3a42', menuText:'#cfeee2', menuDim:'#7fa99c', accent:'#38f5b5',
           score:'#ffd166', shape:'square', uiFont:'Rajdhani', displayFont:'Rajdhani' })['--mn-r'], '0px',
    'Square really is square');

  // no config at all must still produce a complete set — a panel with an unresolved var renders transparent
  const bare = run(null);
  for (const k of ['--mn-bg','--mn-edge','--mn-text','--mn-dim','--mn-cell','--mn-accent','--mn-title','--mn-scrim','--mn-r','--mn-r2','--mn-font','--mn-display'])
    assert(bare[k], 'with no hudCfg at all, ' + k + ' is still set — an unresolved var paints nothing');
}

// ---------------------------------------------------------------- 4. every panel surface reads it
// The failure this guards is a HALF-themed panel: one hardcoded hex left behind is a teal stripe across a
// gold menu, which reads worse than no theming at all.
{
  const inv = extractFunction('renderInventory', src);
  const ins = extractFunction('openInspect', src);
  const cx  = extractFunction('_invCloseX', src);
  const open = extractFunction('openInventory', src);

  for (const [name, body] of [['renderInventory', inv], ['openInventory', open]]) {
    const hexes = (body.match(/(?:background|color|border(?:-color)?)\s*:\s*#[0-9a-fA-F]{3,8}/g) || []);
    eq(hexes.length, 0, name + ' has no hardcoded colour left: ' + hexes.join(' , '));
  }

  // the inspector keeps exactly two deliberate exceptions, and they are named rather than missed
  const insHexes = (ins.match(/(?:background|color)\s*:\s*#[0-9a-fA-F]{3,8}/g) || []);
  assert(insHexes.length <= 6,
    'the inspector\'s remaining hexes are the JOURNAL PAGE (a parchment sheet — content, not panel chrome) ' +
    'and the 3D viewport\'s own gradient backdrop; everything else is themed. Got: ' + insHexes.join(' , '));
  assert(/font-family:Georgia/.test(ins), '...and the journal page is identifiably that exception');

  assert(/var\(--mn-bg\)/.test(inv) && /var\(--mn-edge\)/.test(inv) && /var\(--mn-r\)/.test(inv),
    'the inventory card takes the panel colour, border and radius');
  assert(/var\(--mn-title\)/.test(inv), '...its heading takes the title colour');
  assert(/var\(--mn-dim\)/.test(inv), '...its secondary text takes the dim colour');
  assert(/var\(--mn-cell\)/.test(inv), '...and its item cells the derived inset');
  assert(/font-family:var\(--mn-display\)/.test(inv),
    'the heading asks for --mn-display, not --display-font — the latter is set on #hud, an element this ' +
    'panel is not inside, so the authored display font had never once reached the inventory title');
  assert(!/var\(--display-font\)/.test(inv) && !/var\(--display-font\)/.test(ins),
    '...and neither panel still asks for the variable that could never resolve there');

  assert(/var\(--mn-scrim\)/.test(open), 'the inventory scrim is themed');
  assert(/var\(--mn-scrim\)/.test(ins), '...and the inspector scrim');
  assert(/var\(--mn-accent\)/.test(cx) && /var\(--mn-edge\)/.test(cx), 'the close button is themed');
  assert(/#ff3b30/.test(cx),
    '...and its DESTRUCTIVE hover stays red on purpose — a warning colour, not decoration; a close button ' +
    'that turns the level\'s accent reads as "confirm" rather than "cancel"');
}

// ---------------------------------------------------------------- 5. it is stamped on every open, and on a theme change
{
  const open = extractFunction('openInventory', src);
  assert(/_menuVars\(_invEl\)/.test(open), 'the inventory is themed every time it opens...');
  assert(open.indexOf('_menuVars(_invEl)') < open.indexOf("_invEl.style.display='flex'"),
    '...before it is shown');
  assert(/_menuVars\(_inspEl\)/.test(extractFunction('openInspect', src)), '...and so is the inspector');

  const ap = extractFunction('applyHudCfg', src);
  assert(/if\(typeof _invEl!=='undefined' && _invEl\) _menuVars\(_invEl\);/.test(ap),
    'a theme change re-stamps a panel that is ALREADY OPEN — a creator picking colours with the inventory ' +
    'up must see it change, not have to close and reopen it');
  assert(/if\(typeof _inspEl!=='undefined' && _inspEl\) _menuVars\(_inspEl\);/.test(ap));
  assert(/typeof _invEl!=='undefined'/.test(ap),
    '...guarded, because applyHudCfg is called at BOOT, thousands of lines above where _invEl is declared ' +
    '(builds 1127/1331/1411: typeof does not guard a temporal dead zone, but these are `let` at module ' +
    'scope declared earlier — the guard is for the isolated-scope harnesses)');
}

// ---------------------------------------------------------------- 6. the door (build 1348)
{
  assert(/grp\('Menus'\)/.test(src), 'the HUD panel has a Menus group — a capability nobody can find does not exist');
  for (const k of ['menuBg', 'menuEdge', 'menuText', 'menuDim'])
    assert(new RegExp("colorRow\\('[^']+', '" + k + "'\\)").test(src), 'the creator can set ' + k);
  assert(/The full-screen panels/.test(src), '...with a hint naming which screens it covers');
  assert(/so a light theme dims to light/.test(src), '...including the scrim behaviour, which is not guessable');
  assert(src.indexOf("grp('Menus')") < src.indexOf("grp('Fonts')"),
    'and it sits beside the other appearance groups rather than at the bottom of an unrelated fold');
}

done('build 1469 (asked for from play): THE LEVEL\'S THEME REACHES THE PANELS OUTSIDE THE HUD — the last of a five-part request, "more customizable controls for creators that want to control how the inventory screens look". Verified before building, because the obvious reading is wrong: build 665\'s theme is real and complete, and every variable it sets is scoped to `#hud` — deliberately, because the editor\'s own chrome must not take the level\'s colours. The inventory and the item inspector are `position:fixed` panels appended to `document.body`, so they sat outside it ENTIRELY: a creator who themed their level gold-and-black opened the inventory and got the engine\'s teal, with no control anywhere in the product. So the same scoping trick applies one level out — the theme is stamped ON THE PANEL and the panel\'s own styles read it, which leaves the editor untouched because the editor is not one of these elements. Four authored colours, and their DEFAULTS ARE THE EXACT HEXES THOSE PANELS WERE HARDCODED WITH, so a level that never touches them renders byte-identically; everything else is derived from what the creator already authored — the accent, the heading colour, the corner radius and both fonts come from the existing HUD theme rather than becoming four more fields, and the inset colour a cell sits on is mixed rather than asked for, because four colours that must agree is already the most a creator should have to keep in their head. The scrim is the panel\'s own colour at low alpha, so a light theme dims to LIGHT rather than to the engine\'s near-black, which would read as a bug on any level that is not dark. Two hardcoded colours are deliberately kept and named rather than missed: the journal page\'s parchment (content, not panel chrome) and the close button\'s red destructive hover, because a close button that turns the level\'s own accent reads as "confirm" rather than "cancel". And the build found a latent bug on the way: the inventory heading asked for `--display-font`, which build 665 sets on `#hud` — an element that panel is not inside — so the authored display font had never once reached it');
