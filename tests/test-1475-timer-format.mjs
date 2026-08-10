// build 1475 — a timer widget can read a race.
//
// `_hwFmtTimer` had ONE format, `M:SS`, and it CEILED. So a movement course that ran in 12.34 seconds
// displayed `0:13` — a second AHEAD of reality, rounded the wrong way — and 12.01 s and 12.99 s read
// identically. Build 1474 had just made countdowns first-class and store two decimal places; the widget
// threw all of them away.
//
// `mmss` is byte-identical and stays the default, so no level that exists moves.

import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

const fmt = new Function(extractFunction('_hwFmtTimer', src) + '; return _hwFmtTimer;')();

// ---------------------------------------------------------------- 1. the default is unchanged, exactly
{
  // the pre-1475 function, restated here ONCE as the oracle rather than trusted
  const old = (sec) => { sec = Math.max(0, Math.ceil(+sec || 0)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
  for (const v of [0, 0.001, 0.5, 1, 1.5, 9, 9.99, 10, 59, 59.5, 60, 61, 65.43, 119, 600, 3599, 3600, 7325])
    eq(fmt(v), old(v), 'M:SS is byte-identical at ' + v);
  for (const bad of [undefined, null, NaN, -5, 'x', {}])
    eq(fmt(bad), old(bad), 'and on junk input too: ' + String(bad));
  eq(fmt(65.43), '1:06', 'so the shipped reading is unchanged — 65.43 still CEILS to 1:06');
  eq(fmt(65.43, 'mmss'), '1:06', '...and naming the default explicitly is the same thing');
  eq(fmt(65.43, 'nonsense'), '1:06', '...as is an unknown format, which must never blank the widget');
}

// ---------------------------------------------------------------- 2. the decimal forms TRUNCATE
// A stopwatch that reads 12.35 when 12.34 has elapsed is ahead of the run; a countdown that reads 0.01 when
// it is already over is a lie about a race the player just lost. Truncation is the only reading that is
// never ahead of the truth, in either direction of travel.
{
  eq(fmt(65.43, 'sec'),  '65s',    'whole seconds');
  eq(fmt(65.43, 'sec1'), '65.4s',  'tenths');
  eq(fmt(65.43, 'sec2'), '65.43s', 'hundredths');

  eq(fmt(12.99, 'sec'),  '12s',  'NEVER ahead: 12.99 is 12 whole seconds, not 13');
  eq(fmt(12.99, 'sec1'), '12.9s');
  eq(fmt(12.999, 'sec2'), '12.99s');
  eq(fmt(0.999, 'sec2'), '0.99s', '...and a run under a second is not rounded up to one');

  // trailing zeros are kept, or a stopwatch jitters between 12.4 and 12.40
  eq(fmt(12, 'sec1'), '12.0s', 'a whole number keeps its tenth');
  eq(fmt(12.5, 'sec2'), '12.50s', '...and its hundredth');
  eq(fmt(0, 'sec2'), '0.00s', 'zero reads as zero rather than blank');

  // the reading is monotone — it can never go UP as the value comes down
  let prev = null;
  for (let v = 20; v >= 0; v -= 0.017) {
    const cur = parseFloat(fmt(v, 'sec2'));
    if (prev !== null) assert(cur <= prev + 1e-9, 'the hundredths reading never rises as the value falls');
    prev = cur;
  }

  // ...and it is never AHEAD of the true value, at any of ~1200 samples
  for (let v = 0; v <= 20; v += 0.0167)
    for (const [f, eps] of [['sec', 1], ['sec1', 0.1], ['sec2', 0.01]]) {
      const shown = parseFloat(fmt(v, f));
      assert(shown <= v + 1e-9, f + ' is never ahead of the truth at ' + v.toFixed(4));
      assert(shown > v - eps - 1e-9, '...nor more than one step behind it');
    }

  // a negative is floored at zero rather than printing "-1s"
  for (const f of ['sec', 'sec1', 'sec2']) assert(!/-/.test(fmt(-7, f)), f + ' never prints a negative');
}

// ---------------------------------------------------------------- 3. it is authored, and it travels
{
  const san = new Function('_hwSafeUrl', 'HW_ANCHORS',
    extractFunction('_sanitizeHudWidgets', src) + '; return _sanitizeHudWidgets;')(
    (u) => (typeof u === 'string' ? u : ''), ['tl','tc','tr','ml','mr','bl','bc','br']);

  eq(san([{ kind:'timer' }])[0].tfmt, 'mmss', 'the default is the old behaviour');
  for (const f of ['sec', 'sec1', 'sec2']) eq(san([{ kind:'timer', tfmt:f }])[0].tfmt, f, f + ' survives');
  eq(san([{ kind:'timer', tfmt:'evil' }])[0].tfmt, 'mmss',
    'anything else is DISCARDED — this reaches a whitelist, not a formatter, and a level file is untrusted');
  eq(san([{ kind:'timer', tfmt:{} }])[0].tfmt, 'mmss', 'an object cannot become a format');

  // it rides the level for free, like every other widget field
  assert(/hudWidgets: \(\(typeof hudWidgets!=='undefined' && hudWidgets\.length\) \? _sanitizeHudWidgets\(hudWidgets\)/.test(src),
    'the serializer writes the widgets whole, so no serializer change was needed');
  assert(/hudWidgets = _sanitizeHudWidgets\(level\.hudWidgets\)/.test(src), '...and the loader reads them whole');
}

// ---------------------------------------------------------------- 4. the widget actually asks for it
{
  assert(/_hwFmtTimer\(_lgNum\(w\.value\), w\.tfmt\)/.test(src),
    'the render passes the authored format — the wire build 1277 exists to check');
  eq((src.match(/_hwFmtTimer\(/g) || []).length, 2,
    'and there is exactly one caller beside the definition, so no second site can drift');
}

// ---------------------------------------------------------------- 5. the door (build 1348)
{
  assert(/\['mmss','M:SS  \(1:05\)'\],\['sec','seconds  \(65s\)'\],\['sec1','tenths  \(65\.4s\)'\],\['sec2','hundredths  \(65\.43s\)'\]/.test(src),
    'the creator picks it on the widget, with a worked example beside each option rather than a bare name');
  assert(/if\(w\.kind==='timer'\)\{ l2\.appendChild\(document\.createTextNode\('as'\)\)/.test(src),
    '...on the timer row, beside the variable it reads');
  assert(/label \(before the time\)/.test(src),
    '...and the label placeholder no longer promises M:SS, which is now one of four');
}

done('build 1475: A TIMER WIDGET CAN READ A RACE. `_hwFmtTimer` had ONE format, `M:SS`, and it CEILED — so a movement course that ran in 12.34 seconds displayed `0:13`, a second AHEAD of reality and rounded the wrong way, and 12.01 s and 12.99 s read identically. Build 1474 had just made countdowns first-class and store two decimal places, and the widget threw all of them away. `mmss` is byte-identical and stays the default, proven against a restated copy of the pre-1475 function across 18 values plus six kinds of junk input, so no level that exists moves and an unknown format falls back to it rather than blanking the widget. The three new forms TRUNCATE rather than round, in both directions of travel: a stopwatch that reads 12.35 when 12.34 has elapsed is ahead of the run, and a countdown that reads 0.01 when it is already over is a lie about a race the player just lost — truncation is the only reading that is never ahead. Measured across ~1200 samples that the shown value is never above the true one and never more than one step below it, that the hundredths reading is monotone as the value falls, and that trailing zeros are kept so a stopwatch does not jitter between 12.4 and 12.40');
