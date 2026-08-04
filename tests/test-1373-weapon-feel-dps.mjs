// build 1373: DPS sanity, per-weapon ADS time, a fire FOV punch, and sustained-fire spread bloom
// (feel review #10/#11/#12).
//
// Four defects in one cluster, all verified in source before fixing: sustained DPS was INVERTED (pistol
// 152.9 the highest in the game, the STARTING rifle the worst automatic at 126.3, sniper 95 one-shotting
// every non-boss body shot including the 90 hp brute); ADS took one global ~164 ms (adsBlend eased at a
// flat dt*14 while drawMs was already per-weapon); firing produced no FOV punch of any kind; and standing
// spread was a CONSTANT, so shot 1 and shot 30 of a mag dump were identically accurate.
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const W  = new Function('return ' + extractConst('WEAPONS', src) + ';')();
const ET = new Function('return ' + extractConst('ENEMY_TYPES', src) + ';')();

// ---------------------------------------------------------------- 1. the DPS table, from the real numbers
{
  const dps = k => W[k].dmg * Math.max(1, W[k].pellets || 0) * 1000 / W[k].fireRate;
  eq(W.rifle.dmg, 15, 'rifle 12 -> 15');
  eq(W.pistol.dmg, 20, 'pistol 26 -> 20');
  eq(W.sniper.dmg, 80, 'sniper 95 -> 80');
  near(dps('rifle'), 157.9, 0.2, 'the starting rifle sustains ~157.9');
  near(dps('pistol'), 117.6, 0.2, '...the pistol ~117.6');
  assert(dps('rifle') > dps('pistol'), 'the starting rifle out-DPSes the pistol sustained (was inverted: 126.3 vs 152.9)');
  assert(dps('rifle') > dps('smg'), '...and the SMG (145.5) — the primary is finally the best automatic');
  // the sniper no longer one-shots the toughest non-boss
  assert(ET.brute.hp > W.sniper.dmg, 'a brute (90 hp) survives a max sniper body shot');
  assert(ET.boss.hp > W.sniper.dmg, '...and the boss obviously does');
  // The charger: base hp is 75, UNDER the new 80 — but the random formula never spawns one before wave 12
  // (build 1213), where the hp ramp puts it at 75*1.48 >= 111. An AUTHORED wave-1 charger still one-shots,
  // which is the creator's call; the engine-owned spawns all survive. Pinned against the REAL ramp literal
  // so a ramp retune re-opens this question loudly instead of silently.
  eq(ET.charger.hp, 75, 'charger base hp is 75 (stated: an authored charger still dies to one sniper round)');
  assert(/1 \+ 0\.04\*Math\.min\(\(typeof wave!=='undefined'\?wave:1\), 25\)/.test(src), 'the 1213 hp ramp is still the shipped formula');
  assert(ET.charger.hp * (1 + 0.04 * 12) > W.sniper.dmg, 'a formula-spawned charger (wave >= 12, ramped hp >= 111) survives the sniper');
  // "Nothing else" — the untouched rows really are untouched
  eq(W.smg.dmg, 8, 'smg damage unchanged'); eq(W.shotgun.dmg, 9, 'shotgun unchanged');
  eq(W.launcher.dmg, 90, 'launcher unchanged'); eq(W.crowbar.dmg, 60, 'crowbar unchanged'); eq(W.hands.dmg, 24, 'fists unchanged');
}

// ---------------------------------------------------------------- 2. adsMs on the stat sheet, boot parity EXECUTED
{
  eq(W.rifle.adsMs, 180, 'rifle 180 ms'); eq(W.pistol.adsMs, 140, 'pistol 140'); eq(W.smg.adsMs, 150, 'smg 150');
  eq(W.shotgun.adsMs, 220, 'shotgun 220'); eq(W.sniper.adsMs, 320, 'sniper 320 — the scope is the slowest raise');
  eq(W.launcher.adsMs, 300, 'launcher 300'); eq(W.crowbar.adsMs, 0, 'melee 0 — no ADS ramp'); eq(W.hands.adsMs, 0, '...fists too');
  const KEYS = new Function('return ' + extractConst('GUN_STAT_KEYS', src) + ';')();
  const LIM = new Function('const BOT_MELEE_REACH_MIN=1.2; return ' + extractConst('GUN_STAT_LIM', src) + ';')();
  assert(KEYS.includes('adsMs'), 'adsMs is on the sheet: serializer diff, three loaders, clamp and editor row all free (1190)');
  eq(LIM.adsMs.join(','), '0,600', 'clamp floor 0, not 80 — melee ships adsMs 0 and a floor above a factory value writes a spurious st diff into every level (1296); the divide guard lives in _adsK');
  assert(/\['adsMs','ADS time ms',10\] \];/.test(src), 'the editor exposes the new stat beside the kick rows');
  // GUN_BASE parity at boot, EXECUTED: normalize -> capture -> factory apply -> the serializer's own diff
  // loop must find NOTHING (1296's rule — a phantom override would otherwise ride into every saved level).
  const capIdx = src.indexOf('const GUN_BASE = {}; for(const _k in WEAPONS){');
  const capTail = '_w.reserve0=_w.reserve; }';
  const capEnd = src.indexOf(capTail, capIdx);
  assert(capIdx > 0 && capEnd > capIdx, 'the GUN_BASE capture block exists');
  const capture = src.slice(capIdx, capEnd + capTail.length);
  const diffs = new Function('WEAPONS', 'GUN_STAT_KEYS', 'GUN_STAT_LIM',
    capture + '\n' + extractFunction('_wepApplyStats', src) +
    '\nfor(const k in WEAPONS) _wepApplyStats(k, null);' +
    '\nconst out = [];' +
    '\nfor(const k in WEAPONS){ for(const s of GUN_STAT_KEYS){ if(WEAPONS[k][s]!=null && GUN_BASE[k] && WEAPONS[k][s]!==GUN_BASE[k][s]) out.push(k+"."+s+": "+GUN_BASE[k][s]+" -> "+WEAPONS[k][s]); } }' +
    '\nreturn out;')(
    new Function('return ' + extractConst('WEAPONS', src) + ';')(), KEYS, LIM);
  eq(diffs.join('; '), '', 'boot parity holds on every key of every weapon, adsMs included — a factory apply produces ZERO serializer diffs');
}

// ---------------------------------------------------------------- 3. per-weapon ADS easing (shape kept)
{
  assert(!/adsBlend \+= \(adsTarget - adsBlend\) \* Math\.min\(1, dt\*14\);/.test(src), 'the global dt*14 is gone from the ADS ease');
  assert(/adsBlend \+= \(adsTarget - adsBlend\) \* Math\.min\(1, dt \* _adsK\(\(WEAPONS\[curWep\]\|\|\{\}\)\.adsMs\)\);/.test(src),
    'the ease divides by the CURRENT weapon’s adsMs through _adsK — same exponential form, per-weapon time constant');
  assert(/if\(Math\.abs\(adsBlend - adsTarget\) < 0\.002\) adsBlend = adsTarget;/.test(src), 'the snap epsilon is untouched — the SHAPE survived');
  const adsK = new Function(extractFunction('_adsK', src) + '\nreturn _adsK;')();
  const t90 = (ms, fps) => { let b = 0, t = 0; const dt = 1 / fps; for (let i = 0; i < 3000 && b < 0.9; i++) { b += (1 - b) * Math.min(1, dt * adsK(ms)); t += dt; } return t * 1000; };
  near(adsK(undefined), 2302.585 / 164, 0.05, 'an ABSENT adsMs falls back to the old global ~164 ms feel (k ~= 14)');
  const r = t90(180, 60);
  assert(r > 135 && r < 207, 'the rifle reaches 90% aimed in ~180 ms at 60 fps (Euler lands within ~15% of the stated time, exactly as the old dt*14 always did)');
  assert(t90(320, 60) > t90(220, 60) && t90(220, 60) > t90(180, 60) && t90(180, 60) > t90(140, 60),
    'sniper > shotgun > rifle > pistol — the raise finally has per-weapon weight');
  assert(t90(0, 60) < 60, 'melee (adsMs 0) blends near-instantly through the 40 ms divide floor');
  assert(isFinite(adsK(0)) && adsK(0) > 0, '...and the floor makes divide-by-zero impossible');
  assert(isFinite(adsK(NaN)) && adsK(NaN) > 0, 'NaN input falls to the default and can never poison the blend (1169’s rule)');
}

// ---------------------------------------------------------------- 4. the fire FOV punch
{
  const RM = Number(extractConst('REC_MAX', src));
  const SC = Number(extractConst('FIRE_FOV_SCALE', src));
  const MX = Number(extractConst('FIRE_FOV_MAX', src));
  const DC = Number(extractConst('FIRE_FOV_DECAY', src));
  eq(SC, 85, 'scale: kickV rad -> degrees (rifle ~1.2, shotgun ~2.9, sniper ~3.4)');
  const mk = (vm, adsB, shk) => new Function('vm', 'ads', 'shk',
    'let _recPitch = 0, _recYaw = 0, _recSign = 1, _fireFov = 0;\n' +
    'const REC_MAX = ' + RM + ', FIRE_FOV_SCALE = ' + SC + ', FIRE_FOV_MAX = ' + MX + ';\n' +
    'const activeViewMode = () => vm, adsBlend = ads, a11y = { shake: shk };\n' +
    extractFunction('_recKick', src) +
    '\nreturn { kick: (w) => _recKick(w), fov: () => _fireFov, p: () => _recPitch };')(vm, adsB, shk);
  const t = mk('fps', 0, 1); t.kick({ kickV: 0.034, kickH: 0.01 });
  near(t.fov(), 0.034 * SC, 1e-9, 'one shotgun blast punches the lens by kickV * scale (~2.9 deg)');
  const g = mk('fps', 0, 0); g.kick({ kickV: 0.034, kickH: 0.01 });
  eq(g.fov(), 0, 'a11y.shake 0 gates the punch to exactly zero — comfort motion (1313)...');
  assert(g.p() > 0, '...while the AIM recoil still lands: recoil is gameplay, not decoration, and stays ungated');
  const a = mk('fps', 1, 1); a.kick({ kickV: 0.034, kickH: 0.01 });
  near(a.fov(), 0.034 * SC * 0.6, 1e-9, 'aiming steadies the punch by the same 0.6 the pitch kick uses');
  const top = mk('top', 0, 1); top.kick({ kickV: 0.034, kickH: 0.01 });
  eq(top.fov(), 0, 'build 1102’s gate holds — a cursor view is never punched (and the rocket site inherits this, it calls the same _recKick)');
  const spam = mk('fps', 0, 1); for (let i = 0; i < 200; i++) spam.kick({ kickV: 0.04, kickH: 0.01 });
  eq(spam.fov(), MX, 'a mag dump clamps at the cap — a pump, never a fisheye');
  // decay: dt-correct by construction (exponentials compose exactly), settling to literal zero
  const step = new Function('const FIRE_FOV_DECAY = ' + DC + ';\n' + extractFunction('_fireFovStep', src) + '\nreturn _fireFovStep;')();
  const run = (fps, frames) => { let v = 3; for (let i = 0; i < frames; i++) v = step(v, 1 / fps); return v; };
  near(run(30, 15), 3 * Math.exp(-DC * 0.5), 1e-9, '30 Hz lands on the analytic solution over 0.5 s');
  near(run(60, 30), run(30, 15), 1e-9, '60 Hz lands in the same place');
  near(run(144, 72), run(30, 15), 1e-9, '...and 144 Hz — the punch decays identically at any refresh rate');
  eq(run(60, 600), 0, 'a long run settles to exactly 0 — no denormal paying updateProjectionMatrix forever');
  // wired: decays in the frame loop, THEN joins the wantFov sum beside the sprint push
  const di = src.indexOf('_fireFov = _fireFovStep(_fireFov, dt);');
  const wi = src.indexOf('const wantFov = hipFov + (_zoomFov - hipFov) * adsBlend + _sprintFovCur + _fireFov;');
  assert(di > 0 && wi > di, 'decay runs in the frame loop, then the punch joins the wantFov sum (1210/1222’s persistent-eased-state pattern — no boolean gates near the lens)');
  assert(/let _landDip = 0, _landDipV = 0, _camLean = 0, _sprintFovCur = 0, _fireFov = 0;/.test(src), 'declared beside the other camera-feel state, above every reader');
}

// ---------------------------------------------------------------- 5. sustained-fire bloom, executed
{
  let NOW = 10000;
  const constLine = (src.match(/const BLOOM_ADD_MIN = [^\n]*?;/) || [''])[0];
  assert(constLine.includes('BLOOM_CAP_MIN') && constLine.includes('BLOOM_DRAIN_MS'), 'the bloom constants exist (add floor, cap floor, drain window)');
  const mkB = () => new Function('performance',
    constLine + '\nlet _fireBloom = 0, _fireBloomAt = 0;\n' +
    extractFunction('_bloomCapFor', src) + '\n' + extractFunction('_fireBloomNow', src) + '\n' + extractFunction('_fireBloomAdd', src) +
    '\nreturn { add: (w) => _fireBloomAdd(w), now: (w) => _fireBloomNow(w) };')({ now: () => NOW });
  const rifle = { spread: 0 }, shotgun = { spread: 0.08 };
  let b = mkB();
  eq(b.now(rifle), 0, 'no shots, no bloom');
  b.add(rifle);
  near(b.now(rifle), 0.004, 1e-12, 'a zero-spread rifle still blooms the 0.004 floor per shot (1161’s argument: a multiplier of zero is zero)');
  for (let i = 0; i < 20; i++) b.add(rifle);
  near(b.now(rifle), 0.02, 1e-12, 'sustained zero-spread fire caps at 0.02 — shot 30 is finally less accurate than shot 1');
  NOW += 100; const q1 = b.now(rifle);
  assert(q1 < 0.02 && q1 > 0, 'draining 100 ms after the last shot');
  NOW += 100; assert(b.now(rifle) < q1, 'monotone drain');
  NOW += 200; eq(b.now(rifle), 0, 'a full-cap bloom reaches EXACTLY zero at ~400 ms — the next engagement opens accurate');
  NOW += 5000; eq(b.now(rifle), 0, '...and stays there');
  b = mkB();
  b.add(shotgun);
  near(b.now(shotgun), 0.08 * 0.35, 1e-12, 'a spread gun blooms 35% of its base per shot');
  for (let i = 0; i < 20; i++) b.add(shotgun);
  near(b.now(shotgun), 0.12, 1e-12, 'capped at 1.5x base, so TOTAL standing spread stays inside ~2.5x base');
  const r1 = b.now(shotgun), r2 = b.now(shotgun);
  eq(r1, r2, 'reading the bloom never mutates it — decay is a pure function of the add timestamp, framerate-independent by construction');
  // wired into the ONE spread function both consumers read (1219's pin, restated for the new term)
  const cs = extractFunction('_curSpread', src);
  assert(/\+ _penAdd \+ _fireBloomNow\(w\);/.test(cs), 'the bloom rides INSIDE _curSpread');
  assert(/const spread = _curSpread\(w\);[^\n]*\n\s*_fireBloomAdd\(w\);/.test(src),
    'shoot() reads its spread FIRST, then blooms — the first shot of a burst is the accurate one');
  assert(/const target = Math\.min\(18, _curSpread\(\) \* 90\);/.test(src),
    'the crosshair still reads the same _curSpread, so the bloom is visible for free — both consumers on the one function (1219)');
  // executed end to end: _curSpread inherits exactly the live bloom
  const csFn = new Function('WEAPONS', 'curWep', 'adsBlend', 'player', '_fireBloomNow', cs + '\nreturn _curSpread;');
  const total = csFn({ r: { spread: 0 } }, 'r', 0, { vel: { x: 0, z: 0 }, onGround: true }, () => 0.011)();
  near(total, 0.011, 1e-12, 'standing still on a zero-base gun, the shot inherits exactly the bloom');
}

done('build 1373: the DPS table is finally ordered (rifle 157.9 leads the automatics, pistol 117.6 a sidearm again, sniper 80 leaves the 90 hp brute and every ramped charger standing), ADS time is a per-weapon stat on the 1190 sheet with boot parity executed across every key (pistol 140 ms to the sniper’s 320, melee 0 through the 40 ms divide floor — clamp floors at 0 per 1296’s spurious-diff rule), every shot punches the lens by its own kickV through _recKick (fps-gated, ADS-steadied, a11y.shake-gated, dt-correct decay to exactly 0), and sustained fire blooms spread inside _curSpread so the crosshair shows the penalty for free (0.004/shot floor for zero-spread guns, cap 1.5x base or 0.02, a pure-timestamp drain to exactly zero in ~400 ms)');
