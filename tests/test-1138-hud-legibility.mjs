// build 1138: the HUD is legible over any level.
//
// A critic measured a "systemic contrast failure": every secondary label at 1.8-2.1:1 on its panel,
// 1.08:1 over snow, the reticle at 1.07:1 on ice, and — the root cause — ".panel's 50%-alpha low stop
// lets the level's albedo set the HUD's brightness". Plus "a native white checkbox in the darkest panel
// in the product, with `color-scheme` appearing zero times in 3.1MB".
//
// All three are objectively checkable, so this test computes the real WCAG ratios rather than pinning
// colour strings. The worst case a level can produce behind the HUD is pure white — blown snow, sunlit
// sand — so that is what everything is measured against.
import { html, assert, eq, done } from './harness.mjs';

// ---------------------------------------------------------------- WCAG, from the spec
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const parse = (h) => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const lum = (h) => { const [r, g, b] = parse(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const over = (fg, alpha, bg) => { const f = parse(fg), b = parse(bg);
  return '#' + [0,1,2].map(i => Math.round(f[i]*alpha + b[i]*(1-alpha)).toString(16).padStart(2,'0')).join(''); };
// sanity: the formula reproduces the spec's own reference values
assert(Math.abs(ratio('#000000', '#ffffff') - 21) < 0.01, 'black on white is 21:1');
assert(Math.abs(ratio('#767676', '#ffffff') - 4.54) < 0.02, "the spec's 4.5:1 grey checks out");

// ---------------------------------------------------------------- the panel's own floor
// The gradient's LOW stop is the worst case, because it is where the level shows through most.
// EVERY surface of this class, not just .panel — the interact prompt had the same fault with its own
// numbers, and a sweep is the only way to catch the next one that copies the pattern.
const stops = [...html.matchAll(/rgba\(8,18,22,calc\(\.(\d+)\*var\(--hud-panel-op,1\)\)\)/g)].map(m => +('0.' + m[1]));
assert(stops.length >= 2 && stops.length % 2 === 0, 'the HUD panel surfaces are two-stop gradients (' + stops.length / 2 + ' of them)');
const lowStop = Math.min(...stops), highStop = Math.max(...stops);
assert(lowStop >= 0.8, 'the low stop is at least 0.8 (' + lowStop + ') — at 0.5 the level set the HUD\'s brightness');
assert(highStop >= lowStop, 'the high stop is the more opaque one');
assert(lowStop <= 0.9, '...and not fully opaque (' + lowStop + '): it is still a HUD, not a box');
const WORST = '#ffffff';                       // the brightest a level can be behind the panel
const panel = over('#081216', lowStop, WORST); // what the panel actually composites to there

// ---------------------------------------------------------------- every text colour on it
{
  // the secondary label colour, read out of the CSS rather than restated here
  const m = html.match(/\.label \{[^}]*color: (#[0-9a-f]{6})/i);
  assert(m, 'the .label rule sets a colour');
  const secondary = m[1];
  const r = ratio(secondary, panel);
  assert(r >= 4.5, 'the secondary label reaches WCAG AA over the worst level (' + secondary + ' on ' + panel + ' = ' + r.toFixed(2) + ':1)');
  // it must be the SAME colour everywhere it is used, or one of them will drift back
  const uses = (html.match(new RegExp(secondary, 'gi')) || []).length;
  assert(uses >= 8, 'and it is one token used throughout (' + uses + ' sites)');
  assert(!/#5a7d72/i.test(html), 'the old 1.27:1 colour is gone from the file entirely');
  // the accent and the big readouts have to clear it too
  const accent = (html.match(/--accent:\s*(#[0-9a-f]{6})/i) || [])[1];
  assert(accent, 'the accent token exists');
  assert(ratio(accent, panel) >= 4.5, 'the accent clears AA on the same panel (' + ratio(accent, panel).toFixed(2) + ':1)');
  assert(ratio('#ffffff', panel) >= 7, 'and white clears AAA (' + ratio('#ffffff', panel).toFixed(2) + ':1)');
}
{
  // the old configuration, for the record: this is what the numbers were
  const oldPanel = over('#081216', 0.5, WORST);
  assert(ratio('#5a7d72', oldPanel) < 1.5, 'the old secondary on the old panel was under 1.5:1 (' + ratio('#5a7d72', oldPanel).toFixed(2) + ':1)');
  assert(ratio('#ffffff', oldPanel) < 4.5, '...and even white failed AA on it (' + ratio('#ffffff', oldPanel).toFixed(2) + ':1)');
}

// ---------------------------------------------------------------- the reticle
{
  // the rule that sets its BOX, not `#hud #crosshair` (which only positions it) — anchor on the size
  const m = html.match(/#crosshair \{[^}]*width: 26px[^}]*\}/);
  assert(m, 'the crosshair rule exists');
  assert(/filter: drop-shadow\(0 0 1px rgba\(0,0,0,\.95\)\) drop-shadow\(0 0 2px rgba\(0,0,0,\.55\)\);/.test(m[0]),
    'the reticle carries a dark outline, so it is legible on white as well as on black');
  // it is a filter on the container, so it covers whatever shape the configurable crosshair builds in JS
  assert(/crosshair is built in JS now \(configurable\)/.test(html),
    'the shape is built in JS, which is why the outline is a filter on the container rather than a per-stroke style');
}

// ---------------------------------------------------------------- native controls
assert(/:root\{ color-scheme: dark;/.test(html), 'color-scheme:dark is declared on :root');
eq((html.match(/color-scheme:/g) || []).length, 1, '...once, at the root, so it cascades to every native control');

done('build 1138: the HUD reaches WCAG AA over the brightest level the engine can render');
