import { gameSource, html, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1281: the gameplay audit's #1 finding. The engine shipped a gamepad look slider (909) and TWO touch
// sliders (1042) and nothing at all for the mouse — the primary input, and the first setting a player in
// this genre changes. HIP_SENS was a const with two consumers, so a player whose mouse DPI disagreed with
// one hardcoded number had to change it system-wide.

const sensNow = () => {
  const env = { mouseSens: 1, mouseAimMatch: false, adsFovLive: 38.20, curWep: 'rifle' };
  const fn = new Function('__e', 'WEAPONS', [
    'const HIP_SENS = 0.0022, ADS_SENS = 0.0012, SCOPE_SENS = 0.00045;',
    'const BASE_FOV = 78, ADS_FOV = 38.20;',
    'let mouseSens, mouseAimMatch, adsFovLive, curWep;',
    extractFunction('_mouseSensNow'),
    'return (e, ads)=>{ mouseSens=e.mouseSens; mouseAimMatch=e.mouseAimMatch; adsFovLive=e.adsFovLive; curWep=e.curWep; return _mouseSensNow(ads); };',
  ].join('\n'))(env, { rifle: {}, sniper: { scope: true } });
  return { fn, env };
};

{ // 1.0 IS BYTE-IDENTICAL to everything builds 160–1280 were tuned against — the safe-change constraint
  const { fn, env } = sensNow();
  near(fn({ ...env, mouseSens: 1 }, false), 0.0022, 1e-12, 'hip at 1.0 is exactly HIP_SENS');
  near(fn({ ...env, mouseSens: 1 }, true), 0.0012, 1e-12, 'aim at 1.0 is exactly ADS_SENS');
  near(fn({ ...env, mouseSens: 1, curWep: 'sniper' }, true), 0.00045, 1e-12, 'and the scope is exactly SCOPE_SENS');
}
{ // the multiplier does what it says, in both states
  const { fn, env } = sensNow();
  near(fn({ ...env, mouseSens: 2 }, false), 0.0044, 1e-12, 'double is double');
  near(fn({ ...env, mouseSens: 0.5 }, false), 0.0011, 1e-12, 'and half is half');
  near(fn({ ...env, mouseSens: 2 }, true), 0.0024, 1e-12, 'aim scales with the same number — one slider, not two');
  near(fn({ ...env, mouseSens: 3, curWep: 'sniper' }, true), 0.00135, 1e-12, '...and so does the scope');
}
{ // ZOOM-MATCHED AIM, off by default and correct when on
  const { fn, env } = sensNow();
  const zoom = Math.tan(78 * Math.PI / 360) / Math.tan(38.20 * Math.PI / 360);
  assert(zoom > 2.2 && zoom < 2.5, 'the shipped ADS magnification is ~2.34x (' + zoom.toFixed(2) + ')');
  const shipped = 0.0012 / 0.0022;
  assert(shipped > 0.54 && shipped < 0.55, '...against a shipped sens ratio of 0.545 — the ~28% mismatch the audit measured');

  near(fn({ ...env, mouseAimMatch: false }, true), 0.0012, 1e-12, 'off: the authored feel is untouched');
  const matched = fn({ ...env, mouseAimMatch: true }, true);
  near(matched, 0.0022 / zoom, 1e-12, 'on: aim sensitivity is the hip divided by the real magnification');
  assert(matched < 0.0012, '...which is SLOWER than the shipped aim, because the shipped one was too fast');
  // the property that defines "zoom-matched": the same mouse travel sweeps the same on-screen arc
  const hipArc = fn({ ...env }, false) * 1;
  const aimArc = matched * zoom;
  near(aimArc, hipArc, 1e-12, 'THE PROPERTY: one mouse-inch sweeps the same screen distance aimed or not');
  // and it composes with the multiplier
  near(fn({ ...env, mouseAimMatch: true, mouseSens: 2 }, true), 2 * 0.0022 / zoom, 1e-12, 'the slider still applies');
  // hip is never touched by the aim-match setting
  near(fn({ ...env, mouseAimMatch: true }, false), 0.0022, 1e-12, 'and hip fire is unaffected either way');
}
{ // one derivation, so the two mouse consumers cannot drift apart
  eq((src.match(/_mouseSensNow\(/g) || []).length, 3, 'defined once and asked twice — the look handler and the aim path');
  assert(!/movementX \* HIP_SENS/.test(src), 'no consumer multiplies the raw constant any more');
  assert(/const _s = _mouseSensNow\(false\);/.test(src), 'the pointer-lock look path asks it');
  assert(/const sens = _mouseSensNow\(ads\);/.test(src), '...and so does the aim path, with the ADS state');
}
{ // NO TDZ. The initialiser reads MOUSE_SENS_MIN inside a try/catch, so a constant declared after it
  // would throw a ReferenceError that its own catch swallowed — silently discarding every saved
  // sensitivity, invisibly. That is build 1127's trap verbatim, and it was live in the first draft.
  const a = src.indexOf('const MOUSE_SENS_MIN'), b = src.indexOf('let mouseSens = 1');
  assert(a > 0 && b > 0 && a < b, 'the bounds are declared BEFORE the initialiser that reads them');
}
{ // hostile / absent storage cannot break the look
  const clampers = src.match(/Math\.max\(MOUSE_SENS_MIN, Math\.min\(MOUSE_SENS_MAX, _ms\)\)/g) || [];
  eq(clampers.length, 1, 'the stored value is clamped on the way in');
  assert(/if\(isFinite\(_ms\)\)/.test(src), '...and a NaN is ignored rather than stored as the sensitivity');
  assert(/mouseSens=Math\.max\(MOUSE_SENS_MIN,Math\.min\(MOUSE_SENS_MAX,isFinite\(v\)\?v:1\)\)/.test(src),
    '...and clamped again at the slider, so neither path can set an unusable value');
}
{ // it is reachable, and it persists per device
  assert(/id="msSensRng"/.test(html), 'the slider is in the pause menu');
  assert(/id="msAimMatchCb"/.test(html), '...with the zoom-match toggle beside it');
  assert(/breach_mouse_sens/.test(src) && /breach_mouse_aimmatch/.test(src),
    'both persist — a mouse is a property of the device, not of the level');
  assert(/mr\.oninput=/.test(src), 'dragging it takes effect immediately (no apply button)');
  assert(/mv\.textContent=mouseSens\.toFixed\(2\)/.test(src), '...and the number is shown, so it can be reproduced');
}

done('build 1281: mouse sensitivity — a multiplier that is byte-identical to the shipped tuning at 1.0, applied through ONE derivation both mouse consumers ask, with an optional zoom-matched aim proven to give the same on-screen arc per mouse-inch aimed or not (the audit measured the shipped ratio ~28% off a 2.34x zoom), clamped at both entry points, and with the TDZ that would have silently discarded every saved value pinned against recurrence');
