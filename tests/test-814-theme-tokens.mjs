// (build 814) Theme tokenization — the UI had 77+ hardcoded accent literals bypassing the --accent token system, so a
// player re-theming the accent left toasts, cards, buttons, chips etc. stuck on default green. All CSS-context accent
// literals now go through var(--accent) / rgba(var(--accent-rgb),…); gold/info/danger get named vars adopted by the
// stylesheet. Canvas-2D code keeps reading the UI_ACCENT JS mirror (CSS vars can't reach a 2D canvas) — by design.
import { gameSource, html, assert, eq, done } from './harness.mjs';
const src = gameSource();

// no CSS-context accent literals remain (the survivors are the sanctioned sources of truth + color-input values)
{
  const all = html.split('\n');
  const hex = all.map((l,i)=>({l,n:i+1})).filter(x=>x.l.includes('#38f5b5'));
  // sanctioned: :root definition, JS theme defaults (UI_THEME_DEFAULT / UI_ACCENT / DEFAULT_HUD), var() fallbacks, color-input values
  for(const x of hex){
    const ok = /--accent:#38f5b5|UI_THEME_DEFAULT|UI_ACCENT = |DEFAULT_HUD|var\(--accent,#38f5b5\)|ci\.value=|xhPick\.value=|value="#38f5b5"/.test(x.l);
    assert(ok, 'accent hex at line '+x.n+' is a sanctioned source (not a stray CSS literal)');
  }
  const rgba = all.filter(l=>l.includes('rgba(56,245,181'));
  eq(rgba.length, 0, 'no hardcoded rgba(accent) literals remain — all routed through rgba(var(--accent-rgb),…)');
  assert(all.some(l=>l.includes('--accent-rgb:56,245,181')), 'the :root triplet definition remains the single source');
}

// named vars exist and the stylesheet adopts them
assert(/--gold:#ffd166; --info:#7ad7ff; --danger:#ff6b6b;/.test(html), ':root defines gold / info / danger');
assert(/#scoreVal \{ font-size: 26px; font-weight:700; color:var\(--gold\); \}/.test(html), 'the stylesheet uses var(--gold)');
assert(/#killFeed \.kfArrow \{ color:var\(--danger\); \}/.test(html), 'the stylesheet uses var(--danger)');

// the JS canvas mirror is untouched (canvas can't read CSS vars)
assert(/let UI_ACCENT = '#38f5b5', UI_ACCENT_RGB = '56,245,181';/.test(src), 'the canvas-side accent mirror stays a literal (by design)');
assert(/r\.setProperty\('--accent', UI_ACCENT\);/.test(src), 'applyUiTheme drives both the CSS var and the mirror');

done('build 814: accent fully tokenized — re-theming now recolors the whole UI');
