// build 1411 — does a SAVED level containing a live sign boot?
//
// `loadHostedProps()` is called bare at module level and builds the saved level's props during boot
// (build 1331's whole entry). A sign whose text carries `{coins@}` resolves through `_hwVarKey`, which
// reads `NET` — and `const NET` is declared ~5,700 lines BELOW that boot call. `typeof` does NOT guard a
// temporal dead zone, which is this file's most repeated trap (1127, 1331, 1350, 1383).
//
// So: seed a saved level with a live sign into localStorage BEFORE the game boots, and see whether it
// comes up. A static sign is the control — it never reaches the interpolator, so if only the live one
// fails, the fault is the resolver and not the sign.
import { withGame } from './driver.mjs';

const out = [];
const P = (ok, what, detail) => { out.push({ ok, what, detail }); };

// The level is written by an init script, so it is in storage before the game script evaluates.
const LEVEL = {
  v: 1,
  props: [
    { src: 'sign', t: [30, 3, -30, 0, 0, 0, 4, 2, 1], sgn: { text: 'Score {coins@}', size: 64, color: '#eafff7', bg: '#0b1418', bga: 0.85, align: 'center' } },
    { src: 'sign', t: [36, 3, -30, 0, 0, 0, 4, 2, 1], sgn: { text: 'RANGE', size: 64, color: '#eafff7', bg: '#0b1418', bga: 0.85, align: 'center' } },
  ],
};

await withGame(async (probe, page) => {
  const r = await probe(`(function(){
    const R = {};
    R.props = propModels.length;
    const signs = propModels.filter(o=>o && o.userData && o.userData.sign);
    R.signs = signs.length;
    R.texts = signs.map(o=>o.userData.sign.text);
    R.drawn = signs.map(o=>!!(o.material && o.material.map));
    R.keys  = signs.map(o=>String(o.userData._signKey||'').split('|')[0]);
    return R;
  })()`);

  P(r.signs === 2, 'both signs from the saved level are in the scene', r.signs);
  P(String(r.texts) === 'Score {coins@},RANGE', '...carrying their authored text', String(r.texts));
  P(r.drawn.every(Boolean), '...and both were DRAWN during the load, not left blank', String(r.drawn));
  P(r.keys[0] === 'Score 0',
    'the LIVE one resolved its variable at boot — which means _hwVarKey read NET without throwing',
    String(r.keys));
}, { settleMs: 2500, savedLevel: LEVEL });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
