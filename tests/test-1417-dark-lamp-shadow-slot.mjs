// build 1417: a lamp a signal switched OFF does not spend a shadow slot.
//
// Build 1414 recorded this as open work and deliberately did not change it, because it is not a property
// of point lights — it is build 1132's shipped ranking, and it has applied to every signal-controlled SPOT
// since that build:
//
//     const L = list[i].userData.light, on = i < n && list[i].userData.lon !== false;
//
// `i` is the RANK. A dark lamp occupied its place in the budget and resolved to "off", producing no shadow
// and denying the slot to a lit lamp behind it. Measured on four lamps in a line at a budget of two
// (tools/probe/shadow-slot-dark.mjs), with the all-lit case as the control at both ends:
//
//     all lit          lit+SHADOW  lit+SHADOW  lit  lit    -> 2 casting
//     nearest two off  dark  dark  lit  lit                -> 0 casting   <- two lit lamps, no shadows
//     back on          lit+SHADOW  lit+SHADOW  lit  lit    -> 2 casting
//
// So a corridor of switchable lamps went completely shadowless whenever the switch nearest the player
// happened to be off.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the budget, executed
const mkBudget = (lightModels, cams) => {
  const camera = { position: { x: 0, y: 0, z: 0 } };
  const _lp = { x: 0, y: 0, z: 0, distanceToSquared(p) {
    const dx = this.x - p.x, dy = this.y - p.y, dz = this.z - p.z; return dx * dx + dy * dy + dz * dz; } };
  let dirtied = 0;
  const fn = new Function('lightModels', 'camera', '_lp', '_prStepI', 'IS_COARSE', '_dirtyShadows',
    'let _shadowLightT = 0;' +
    extractFunction('_maxShadowLights') + ';' + extractFunction('_maxPointShadows') + ';' +
    extractFunction('updateShadowLightBudget') + '; return updateShadowLightBudget;'
  )(lightModels, camera, _lp, 0, false, () => { dirtied++; });
  return { run: (dt) => fn(dt), dirtied: () => dirtied };
};
const lamp = (type, dist, lit) => ({
  userData: { ltype: type, wantShadow: true, lon: lit !== false, light: { castShadow: false } },
  getWorldPosition(v) { v.x = dist; v.y = 0; v.z = 0; return v; }
});
const casting = (l) => l.filter(x => x.userData.light.castShadow).length;

{
  // POINT lamps, budget 2, four in a line nearest-first
  const mk = (pattern) => {
    const list = pattern.map((lit, i) => lamp('point', i + 1, !!lit));
    mkBudget(list).run(1);
    return list;
  };

  // the control first, or nothing below it means anything
  eq(casting(mk([1, 1, 1, 1])), 2, 'THE CONTROL: four lit lamps spend the whole budget');

  {
    const l = mk([0, 0, 1, 1]);
    eq(casting(l), 2, 'darkening the two NEAREST does not cost the budget — this is the defect, and it ' +
                      'measured 0 before');
    assert(!l[0].userData.light.castShadow && !l[1].userData.light.castShadow,
      '...the dark ones still never cast (build 699\'s rule, untouched)');
    assert(l[2].userData.light.castShadow && l[3].userData.light.castShadow,
      '...and the lit lamps behind them inherit the freed slots');
  }
  {
    // the pathological case: every lamp but the last one dark
    const l = mk([0, 0, 0, 1]);
    eq(casting(l), 1, 'one lit lamp behind three dark ones still casts');
    assert(l[3].userData.light.castShadow, '...and it is the lit one');
  }
  {
    eq(casting(mk([0, 0, 0, 0])), 0, 'and an all-dark corridor casts nothing, which is correct');
  }
  {
    // nearest-first is preserved AMONG THE LIT: the third and fifth lit lamps do not jump the queue
    const l = mk([1, 0, 1, 1]);
    assert(l[0].userData.light.castShadow && l[2].userData.light.castShadow, 'the two nearest LIT lamps cast');
    assert(!l[3].userData.light.castShadow, '...and the third-nearest lit one does not — ranking survives');
  }
}

{
  // SPOTS take the same path and the same fix, at their own cap of four
  const list = [0, 0, 1, 1, 1, 1].map((lit, i) => lamp('spot', i + 1, !!lit));
  mkBudget(list).run(1);
  eq(casting(list), 4, 'a spot corridor keeps its full budget too — the defect was never point-specific, ' +
                       'which is why build 1414 left it for its own build');
}

{
  // and the two kinds still do not share a budget (build 1414)
  const list = [];
  for (let i = 0; i < 6; i++) list.push(lamp('spot', i + 1, true));
  for (let i = 0; i < 6; i++) list.push(lamp('point', i + 1, true));
  mkBudget(list).run(1);
  eq(casting(list.filter(x => x.userData.ltype === 'spot')), 4, 'spots keep their four...');
  eq(casting(list.filter(x => x.userData.ltype === 'point')), 2, '...and points their two');
}

// ---------------------------------------------------------------- the count is steadier, which is the
// second half of the argument: it is NUM_POINT_LIGHT_SHADOWS, a #define, and build 1414 measured one
// change to it at 11 recompiled programs in a single frame.
{
  const patterns = [[1,1,1,1],[0,1,1,1],[0,0,1,1],[1,0,0,1],[0,0,0,1],[1,1,0,0],[0,1,0,1]];
  const totals = patterns.map(p => {
    const l = p.map((lit, i) => lamp('point', i + 1, !!lit));
    mkBudget(l).run(1);
    return casting(l);
  });
  const distinct = new Set(totals).size;
  eq(totals.filter(t => t === 0).length, 0,
    'across seven on/off patterns, none that contains a lit lamp comes out shadowless — the creator-visible ' +
    'form of the defect (' + JSON.stringify(totals) + ')');
  assert(distinct <= 2,
    'and the caster COUNT barely moves across them, so a player walking a corridor of switches is not ' +
    'recompiling every material each time one flips (' + JSON.stringify(totals) + ' -> ' + distinct + ')');
}

// ---------------------------------------------------------------- the rest of the budget is untouched
{
  const fn = extractFunction('updateShadowLightBudget');
  assert(/_shadowLightT \+= \(dt\|\|0\); if\(_shadowLightT < 0\.33\) return;/.test(fn),
    're-ranked three times a second, not per frame (build 1132)');
  assert(/list\.sort\(\(a,b\)=>a\._sd - b\._sd\);/.test(fn), 'nearest to the camera still win');
  assert(/if\(L\.castShadow !== on\)\{ L\.castShadow = on; changed = true; \}/.test(fn),
    '...and it still only writes on a real change');
  assert(/const cap = _maxShadowLights\(\), capPt = _maxPointShadows\(\);/.test(fn),
    '...with build 1414\'s two separate caps');
  // the rank counter must advance ONLY for a light that actually got a slot, or the fix is a no-op
  assert(/let k = 0;/.test(fn) && /if\(on\) k\+\+;/.test(fn),
    'and the slot counter advances only when a slot was actually spent — the whole of the change');
  assert(!/on = i < (?:n|cap|capPt)/.test(fn),
    '...so the cap is no longer compared against the RANK, which is what let a dark lamp hold a slot');
}

done('build 1417: a switched-off lamp no longer denies its shadow slot to a lit one behind it');
