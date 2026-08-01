import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1260: HUD ART. Widgets could show numbers (1058) and take a click (1255) but never show a
// PICTURE, so every authored interface was engine-coloured text on the engine's own plate. `img` is
// one field with two roles decided by the kind: on `image` it IS the widget, on every other kind it
// is the BACKGROUND — so a button becomes a card face and a bar sits inside a frame.

// --- the url guard: it goes into CSS, and level data is untrusted -------------------------------------
const safe = new Function(extractFunction('_hwSafeUrl') + '; return _hwSafeUrl;')();
{
  eq(safe('https://x.test/card.png'), 'https://x.test/card.png', 'an ordinary https image passes');
  eq(safe('  http://x.test/a.jpg  '), 'http://x.test/a.jpg', 'whitespace is trimmed');
  eq(safe('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA', 'an inline data image passes');
  eq(safe(''), '', 'blank is blank');
  eq(safe(null), '', 'and so is nothing at all');
  // the injection shapes: nothing may break out of url("...") or smuggle a scheme
  for (const bad of [
    'https://x.test/a.png") ; background: url("evil',   // quote + paren escape
    "https://x.test/a.png');x:(",
    'javascript:alert(1)',
    'data:text/html,<script>',                          // a data url that is not an image
    'https://x.test/a b.png',                           // whitespace splits the css value
    'https://x.test/a\\.png',                           // backslash escape
    '//x.test/a.png',                                   // scheme-relative: no explicit scheme
    'vbscript:x', 'file:///etc/passwd',
  ]) eq(safe(bad), '', 'rejected: ' + bad.slice(0, 34));
  assert(safe('https://x.test/' + 'a'.repeat(999)).length <= 400, 'and a hostile length is capped');
}

// --- the sanitizer carries the fields, clamped --------------------------------------------------------
const san = new Function('HW_ANCHORS', extractFunction('_hwSafeUrl') + extractFunction('_sanitizeHudWidgets') + '; return _sanitizeHudWidgets;')(
  ['tl','tc','tr','ml','mr','bl','bc','br']);
{
  const [w] = san([{ kind:'image', img:'https://x.test/c.png', iw:200, ih:300, alpha:0.5 }]);
  eq(w.kind, 'image', 'the image kind survives');
  eq(w.img, 'https://x.test/c.png', 'the url rides along');
  eq(w.iw, 200); eq(w.ih, 300); eq(w.alpha, 0.5, 'box and opacity ride along');
  const [d] = san([{ kind:'image' }]);
  eq(d.iw, 160); eq(d.ih, 100); eq(d.alpha, 1, 'sane defaults');
  const [h] = san([{ kind:'image', iw:99999, ih:-5, alpha:9, img:'javascript:x' }]);
  eq(h.iw, 1600, 'width clamps'); eq(h.ih, 8, 'height clamps'); eq(h.alpha, 1, 'opacity clamps');
  eq(h.img, '', 'and a hostile url is dropped at the door, not at render time');
  const [b] = san([{ kind:'button', img:'https://x.test/face.png', event:'play1' }]);
  eq(b.img, 'https://x.test/face.png', 'ANY kind can carry art — this is the card face');
  eq(b.event, 'play1', '...without losing what makes it a button');
}

// --- wiring pins --------------------------------------------------------------------------------------
assert(/w\.kind==='button'\|\|w\.kind==='image'\)\?w\.kind:'text'/.test(src), 'the kind is accepted by the sanitizer');
assert(/el\.style\.backgroundImage='url\("'\+w\.img\+'"\)';/.test(src),
  'the url is only ever interpolated AFTER _hwSafeUrl has vetted it at sanitize time');
assert(/el\.style\.backgroundSize='100% 100%'; el\.style\.backgroundRepeat='no-repeat';/.test(src),
  'art stretches to the widget box and never tiles');
assert(/el\.style\.width=w\.iw\+'px'; el\.style\.height=w\.ih\+'px';/.test(src),
  'an image widget has an AUTHORED box — so nothing reflows when the picture finally loads');
assert(/if\(!w\.bg && w\.kind!=='button'\)\{ el\.style\.border='0'; el\.style\.padding='0'; \}/.test(src),
  'with the engine plate off, art supplies its own frame (no stray border around a card)');
assert(/if\(w\.alpha < 1\) el\.style\.opacity=String\(w\.alpha\)/.test(src), 'opacity is applied only when it is not 1');
assert(/\['button','Button'\],\['image','Image'\]/.test(src), 'the editor offers the kind');
assert(/w\.kind==='image'\?'image url':'background image'/.test(src),
  'and labels the field for the role it plays on THIS kind');
assert(/no CORS header needed \(unlike the texture fields\)/.test(src),
  'the hint states the one thing a creator would otherwise get wrong by analogy with the texture fields');
assert(/mkAdd\('\+ Image'/.test(src), 'and a + Image button');
{
  const fn = extractFunction('_hwSafeUrl');
  assert(/\\u0022/.test(fn) && !/["']\)\\\\/.test(fn),
    'the guard writes its quotes as \\u escapes — a literal quote inside the regex derails extractFunction, and this function is unit-tested');
}

done('build 1260: HUD images — the CSS url guard executed against eight injection shapes plus the legitimate ones, the fields clamped, art on any kind (card faces on buttons), and an authored box so nothing reflows on load');
