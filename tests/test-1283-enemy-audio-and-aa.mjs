import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1283: enemies make sound. Across all 85 SFX call sites they made sound in exactly THREE — a ranged
// shot (twice) and death. So build 627's 320 ms melee wind-up and the charger's 520 ms lunge tell, the two
// mechanics that exist SPECIFICALLY to be reacted to, were purely visual, and a brute closing from behind
// you was silent. The panner and distance falloff already existed (build 1208); nothing used them.
//
// build 1284: the DoF path was getting neither MSAA nor FXAA.

// ---------------------------------------------------------------- the sounds exist and are positional
{
  const sfx = src.slice(src.indexOf('const SFX = {'), src.indexOf('\n};', src.indexOf('const SFX = {')));
  for (const name of ['meleeWind', 'lungeWind', 'meleeSwing', 'enemyHurt'])
    assert(new RegExp('\\b' + name + '\\(at\\)\\{').test(sfx), 'SFX.' + name + ' exists and takes a position');
  // EVERY tone/noise inside them passes `at` — a cue with no position is useless for something behind you
  for (const name of ['meleeWind', 'lungeWind', 'meleeSwing', 'enemyHurt']) {
    const i = sfx.indexOf(name + '(at){');
    const body = sfx.slice(i, sfx.indexOf('},', i));
    const calls = body.match(/(?:tone|noise)\(\{[^}]*\}/g) || [];
    assert(calls.length > 0, name + ' actually makes a sound');
    for (const c of calls) assert(/\bat\b/.test(c), name + ' passes the position to every layer: ' + c.slice(0, 60));
  }
  // the two telegraphs RISE — a rising tell reads as "about to happen" without needing volume
  for (const name of ['meleeWind', 'lungeWind']) {
    const i = sfx.indexOf(name + '(at){');
    const body = sfx.slice(i, sfx.indexOf('},', i));
    const m = body.match(/freq:(\d+)[^}]*slideTo:(\d+)/);
    assert(m && +m[2] > +m[1], name + ' rises in pitch (' + (m ? m[1] + '->' + m[2] : '?') + ')');
  }
  // ...and the swing does not, because it is an impact rather than an anticipation
  const sw = sfx.slice(sfx.indexOf('meleeSwing(at){'));
  const m2 = sw.slice(0, sw.indexOf('},')).match(/freq:(\d+)[^}]*slideTo:(\d+)/);
  assert(m2 && +m2[2] < +m2[1], 'meleeSwing FALLS — it is the hit, not the warning');
}

// ---------------------------------------------------------------- they fire at the right moments
{
  assert(/en\._windupT = nowMs \+ ENEMY_MELEE_WINDUP_MS;[\s\S]{0,200}?SFX\.meleeWind\(en\.mesh\.position\)/.test(src),
    'the melee tell sounds when the wind-up STARTS — that is what makes the 320ms dodgeable');
  assert(/SFX\.lungeWind\(en\.mesh\.position\)[\s\S]{0,200}?en\._lungeWind = nowMs \+ \(en\.lungeWind\|\|520\)/.test(src),
    'the charger tell sounds when its 520ms wind-up starts');
  assert(/if\(en\._windupT && nowMs >= en\._windupT\)\{[\s\S]{0,160}?SFX\.meleeSwing\(en\.mesh\.position\)/.test(src),
    'the swing sounds when the wind-up completes, hit or miss');
  const eh = extractFunction('enemyHurt');
  assert(/SFX\.enemyHurt\(en\.mesh\.position\)/.test(eh), 'a wounded enemy grunts');
  assert(eh.indexOf('killEnemy') < eh.indexOf('SFX.enemyHurt'),
    '...but a killed one does not — killEnemy already plays its own death sound (752)');
}
{ // every call is guarded, so a missing SFX table can never break the AI loop
  for (const m of src.match(/SFX\.(meleeWind|lungeWind|meleeSwing|enemyHurt)\(/g) || []) {
    const i = src.indexOf(m);
    const before = src.slice(Math.max(0, i - 90), i);
    assert(/typeof SFX!=='undefined' && SFX\.\w+/.test(before), 'guarded call site for ' + m);
  }
  eq((src.match(/SFX\.meleeWind\(/g) || []).length, 1, 'the melee tell has exactly one call site');
  eq((src.match(/SFX\.lungeWind\(/g) || []).length, 1, '...and so does the lunge tell');
}
{ // footsteps were DEFERRED here and DELIVERED in build 1315 — the deferral's worry shaped the design
  assert(/Build 1283 DEFERRED the footfall/.test(src),
    'the deferral is still recorded, now with what became of it');
  assert(/DELIVERED in build 1315, and the deferral's worry is what shaped it/.test(src),
    '...and the density worry is named as the thing that produced 1315’s range gate, budget and near-field exemption');
  assert(/enemyStep\(at, heavy\)/.test(src), 'the sound exists now, and takes a position');
}

// ---------------------------------------------------------------- build 1284: the antialiasing gate
{
  // The DoF path rasterises into _dofRT — single-sampled, because r149 will not attach a depth texture to
  // a multisampled target — then blits into _postRT, which still DECLARES samples:4 at the top rung. So
  // the old gate read "MSAA is in effect" and skipped FXAA while MSAA had never touched the pixels.
  assert(/const _msaaThisFrame = \(_postRT\.samples\|\|0\) > 0 && !dofEnabled;/.test(src),
    'the gate asks whether THIS FRAME was multisampled, not what the target declares');
  assert(/const _fx = _matFXAA && !_msaaThisFrame;/.test(src), '...and FXAA runs whenever it was not');
  assert(!/const _fx = _matFXAA && \(_postRT\.samples\|\|0\) === 0;/.test(src), 'the old test is gone');

  const gate = (samples, dof, hasFxaa) => {
    const f = new Function('_postRT', 'dofEnabled', '_matFXAA', [
      'const _msaaThisFrame = (_postRT.samples||0) > 0 && !dofEnabled;',
      'return !!(_matFXAA && !_msaaThisFrame);',
    ].join('\n'));
    return f({ samples }, dof, hasFxaa);
  };
  eq(gate(4, false, true), false, 'top rung, no DoF: MSAA really is in effect, so FXAA stays off (build 1126)');
  eq(gate(4, true, true), true, 'THE FIX: top rung WITH DoF — the pixels were never multisampled, so FXAA runs');
  eq(gate(0, false, true), true, 'a lower rung has no MSAA, so FXAA runs as before');
  eq(gate(0, true, true), true, '...and so does a lower rung with DoF');
  eq(gate(4, true, false), false, 'and none of it applies if the FXAA material failed to build');
  // the DoF path really does render into its own single-sampled target — the premise of the whole fix
  assert(/if\(dofEnabled && ensureDof\(\)\)\{ _runDofTo\(scn, cam, _postRT\); \}/.test(src),
    'DoF renders the scene through _runDofTo into _postRT rather than letting the MSAA path draw it');
  assert(/_dofRT  = mkRT\(true\);    \/\/ scene color \+ depth/.test(src),
    '...and _dofRT is the depth-carrying target r149 cannot multisample');
}

done('build 1283: the enemy telegraphs are audible — a rising positional tell at the start of the 320ms melee wind-up and the 520ms charger lunge, a falling impact when the swing lands, and a hurt grunt so shooting into the dark tells you both that you connected and where; every layer carries its position, every call site is guarded, and the continuous footstep cue is deferred with its reason rather than guessed. Plus build 1284: DoF-on at the top rung was getting neither MSAA nor FXAA, because the gate asked what the target DECLARED rather than what had actually touched the pixels');
