// build 1447 — the game finally has haptics.
//
// Greped `vibrat|hapticActuators|vibrationActuator` across the engine: the only two hits were PROSE about
// enemy separation. So there was no rumble of any kind — on a game that ships a full gamepad prefs panel
// and a touch layout editor, which is the same "it clearly intends those inputs to be first-class"
// argument build 1316 made for the aim assist.
//
// It rides `addShake`, which is already the ONE chokepoint for "the world just jolted": build 1313 routed
// blasts, hits, kills, car impacts, the melee thump and every weapon's fire through it precisely so a
// single scale could cover them. So every jolt-worthy event gets haptics from one call site, including the
// ones nobody has written yet, and the amount is already a magnitude.
import { gameSource, html, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';

const src = gameSource();
const GAP = +extractConst('RUMBLE_GAP', src);
eq(GAP, 40, 'lifted the real coalescing window from source');

/* ---- EXECUTED: the whole decision, against a fake pad --------------------------------------------- */
const run = (calls, w = {}) => {
  const out = { effects: [], pulses: [], vibrates: [] };
  const fn = new Function('CALLS', 'W', 'OUT', `
    let now = 0;
    const performance = { now: () => now };
    const a11y = { rumble: (W.pref == null ? 1 : W.pref), shake: 1 };
    const padIndex = W.padIndex == null ? 0 : W.padIndex;
    const isTouch = !!W.touch;
    const pad = W.noPad ? null : {
      vibrationActuator: W.legacy ? null : {
        playEffect: (kind, o) => { OUT.effects.push({ kind, ...o }); return W.reject ? Promise.reject(new Error('nope')) : Promise.resolve(); },
      },
      hapticActuators: W.legacy ? [{ pulse: (v, ms) => { OUT.pulses.push({ v, ms }); return Promise.resolve(); } }] : null,
    };
    const navigator = {
      getGamepads: W.noApi ? undefined : () => (pad ? [pad] : []),
      vibrate: (ms) => { OUT.vibrates.push(ms); return true; },
    };
    ${extractConst('RUMBLE_GAP', src) ? 'const RUMBLE_GAP = ' + GAP + ';' : ''}
    let _rumbleAt = -1e9, _rumbleLast = 0;
    ${extractFunction('_rumble', src)}
    for(const c of CALLS){ now = c.t; _rumble(c.a); }
    return null;
  `);
  fn(calls, w, out);
  return out;
};

{
  const r = run([{ t: 0, a: 0.26 }]);           // a shotgun
  eq(r.effects.length, 1, 'a jolt rumbles the pad');
  eq(r.effects[0].kind, 'dual-rumble', '...through the modern actuator');
  near(r.effects[0].strongMagnitude, 0.26, 1e-9, 'the low body tracks the jolt');
  near(r.effects[0].weakMagnitude, 0.52, 1e-9, '...and the buzz is doubled, so a gunshot reads as a tick');
  eq(r.effects[0].duration, Math.round(50 + 0.26 * 220), 'duration tracks amplitude, as the shake decay does');
  eq(r.vibrates.length, 0, 'and a desktop session does not try to vibrate a phone');
}
{
  const big = run([{ t: 0, a: 1 }]).effects[0];
  const small = run([{ t: 0, a: 0.075 }]).effects[0];
  assert(big.duration > small.duration, 'a blast rumbles longer than an SMG round');
  assert(big.strongMagnitude > small.strongMagnitude, '...and harder');
  eq(big.weakMagnitude, 1, 'the doubled buzz still clamps at 1');
}
{
  // the coalesce: a small jolt inside the window must not cut a big one short, a bigger one may replace it
  const seq = run([{ t: 0, a: 0.8 }, { t: 10, a: 0.1 }, { t: 20, a: 0.95 }, { t: 500, a: 0.1 }]);
  eq(seq.effects.length, 3, 'the small jolt inside the window is dropped; the bigger one and a later one play');
  near(seq.effects[1].strongMagnitude, 0.95, 1e-9, '...and the replacement is the bigger one');
  near(seq.effects[2].strongMagnitude, 0.1, 1e-9, '...while a jolt past the window always plays');
}
{
  eq(run([{ t: 0, a: 0.26 }], { pref: 0 }).effects.length, 0, 'the slider at 0 turns it fully off');
  eq(run([{ t: 0, a: 0.26 }], { pref: 0 }).vibrates.length, 0, '...on touch too');
  const half = run([{ t: 0, a: 0.8 }], { pref: 0.5 }).effects[0];
  near(half.strongMagnitude, 0.4, 1e-9, 'and it scales the strength');
  assert(half.duration < Math.round(50 + 0.8 * 220), '...and the duration with it');
}
{
  eq(run([{ t: 0, a: 0.003 }]).effects.length, 0, 'a hair of trauma is not a jolt and is ignored');
  eq(run([{ t: 0, a: 0 }]).effects.length, 0, '...nor is nothing at all');
}
{
  const t = run([{ t: 0, a: 0.5 }], { touch: true });
  eq(t.vibrates.length, 1, 'a touch session vibrates the phone');
  assert(t.vibrates[0] > 0 && t.vibrates[0] < 60,
    'briefly — a long buzz on a handheld reads as a fault rather than as feedback, got ' + t.vibrates[0]);
  const bigger = run([{ t: 0, a: 1 }], { touch: true }).vibrates[0];
  assert(bigger > t.vibrates[0], 'and the duration carries the magnitude, since a phone has no strength channel');
}
{
  const l = run([{ t: 0, a: 0.5 }], { legacy: true });
  eq(l.pulses.length, 1, 'an older pad falls back to hapticActuators.pulse');
  near(l.pulses[0].v, 0.5, 1e-9, '...with the same magnitude');
  eq(l.effects.length, 0, '...and does not also try the modern path');
}
{
  // every way this can be absent must be silent — a comfort setting may never take the frame loop down
  eq(run([{ t: 0, a: 0.5 }], { noPad: true }).effects.length, 0, 'no pad connected: nothing, no throw');
  eq(run([{ t: 0, a: 0.5 }], { noApi: true }).effects.length, 0, 'no gamepad API at all: nothing, no throw');
  const rej = run([{ t: 0, a: 0.5 }], { reject: true });
  eq(rej.effects.length, 1, 'a rejecting actuator still issued the effect');
  // an uncaught rejection would reach build 1330's overlay and put a red error bar on screen
  assert(/if\(p && p\.catch\) p\.catch\(\(\)=>\{\}\);/.test(extractFunction('_rumble', src)),
    '...and its promise is caught, or build 1330’s overlay shows the player a red bar');
}
{
  const idx = run([{ t: 0, a: 0.5 }], { padIndex: null });
  eq(idx.effects.length, 1, 'with no remembered pad index it still finds the first pad');
}

/* ---- it reads the RAW amount, not the camera-shake scale ------------------------------------------- */
// Two different senses. A player who turned the camera down because motion makes them ill has not asked
// for their controller to go quiet, and a player who dislikes rumble has not asked to lose the camera.
const add = extractFunction('addShake', src);
assert(/_rumble\(amt\)/.test(add), 'addShake rumbles');
assert(!/_rumble\(amt \* /.test(add) && !/a11y\.shake[\s\S]*_rumble/.test(add.replace(/shake = [^;]+;/, '')),
  '...with the amount it was GIVEN, not the one scaled by the camera-shake slider');
{
  // executed: with camera shake at 0 the rumble still fires at full strength
  const out = { effects: [] };
  new Function('OUT', `
    let shake = 0, now = 0;
    const performance = { now: () => now };
    const a11y = { shake: 0, rumble: 1 };
    const padIndex = 0;
    const isTouch = false;
    const navigator = { getGamepads: () => [{ vibrationActuator: {
      playEffect: (k, o) => { OUT.effects.push(o); return Promise.resolve(); } } }] };
    const RUMBLE_GAP = ${GAP};
    let _rumbleAt = -1e9, _rumbleLast = 0;
    ${extractFunction('_rumble', src)}
    ${add}
    addShake(0.5);
    OUT.shake = shake;
  `)(out);
  eq(out.shake, 0, 'camera shake at 0 moves the camera not at all (build 1313)');
  eq(out.effects.length, 1, '...and the pad still rumbles');
  near(out.effects[0].strongMagnitude, 0.5, 1e-9, '...at full strength');
}

/* ---- one chokepoint, and the pref rides the blob that already exists ------------------------------- */
eq((src.match(/_rumble\(/g) || []).length, 2, 'defined once and called once — from the one jolt chokepoint');
assert(/const A11Y_DEFAULT = \{ shake:1, flash:1, blur:1, sway:1, hitstop:1, rumble:1 \};/.test(src),
  'the pref lives in the a11y blob, which gives it the 0..1 clamp, persistence and Restore defaults free');
assert(/\['rumble','a11yRumble'\]/.test(src), 'and it is in the row table, so the slider wires itself');
assert(/id="a11yRumble"[^>]*min="0" max="100" step="5"/.test(html),
  'the slider is in the markup beside the other "how hard does this hit me" rows');
assert(html.indexOf('id="a11yHitstop"') < html.indexOf('id="a11yRumble"'),
  '...in the Motion & comfort panel, because that is the question it answers');

/* ---- a TDZ that typeof cannot guard ---------------------------------------------------------------- */
// `a11y` is a `let` declared thousands of lines below addShake, and `typeof` THROWS for an uninitialised
// binding — the trap builds 1127, 1331, 1350, 1383 and 1411 each lost something to.
assert(/let pref = 1; try\{ pref = a11y\.rumble; \}catch\(e\)\{\}/.test(extractFunction('_rumble', src)),
  'the pref read is inside a try, which is what actually guards a temporal dead zone');
{
  // executed IN a real dead zone: the read must not throw
  let threw = null;
  try {
    new Function(`
      const RUMBLE_GAP = ${GAP};
      let _rumbleAt = -1e9, _rumbleLast = 0;
      const performance = { now: () => 0 };
      const navigator = {};
      const isTouch = false;
      ${extractFunction('_rumble', src)}
      _rumble(0.5);          // a11y is in its dead zone right here
      let a11y = { rumble: 1 };
    `)();
  } catch (e) { threw = e.message; }
  eq(threw, null, 'calling it inside the dead zone does not throw');
}

done('build 1447: every jolt the engine already knows about — a shot, a hit taken, a blast, a kill, a car ' +
     'impact — now reaches the pad and the phone, from the one chokepoint that already collected them, with ' +
     'its own slider because a player who cannot take camera motion has not asked for a silent controller');
