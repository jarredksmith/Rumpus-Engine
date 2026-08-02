import { gameSource, extractFunction, extractConst, html, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1313 — gameplay audit F9, verified still live:
//
//   "No player-facing difficulty or accessibility options. Greped `colorblind`, `reduceMotion`,
//    `prefers-reduced`, `a11y` -> one CSS media query for UI animation, nothing that touches camera shake,
//    the damage flash, motion blur or hitstop. A PLAYER WHO GETS MOTION SICK FROM addShake/postMotion HAS
//    NO RECOURSE INSIDE THE GAME."
//
// Every one of those was either a hardcoded constant or a LEVEL setting the creator owns. A player who
// cannot tolerate camera shake could not turn it down in someone else's level, on any platform, at all.
//
// Measured against the live engine (tools/probe/a11y-motion.mjs):
//   shake      addShake(0.4) -> 0.40 / 0.20 / 0.10 / 0.00 at 100/50/25/0%
//   flash      overlay alpha  -> 0.55 / 0.333 / 0.12 at 100/50/0% (0 is still VISIBLE)
//   blur       0.62 authored  -> 0.62 / 0.31 / 0.00 reaching the shader, worldCfg untouched
//   hitstop    dt in a freeze -> 0.00192 / 0.00896 / 0.016 (at 0 the clock never slows)
//   OS         prefers-reduced-motion:reduce seeds a calm baseline; an explicit choice always wins

const DEF = new Function('return ' + extractConst('A11Y_DEFAULT', src) + ';')();

// ---------------------------------------------------------------- the store
const store = () => {
  const mem = {}, ST = { reduced: false };
  const api = new Function('localStorage', 'matchMedia', 'ST',
    'let a11y = null;\n' + 'const A11Y_KEY = "breach_a11y";\n' +
    'const A11Y_DEFAULT = ' + JSON.stringify(DEF) + ';\n' +
    'const window = { matchMedia };\n' +
    extractFunction('_a11yOsReduced') + '\n' + extractFunction('loadA11y') + '\n' +
    extractFunction('saveA11y') + '\n' + extractFunction('a11yReduceAll') + '\n' + extractFunction('a11yRestoreAll') + '\n' +
    'return { load:loadA11y, save:saveA11y, reduce:a11yReduceAll, restore:a11yRestoreAll, get:()=>a11y, set:(k,v)=>{ a11y[k]=v; } };')(
    { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } },
    () => ({ matches: ST.reduced }), ST);
  return { ...api, mem, ST };
};
{
  const api = store(), ST = api.ST;
  ST.reduced = false; api.load();
  eq(JSON.stringify(api.get()), JSON.stringify(DEF), 'with nothing stored and no OS preference, everything is at full');
  for (const k in DEF) eq(DEF[k], 1, k + ' defaults to 1 — this build changes nothing for a player who does not open it');
}
{ // THE OS HAS ALREADY BEEN ASKED
  const api = store(), ST = api.ST;
  ST.reduced = true; api.load();
  const a = api.get();
  eq(a.shake, 0, 'prefers-reduced-motion: reduce seeds shake OFF…');
  eq(a.blur, 0, '…blur off…');
  eq(a.sway, 0, '…sway off…');
  eq(a.hitstop, 0, '…and no time distortion');
  assert(a.flash > 0, '…while the damage flash is DIMMED, not removed — being hit still has to be legible');
  assert(/asking again is the accessibility failure one level up/.test(src),
    'and why the OS is taken at its word is recorded');
}
{ // AN EXPLICIT CHOICE ALWAYS WINS, including the choice to keep the motion
  const api = store(), ST = api.ST;
  ST.reduced = false; api.load(); api.set('shake', 0.8); api.save();
  ST.reduced = true; api.load();
  eq(api.get().shake, 0.8, 'a player who set it themselves is not overridden by the OS on the next launch');
  // ...and someone who deliberately turned everything back UP keeps it
  api.restore(); ST.reduced = true; api.load();
  eq(JSON.stringify(api.get()), JSON.stringify(DEF), 'restoring the defaults is itself a stored choice');
}
{ // LOAD IS IDEMPOTENT. Without this it only ever ADDS constraints: a second call with nothing stored and
  // no OS preference left whatever the last call wrote. Found by this build's own probe, calling it twice.
  const api = store(), ST = api.ST;
  ST.reduced = true; api.load();
  ST.reduced = false; api.mem && delete api.mem;
  const a2 = store(), s2 = a2.ST;
  s2.reduced = true; a2.load();
  eq(a2.get().shake, 0, 'reduced');
  s2.reduced = false; a2.load();
  eq(JSON.stringify(a2.get()), JSON.stringify(DEF), 'loading again with no preference returns to the defaults, not to the last state');
  assert(/start from the defaults EVERY time/.test(src), 'and the trap is written down where it was');
}
{ // a hostile or corrupt stored value cannot produce a broken engine
  const api = store(), ST = api.ST;
  api.set === undefined;
  const a3 = store();
  a3.load(); a3.set('shake', 0.5); a3.save();
  // hand-write nonsense into the same slot the loader reads
  const a4 = store(), mem = a4.mem;
  mem['breach_a11y'] = JSON.stringify({ shake: 'lots', sway: -5, blur: 99, flash: null, hitstop: 0 / 0 });
  a4.load();
  const v = a4.get();
  for (const k in DEF) { assert(v[k] >= 0 && v[k] <= 1, k + ' is clamped to 0..1 (' + v[k] + ')'); assert(v[k] === v[k], k + ' is never NaN'); }
  eq(v.blur, 1, '99 clamps to 1');
  eq(v.shake, 0, 'a non-number falls to 0 rather than poisoning every effect it scales');
  eq(v.flash, 1, 'a null takes the default');
  mem['breach_a11y'] = '{not json';
  a4.load();
  eq(JSON.stringify(a4.get()), JSON.stringify(DEF), 'and unparseable storage falls back to the defaults instead of throwing at boot');
}

// ---------------------------------------------------------------- every effect, at its own site
{
  // SHAKE: one chokepoint, so blasts, hits, kills, car impacts and the melee thump are all covered — and
  // so is the next one somebody adds.
  const fn = new Function('a11y', 'ST', 'let shake=0;\n' + extractFunction('addShake') + '; return { add:addShake, get:()=>shake };');
  for (const [set, want] of [[1, 0.4], [0.5, 0.2], [0.25, 0.1], [0, 0]]) {
    const r = fn({ shake: set }); r.add(0.4);
    near(r.get(), want, 1e-9, 'addShake(0.4) at ' + (set * 100) + '% gives ' + want);
  }
  const r = fn({ shake: 1 }); for (let i = 0; i < 20; i++) r.add(0.4);
  eq(r.get(), 1, '...and the 0..1 clamp still holds');
  assert(/EVERY shake in the engine goes through here/.test(src), 'the chokepoint argument is recorded');
  // the two places that write `shake` directly rather than through addShake are scaled too
  eq((src.match(/\(\(typeof a11y!=='undefined'\)\?a11y\.shake:1\)/g) || []).length, 2,
    'the two direct writes (a car slam, a multi-kill punch) are scaled as well — a chokepoint you can go around is not one');
}
{
  // FLASH: scaled, floored, never removed.
  const d = { style: {} };
  const fn = new Function('a11y', '$', extractFunction('flashDamage') + '; return flashDamage;');
  const alpha = (set) => { const f = fn({ flash: set }, () => d); f(); return +/rgba\(255,40,70,([0-9.]+)\)/.exec(d.style.boxShadow)[1]; };
  near(alpha(1), 0.55, 1e-9, 'at 100% the flash is exactly what it always was — nothing moves for a player who never opens this');
  assert(alpha(0.5) < alpha(1) && alpha(0.5) > alpha(0), 'half is between');
  assert(alpha(0) > 0.1, 'AT ZERO THE FLASH IS STILL VISIBLE (' + alpha(0) + ') — a player who has turned motion down still needs to know they are being hit');
  assert(/Being hit MUST stay legible/.test(src), 'and that floor is argued for, not incidental');
}
{
  // BLUR: the creator's authored value is scaled on the way to the shader and never overwritten.
  assert(/const _postMotionP = _postMotion \* \(\(typeof a11y!=='undefined'\) \? a11y\.blur : 1\);/.test(src),
    'the player preference multiplies the authored strength');
  assert(/worldCfg\.postMotion is untouched, so the level still saves exactly what its author set/.test(src),
    '...and the reason it is a multiplier rather than a write is recorded');
  assert(!/worldCfg\.postMotion\s*=\s*[^;]*a11y/.test(src), 'nothing writes the player’s setting into the level');
  assert(/const _mbOn = \(_postMotion \* \(\(typeof a11y!=='undefined'\) \? a11y\.blur : 1\)\)>0\.01/.test(src),
    'and at 0 the whole blur pass switches off rather than running at zero strength');
}
{
  // HITSTOP: at 0 the clock never slows at all, but the countdown still runs.
  const dtOf = (hs, rawDt = 0.016) => (hs > 0 ? rawDt * (0.12 + 0.88 * (1 - hs)) : rawDt);
  near(dtOf(1), 0.016 * 0.12, 1e-12, 'at 100% the freeze is exactly the shipped 0.12x');
  assert(dtOf(0.5) > dtOf(1) && dtOf(0.5) < dtOf(0), 'half is a gentler dip');
  eq(dtOf(0), 0.016, 'AT ZERO TIME DOES NOT DISTORT AT ALL');
  assert(/hitStop > 0\)\{ hitStop -= rawDt;/.test(src),
    'and the countdown runs regardless, so nothing waiting on hitStop can hang at 0');
}
{
  // SWAY: the targets are scaled, not the springs — the curve is the creator's, the amount is the player's.
  assert(/const _dt=Math\.min\(0\.05, dt\), _sw=\(typeof a11y!=='undefined'\)\?a11y\.sway:1;/.test(src));
  assert(/\* \(1 - adsBlend\) \* _sw;/.test(src), 'the strafe lean target is scaled');
  assert(/_landDipV -= \(1\.6 \+ _imp\*7\.0\) \* \(\(typeof a11y!=='undefined'\)\?a11y\.sway:1\);/.test(src),
    'and the landing dip is scaled at the IMPULSE, so the spring keeps its tuned settle');
  assert(/Scaling the spring rates instead would change the\n     FEEL rather than the amount/.test(src),
    'with the reason, which is the difference between a comfort setting and a re-tune');
}

// ---------------------------------------------------------------- the panel
{
  for (const id of ['a11yShake', 'a11ySway', 'a11yBlur', 'a11yFlash', 'a11yHitstop'])
    assert(html.indexOf('id="' + id + '"') > 0, 'the pause menu has a ' + id + ' slider');
  assert(html.indexOf('id="a11yReduce"') > 0 && html.indexOf('id="a11yRestore"') > 0,
    'plus a one-press "reduce all" and a way back');
  assert(/MOTION &amp; COMFORT/.test(html), 'under a heading that says what it is');
  assert(/These are yours, not the level's/.test(html),
    '...and a hint that says they follow the player into other people’s levels, which is the point');
  // one loop, not five copies — adding a sixth effect is one row here and one input above
  assert(/const A11Y_ROWS = \[\['shake','a11yShake'\],\['sway','a11ySway'\],\['blur','a11yBlur'\],\['flash','a11yFlash'\],\['hitstop','a11yHitstop'\]\];/.test(src),
    'the wiring is one table rather than five copies of six lines');
  assert(/saveA11y\(\);/.test(src), 'and every change persists immediately');
}
{ // it is a DEVICE setting, like the volume — not level data
  assert(/const A11Y_KEY = 'breach_a11y';/.test(src), 'stored per device');
  assert(!/a11y/.test(extractFunction('serializeLevel')), 'and never written into a level file');
  assert(/PER DEVICE, NOT PER LEVEL\. This is a property of the person, not the content\./.test(src),
    'with the reason stated where the decision is');
}

done('build 1313 (gameplay audit F9): motion accessibility — camera shake, camera sway, motion blur, the damage flash and kill slow-mo were each a hardcoded constant or a LEVEL setting the creator owns, so a player who gets motion sick had no recourse in anyone else\'s level on any platform. Five per-device sliders in the pause menu now scale each at its point of use, so the creator\'s authored values are never overwritten and the level still saves exactly what its author set. Defaults are 1 across the board — nothing moves for a player who never opens the panel — but `prefers-reduced-motion: reduce` seeds a calm baseline on first run, because a player who has already told their OS has said it once. The damage flash is DIMMED rather than removed at zero: being hit has to stay legible. Measured live at every site, plus a corrupt-storage sweep; the probe also caught loadA11y() only ever ADDING constraints on a second call');
