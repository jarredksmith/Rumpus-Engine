// build 1450 — how far through a reload you are.
//
// A reload had NO progress readout of any kind. The flat path put '--' in the ammo counter and that was it,
// so "how much longer" was unanswerable — a real question at 700 ms for a pistol against 1600 for a sniper,
// and one build 1172's reload-cancel makes ACTIONABLE: knowing you are a tenth of the way in is what decides
// whether to switch out of it.
//
// The shell path (1249) already shows the count climbing, which is the COUNT. What it never showed is when
// the next shell lands — the beat that decides whether to cancel-fire with what is in the tube. The bar
// re-arms per shell, so it answers that one instead of duplicating the counter.
import { gameSource, html, extractFunction, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

/* ---- EXECUTED: the fraction ------------------------------------------------------------------------ */
const frac = (t0, t1, now) => new Function('T0', 'T1', 'NOW', `
  let _rlT0 = T0, _rlT1 = T1;
  ${extractFunction('_reloadFrac', src)}
  return _reloadFrac(NOW);
`)(t0, t1, now);

{
  eq(frac(1000, 2000, 1000), 0, 'the bar starts empty');
  near(frac(1000, 2000, 1500), 0.5, 1e-9, '...is half full half way');
  eq(frac(1000, 2000, 2000), 1, '...and full at the end');
  eq(frac(1000, 2000, 5000), 1, 'past the end it stays full rather than running off');
  eq(frac(1000, 2000, 500), 0, '...and before the start it stays empty');
}
{
  // a degenerate window must not divide by zero — a NaN width would leave the bar in whatever state the
  // browser makes of `scaleX(NaN)`, which is not a state anyone can debug
  eq(frac(0, 0, 0), 0, 'a zero-length window reads 0, never NaN');
  eq(frac(5000, 1000, 3000), 0, '...and so does a backwards one');
  assert(isFinite(frac(0, 0, 99999)), 'and the result is always a real number');
}
{
  // it is PURE in the clock: two reads at one instant agree, so nothing about the bar depends on how often
  // the frame loop happens to run
  eq(frac(0, 1000, 400), frac(0, 1000, 400), 'the same instant reads the same fraction');
}

/* ---- EXECUTED: the arm, at the real durations ------------------------------------------------------- */
const arm = (ms, at) => new Function('MS', 'AT', `
  let _rlT0 = 0, _rlT1 = 0;
  const performance = { now: () => AT };
  ${extractFunction('_rlArm', src)}
  _rlArm(MS);
  return { t0: _rlT0, t1: _rlT1 };
`)(ms, at);

{
  const a = arm(1600, 5000);           // the sniper
  eq(a.t0, 5000, 'the window opens now');
  eq(a.t1, 6600, '...and closes exactly reloadMs later, so the bar and the timeout cannot disagree');
  eq(arm(0, 0).t1, 1, 'a zero duration still gives a window with width, so the fraction stays finite');
  eq(arm(undefined, 0).t1, 1, '...and so does a missing one');
}

/* ---- EXECUTED: the tick, against a fake element ----------------------------------------------------- */
const tick = (states) => {
  const out = { widths: [], hidden: [], writes: 0 };
  new Function('STATES', 'OUT', `
    let _rlT0 = 0, _rlT1 = 1000, _rlEl = null, _rlShown = false, _rlPct = -1;
    let reloading = false, now = 0;
    const performance = { now: () => now };
    const span = { style: { set transform(v){ OUT.writes++; OUT.widths.push(v); }, get transform(){ return ''; } } };
    const el = { firstElementChild: span, classList: { toggle: (c, on) => OUT.hidden.push(!!on) } };
    const document = { getElementById: () => el };
    ${extractFunction('_reloadFrac', src)}
    ${extractFunction('_reloadBarTick', src)}
    for(const st of STATES){ reloading = st.on; now = st.t; if(st.t1 != null){ _rlT0 = st.t0; _rlT1 = st.t1; } _reloadBarTick(); }
    return null;
  `)(states, out);
  return out;
};

{
  const r = tick([{ on: false, t: 0 }, { on: true, t: 0, t0: 0, t1: 1000 }, { on: true, t: 500 },
                  { on: true, t: 1000 }, { on: false, t: 1100 }]);
  // `classList.toggle(c, force)` takes force-ON, and the call is `toggle('hidden', !on)` — so a recorded
  // `false` means the hidden class was REMOVED. The rig records the force argument; read it that way.
  eq(r.hidden.length, 2, 'the bar is shown once and hidden once — not toggled every frame');
  eq(r.hidden[0], false, 'the hidden class comes OFF when a reload starts');
  eq(r.hidden[1], true, '...and back on when it ends');
  assert(r.widths.some((w) => /scaleX\(0\.5\)/.test(w)), 'and it fills to half at half way');
  assert(r.widths.some((w) => /scaleX\(1\)/.test(w)), '...and to full at the end');
}
{
  // a frame that changes nothing must not touch the DOM: this runs every frame of every session
  const r = tick([{ on: true, t: 500, t0: 0, t1: 1000 }, { on: true, t: 500 }, { on: true, t: 501 }]);
  eq(r.writes, 1, 'three frames at the same rounded percent perform ONE style write');
  const idle = tick([{ on: false, t: 0 }, { on: false, t: 100 }, { on: false, t: 200 }]);
  eq(idle.writes, 0, 'and a session that is not reloading writes nothing at all');
  // and it does not toggle on the first frame either: the markup SHIPS `class="hidden"` and `_rlShown`
  // starts false, so the initial DOM and the initial state already agree — nothing to write.
  eq(idle.hidden.length, 0, '...and does not touch the class either, because the markup already agrees');
}
{
  // a missing element must not throw once a frame forever
  const noEl = new Function(`
    let _rlT0 = 0, _rlT1 = 1000, _rlEl = null, _rlShown = false, _rlPct = -1, reloading = true;
    const performance = { now: () => 500 };
    const document = { getElementById: () => null };
    ${extractFunction('_reloadFrac', src)}
    ${extractFunction('_reloadBarTick', src)}
    _reloadBarTick(); _reloadBarTick();
    return 'ok';
  `);
  eq(noEl(), 'ok', 'with no element in the DOM it returns quietly rather than throwing every frame');
}

/* ---- nothing clears the timestamps: `reloading` is the gate ----------------------------------------- */
// Every cancel path — build 1172's weapon switch, build 1249's fire-mid-reload, and both completions —
// already sets `reloading = false`, so the bar comes down for free. A timer of the bar's own would have
// needed unwinding at four sites, which is how one of them gets missed.
{
  const t = extractFunction('_reloadBarTick', src);
  assert(/const on = !!reloading;/.test(t), 'the gate is the reload state itself');
  eq((src.match(/_rlT0 = 0/g) || []).length, 1, 'the timestamps are never reset anywhere but their declaration');
}

/* ---- armed where the timeouts are scheduled, so the two cannot disagree ------------------------------ */
{
  const rl = extractFunction('reload', src);
  assert(/_rlArm\(w\.reloadMs\);/.test(rl), 'the flat path arms with the exact value its timeout takes');
  const i = rl.indexOf('_rlArm(w.reloadMs)'), j = rl.indexOf('}, w.reloadMs);');
  assert(i > 0 && j > i, '...immediately before that timeout');
  const sn = extractFunction('_shellNext', src);
  assert(/_rlArm\(delayMs\);/.test(sn), 'and the shell path arms with the delay it is about to wait');
  assert(sn.indexOf('_rlArm(delayMs)') < sn.indexOf('setTimeout('), '...before scheduling it');
  // the shell path re-arms per shell, which is the whole reason it reads as one sweep per shell
  assert(/_shellNext\(w, tok, w\.shellMs \|\| 420\)/.test(sn), 'each landed shell schedules the next');
  eq((src.match(/_rlArm\(/g) || []).length, 3, 'armed in exactly two places, plus its own definition');
}

/* ---- the element, and the toggle it rides ----------------------------------------------------------- */
assert(/<div id="reloadBar" class="hidden"><span><\/span><\/div>/.test(html), 'the bar is in the markup, hidden');
assert(html.indexOf('id="crosshair"') < html.indexOf('id="reloadBar"'),
  '...as a sibling of the crosshair, which is what centres it');
/* build 1465: this pinned the WELD — the bar shared the crosshair's hide rule, which made "keep the
   reticle, lose the bar" unsayable, and that was the thing creators asked for. What it was really
   guarding is that the bar CAN be hidden, and it now has its own toggle to do it with. */
assert(/body\.hud-hide-reload\s+#reloadBar/.test(html), 'the reload bar can be switched off');
assert(!/body\.hud-hide-crosshair\s+#reloadBar/.test(html),
  '...on its OWN toggle: hiding the crosshair no longer takes the bar with it');
assert(/#reloadBar > span \{[^}]*transform-origin: left center;/.test(html.replace(/\n/g, ' ')),
  'it grows from the left rather than the middle');
assert(/#reloadBar \{[^}]*pointer-events: none;/.test(html.replace(/\n/g, ' ')),
  '...and never eats a click, since it sits over the centre of the screen');

/* ---- and the frame loop asks for it ------------------------------------------------------------------ */
assert(/updateHurtDir\(dt\);.*\n\s*_reloadBarTick\(\);/.test(src),
  'the tick runs every frame, beside the other per-frame HUD work');

done('build 1450: a reload finally says how far through it is — one bar under the reticle, armed with the ' +
     'exact duration its own timeout takes, gated on the reload state so every cancel path takes it down ' +
     'for free, and re-armed per shell on a shell loader so it answers "when does the next one land"');
