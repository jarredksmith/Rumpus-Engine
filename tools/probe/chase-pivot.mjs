// build 1413 — the chase camera's height, measured through the real pipeline.
//
// test-1413 drives `_tpPivot` in isolation. This drives `tpCameraPushback` — the whole boom, with the
// damping, the tilt and the collide — and reads `camera.position.y` off the REAL camera, which is the
// number a player actually experiences. The control is the stock capsule: whatever else moves, the body
// every existing level was framed against must not.
import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

const out = [];
const P = (ok, what, detail) => { out.push({ ok, what, detail }); };

await withGame(async (probe) => {
  const r = await probe(DRIVE_RIG + `
  (function(){
    const R = {};
    __ungate();
    gameCfg.objective = 'puzzle';
    __wavesOff(); __clearEnemies();

    /* Third person, on open ground away from the stock level's own geometry so the camera collide
       (build 799) cannot pull the boom in and confound the height. */
    gameCfg.view = 'chase'; tpMode = true;
    player.pos.x = 45; player.pos.z = -45; player.yaw = 0; player.pitch = 0;
    player.vel.x = player.vel.y = player.vel.z = 0;
    R.tpActive = tpActive();
    /* _ownAvatar is built LAZILY by updateOwnAvatar the first time third person is actually drawn —
       reading it in the same synchronous block that turns tpMode on gets null. Drive a few frames. */
    __drive(10, 1/60);

    const av = _ownAvatar;
    R.haveAvatar = !!av;
    const REAL = av && av.userData.centerLocal ? { x:av.userData.centerLocal.x, y:av.userData.centerLocal.y, z:av.userData.centerLocal.z } : null;
    R.stockCentre = REAL && REAL.y;

    /* Settle the damped follow first (build 894 snaps on a >1s gap and eases otherwise), then read.
       A camera measured mid-ease is measuring the spring, not the pivot. */
    function camYFor(cy){
      if(cy == null) delete av.userData.centerLocal;
      else av.userData.centerLocal = { x:0, y:cy, z:0 };
      __drive(90, 1/60);
      return +camera.position.y.toFixed(4);
    }

    R.stockY = camYFor(REAL ? REAL.y : 1.0);   // the CONTROL: the shipped capsule
    R.tinyY  = camYFor(0.25);                  // a 0.5 m creature
    R.mechY  = camYFor(2.00);                  // a 4 m mech
    R.humanY = camYFor(0.90);                  // an ordinary 1.8 m humanoid
    R.tallY  = camYFor(1.10);                  // a 2.2 m one

    // the bounds the engine states, read back rather than assumed
    R.MIN = +TP_PIVOT_MIN.toFixed(4); R.MAX = +TP_PIVOT_MAX.toFixed(4); R.EYE = EYE;

    /* The pivot is footY plus the clamped centerLocal.y, and footY is the avatar's own foot height — NOT
       zero, and not player.pos.y - EYE either. Report it, and measure the clamp against it: comparing a
       pivot to a bare bound is comparing two different origins, which is what the first run of this
       probe did (every reading was out by exactly footY, which is how it was recognised). */
    R.footY = +(av.userData.footY != null ? av.userData.footY : (player.pos.y - EYE)).toFixed(4);
    // and the pivot itself, through the real function at the real pose
    av.userData.centerLocal = { x:0, y:0.25, z:0 };
    R.pivotTiny = +_tpPivot(av, player.pos, player.yaw, player.pos.y-EYE).y.toFixed(4);
    av.userData.centerLocal = { x:0, y:2.00, z:0 };
    R.pivotMech = +_tpPivot(av, player.pos, player.yaw, player.pos.y-EYE).y.toFixed(4);
    av.userData.centerLocal = { x:0, y:0.90, z:0 };
    R.pivotHuman = +_tpPivot(av, player.pos, player.yaw, player.pos.y-EYE).y.toFixed(4);

    /* Does the camera still LOOK at the character? The boom must frame the body, not the sky — so the
       avatar's own centre has to project inside the frame at every one of these heights. */
    function onScreen(cy){
      av.userData.centerLocal = { x:0, y:cy, z:0 };
      __drive(90, 1/60);
      const v = new THREE.Vector3(player.pos.x, (player.pos.y - EYE) + cy, player.pos.z).project(camera);
      return { x:+v.x.toFixed(3), y:+v.y.toFixed(3), inFrame: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1 };
    }
    R.frameTiny  = onScreen(0.25);
    R.frameMech  = onScreen(2.00);
    R.frameStock = onScreen(REAL ? REAL.y : 1.0);

    // restore
    if(REAL) av.userData.centerLocal = REAL; else delete av.userData.centerLocal;
    __drive(4, 1/60);
    tpMode = false; gameCfg.view = 'fps';
    __release();
    return R;
  })()`);

  P(r.tpActive && r.haveAvatar, 'the chase camera is live with a real avatar');
  const above = (p) => +(p - r.footY).toFixed(4);   // the pivot's height ABOVE THE AVATAR'S OWN FEET
  P(above(r.pivotHuman) === 0.9,
    'an ordinary humanoid pivots at its own centre — untouched', above(r.pivotHuman));
  P(above(r.pivotTiny) === r.MIN,
    'a 0.5 m creature is lifted to the player\'s own hip', above(r.pivotTiny) + ' vs ' + r.MIN);
  P(above(r.pivotMech) === r.MAX,
    'a 4 m mech is held at the top of the player\'s own head', above(r.pivotMech) + ' vs ' + r.MAX);

  // the whole boom, read off the real camera
  P(Math.abs(r.humanY - r.stockY) < 0.15,
    'through the FULL boom, a humanoid and the stock capsule frame within 15 cm of each other',
    r.humanY + ' vs ' + r.stockY);
  P(r.tinyY > 0.6,
    'and the creature\'s camera is no longer at ankle height — before this build its pivot was 0.25 and ' +
    'the boom looked along the floor', r.tinyY);
  P(Math.abs(r.mechY - r.tallY) < 0.9,
    'while the mech\'s camera is within a metre of a tall humanoid\'s rather than a stop above it',
    r.mechY + ' vs ' + r.tallY);
  P(r.tinyY < r.humanY && r.humanY <= r.mechY,
    'the ordering still holds — a bigger character still frames higher, it is just bounded',
    [r.tinyY, r.humanY, r.mechY].join(' < '));

  P(r.frameStock.inFrame, 'the stock body is in frame');
  P(r.frameTiny.inFrame, '...and so is the creature, at the clamped pivot', JSON.stringify(r.frameTiny));
  P(r.frameMech.inFrame, '...and the mech', JSON.stringify(r.frameMech));
  P(r.MIN < r.EYE && r.MAX > r.EYE * 0.9, 'the bounds really are the player\'s own body', r.MIN + '..' + r.MAX + ' (EYE ' + r.EYE + ')');
}, { settleMs: 2500 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
