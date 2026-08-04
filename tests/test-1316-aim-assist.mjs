import { gameSource, html, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1316 — gameplay audit F4, HIGH:
//
//   "Greped aimAssist, aim_assist, aimassist, magnetism, stickyAim, snapTarget, adhes, assist, friction ->
//    the only hit is a twin-stick CURSOR nudge, which is for top-down aim, not stick aim. There is no
//    rotational slowdown near a target, no bullet magnetism, no target snap. Rumpus ships a full touch
//    layout editor and a gamepad prefs panel, so it clearly intends those inputs to be first-class; a 3D
//    FPS with zero aim assist on a stick is not."
//
// Two components, which is what every console shooter means by the term: ADHESION (the look slows while
// the crosshair is on a target) and MAGNETISM (the view is pulled toward it WHILE THE PLAYER IS TURNING).
//
// Measured live against a real enemy 20 m away on clear ground (tools/probe/aim-assist.mjs):
//
//   off target    0 deg    2      4      6      8     10     20
//   look slowdown 0.644  0.749  0.883  0.969  1.00   1.00   1.00        <- fades to nothing at the rim
//
//   half a second of a HALF-DEFLECTED stick, same input both times:
//     4 deg off target   assist off: swept 20.05 deg     assist on: swept 4.23 deg
//     nothing in view    assist off: swept 20.05 deg     assist on: swept 20.05 deg   <- IDENTICAL
//
//   and inert in every case it must be: assist 0, a still stick, a dead enemy, a target behind you, one
//   past the range, the editor — and a MOUSE never reads the slowdown at all.

const CONE = +src.match(/const AA_CONE = ([0-9.]+);/)[1];
const SLOW_MIN = +src.match(/const AA_SLOW_MIN = ([0-9.]+);/)[1];
const MAG = +src.match(/const AA_MAG = ([0-9.]+);/)[1];
const RANGE = +src.match(/const AA_RANGE = (\d+);/)[1];

// ---------------------------------------------------------------- the scan, executed
const rig = (opts = {}) => {
  const ST = Object.assign({ gameOn: true, editorOpen: false, paused: false, drivingCar: null, mountedTurret: null,
    hp: 100, aim: 1, enemies: [], blocked: false, pvp: false, bots: [], players: {} }, opts);
  const body =
    'let _aaSlow = 1, _aaYaw = 0, _aaPitch = 0, _aaK = 0;\n' +
    'const player = { pos:{x:0,y:1.7,z:0}, yaw:Math.PI, pitch:0, get hp(){ return ST.hp; } };\n' +
    'const padPrefs = { get aim(){ return ST.aim; } };\n' +
    'const gameOn = true;\n' +
    'const enemies = ST.enemies, bots = ST.bots, NET = { myId:1, players:ST.players };\n' +
    'const pvpMode = () => ST.pvp, sameTeam = (a,b) => ST.team === true;\n' +
    'const segmentBlocked = () => ST.blocked;\n' +
    'const _aaF = { x:0, y:0, z:0 };\n' +
    'let editorOpen = false, paused = false, drivingCar = null, mountedTurret = null;\n' +
    'const AA_CONE = ' + CONE + ', AA_SLOW_MIN = ' + SLOW_MIN + ', AA_MAG = ' + MAG + ', AA_RANGE = ' + RANGE + ';\n' +
    extractFunction('_aaForward') + '\n' + extractFunction('_aimAssistScan') + '\n' + extractFunction('_aimAssistPull') + '\n' +
    'return { scan:()=>{ editorOpen=ST.editorOpen; paused=ST.paused; drivingCar=ST.drivingCar; mountedTurret=ST.mountedTurret; _aimAssistScan(); },' +
    ' pull:(dt,t)=>_aimAssistPull(dt,t), st:()=>({ slow:_aaSlow, k:_aaK, yaw:_aaYaw, pitch:_aaPitch }), player };';
  return { fn: new Function('ST', body)(ST), ST };
};
// an enemy at a given horizontal angle off the player's forward, at a given distance
const enemyAt = (deg, dist = 20, y = 1.7) => {
  const a = Math.PI + deg * Math.PI / 180;
  return { dead: false, mesh: { position: { x: -Math.sin(a) * dist, y: y - 0.6, z: -Math.cos(a) * dist } } };
};

{ // ADHESION falls off across the cone and stops at its rim
  const rows = [];
  for (const d of [0, 2, 4, 6, 8, 12]) {
    const r = rig({ enemies: [enemyAt(d)] }); r.fn.scan();
    rows.push([d, r.fn.st().slow]);
  }
  near(rows[0][1], SLOW_MIN, 1e-9, 'dead on target the look runs at ' + SLOW_MIN + ' — a ' + Math.round((1 - SLOW_MIN) * 100) + '% slowdown');
  for (let i = 1; i < rows.length; i++) assert(rows[i][1] >= rows[i - 1][1] - 1e-9,
    'the slowdown eases off as the target leaves the middle (' + rows[i][0] + ' deg -> ' + rows[i][1].toFixed(3) + ')');
  eq(rows[rows.length - 1][1], 1, 'and past the cone there is none at all');
  near(CONE * 180 / Math.PI, 8, 0.2, 'the cone is ~8 degrees — an aim aid, not a magnet');
  assert(/Squared, so the assist concentrates near the middle\n     instead of smearing evenly across the cone/.test(src),
    'the falloff is squared, which is the difference between "sticky" and "floaty"');
}
{ // MAGNETISM holds the view on target — and does NOTHING when there is nothing to hold it on
  const sweep = (assist, enemies) => {
    const r = rig({ aim: assist, enemies });
    const y0 = r.fn.player.yaw;
    for (let i = 0; i < 30; i++) {                      // half a second of a half-deflected stick
      r.fn.scan();
      r.fn.player.yaw -= 0.25 * 2.8 * (r.fn.st().slow) * (1 / 60);
      r.fn.pull(1 / 60, 0.5);
    }
    return (r.fn.player.yaw - y0) * 180 / Math.PI;
  };
  /* the target sits on the side the sweep travels TOWARD, which is the case that matters: the player is
     turning onto it. (Placed the other way the crosshair leaves immediately and there is nothing to stick
     to — that mistake cost this test a run.) */
  const off = sweep(0, [enemyAt(-4)]), on = sweep(1, [enemyAt(-4)]);
  assert(Math.abs(on) < Math.abs(off) * 0.5,
    'the same stick input sweeps ' + Math.abs(on).toFixed(1) + ' deg with assist against ' + Math.abs(off).toFixed(1) + ' without — the view is being HELD on the target');
  const emptyOff = sweep(0, []), emptyOn = sweep(1, []);
  near(emptyOn, emptyOff, 1e-9, 'with nothing in view the two are IDENTICAL — the assist is not a global sensitivity change');
}
{ // it never turns the view on its own
  const r = rig({ enemies: [enemyAt(3)] });
  r.fn.scan();
  const y0 = r.fn.player.yaw, p0 = r.fn.player.pitch;
  for (let i = 0; i < 120; i++) r.fn.pull(1 / 60, 0);   // two seconds with the stick at rest
  eq(r.fn.player.yaw, y0, 'A STILL STICK MOVES NOTHING — magnetism with no input is a camera that moves by itself');
  eq(r.fn.player.pitch, p0);
  assert(r.fn.st().k > 0, '...even though a target is right there and the SLOWDOWN is live');
  assert(/NEVER WHILE THE STICK IS STILL/.test(src), 'and that is stated as a rule, not left to the code');
  // and it never overshoots past the target
  const r2 = rig({ enemies: [enemyAt(3)] });
  for (let i = 0; i < 600; i++) { r2.fn.scan(); r2.fn.pull(1 / 60, 1); }
  const st = r2.fn.st();
  assert(Math.abs(st.yaw) < 0.02, 'ten seconds of full pull settles ON the target rather than sailing past it (' + (st.yaw * 180 / Math.PI).toFixed(2) + ' deg)');
}

// ---------------------------------------------------------------- everything it must decline
{
  const cases = [
    ['the slider at 0', { aim: 0, enemies: [enemyAt(0)] }],
    ['a dead enemy', { enemies: [Object.assign(enemyAt(0), { dead: true })] }],
    ['a target behind you', { enemies: [enemyAt(180)] }],
    ['a target past the range', { enemies: [enemyAt(0, RANGE + 10)] }],
    ['a target through a wall', { enemies: [enemyAt(0)], blocked: true }],
    ['the editor open', { enemies: [enemyAt(0)], editorOpen: true }],
    ['paused', { enemies: [enemyAt(0)], paused: true }],
    ['driving', { enemies: [enemyAt(0)], drivingCar: {} }],
    ['on a turret', { enemies: [enemyAt(0)], mountedTurret: {} }],
    ['dead', { enemies: [enemyAt(0)], hp: 0 }],
    ['nothing in the level', { enemies: [] }],
  ];
  for (const [label, opts] of cases) {
    const r = rig(opts); r.fn.scan();
    const st = r.fn.st();
    eq(st.slow, 1, 'no slowdown with ' + label);
    eq(st.k, 0, '...and no pull with ' + label);
  }
}
{ // a teammate is not a target
  const r = rig({ pvp: true, team: true, bots: [{ id: 2, dead: false, pos: { x: 0, y: 1, z: 20 } }] });
  r.fn.scan();
  eq(r.fn.st().k, 0, 'PvP: a teammate is never assisted toward');
  const r2 = rig({ pvp: true, team: false, bots: [{ id: 2, dead: false, pos: { x: 0, y: 1.2, z: 20 } }] });
  r2.fn.scan();
  assert(r2.fn.st().k > 0, '...while an opponent is');
  // a downed player too
  const r3 = rig({ pvp: true, team: false, players: { 2: { posEye: { x: 0, y: 1.7, z: 20 }, hp: 0 } } });
  r3.fn.scan();
  eq(r3.fn.st().k, 0, 'and a player who is already down is not a target');
}
{ // the NEAREST-to-centre target wins, not the nearest in space
  const r = rig({ enemies: [enemyAt(6, 8), enemyAt(0.5, 40)] });
  r.fn.scan();
  assert(Math.abs(r.fn.st().yaw) < 0.02,
    'with a target 6 deg off at 8 m and one half a degree off at 40 m, the assist tracks the one you are actually pointing at');
}

// ---------------------------------------------------------------- who consumes it
{
  assert(/const _sm=\(padPrefs\.sens\|\|1\) \* \(\(ads\|\|padAds\) \? \(padPrefs\.ads\|\|0\.7\) : 1\) \* _aaSlow;/.test(src),
    'the PAD look multiplies by the slowdown');
  assert(/_aimAssistPull\(dt, Math\.hypot\(rx, ry\)\);/.test(src), '...and pulls by how hard the stick is deflected');
  assert(/player\.yaw   -= touchLookDX \* tsens \* _aaSlow;/.test(src), 'and so does TOUCH, from the same derivation');
  assert(/_aimAssistPull\(dt, Math\.min\(1, Math\.hypot\(touchLookDX, touchLookDY\) \* 12\)\);/.test(src),
    '...scaled by how fast the thumb is actually dragging');
  assert(/a thumb on glass has every problem a stick has and no analogue floor at all, so it gets\n       the same assist from the same derivation rather than a second tuning/.test(src),
    'with the reason touch shares the stick’s tuning recorded');
  // A MOUSE NEVER TOUCHES IT. That is the whole fairness argument.
  const mouseLook = src.slice(src.indexOf('const _s = _mouseSensNow(false);'), src.indexOf('const _s = _mouseSensNow(false);') + 400);
  assert(!/_aaSlow/.test(mouseLook), 'THE MOUSE LOOK PATH NEVER READS THE SLOWDOWN');
  eq((src.match(/_aaSlow/g) || []).length, 6,
    'the slowdown is declared, cleared, computed and read by exactly the pad and the two touch axes — nowhere else');
  assert(/NEVER FOR A MOUSE\. A mouse has no deadzone, no stick drift and no analogue floor; assisting it is\n\/\/    just aiming for the player\./.test(src),
    'and why is written down');
  // scanned once, before either consumer
  const iScan = src.indexOf('if(typeof _aimAssistScan===\'function\') _aimAssistScan();');
  assert(iScan > 0 && iScan < src.indexOf('pollGamepad(dt);   // controller input'),
    'the scan runs before the pad look…');
  assert(iScan < src.indexOf('player.yaw   -= touchLookDX * tsens * _aaSlow;'), '…and before the touch look');
  assert(/It is one\n     frame stale by construction — the alternative is scanning twice/.test(src),
    'and the one-frame staleness is a stated trade rather than an oversight');
}
{ // it is a slider, and it says what it does
  assert(/id="padAimRng"/.test(html), 'there is an aim-assist slider');   /* markup lives in the HTML, not the script */
  assert(/padPrefs\.aim=Math\.max\(0, Math\.min\(1, \(\+ar2\.value\|\|0\)\/100\)\); savePadPrefs\(\);/.test(src),
    '...clamped and persisted');
  assert(/let padPrefs = \{ sens:1, ads:0\.7, dead:PAD_DEADZONE, invertY:false, aim:1 \};/.test(src), 'and it defaults on');
  /* build 1375: a REAL em-dash — the literal backslash-u2014 rendered as garbage in the markup */
  assert(/<b>Stick and touch only<\/b> — a mouse is never assisted/.test(html),
    'the panel tells the player it is stick and touch only, which is the thing a mouse player would otherwise assume');
}

done('build 1316 (gameplay audit F4): aim assist, for sticks and thumbs only — the engine ships a full touch layout editor and a gamepad prefs panel and had zero rotational slowdown, zero magnetism and zero target snap, which the audit called disqualifying for a 3D FPS. Both components now exist from ONE per-frame scan the pad and the touch pad share: adhesion drops look sensitivity to 55% dead on target and fades to nothing at an 8-degree rim, and magnetism pulls toward the target only in proportion to how hard the player is already turning. Measured live: the same half-second of half-stick swept 20.05 degrees unassisted and 4.23 degrees on target, while with nothing in view the two were byte-identical. It declines a teammate, a corpse, a downed player, a target through a wall, one past 60 m, the editor, a car, a turret, and a still stick — and the MOUSE look path never reads it at all, which is the whole fairness argument');
