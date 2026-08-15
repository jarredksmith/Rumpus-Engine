// build 1504: the minimap / score / wave hide toggles work again.
//
// Reported from play: "if you toggle the minimap, wave counter, and score off, they still show up on the
// HUD no matter what." Exactly those three — because their selectors were a DANGLING FRAGMENT: build 1467
// inserted its freeCursor rules into the middle of the hide rule's comma list, so
//   body.hud-hide-minimap #minimap, ...score, ...wavePanel,
//   body.freeCursor #hud { cursor: default; }
// parsed as ONE selector list ending in the CURSOR rule. The three selectors set cursor:default (invisible
// no-op) and fell out of `display:none !important`. Every toggle after the insertion point kept working,
// which is what made it read as "these three specifically".
//
// The guard here is the general form: parse the stylesheet into rules and walk EVERY hud-hide selector to
// the declaration of the rule that actually contains it. An orphaned selector lands in the wrong rule's
// declaration and fails by name.
import { gameSource, html, assert, eq, done } from './harness.mjs';

const src = gameSource();

// the toggle list is the engine's own
const TOGGLES = JSON.parse(src.match(/const HUD_TOGGLES = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
assert(TOGGLES.includes('minimap') && TOGGLES.includes('score') && TOGGLES.includes('wave'),
  'the three reported toggles are real HUD_TOGGLES keys');

// ---------------------------------------- parse the stylesheet into (selectors, declaration) rules ----
const cssStart = html.indexOf('<style>'), cssEnd = html.indexOf('</style>', cssStart);
let css = html.slice(cssStart, cssEnd).replace(/\/\*[\s\S]*?\*\//g, '');   // comments are legal mid-list — strip them
const rules = [];
{
  let i = 0;
  while (true) {
    const b = css.indexOf('{', i); if (b < 0) break;
    let d = 1, j = b + 1;
    while (j < css.length && d > 0) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++; }
    rules.push({ sel: css.slice(i, b).trim(), body: css.slice(b + 1, j - 1) });
    i = j;
  }
}
assert(rules.length > 200, 'the stylesheet parsed into rules (' + rules.length + ')');

// ---------------------------------------- every hud-hide selector reaches a rule that HIDES ----
const EXPECT = { goal: /opacity:\s*0\s*!important/, dlg: /display:\s*none\s*!important/ };
for (const k of TOGGLES) {
  const needle = 'body.hud-hide-' + k + ' ';
  // the AUTHORING preview intentionally re-shows some elements (body.hudPreview:not(.hud-hide-x)) —
  // only a rule whose selector list carries the bare hide class counts
  const owning = rules.filter(r => r.sel.split(',').some(s => s.trim().startsWith(needle)));
  assert(owning.length >= 1, 'hud-hide-' + k + ' appears as a selector of some rule');
  const want = EXPECT[k] || /display:\s*none\s*!important/;
  assert(owning.some(r => want.test(r.body)),
    'hud-hide-' + k + ' lands in a rule that actually HIDES — an orphaned fragment absorbed into a ' +
    'neighbouring rule (the 1467 insertion) fails here by name');
  // ...and never in a rule that merely restyles: the exact 1467 failure was these selectors setting cursor
  for (const r of owning) {
    assert(!/cursor:/.test(r.body) || want.test(r.body),
      'hud-hide-' + k + ' is not absorbed into a cursor rule');
  }
}

// the three reported keys, asserted by name so the report maps to a check
for (const k of ['minimap', 'score', 'wave']) {
  const target = { minimap: '#minimap', score: '#score', wave: '#wavePanel' }[k];
  const r = rules.find(r => r.sel.includes('body.hud-hide-' + k + ' ' + target) && /display:\s*none\s*!important/.test(r.body));
  assert(r, 'toggling ' + k + ' off really hides ' + target);
}

// the freeCursor rules that caused the orphaning are intact — the fix moved selectors, not features
assert(rules.some(r => r.sel === 'body.freeCursor #hud' && /cursor:\s*default/.test(r.body)),
  "build 1467's free-cursor rule survives, no longer carrying three stowaways");
assert(rules.some(r => r.sel === 'body.clickHot canvas' && /cursor:\s*pointer/.test(r.body)),
  "build 1480's click-cue rule survives");

// the application mechanism (one writer, class per toggle) is unchanged
assert(/for\(const k of HUD_TOGGLES\) body\.classList\.toggle\('hud-hide-'\+k, !!\(c\.hide && c\.hide\[k\]\)\);/.test(src),
  'applyHudCfg still writes one class per toggle');

done('build 1504: every hud-hide selector provably reaches a hiding declaration — the three orphans ' +
  '(minimap, score, wave) are back in a display:none rule, and a future mid-list insertion fails by name');
