// (build 1058) CUSTOM HUD WIDGETS — author request: "custom on screen hud elements? For
// example, a custom score board, or a countdown timer, etc that users could add and connect
// through the node signals?" Widgets are LIVE VIEWS of the logic graph's variable store:
// a text widget interpolates {var} (the Show-message node's syntax), a timer formats a
// seconds variable as M:SS (the graph drives it with Every-X-sec/Change-variable/Branch),
// a bar fills value/max, and 'when' gates visibility on a variable — so show/hide, scoring
// and countdowns are all wired through the same nodes the level already uses. Level-scoped,
// serialized, host-authoritative with the watched variables mirrored to clients ({t:'hudv'}).
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- the sanitizer: imported levels stay inert data ----
const san = new Function(
  "const HW_ANCHORS=['tl','tc','tr','ml','mr','bl','bc','br'];\n" + extractFunction('_sanitizeHudWidgets', src)
  + '\nreturn _sanitizeHudWidgets;')();
eq(san(null).length, 0, 'junk input yields no widgets');
eq(san([null, 'x', 7]).length, 0, 'non-object entries are dropped');
{
  const w = san([{ id: 'hw_abc', kind: 'timer', label: 'LEFT', value: ' time ', max: '', when: 'started', anchor: 'br', dx: 9999, dy: -3.7, size: 200, color: '#ff0000', bg: false }])[0];
  eq(w.kind, 'timer', 'kinds pass through');
  eq(w.value, 'time', 'variable names trim');
  eq(w.anchor, 'br', 'anchors pass the whitelist');
  eq(w.dx, 2000, 'offsets clamp');
  eq(w.size, 96, 'size clamps');
  eq(w.color, '#ff0000', 'a #rrggbb colour is kept');
  eq(w.bg, false, 'the panel background can be turned off');
}
{
  const w = san([{ kind: 'evil', anchor: 'nope', color: 'javascript:alert(1)', label: { toString: () => '<b>x</b>' } }])[0];
  eq(w.kind, 'text', 'unknown kinds fall back to text');
  eq(w.anchor, 'tc', 'unknown anchors fall back to top centre');
  eq(w.color, '', 'a non-#rrggbb colour is discarded (falls back to the theme accent)');
  assert(/^hw_/.test(w.id), 'a missing id is generated');
  eq(w.label, '<b>x</b>', 'labels stay strings — and the renderer only ever writes textContent');
}
eq(san(new Array(40).fill({ kind: 'text' })).length, 24, 'hard cap at 24 widgets');
{
  const long = san([{ label: 'x'.repeat(500) }])[0];
  eq(long.label.length, 80, 'labels cap at 80 chars');
}

// ---- the timer format and live interpolation, executed ----
const glue = extractFunction('_lgNum', src) + '\n' + extractFunction('_hwFmtTimer', src) + '\n' + extractFunction('_hwText', src);
const env = new Function('logicVars', glue + '\nreturn { fmt:_hwFmtTimer, text:_hwText };');
{
  const e = env({ score: 12.345, time: 65, kills: 3 });
  eq(e.fmt(65), '1:05', 'seconds format as M:SS');
  eq(e.fmt(0), '0:00', 'zero holds at 0:00');
  eq(e.fmt(-12), '0:00', 'negative time never shows');
  eq(e.fmt(3599), '59:59', 'long timers stay sane');
  eq(e.text({ kind: 'text', label: 'SCORE {score} · K {kills}' }), 'SCORE 12.35 · K 3',
    'text widgets interpolate {var} live (rounded to 2 decimals, same as the Show-message node)');
  eq(e.text({ kind: 'text', label: 'X {missing}' }), 'X 0', 'unknown variables read 0');
  eq(e.text({ kind: 'timer', label: 'LEFT', value: 'time' }), 'LEFT 1:05', 'timer widgets format their variable after the label');
  eq(e.text({ kind: 'timer', label: '', value: 'time' }), '1:05', '...or stand alone without one');
  eq(e.text({ kind: 'timer', label: '', value: '90' }), '1:30', 'a literal number works too (_lgNum resolves value fields)');
}

// ---- wiring pins ----
assert(/let hudWidgets = _sanitizeHudWidgets\(savedLevel && savedLevel\.hudWidgets\);/.test(src), 'widgets boot from the saved level');
assert(/hudWidgets: \(\(typeof hudWidgets!=='undefined' && hudWidgets\.length\) \? _sanitizeHudWidgets\(hudWidgets\) : undefined\),/.test(src),
  'and serialize with it');
eq((src.match(/hudWidgets = _sanitizeHudWidgets\(level\.hudWidgets\); _hwRev\+\+;/g) || []).length, 2,
  'both level-load paths restore them');
assert(/updateHudWidgets\(\);   \/\/ build 1058: custom HUD widgets mirror the logic variables \(all modes\)/.test(src),
  'the frame loop drives them right after the logic graph');
assert(/e\.lb\.textContent=t;/.test(src) && !/hwLb[^]{0,200}innerHTML/.test(src),
  'labels render via textContent only — no markup injection from imported levels');
assert(/const vis=!w\.when \|\| \(\+logicVars\[w\.when\]\|\|0\)!==0;/.test(src),
  "'show when' gates visibility on a logic variable being non-zero");
assert(/pointer-events:none;z-index:4;/.test(src), 'the widget layer never eats clicks');
assert(/NET\.conns\[cid\]\.send\(\{t:'hudv', v\}\)/.test(src), 'the host mirrors the watched variables to clients');
assert(/else if\(msg\.t==='hudv'\)\{ if\(msg\.v && typeof msg\.v==='object'\) for\(const k in msg\.v\) logicVars\[k\]=\+msg\.v\[k\]\|\|0; \}/.test(src),
  'clients fold the mirror into their own variable store (widgets render identically everywhere)');
assert(/if\(js!==_hwSent \|\| now-_hwSentAt>2000\)/.test(src), 'the mirror sends on change, with a 2s keepalive for late joiners');
assert(/grp\('Custom widgets \(logic-driven\)'\);/.test(src), 'the HUD tab has the authoring section');
assert(/mkAdd\('\+ Text', \{ kind:'text', label:'SCORE \{score\}', anchor:'tc' \}\);/.test(src),
  'one-click starter widgets (text / timer / bar)');
assert(/if\(hudWidgets\.length>=24\)/.test(src), 'the editor enforces the same 24 cap as the sanitizer');

done('build 1058: scoreboards, countdowns and bars on the HUD — authored in the editor, driven by the logic graph, synced to every player');
