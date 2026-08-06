// Does a lamp a signal switched OFF still hold a shadow slot?
//
// Recorded as open work by build 1414 and left alone there deliberately, because it is not a property of
// point lights — it is build 1132's shipped ranking, and it has applied to every signal-controlled SPOT
// since that build:
//
//     const L = list[i].userData.light, on = i < n && list[i].userData.lon !== false;
//
// `i` is the rank. A dark lamp occupies its rank and simply resolves to `on = false`, so it spends one of
// the budget's slots on producing no shadow. A creator with a corridor of switchable lamps and a budget of
// two gets NO shadows at all whenever the two nearest happen to be off — while lit lamps a few metres
// further along cast nothing.
//
// Measured with a control at both ends: all-lit (the ordinary case, which must not move) and the same set
// with the nearest ones darkened. If the all-lit row does not read the full budget, the instrument is
// wrong and the darkened row means nothing.
import { withGame } from './driver.mjs';

const out = [];
const P = (ok, what, detail) => { out.push({ ok, what, detail }); };

await withGame(async (probe) => {
  const r = await probe(`
  (function(){
    const R = {}, made = [];
    paused = true; _tabHidden = true; _adaptOn = false; _prStepI = 0;
    /* far outside ARENA, so nothing the stock level placed competes for a rank (build 1323) */
    const X = 300, Z = 300;
    /* Four lamps in a line receding from the camera, nearest first. buildLight is the shipped path and
       records wantShadow; the budget is what decides which of them actually cast. */
    for(let i = 0; i < 4; i++){
      made.push(buildLight({ type:'point', color:0xffffff, intensity:6, distance:20,
                             shadow:true, t:[X, 3, Z + i*6] }));
    }
    camera.position.set(X, 3, Z - 4); camera.updateMatrixWorld(true);

    function rank(){
      /* the budget re-ranks on its own 0.33 s interval; hand it a big dt so one call is one decision */
      _shadowLightT = 0;
      updateShadowLightBudget(1);
      return made.map(g => (g.userData.lon !== false ? 'lit' : 'dark') +
                           (g.userData.light.castShadow ? '+SHADOW' : ''));
    }
    function litCasters(){ let n = 0;
      for(const g of made) if(g.userData.lon !== false && g.userData.light.castShadow) n++;
      return n; }
    function casters(){ let n = 0; for(const g of made) if(g.userData.light.castShadow) n++; return n; }

    R.cap = _maxPointShadows();

    /* --- the CONTROL: every lamp lit. This is the ordinary case and must read the full budget. --- */
    for(const g of made) g.userData.lon = true;
    R.allLit = rank(); R.allLitCasters = casters();

    /* --- a signal darkens the two NEAREST --- */
    made[0].userData.lon = false; made[1].userData.lon = false;
    R.twoDark = rank(); R.twoDarkLitCasters = litCasters(); R.twoDarkAny = casters();

    /* --- and back on again, so the state is recoverable rather than one-way --- */
    made[0].userData.lon = true; made[1].userData.lon = true;
    R.backOn = rank(); R.backOnCasters = casters();

    /* --- and the second half: how often the CASTER COUNT moves ---------------------------------
       The count is NUM_POINT_LIGHT_SHADOWS, a #define — build 1414 measured a change to it at 11
       recompiled programs in one frame. Walk a switch pattern and count how many distinct totals the
       budget produces. Fewer distinct totals = fewer recompiles for the same player experience. */
    const patterns = [[1,1,1,1],[0,1,1,1],[0,0,1,1],[1,0,0,1],[0,0,0,1],[1,1,0,0],[0,1,0,1]];
    const totals = [];
    for(const pat of patterns){
      for(let i=0;i<4;i++) made[i].userData.lon = !!pat[i];
      rank(); totals.push(casters());
    }
    R.totals = totals;
    R.distinct = [...new Set(totals)].length;
    R.shadowless = totals.filter(function(t){ return t === 0; }).length;
    /* how many of those patterns had at least one lit lamp — i.e. how many SHOULD have cast */
    R.hadLit = patterns.filter(function(p){ return p.some(function(x){ return x; }); }).length;

    for(const g of made){ g.userData.light.castShadow = false;
      const i = lightModels.indexOf(g); if(i >= 0) lightModels.splice(i, 1); scene.remove(g); }
    renderer.shadowMap.needsUpdate = true;
    paused = false; _tabHidden = false;
    R.leftOver = made.filter(g => lightModels.indexOf(g) >= 0).length;
    return R;
  })()`);

  console.log('        budget: ' + r.cap + ' point casters');
  console.log('        all lit        ' + r.allLit.join('  ') + '   -> ' + r.allLitCasters + ' casting');
  console.log('        two darkened   ' + r.twoDark.join('  ') + '   -> ' + r.twoDarkLitCasters + ' LIT casting');
  console.log('        back on        ' + r.backOn.join('  ') + '   -> ' + r.backOnCasters + ' casting\n');

  P(r.allLitCasters === r.cap,
    'THE CONTROL: with every lamp lit, the budget is fully spent — so the row below is about the darkening ' +
    'and not about the instrument',
    r.allLitCasters + ' of ' + r.cap);

  P(r.twoDarkAny === r.twoDarkLitCasters,
    'a darkened lamp never casts, which is build 699\'s rule and is not in question here',
    r.twoDarkAny + ' casting, ' + r.twoDarkLitCasters + ' of them lit');

  P(r.twoDarkLitCasters === r.cap,
    'and darkening the two NEAREST lamps does not cost the budget: the lit lamps further along inherit ' +
    'the freed slots, instead of a corridor going shadowless because the switch nearest you is off',
    r.twoDarkLitCasters + ' of ' + r.cap);

  P(r.backOnCasters === r.cap, 'switching them back on restores the full budget', r.backOnCasters);

  console.log('        switch patterns -> caster totals ' + JSON.stringify(r.totals) +
              '   distinct ' + r.distinct + ', shadowless ' + r.shadowless + ' of ' + r.hadLit +
              ' patterns that had a lit lamp\n');
  P(r.shadowless === 0,
    'and across seven on/off patterns, NONE that contains a lit lamp comes out shadowless — which is the ' +
    'creator-visible form of the defect',
    r.shadowless + ' of ' + r.hadLit);
  P(r.distinct <= 2,
    '...while the caster COUNT barely moves across those patterns. That is not a side note: the count is ' +
    'NUM_POINT_LIGHT_SHADOWS, a #define, and build 1414 measured one change to it at 11 recompiled ' +
    'programs in a frame — so a steadier count is fewer mid-play recompiles',
    JSON.stringify(r.totals) + ' -> ' + r.distinct + ' distinct');
  P(r.leftOver === 0, 'teardown removed every fixture', r.leftOver);
}, { settleMs: 3000 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
