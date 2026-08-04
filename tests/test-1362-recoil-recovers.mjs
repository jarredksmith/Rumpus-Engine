// build 1362: recoil RECOVERS. The view kick is a pair of camera-offset accumulators sprung back to
// zero exponentially - never a write into player.pitch, so nothing is permanent (the critics measured
// one SMG magazine walking the view 23-31 degrees with recoveredDeg = 0 twenty frames after release).
// The kick is per-weapon (kickV/kickH on build 1190's stat sheet - the old scope-only factor made the
// SMG climb 10x faster than the shotgun), horizontal recoil alternates sides, being hit finally
// produces an aim punch at both damage sites, and pulling the mouse down against a live kick consumes
// the recoil first so the spring cannot double-correct the player into the floor.
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the accumulator never reaches player.pitch
{
  eq((src.match(/player\.pitch \+=/g) || []).length, 1,
    'exactly ONE player.pitch += remains in the engine - the aim-assist magnetism step; both recoil kick sites are gone');
  assert(/player\.pitch \+= Math\.max\(-Math\.abs\(_aaPitch\)/.test(src), '...and it is the aim-assist one');
  assert(!/player\.pitch \+= \(0\.010/.test(src), 'the old permanent hitscan kick is gone');
  assert(!/player\.pitch/.test(extractFunction('_recKick', src)), '_recKick never touches player.pitch');
  assert(!/player\.pitch\s*[-+*\/]?=/.test(extractFunction('_recPunch', src)),
    '_recPunch reads the yaw for the decomposition but never writes the aim');
}

// ---------------------------------------------------------------- the spring, executed frame-by-frame, dt-correct
{
  const SPRING = Number(extractConst('REC_SPRING', src));
  eq(SPRING, 8, 'the return rate is 8/s');
  const a0 = src.indexOf('if(_recPitch !== 0 || _recYaw !== 0){');
  assert(a0 > 0, 'the apply+spring block exists in the frame loop');
  const aset = src.indexOf('settle exactly, stop paying', a0);
  assert(aset > a0, '...with the exact-settle line');
  const blk = src.slice(a0, src.indexOf('}', aset) + 1);
  const step = new Function('st', 'dt', 'REC_SPRING',
    'let _recPitch = st.p, _recYaw = st.y; const camera = { rotation: { x: st.bx, y: st.by } };\n' +
    blk + '\nst.p = _recPitch; st.y = _recYaw; st.cx = camera.rotation.x; st.cy = camera.rotation.y;');

  // application: the offset lands on the CAMERA, on top of whatever base rotation the frame set
  const one = { p: 0.03, y: 0.01, bx: 0.2, by: 1.0 };
  step(one, 1/60, SPRING);
  near(one.cx, 0.23, 1e-12, 'the pitch offset is added to the camera');
  near(one.cy, 1.01, 1e-12, '...and the yaw offset too (the old kick never had a horizontal term at all)');
  const hi = { p: 0.22, y: 0, bx: 1.5, by: 0 };
  step(hi, 1/60, SPRING);
  near(hi.cx, 1.55, 1e-12, 'base aim at the pitch clamp + a full kick can never cross vertical');

  // recovery: <10% left after 0.3 s...
  const run = (hz, frames) => { const st = { p: 0.03, y: 0.01, bx: 0, by: 0 };
    for(let i = 0; i < frames; i++){ st.bx = 0; st.by = 0; step(st, 1/hz, SPRING); } return st; };
  const r60 = run(60, 18);   // 0.3 s
  assert(r60.p < 0.003, 'recovered to under 10% in 0.3 s (' + (r60.p/0.03*100).toFixed(1) + '% left) - the old kick recovered 0%');
  // ...and BYTE-identically at 30/60/144 Hz over the same 0.5 s, because the decay is multiplicative
  const a = run(30, 15), b = run(60, 30), c = run(144, 72);
  near(a.p, 0.03*Math.exp(-SPRING*0.5), 1e-12, '30 Hz lands on the analytic solution');
  near(b.p, a.p, 1e-12, '60 Hz lands in the same place');
  near(c.p, a.p, 1e-12, '...and 144 Hz - recovery feels identical at any refresh rate');
  // the exact settle: a long run reaches literal zero, not a denormal that pays the branch forever
  const z = run(60, 240);
  eq(z.p, 0, 'the spring settles to exactly 0'); eq(z.y, 0, '...both axes');
}

// ---------------------------------------------------------------- per-weapon ordering, from the REAL table
{
  const W = new Function('return ' + extractConst('WEAPONS', src) + ';')();
  assert(W.shotgun.kickV > W.rifle.kickV, 'the shotgun kicks harder than the rifle');
  assert(W.rifle.kickV > W.smg.kickV, '...and the rifle harder than the SMG - the old curve had this exactly backwards');
  assert(W.pistol.kickV > W.smg.kickV, 'a pistol snaps more per shot than an SMG');
  assert(W.sniper.kickV >= 0.03 && W.launcher.kickV >= 0.03 && W.shotgun.kickV >= 0.03, 'the heavies are heavy (0.030-0.040)');
  for(const k of ['rifle','pistol','smg','shotgun','sniper','launcher'])
    assert(W[k].kickH > 0 && W[k].kickH < W[k].kickV, k + ' has a horizontal component, smaller than its vertical');
  eq(W.crowbar.kickV, 0, 'a swing has no gun recoil');
  eq(W.hands.kickV, 0, '...nor do fists');
}

// ---------------------------------------------------------------- _recKick executed: gate, ADS scale, clamp
{
  const RM = Number(extractConst('REC_MAX', src));
  const mk = (vm, ads) => new Function('vm', 'ads',
    'let _recPitch = 0, _recYaw = 0, _recSign = 1; const REC_MAX = ' + RM + ';\n' +
    'const activeViewMode = () => vm, adsBlend = ads;\n' +
    extractFunction('_recKick', src) +
    '\nreturn { kick: (w) => _recKick(w), get: () => ({ p: _recPitch, y: _recYaw }) };')(vm, ads);
  const t = mk('fps', 0);
  t.kick({ kickV: 0.03, kickH: 0.01 });
  near(t.get().p, 0.03, 1e-12, 'one shot pushes exactly the weapon’s own kickV');
  assert(Math.abs(t.get().y) > 0.003, '...and a real horizontal component');
  const top = mk('top', 0);
  top.kick({ kickV: 0.03, kickH: 0.01 });
  eq(top.get().p, 0, 'build 1102’s rule holds: a cursor view is never kicked');
  const ads = mk('fps', 1);
  ads.kick({ kickV: 0.03, kickH: 0.01 });
  near(ads.get().p, 0.018, 1e-12, 'aiming scales the kick by 0.6');
  const spam = mk('fps', 0);
  for(let i = 0; i < 200; i++) spam.kick({ kickV: 0.03, kickH: 0.01 });
  assert(spam.get().p <= RM + 1e-12 && spam.get().p > 0.2, 'a 200-round mag-dump clamps at REC_MAX - a lean, never 23-31 degrees of permanent climb');
  assert(Math.abs(spam.get().y) <= RM + 1e-12, '...and yaw is clamped the same');
}

// ---------------------------------------------------------------- both damage sites push it (aim punch)
{
  const RM = Number(extractConst('REC_MAX', src));
  const stub = () => {};
  const mkPvE = (shakePref) => new Function(
    'player', 'buffs', 'flashDamage', 'SFX', 'addShake', 'hurtDir', 'updateHUD', 'playerDied', 'a11y',
    'let _recPitch = 0, _recYaw = 0; const REC_MAX = ' + RM + ';\n' +
    extractFunction('_recPunch', src) + '\n' + extractFunction('applyEnemyDamageToSelf', src) +
    '\nreturn { hit: (d,x,z) => applyEnemyDamageToSelf(d,x,z), get: () => ({ p: _recPitch, y: _recYaw }) };')(
    { hp: 100, maxHp: 100, pos: { x: 0, y: 1.7, z: 0 }, yaw: 0 }, { shield: 0 },
    stub, { hurt: stub }, stub, stub, stub, stub, { shake: shakePref });
  const t = mkPvE(1);
  t.hit(30, 0, -10);   // dead ahead (forward is -Z at yaw 0)
  assert(t.get().p > 0.02, 'a PvE hit punches the view up (' + t.get().p.toFixed(4) + ' rad)');
  near(t.get().y, 0, 1e-12, '...a frontal hit has no side component');
  const tr = mkPvE(1);
  tr.hit(30, 10, 0);   // from the RIGHT
  assert(tr.get().y > 0.005, 'a hit from the right yaws the view away from it (+yaw = left)');
  const t0 = mkPvE(0);
  t0.hit(30, 0, -10);
  eq(t0.get().p, 0, 'build 1313’s a11y.shake gates the punch to zero, like every other physical reaction');

  const mkPvP = () => new Function(
    'NET', 'player', 'buffs', 'flashDamage', 'SFX', 'addShake', 'hurtDir', 'updateHUD', 'duelDie', 'sameTeam', 'a11y', 'botById',
    'let _recPitch = 0, _recYaw = 0, duelDead = false, duelInvuln = 0, lastDamagedBy = null; const REC_MAX = ' + RM + ';\n' +
    extractFunction('_recPunch', src) + '\n' + extractFunction('applyPvpDamage', src) +
    '\nreturn { hit: (d,f) => applyPvpDamage(d,f), get: () => ({ p: _recPitch, y: _recYaw }) };')(
    { players: { 1: { posEye: { x: 0, z: -8 } } }, myId: 0 },
    { hp: 100, maxHp: 100, pos: { x: 0, y: 1.7, z: 0 }, yaw: 0 }, { shield: 0 },
    stub, { hurt: stub }, stub, stub, stub, stub, () => false, { shake: 1 }, () => null);
  const pv = mkPvP();
  pv.hit(40, 1);
  assert(pv.get().p > 0.02, 'a PvP hit punches too, riding the posEye source hurtDir already computed');
  const pu = mkPvP();
  pu.hit(40, 99);   // unknown attacker: no posEye, botById null
  assert(pu.get().p > 0.02, 'an unknown attacker still jolts, just without a direction');
}

// ---------------------------------------------------------------- the correction-subtraction, executed
{
  const a0 = src.indexOf('const sens = _mouseSensNow(ads);');
  const a1 = src.indexOf('if(drivingCar && mx)', a0);
  assert(a0 > 0 && a1 > a0, 'the aim-path mouse block exists');
  const blk = src.slice(a0, a1);
  const drive = new Function('st', 'mx', 'my',
    'let _recPitch = st.rec; const player = { yaw: st.yaw, pitch: st.pitch }; const ads = false; const _mouseSensNow = () => 0.002;\n' +
    blk + '\nst.rec = _recPitch; st.yaw = player.yaw; st.pitch = player.pitch;');
  const s1 = { rec: 0.05, yaw: 0, pitch: 0.3 };
  drive(s1, 0, 10);   // a 0.02 rad downward pull against 0.05 rad of live recoil
  near(s1.pitch, 0.3, 1e-12, 'a pull smaller than the remaining recoil moves the AIM not at all');
  near(s1.rec, 0.03, 1e-12, '...it spent the recoil instead - no double correction');
  const s2 = { rec: 0.01, yaw: 0, pitch: 0.3 };
  drive(s2, 0, 10);
  near(s2.rec, 0, 1e-12, 'a bigger pull drains the recoil');
  near(s2.pitch, 0.29, 1e-12, '...and only the REMAINDER lowers the aim');
  const s3 = { rec: 0.05, yaw: 0, pitch: 0.3 };
  drive(s3, 0, -10);
  near(s3.rec, 0.05, 1e-12, 'pulling UP never consumes recoil');
  near(s3.pitch, 0.32, 1e-12, '...and moves the aim in full');
  const s4 = { rec: 0.05, yaw: 0.5, pitch: 0.3 };
  drive(s4, 10, 0);
  near(s4.yaw, 0.48, 1e-12, 'yaw is untouched by the consume');
}

// ---------------------------------------------------------------- wiring
{
  eq((src.match(/_recKick\(/g) || []).length, 3, 'declared once, called from exactly the two kick sites - hitscan and rocket');
  assert(/addShake\(0\.22\); _recKick\(W\(\)\);/.test(src), 'the rocket routes through the shared helper (its old kick was a hardcoded permanent 0.02)');
  assert(/recoil = Math\.min\(recoil \+ \(0\.018\*w\.pellets\*0\.5 \+ 0\.014\) \* \(adsBlend>0\.5\?0\.5:1\) \* \(w\.scope\?2\.0:1\), 0\.10\);\n    _recKick\(w\);/.test(src),
    'the hitscan kick sits beside the viewmodel recoil inside build 1102’s fps gate');
  const KEYS = new Function('return ' + extractConst('GUN_STAT_KEYS', src) + ';')();
  assert(KEYS.includes('kickV') && KEYS.includes('kickH'),
    'the kicks ride build 1190’s stat sheet - serialization, clamps, loaders and an editor row for free');
  const LIM = new Function('BOT_MELEE_REACH_MIN', 'return ' + extractConst('GUN_STAT_LIM', src) + ';')(1.2);
  eq(LIM.kickV.join(','), '0,0.15', 'kickV clamps - a hostile file cannot author a neck-snapper');
  eq(LIM.kickH.join(','), '0,0.08', '...and kickH');
  assert(/\['kickV','Recoil kick rad',0\.002\], \['kickH','Recoil side rad',0\.001\]/.test(src), 'the editor exposes both');
  // the apply block sits AFTER the third-person boom, which lookAt-overwrites the rotation - before it,
  // the kick would be silently dropped in exactly the view where the old player.pitch kick was visible
  const iTp = src.indexOf('if(tpActive() && gameOn && !duelDead){ gun.visible=false; tpCameraPushback(dt); }');
  const iRec = src.indexOf('if(_recPitch !== 0 || _recYaw !== 0){');
  assert(iTp > 0 && iRec > iTp, 'the recoil offset is applied after tpCameraPushback');
}

done('build 1362: recoil is a recovering camera offset (dt-correct spring executed at 30/60/144 Hz), per-weapon kickV/kickH on the stat sheet with shotgun>rifle>SMG ordering from the real table, aim punch at both damage sites gated by a11y.shake, and the mouse consumes live recoil before double-correcting the aim');
