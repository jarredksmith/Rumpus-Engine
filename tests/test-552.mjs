import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 709: drivable vehicles (arcade kinematic, Phase 1). A prop flagged as a vehicle is entered with E and driven
// (W/S throttle, A/D steer) with a chase cam; it follows the ground/ramps. The drive math is a pure function, so the
// feel is unit-tested here; the camera / enter-exit are browser-verified.

// --- executable: driveStep arcade math (self-contained, no globals) ---
const ds = new Function(extractFunction('driveStep') + '\nreturn driveStep;')();
const cfg = { maxSpeed:16, accel:18, turn:90, reverse:7 };
// accelerates from rest toward top speed
{ const r = ds(0, 1, 0, cfg, 0.1); near(r.speed, 1.8, 1e-9, 'full throttle accelerates (accel*dt)'); eq(r.yawDelta, 0, 'no steer = no yaw change'); }
// caps at top speed
{ const r = ds(16, 1, 0, cfg, 0.1); eq(r.speed, 16, 'does not exceed top speed'); }
// coasts toward 0 with no throttle
{ const r = ds(5, 0, 0, cfg, 0.1); assert(r.speed < 5 && r.speed >= 0, 'coasts down when off the gas'); }
{ const r = ds(0.5, 0, 0, cfg, 1); eq(r.speed, 0, 'coast does not overshoot past zero'); }
// reverse uses the (smaller) reverse cap
{ let s=0; for(let i=0;i<200;i++) s=ds(s,-1,0,cfg,0.1).speed; near(s, -7, 1e-6, 'reverse tops out at the reverse speed'); }
// steering scales with speed and flips in reverse
{ const slow = ds(1, 1, 1, cfg, 0.1).yawDelta, fast = ds(16, 1, 1, cfg, 0.1).yawDelta;
  assert(Math.abs(fast) > Math.abs(slow), 'turns harder at speed than when crawling');
  const rev = ds(-8, 1, 1, cfg, 0.1).yawDelta; assert(Math.sign(rev) === -Math.sign(fast), 'steering inverts in reverse'); }
{ const r = ds(0, 0, 1, cfg, 0.1); near(r.yawDelta, 0, 1e-9, 'no steering authority when fully stopped'); }

// --- vehicleApply normalizes config ---
const va = new Function('o','v', extractFunction('vehicleApply') + '\nreturn (o,v)=>{ vehicleApply(o,v); return o.userData.vehicle; };')();
{ const V = va({userData:{}}, {}); eq(V.maxSpeed,16,'default top speed'); eq(V.reverse,7,'default reverse'); }
{ const V = va({userData:{}}, {maxSpeed:30, turn:120}); eq(V.maxSpeed,30,'custom values kept'); eq(V.turn,120,'custom turn kept'); }

// --- enter/exit + drive are wired into proximity, interact, update, deploy ---
assert(/if\(!nearTarget && !drivingCar\)\{[\s\S]*?o\.userData\.vehicle[\s\S]*?nearTarget = \{ type:'vehicle', obj:best \};/.test(src), 'a nearby vehicle prop becomes an E-target');
assert(/nearTarget\.type==='vehicle'[\s\S]*?prompt\.innerHTML = `<b>E<\/b> Drive`;/.test(src), 'the prompt reads "E Drive"');
assert(/if\(drivingCar\)\{ exitCar\(\); return; \}/.test(extractFunction('interact')), 'E gets you out while driving');
assert(/nearTarget\.type==='vehicle'\)\{\s*enterCar\(nearTarget\.obj\);/.test(extractFunction('interact')), 'E on a vehicle gets you in');
assert(/if\(drivingCar\)\{ wish\.set\(0,0,0\); moveScale=0; \}/.test(src), 'foot movement is frozen while driving');
assert(/if\(drivingCar\) driveUpdate\(dt\);/.test(src), 'driveUpdate runs each frame while driving');
assert(/\} else if\(drivingCar\)\{[\s\S]*?const o=drivingCar, yaw=player\.yaw[\s\S]*?camera\.position\.set\(_tx - fx\*_cd/.test(src), 'a chase camera orbits with the look (player.yaw)');

// --- build 711: mouse-orbit steering — the car turns toward where you look (player.yaw), not A/D ---
const du = extractFunction('driveUpdate');
assert(/let diff = player\.yaw - o\.userData\.carYaw; diff = Math\.atan2\(Math\.sin\(diff\), Math\.cos\(diff\)\);/.test(du), 'steers toward the look heading (shortest angle)');
assert(/o\.userData\.carYaw \+= Math\.max\(-maxStep, Math\.min\(maxStep, diff\)\);/.test(du), 'turn is rate-limited toward that heading');
assert(/let steer=0; if\(keys\['KeyA'\]\) steer\+=1; if\(keys\['KeyD'\]\) steer-=1;/.test(du) && /if\(steer\) player\.yaw \+= steer \* \(cfg\.turn\*RAD\) \* 0\.85 \* dt;/.test(du), 'build 725: A/D steer too, alongside the mouse (swing the look heading)');
assert(/!o\.userData\.vehicle/.test(extractFunction('instanceEligible')), 'a vehicle is never instanced (so it renders where it is driven)');

// --- build 712: Phase 2 wall collision — each axis of the move is blocked if a wall is within reach (slide), guarded ---
assert(/if\(mvx!==0 && _carWall\(o, Math\.sign\(mvx\), 0, Math\.abs\(mvx\), _h\)\) mvx = 0;/.test(du), 'X move is blocked by a wall (slides along Z)');
assert(/if\(mvz!==0 && _carWall\(o, 0, Math\.sign\(mvz\), Math\.abs\(mvz\), _h\)\) mvz = 0;/.test(du), 'Z move is blocked by a wall (slides along X)');
const cw = extractFunction('_carWall');
assert(/if\(!physWorld \|\| !RAPIER \|\| !RAPIER\.Ray \|\| typeof physWorld\.castRay!=='function'\) return false;/.test(cw), 'collision degrades to none if Rapier is unavailable');
assert(/new RAPIER\.Ray\(\{x:ox, y, z:oz\}, \{x:dx, y:0, z:dz\}\)/.test(cw) && /physWorld\.castRay\(ray, dist\+0\.12, true\)/.test(cw), 'casts forward rays against the world');
assert(/\}\s*catch\(e\)\{ return false; \}/.test(cw), 'a cast error never breaks driving');
// build 716/724: ramps + openings work — block only on SOLID geometry at the car's body height (just above the tallest
// climbable step). A wall hits there; a ramp/kerb is below it (climbed); an archway/doorway is open there (driven through).
assert(/const MAX_RISE = Math\.max\(0\.9, half\.hh\);/.test(cw), 'a max climbable rise is defined');
assert(/const y = baseY \+ MAX_RISE \+ 0\.15 \+ start\*0\.45;/.test(cw), 'rays are cast above the tallest climbable step + a ramp-clearance term (so openings + ramps pass, walls block)');
assert(/if\(physWorld\.castRay\(ray, dist\+0\.12, true\)\) return true;/.test(cw), 'a hit at body height = wall; an archway/ramp passes (no surfaceTopAt over-blocking)');
assert(/if\(drivingCar\)\{ drivingCar=null; _carReturn=null; \}/.test(extractFunction('startGame')), 'never start a round still driving');
assert(/if\(o\.userData && o\.userData\.vehicle\) return;/.test(extractFunction('addStaticColliderFor')), 'a vehicle gets no static collider (it is moved kinematically)');

// --- build 710 fix: the ground query excludes the car so it can't read its own roof and climb into the sky ---
assert(/function surfaceTopAt\(x, z, exclude, skipDynamic\)\{/.test(src), 'surfaceTopAt takes an exclude');
assert(/const _ex = exclude \? \(h\)=>\{ let o=h\.object; while\(o\)\{ if\(o===exclude\) return true; o=o\.parent; \} return false; \} : null;/.test(src), 'exclude drops an object (and its children) from the surface result');
assert(/const gC=_carGroundY\(o\.position\.x, o\.position\.z, o\);/.test(src), 'driveUpdate samples its ground excluding the car itself');
// build 717: ramp-aware vertical — 4-corner ground sample, surface tilt, gravity + launch
assert(/const gF=_carGroundY\(o\.position\.x\+hx\*_hd[\s\S]*?const gB=_carGroundY\(o\.position\.x-hx\*_hd/.test(src), 'samples front + back ground (heading frame) to tilt to the ramp');
assert(/_vy -= GRAV\*0\.85\*dt;/.test(src), 'the car has gravity (so it can leave a ramp)');
assert(/const _launch=\(_climb>0\.8 && _climb<22\)\?Math\.min\(_climb,7\):0;/.test(src), 'a real ramp banks launch velocity (capped); a sudden spike (wall ram) does not');
assert(/_carEuler\.set\(o\.userData\.carPitch \+ o\.userData\.leanPitch, carYaw, o\.userData\.carRoll \+ o\.userData\.leanRoll\);/.test(src) && /o\.quaternion\.copy\(_carQuat\)\.multiply\(_carModelQ\);/.test(src), 'the body pitches/rolls to the surface + suspension lean (build 729)');

// --- serialize + restore (compact veh) at all three prop-load sites ---
assert(/if\(o\.userData\.vehicle\)\{ const V=o\.userData\.vehicle; e\.veh=\{ maxSpeed:V\.maxSpeed, accel:V\.accel, turn:V\.turn, reverse:V\.reverse \}; if\(V\.units==='mph'\) e\.veh\.units='mph'; if\(V\.boost>1\.01\)\{ e\.veh\.boost=V\.boost; e\.veh\.boostDur=V\.boostDur; e\.veh\.boostCd=V\.boostCd; \} if\(V\.modelYaw\) e\.veh\.modelYaw=V\.modelYaw; if\(V\.pivot\) e\.veh\.pivot=V\.pivot;/.test(src), 'vehicle (+ units + boost + model facing + pivot) serialized');
eq(src.split('if(p.veh) vehicleApply(obj, p.veh);').length - 1, 3, 'vehicle restored at all three prop-load sites');

// --- editor fold ---
assert(/edFold\(animHost, 'vehicle', 'Vehicle \(drivable\)'/.test(src), 'a Vehicle (drivable) fold in the inspector');
assert(/row\('Top speed \('\+U\.l\+'\)','maxSpeed', 5, 200, 1, U\.f\)/.test(src) && /row\('Turn rate \(°\/s\)','turn', 20, 400, 1, 1\)/.test(src), 'top-speed (in units) + finer turn-rate controls (build 718)');
assert(/\[\['kph','km\/h'\],\['mph','mph'\]\]/.test(src) && /V\.units=o\[0\]/.test(src), 'a km/h <-> mph units toggle');
assert(/units:\(v\.units==='mph'\?'mph':'kph'\)/.test(extractFunction('vehicleApply')), 'vehicleApply stores the unit');

// --- build 719: boost (hold Shift), forward arrow, no self-crush ---
assert(/boost:Math\.max\(1, Math\.min\(4, \+v\.boost\|\|1\)\), boostDur:Math\.max\(0\.5, \+v\.boostDur\|\|3\), boostCd:Math\.max\(0, \+v\.boostCd\|\|5\)/.test(extractFunction('vehicleApply')), 'vehicleApply has boost / duration / cooldown');
assert(/else if\(boostKey && bMult>1\.01 && \(o\.userData\.boostCdT\|\|0\)<=0 && throttle>0\)\{ o\.userData\.boostT=\+cfg\.boostDur\|\|3; \}/.test(du), 'Shift engages boost (forward, off cooldown)');
assert(/const effCfg = boosting \? \{ maxSpeed:cfg\.maxSpeed\*bMult, accel:cfg\.accel\*1\.5/.test(du), 'boost raises top speed + acceleration');
assert(/o\.userData\.boostCdT=\+cfg\.boostCd\|\|0;/.test(du), 'boost falls into cooldown when it expires');
assert(/row\('Boost ×','boost', 1, 4, 0\.05, 1\)/.test(src), 'editor exposes the boost controls');
const sv = extractFunction('_setVehArrow');
assert(/const isVeh = o && editorOpen && editorActive==='props' && o\.userData && o\.userData\.vehicle;/.test(sv), 'the forward arrow only shows on a selected vehicle in the editor');
assert(/_vaFwd\.set\(0,0,-1\)\.applyAxisAngle\(_UP_Y, \(o\.userData\.vehicle\.modelYaw\|\|0\)\*RAD\)\.applyQuaternion\(o\.quaternion\)/.test(sv), 'the arrow points along the model facing (forward + modelYaw offset)');

// --- build 720: Model facing (modelYaw) — orient the model independently of the drive direction ---
assert(/modelYaw:\+v\.modelYaw\|\|0/.test(extractFunction('vehicleApply')), 'vehicleApply stores a modelYaw offset');
assert(/o\.userData\.carYaw = o\.rotation\.y \+ \(o\.userData\.vehicle\.modelYaw\|\|0\)\*RAD;/.test(extractFunction('enterCar')), 'entering seeds the logical heading from the nose (placement + modelYaw)');
assert(/const carYaw=o\.userData\.carYaw, hx=-Math\.sin\(carYaw\), hz=-Math\.cos\(carYaw\);/.test(du), 'the heading frame is derived from carYaw (decoupled from mesh rotation)');
assert(/_carModelQ\.setFromAxisAngle\(_UP_Y, -\(cfg\.modelYaw\|\|0\)\*RAD\);/.test(du), 'the mesh is spun by -modelYaw so the nose lines up with travel');
assert(/row\('Model facing \(°\)','modelYaw', -180, 180, 1, 1\)/.test(src), 'editor exposes a Model facing slider');

// --- build 721: turn pivot — rotate around a forward offset (the centre/front) instead of the mesh origin ---
assert(/pivot:\+v\.pivot\|\|0/.test(extractFunction('vehicleApply')), 'vehicleApply stores a pivot offset');
// during a yaw change the origin shifts by (fwdOld - fwdNew)*pivot so the pivot point stays put
assert(/const _pv=\+cfg\.pivot\|\|0;/.test(du) && /o\.position\.x \+= \(Math\.sin\(_yn\) - Math\.sin\(_yawOld\)\)\*_pv;/.test(du) && /o\.position\.z \+= \(Math\.cos\(_yn\) - Math\.cos\(_yawOld\)\)\*_pv;/.test(du), 'the turn pivots around the forward offset, not the origin');
assert(/player\.pos\.set\(o\.position\.x \+ hx\*_pv, o\.position\.y\+EYE, o\.position\.z \+ hz\*_pv\)/.test(du), 'the rider sits at the pivot (centre, heading frame), not the tail');
assert(/if\(V\.pivot\) e\.veh\.pivot=V\.pivot;/.test(src), 'pivot is serialized');
assert(/row\('Pivot \(m\)','pivot', -12, 12, 0\.1, 1\)/.test(src) && /Center pivot on model/.test(src), 'editor exposes a Pivot slider + a Center-pivot helper');
const sva = extractFunction('_setVehArrow');
assert(/pd\.position\.copy\(o\.position\)\.addScaledVector\(_vaFwd, pv\);/.test(sva), 'a pivot marker is drawn at origin + nose*pivot');

// --- the turn-pivot math: rotating about a point pivot metres ahead keeps that point fixed ---
{ const pv=3, y0=0, y1=0.4;   // a 0.4 rad step
  const f0x=-Math.sin(y0), f0z=-Math.cos(y0), f1x=-Math.sin(y1), f1z=-Math.cos(y1);
  let ox=0, oz=0;                      // origin starts at world 0
  const Px=ox+f0x*pv, Pz=oz+f0z*pv;   // pivot point before the turn
  ox += (Math.sin(y1)-Math.sin(y0))*pv; oz += (Math.cos(y1)-Math.cos(y0))*pv;   // the build-721 correction
  const Px2=ox+f1x*pv, Pz2=oz+f1z*pv; // pivot point after the turn
  near(Px2, Px, 1e-9, 'pivot X is unmoved by the turn'); near(Pz2, Pz, 1e-9, 'pivot Z is unmoved by the turn'); }

// --- build 722: fit-to-model placement — chase-cam distance/height + ride height (no float/sink) ---
assert(/camDist:\+v\.camDist\|\|0, camHigh:\+v\.camHigh\|\|0, rideHeight:\+v\.rideHeight\|\|0/.test(extractFunction('vehicleApply')), 'vehicleApply stores camera + ride trims');
assert(/o\.userData\.carBaseOff = _bb\.isEmpty\(\)\?0:\(o\.position\.y - _bb\.min\.y\);/.test(extractFunction('enterCar')), 'entering measures origin->lowest-point so the wheels rest on the ground');
assert(/const _base=\(o\.userData\.carBaseOff\|\|0\)\+\(\+cfg\.rideHeight\|\|0\); let _rest=gC\+_base;/.test(du), 'the car rests at ground + base offset (+ ride trim), not origin-on-ground');
assert(/if\(_ny<=_rest\)\{ _ny=_rest;/.test(du) && /const _grounded=\(_ny-_rest\)<0\.12;/.test(du), 'the vertical solve snaps + grounds against the rest height');
assert(/const _maxUp=_cy \+ Math\.max\(0\.6, _h\.hh\*1\.2\);/.test(du) && /if\(_rest>_maxUp\) _rest=_maxUp;/.test(du), 'build 724: the per-frame climb is capped so a fast hit cannot rocket the car out of the arena');
assert(/const _cd=Math\.max\(2\.5, _ex\.hd\*2\.4 \+ _ex\.hw\*0\.5 \+ 4 \+ \(\+_vv\.camDist\|\|0\)\);/.test(src), 'chase-cam distance fits the model depth/width, trimmable by camDist');
assert(/const _ch=Math\.max\(1\.2, _ex\.hh\*1\.8 \+ 1\.5 \+ \(\+_vv\.camHigh\|\|0\)\);/.test(src) && /camera\.position\.set\(_tx - fx\*_cd, o\.position\.y \+ _ch, _tz - fz\*_cd\)/.test(src), 'chase-cam height fits the model height, trimmable by camHigh');
assert(/if\(V\.camDist\) e\.veh\.camDist=V\.camDist; if\(V\.camHigh\) e\.veh\.camHigh=V\.camHigh; if\(V\.rideHeight\) e\.veh\.rideHeight=V\.rideHeight;/.test(src), 'camera + ride trims serialized');
assert(/row\('Camera back \(±m\)','camDist'/.test(src) && /row\('Camera up \(±m\)','camHigh'/.test(src) && /row\('Ride height \(±m\)','rideHeight'/.test(src), 'editor exposes camera + ride-height rows');

// --- build 723: vehicle physics — ignore dynamic props as ground (no fling) + shove them out of the way ---
const st = extractFunction('surfaceTopAt');
assert(/function surfaceTopAt\(x, z, exclude, skipDynamic\)\{/.test(st), 'surfaceTopAt takes a skipDynamic flag');
assert(/if\(dynamicProps\.length && !skipDynamic\)\{/.test(st), 'skipDynamic drops dynamic props from the surface result');
assert(/const s=surfaceTopAt\(x,z,exclude,true\);/.test(extractFunction('_carGroundY')), 'the car ground query skips dynamic props (so it never rides up + launches off a barrel)');
const sh = extractFunction('_carShoveDynamics');
assert(/const b = p\.userData && p\.userData\.phys && p\.userData\.phys\.body; if\(!b\) continue;/.test(sh), 'only dynamic props with a physics body are shoved');
assert(/if\(sp < 1\.2\) return 0;/.test(sh), 'a near-stopped car does not shove (so it can rest against props)');
assert(/const ahead=dx\*tx \+ dz\*tz; if\(ahead < -0\.3\) continue;/.test(sh), 'props behind the travel direction are not dragged');
assert(/pushDynamic\(p, _carShoveDir, sp\*m\*14\*dt, p\.position\)/.test(sh), 'shove impulse scales with speed * mass (heavier/faster = bigger launch)');
assert(/if\(typeof NET==='undefined' \|\| NET\.mode!=='client'\)\{ const _sgn=Math\.sign\(r\.speed\)\|\|1; const _react=_carShoveDynamics\(o, r\.speed, fx\*_sgn, fz\*_sgn, _h, dt\);/.test(du), 'the host/solo shoves dynamic props each frame along the travel direction');

// --- build 734: Newton's 3rd law — a heavy prop shoves the car back (mass matters both ways) ---
assert(/reaction \+= m \* Math\.max\(0, nx\*tx \+ nz\*tz\);/.test(sh) && /return reaction;/.test(sh), 'the shove accumulates a mass-weighted, head-on reaction and returns it');
assert(/if\(_react>0\)\{ const CARM=8, _slow=Math\.min\(0\.55, \(_react\/CARM\)\*dt\*3\); o\.userData\.carSpeed\*=\(1-_slow\); r\.speed\*=\(1-_slow\); if\(_react>20 && \(o\.userData\._hitCd\|\|0\)<=0\)\{ o\.userData\._hitCd=0\.3; _carImpactFx\(o, Math\.min\(14,_react\*0\.4\)\); \} \}/.test(du), 'a heavy prop slows the car (and jolts it if very heavy); a light barrel barely registers');

// executable: reaction scales with mass — a heavy crate bites, a barrel barely does
{ const react=(m)=>m*1;   // head-on (nx*tx+nz*tz = 1)
  const slow=(r)=>Math.min(0.55, (r/8)*(1/60)*3);
  assert(slow(react(50)) > slow(react(1)), 'a 50kg crate slows the car far more than a 1kg barrel');
  assert(slow(react(1)) < 0.02, 'a light barrel barely slows the car'); }

// executable: the shove direction points roughly along travel and away from the car, never backward into it
{ const shove = new Function('dynamicProps','heldProp','pushDynamic',
    'const _carShoveDir={x:0,y:0,z:0};\n' + extractFunction('_carShoveDynamics') + '\nreturn _carShoveDynamics;');
  let captured=null;   // a fake world: one barrel 1m in front of the car (moving +X), and a capturing pushDynamic
  const props=[{ position:{x:1,y:0,z:0}, userData:{ phys:{ body:{} }, mass:1 } }];
  const pd=(p,dir,strength)=>{ captured={ x:dir.x, z:dir.z, strength }; };
  const fn = shove(props, null, pd);
  fn({ position:{x:0,y:0,z:0} }, 10, 1, 0, { hw:0.6, hh:0.5, hd:1.2 }, 1/60);
  assert(captured && captured.x>0, 'a barrel ahead is pushed forward (+X), not backward');
  assert(captured.strength>0, 'the shove has positive strength when moving');
  // a barrel directly behind the travel direction is left alone
  captured=null; const back=[{ position:{x:-1,y:0,z:0}, userData:{ phys:{ body:{} }, mass:1 } }];
  shove(back, null, pd)({ position:{x:0,y:0,z:0} }, 10, 1, 0, { hw:0.6, hh:0.5, hd:1.2 }, 1/60);
  assert(captured===null, 'a barrel behind the car is not dragged along'); }

// --- build 725: A/D steering + grip/drift model (travel direction lags the heading; handbrake to slide) ---
assert(/grip:Math\.max\(0\.5, \+v\.grip\|\|6\)/.test(extractFunction('vehicleApply')), 'vehicleApply stores grip (default 6)');
assert(/o\.userData\.carVelYaw = o\.userData\.carYaw;/.test(extractFunction('enterCar')), 'entering aligns the travel direction with the heading (no drift until you turn)');
assert(/const handbrake=\(keys\['Space'\]\|\|keys\['KeyB'\]\);/.test(du), 'Space / B is the handbrake');
assert(/const gripBase=Math\.max\(0\.5,\+cfg\.grip\|\|6\), grip=handbrake\?gripBase\*0\.16:gripBase;/.test(du), 'the handbrake cuts grip so the travel dir lags far behind the heading (big slide)');
assert(/const vstep=grip\*dt; o\.userData\.carVelYaw \+= Math\.max\(-vstep,Math\.min\(vstep,vd\)\);/.test(du), 'the travel direction chases the heading at the grip rate');
assert(/const vYaw=o\.userData\.carVelYaw, fx=-Math\.sin\(vYaw\), fz=-Math\.cos\(vYaw\);/.test(du), 'the car MOVES along the travel direction (which may differ from the heading = drift)');
assert(/if\(_slip>0\.15\)\{ const _f=1 - Math\.min\(0\.5,_slip\*0\.4\)\*Math\.min\(1,dt\*5\); o\.userData\.carSpeed\*=_f; r\.speed\*=_f; \}/.test(du), 'tyres scrub speed during a slide');
assert(/if\(V\.grip && V\.grip!==6\) e\.veh\.grip=V\.grip;/.test(src), 'grip serialized when non-default');
assert(/row\('Grip','grip', 1, 12, 0\.5, 1\)/.test(src), 'editor exposes a Grip slider');

// executable: the travel direction eases toward the heading, and slower (more slide) under handbrake
{ const ease=(velYaw, carYaw, grip, dt)=>{ let vd=carYaw-velYaw; vd=Math.atan2(Math.sin(vd),Math.cos(vd)); const s=grip*dt; return velYaw + Math.max(-s,Math.min(s,vd)); };
  const gripped = ease(0, 1.0, 6, 1/60), drifty = ease(0, 1.0, 6*0.16, 1/60);
  assert(gripped>drifty && drifty>0, 'a gripped car aligns its travel to the heading faster than a handbraking one');
  assert(Math.abs(ease(0, 0.0001, 6, 1/60)) < 0.0002, 'no heading change => travel direction barely moves'); }

// --- build 726/727: tilt clamped by ANGLE (no roll-over, correct ramp pitch at any length) + handbrake brakes ---
assert(/const _TP=0\.72, _TR=0\.42;/.test(du), 'pitch is allowed steep (ramps); roll is capped tighter (a wall leans, never flips)');
assert(/let _tp=_grounded\?Math\.atan2\(gF-gB, 2\*_hd\):0, _tr=_grounded\?Math\.atan2\(gR-gL, 2\*_hw\):0;/.test(du), 'tilt is the raw surface slope (no height clamp that throttled a long vehicle on a ramp)');
assert(/_tp=Math\.max\(-_TP,Math\.min\(_TP,_tp\)\); _tr=Math\.max\(-_TR,Math\.min\(_TR,_tr\)\);/.test(du), 'final pitch/roll is angle-capped so the car never tips over and buries itself');
assert(/if\(handbrake && Math\.abs\(r\.speed\)>0\.1\)\{ const _bk=1 - Math\.min\(0\.85, 3\.2\*dt\); o\.userData\.carSpeed\*=_bk; r\.speed\*=_bk; \}/.test(du), 'the handbrake actually brakes (slows the car), not just loosens grip');

// executable: a steep ramp pitches a LONG vehicle correctly (build-726 height-clamp would have throttled it), a wall is bounded
{ const TP=0.72, TR=0.42;
  const hd=2.5, ramp=30*Math.PI/180;              // a long camper on a 30° ramp
  const gF=hd*Math.tan(ramp), gB=-hd*Math.tan(ramp);
  let tp=Math.atan2(gF-gB, 2*hd); tp=Math.max(-TP,Math.min(TP,tp));
  assert(Math.abs(tp-ramp)<1e-9, 'a long vehicle pitches to match the ramp (not under-tilted into it)');
  let tr=Math.atan2(8-0, 2*1); tr=Math.max(-TR,Math.min(TR,tr));   // an 8m wall under one side
  assert(tr===TR, 'a wall under one side is capped (lean, never flip)'); }

// --- build 729: suspension lean / weight transfer (visual offsets on top of the surface tilt) ---
assert(/const _leanRollT=Math\.max\(-0\.07,Math\.min\(0\.07, _yawRate\*r\.speed\*0\.007\)\)\*_leanAmt;/.test(du), 'body rolls out of the corner, scaled by yaw-rate * speed * Body-lean (capped, build 737)');
assert(/const _leanPitchT=Math\.max\(-0\.07,Math\.min\(0\.07, _accel\*0\.005\)\)\*_leanAmt;/.test(du), 'body dives on braking / squats under power, scaled by accel * Body-lean (capped)');
// build 737: adjustable + snappier (no boat sway)
assert(/const _leanAmt=\(cfg\.lean==null\?0\.5:\+cfg\.lean\);/.test(du), 'the lean is scaled by the per-vehicle Body-lean amount (0 = off)');
assert(/const _lk=Math\.min\(1, dt\*8\);/.test(du), 'the lean eases faster now (settles instead of swaying like a boat)');
assert(/lean:\(v\.lean==null\?0\.5:Math\.max\(0, Math\.min\(2, \+v\.lean\|\|0\)\)\)/.test(extractFunction('vehicleApply')), 'vehicleApply stores Body lean (default 0.5)');
assert(/if\(V\.lean!=null && V\.lean!==0\.5\) e\.veh\.lean=V\.lean;/.test(src), 'Body lean serialized when non-default');
assert(/row\('Body lean','lean', 0, 2, 0\.05, 1\)/.test(src), 'editor exposes a Body lean slider (0 = off)');
assert(/o\.userData\.leanRoll =\(o\.userData\.leanRoll \|\|0\)\+\(_leanRollT -\(o\.userData\.leanRoll \|\|0\)\)\*_lk;/.test(du), 'the lean eases (suspension feel), not a snap');
assert(/o\.userData\.leanRoll=0; o\.userData\.leanPitch=0; o\.userData\._prevSpeed=0;/.test(extractFunction('enterCar')), 'lean starts neutral on enter');

// executable: lean signs — turning leans, accel/brake pitch the body the right way
{ const clamp=(v,m)=>Math.max(-m,Math.min(m,v));
  const rollTurning=clamp(2.0*12*0.012, 0.13), rollStraight=clamp(0*12*0.012, 0.13);
  assert(rollTurning>0 && rollStraight===0, 'turning at speed leans the body; going straight does not');
  const pitchAccel=clamp(18*0.006, 0.1), pitchBrake=clamp(-30*0.006, 0.1);
  assert(pitchAccel>0 && pitchBrake<0, 'power squats (nose up, +) and braking dives (nose down, -)'); }

// --- build 730: speed-sensitive FOV + camera shake on the chase cam ---
assert(/const _baseFov=\(typeof worldCfg!=='undefined'&&worldCfg\.fov\)\?worldCfg\.fov:78, _fovT=_baseFov \+ _sf\*12 \+ _bst\*9;/.test(src), 'FOV target widens with speed fraction + a boost kick');
assert(/camera\.fov \+= \(_fovT-camera\.fov\)\*Math\.min\(1,dt\*4\); camera\.updateProjectionMatrix\(\);/.test(src), 'FOV eases toward the target each frame');
assert(/if\(_shk>0\.0006\)\{ camera\.rotation\.x \+= \(Math\.random\(\)-0\.5\)\*_shk; camera\.rotation\.y \+= \(Math\.random\(\)-0\.5\)\*_shk; \}/.test(src), 'a faint shake scales with speed/boost');
assert(/camera\.fov=worldCfg\.fov; camera\.updateProjectionMatrix\(\); \}   \/\/ build 730: restore the normal FOV/.test(extractFunction('exitCar')), 'exiting restores the normal FOV');

// --- build 733: impact feedback — a hard head-on wall hit jolts/thuds/throws debris (not a silent stop) ---
assert(/if\(mvx===0 && mvz===0 && _imp0>5 && o\.userData\._hitCd<=0\)\{ o\.userData\._hitCd=0\.35; o\.userData\.carSpeed=r\.speed\*0\.1; r\.speed=o\.userData\.carSpeed; _carImpactFx\(o, _imp0\); \}/.test(du), 'a hard head-on hit fires impact FX once per hit (cooldown)');
const cfx = extractFunction('_carImpactFx');
assert(/o\.userData\.hitShake=Math\.max\(o\.userData\.hitShake\|\|0, 0\.02 \+ f\*0\.06\);/.test(cfx) && /_carThud\(f\)/.test(cfx), 'impact jolts the camera + thuds, scaled by impact speed');
assert(/for\(let i=0;i<5;i\+\+\) _spawnDust\(nx, o\.position\.y\+0\.3, nz/.test(cfx), 'impact throws a debris burst at the nose');
assert(/o\.userData\.hitShake=_hs\*\(1-Math\.min\(1,dt\*5\)\);/.test(src), 'the impact jolt decays in the chase cam');
assert(/o\.userData\.hitShake=0; o\.userData\._hitCd=0;/.test(extractFunction('enterCar')), 'impact state resets on enter');

done('build 709-734: drivable vehicles — … / suspension lean / speed-FOV+shake / impact feedback / heavy-prop push-back');
