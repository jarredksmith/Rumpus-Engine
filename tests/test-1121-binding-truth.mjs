// build 1121: every player-facing key label is RESOLVED from the live binding.
//
// The HUD shipped `[G] THROW` as literal markup while BIND_DEFAULTS.grenade was KeyF and KeyG was
// grab — so the game instructed every player to press the wrong key, and pressing it threw nothing
// (it grabs). The Instructions modal said the same thing. Neither followed a remap either: a player
// who moved grenade to Q still read "G".
//
// Verified in a real browser after the fix: #nadeKbd renders "[F] THROW" and the controls line reads
// "F throw grenade".
import { assert, eq, done, html } from './harness.mjs';
import { gameSource, extractFunction } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- no literal key text survives
// The engine's own source legitimately quotes the old bug in a comment (so does this file's
// header). Test the BODY MARKUP: strip script and style blocks, which is where those live.
const markup = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
assert(!/\[G\] THROW/.test(markup), 'the wrong hardcoded grenade key is gone from the markup');
assert(/<span id="nadeKbd"><\/span>/.test(html), '...leaving a slot the binds fill in');
{
  // the controls line must not name a key in <b> without saying which action it belongs to
  const m = html.match(/<div id="controls">([\s\S]*?)<div id="padNote"/);
  assert(m, 'the controls block exists');
  // stop at the controller note: gamepad buttons (A/B/X/Y, LB, L3) are not keyboard bindings and
  // are correctly literal
  const bolds = [...m[1].matchAll(/<b(?: data-bind="([a-z]+)")?>([^<]+)<\/b>/g)];
  const bound = bolds.filter(b => b[1]).length;
  assert(bound >= 10, 'the movement and action keys are all bound to their action (' + bound + ')');
  // MOUSE / L-CLICK / weapon digits are not keyboard bindings and are allowed to stay literal
  const literals = bolds.filter(b => !b[1]).map(b => b[2].trim());
  for (const t of literals)
    assert(/MOUSE|CLICK|1·2·3|scroll|ESC|^P$/i.test(t), 'unbound literal "' + t + '" is not a rebindable key');
}

// ---------------------------------------------------------------- the resolver
{
  const fn = extractFunction('refreshBindLabels');
  assert(/document\.querySelectorAll\('\[data-bind\]'\)/.test(fn), 'every data-bind element is filled in');
  assert(/_keyLabel\(B\[a\]\)/.test(fn), '...from the live BINDS, through the existing label formatter');
  assert(/_keyLabel\(B\.grenade \|\| BIND_DEFAULTS\.grenade\)/.test(fn), 'and the grenade chip comes from the grenade binding');
  assert(/requestAnimationFrame\(refreshBindLabels\)/.test(fn),
    '...retrying once if the HUD markup is not up yet, since an empty chip would be worse than a wrong one');
}
// it must run at boot AND after any rebind
assert(/function saveBinds\(\)\{[^]*?refreshBindLabels\(\)/.test(src),
  'saveBinds re-resolves the labels — every remap and the reset button both funnel through it');
assert(/function _rebuildGameKeys\(\)\{\n  if\(typeof refreshBindLabels==='function'\) refreshBindLabels\(\);/.test(src),
  '...and so does the boot path');

// ---------------------------------------------------------------- the bug itself, pinned
{
  const m = src.match(/const BIND_DEFAULTS = \{[^}]*\}/)[0];
  const grenade = m.match(/grenade:'(\w+)'/)[1], grab = m.match(/grab:'(\w+)'/)[1];
  assert(grenade !== grab, 'grenade and grab are different keys');
  eq(grenade, 'KeyF', 'grenade is F');
  eq(grab, 'KeyG', 'grab is G — which is exactly what the HUD used to tell players to press to throw');
  // and the formatter turns those codes into what a player reads
  const kl = new Function('return ' + extractFunction('_keyLabel').replace(/^function _keyLabel/, 'function'))();
  eq(kl('KeyF'), 'F', 'KeyF reads as F');
  eq(kl('Space'), 'Space', 'Space reads as Space');
  eq(kl('ControlLeft'), 'Ctrl', 'ControlLeft reads as Ctrl');
}

done('build 1121: the game tells players the key that actually works, and keeps telling the truth after a remap');
