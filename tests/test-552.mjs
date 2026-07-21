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
assert(/nearTarget\.type==='vehicle'[\s\S]*?prompt\.innerHTML = `<b>\$\{_uk\}<\/b> Drive`;/.test(src), 'the prompt reads "Drive" with the key named per device (build 935)');
assert(/if\(drivingCar\)\{ exitCar\(\); return; \}/.test(extractFunction('interact')), 'E gets you out while driving');
assert(/nearTarget\.type==='vehicle'\)\{\s*enterCar\(nearTarget\.obj\);/.test(extractFunction('interact')), 'E on a vehicle gets you in');
assert(/if\(drivingCar\)\{ wish\.set\(0,0,0\); moveScale=0; \}/.test(src), 'foot movement is frozen while driving');
assert(/if\(drivingCar\) driveUpdate\(dt\);/.test(src), 'driveUpdate runs each frame while driving');
assert(/\} else if\(drivingCar\)\{[\s\S]*?const o=drivingCar, yaw=player\.yaw[\s\S]*?camera\.position\.set\(_tx - fx\*_cd/.test(src), 'a chase camera orbits with the look (player.yaw)');

// --- build 764: A/D steer the car DIRECTLY; the mouse is a free-orbit camera only (no longer steers) ---
const du = extractFunction('driveUpdate');
assert(/let steer=0; if\(keys\[BINDS\.left\]\) steer\+=1; if\(keys\[BINDS\.right\]\) steer-=1;/.test(du), 'A/D (rebindable) set the steer input');
assert(/o\.userData\.carYaw \+= _cmdYaw \* \(r\.speed<-0\.05\?-1:1\) \* dt;/.test(du) && /const _wantYaw=steer\*\(cfg\.turn\*RAD\)\*speedFrac;/.test(du), 'steer turns the heading (build 820: capped by lateral G), scaled by speed, inverted in reverse');
assert(!/player\.yaw \+= steer/.test(du) && !/diff = player\.yaw/.test(du), 'A/D no longer move the camera (player.yaw), and the car no longer chases the look');

// --- build 765: optional follow-cam toggle (trails behind the car, recenters when you stop orbiting) ---
assert(/camFollow:!!v\.camFollow/.test(extractFunction('vehicleApply')), 'vehicleApply stores the follow-cam flag');
assert(/if\(V\.camFollow\) e\.veh\.camFollow=1;/.test(src), 'follow-cam serialized when on');
assert(/function _carFollowMode\(o\)\{ if\(_carFollowOverride!=null\) return _carFollowOverride;/.test(src), 'a session override (V) wins over the vehicle default');
assert(/if\(_carFollowMode\(drivingCar\) && _carViewMode\(drivingCar\)!=='cockpit'\)\{/.test(src), 'the recenter only runs in chase view when follow is on');
assert(/player\.yaw \+= _rd \* Math\.min\(1, dt\*2\.2\);/.test(src), 'the look heading eases toward the car heading (gentle trail)');
assert(/if\(drivingCar && mx\) drivingCar\.userData\._lookCd = 0\.6;/.test(src), 'moving the mouse pauses the recenter (free orbit while you look)');
assert(/e\.code==='KeyV'[\s\S]*?_carFollowOverride = !_carFollowMode\(drivingCar\)/.test(src), 'V toggles follow-cam vs free orbit live');
assert(/<b>Camera follows the car<\/b>/.test(src), 'the editor exposes the follow-cam toggle');

// --- build 766: "press E to drive" appears within enterDist of ANY part of the model (footprint), + force-exit on editor/unload ---
assert(/enterDist:\(v\.enterDist==null\?2\.5:Math\.max\(0\.5,Math\.min\(12,\+v\.enterDist\|\|0\)\)\)/.test(extractFunction('vehicleApply')), 'vehicleApply stores the enter radius (default 2.5)');
assert(/if\(V\.enterDist!=null && V\.enterDist!==2\.5\) e\.veh\.enterDist=V\.enterDist;/.test(src), 'enter radius serialized when non-default');
assert(/const dx=Math\.max\(bx\.min\.x-px, 0, px-bx\.max\.x\), dz=Math\.max\(bx\.min\.z-pz, 0, pz-bx\.max\.z\);/.test(src), 'distance is measured to the model footprint (box), not its origin');
assert(/const rad=\(o\.userData\.vehicle\.enterDist!=null\?Math\.max\(0\.5,\+o\.userData\.vehicle\.enterDist\):2\.5\);/.test(src) && /if\(d<rad && d<bd\)/.test(src), 'the prompt shows within the enter radius of any part');
assert(/row\('Enter radius \(m\)','enterDist', 0\.5, 12, 0\.5, 1\)/.test(src), 'the editor exposes an Enter radius slider');
assert(/if\(!editorOpen && drivingCar && typeof exitCar==='function'\) exitCar\(\);/.test(extractFunction('toggleEditor')), 'opening the editor forces you out of the car (no stuck speedo)');
assert(/addEventListener\('pagehide', \(\)=>\{ try\{ if\(drivingCar && typeof exitCar==='function'\) exitCar\(\);/.test(src), 'leaving the page (refresh/close) forces you out of the car');

// --- build 768: turbo flames out the exhaust while boosting (toggle) ---
assert(/boostFlame:!!v\.boostFlame/.test(extractFunction('vehicleApply')), 'vehicleApply stores the boost-flame flag');
assert(/if\(V\.boostFlame\) e\.veh\.boostFlame=1;/.test(src), 'boost-flame serialized when on');
assert(/blending:THREE\.AdditiveBlending/.test(extractFunction('_ensureFlamePool')), 'the flame particles are additive-blended (glow)');
assert(/const _k=0\.35\+0\.65\*f, _wf=Math\.max\(0,\(f-0\.55\)\)\*1\.3;/.test(extractFunction('_updateFlames')) && /m\.material\.color\.setRGB\(Math\.min\(1,d\.r\*_k\+_wf\)/.test(extractFunction('_updateFlames')), 'flames glow white-hot fresh and cool toward the base colour as they fade (any hue)');
assert(/if\(_boosting && cfg\.boostFlame\)\{[\s\S]*?_spawnFlame\(/.test(du), 'boosting + the toggle emits flames out the rear');
assert(/const _fbx=o\.position\.x - hx\*\(_hd\*0\.96\+_bk\) \+ _rx\*_sd, _fbz=o\.position\.z - hz\*\(_hd\*0\.96\+_bk\) \+ _rz\*_sd;/.test(du), 'flames spawn at the rear-centre (exhaust) plus the position offsets');
assert(/<b>Flames on boost<\/b>/.test(src), 'the editor exposes the boost-flame toggle');
// build 771: flame controls — position offsets, density, size, colour
assert(/flameColor:\(v\.flameColor!=null\?\(v\.flameColor\|0\):0xff7a3d\)/.test(extractFunction('vehicleApply')) && /flameSize:\(v\.flameSize==null\?1:/.test(extractFunction('vehicleApply')) && /flameDensity:\(v\.flameDensity==null\?1:/.test(extractFunction('vehicleApply')), 'vehicleApply stores flame colour/size/density');
assert(/const _n=Math\.max\(1, Math\.round\(3\*_dens\)\);/.test(du), 'flame density scales the particles per emit');
assert(/\(0\.5\+Math\.random\(\)\*0\.4\)\*_sz, _col\)/.test(du), 'flame size scales each particle and the colour is passed through');
assert(/if\(col!=null\)\{ d\.r=\(\(col>>16\)&255\)\/255; d\.g=\(\(col>>8\)&255\)\/255; d\.b=\(col&255\)\/255; \}/.test(extractFunction('_spawnFlame')), 'the flame colour is unpacked per particle');
assert(/row\('Flame size','flameSize'/.test(src) && /row\('Flame density','flameDensity'/.test(src) && /ci\.type='color'/.test(src), 'the editor exposes flame size/density/colour controls (when flames are on)');

// --- build 769: penetration spring so props don't clip half-into the car at low speed ---
assert(/const sp = Math\.abs\(speed\); if\(sp < 0\.2\) return 0;/.test(extractFunction('_carShoveDynamics')), 'the car reacts at a crawl (shove gate lowered from 1.2 to 0.2 m/s)');
// build 776: the shove centres on the footprint (origin + offset), so an off-centre model origin doesn't shift the collision
assert(/const cx=o\.position\.x \+ tx\*_oz \+ rxu\*_ox, cy=o\.position\.y \+ \(half\.oy\|\|0\), cz=o\.position\.z \+ tz\*_oz \+ rzu\*_ox;/.test(extractFunction('_carShoveDynamics')), 'the shove is centred on the hit-box footprint, matching the orange outline');
assert(/const frontPen=\(hd\+pr\)-ahead, sidePen=\(hw\+pr\)-Math\.abs\(side\);/.test(extractFunction('_carShoveDynamics')), 'penetration is measured into the oriented footprint (front + side)');
assert(/const _hor=\(sp\*14 \+ penImp\*50\)\*m\*dt, _ver=Math\.min\(sp\*3\.5, 5\)\*m\*dt;/.test(extractFunction('_carShoveDynamics')), 'horizontal = speed knock + depth spring; vertical arc scales with speed only (build 777)');
// executable: a slow car still shoves a barrel sunk into its footprint; a near-parked one rests
{ const calls=[];
  const dyn=[{ position:{x:1,y:0,z:0}, userData:{ mass:2, physInfo:{radius:0.4}, phys:{ body:{} } } }];
  const shove = new Function('dynamicProps','heldProp','pushDynamic','_carShoveDir',
    extractFunction('_carShoveDynamics') + '\nreturn _carShoveDynamics;')(
    dyn, null, (p,dir,str)=>calls.push(str), {x:0,y:0,z:0});
  const car={position:{x:0,y:0,z:0}, userData:{}}, half={hw:1, hh:0.5, hd:2.2};
  calls.length=0; shove(car, 0.3, 1, 0, half, 1/60);
  assert(calls.length===1 && calls[0]>0, 'a slow (0.3 m/s) car still shoves a barrel sunk into its footprint');
  calls.length=0; shove(car, 0.1, 1, 0, half, 1/60);
  assert(calls.length===0, 'a near-parked car (<0.2 m/s) rests against props instead of shoving');
  calls.length=0; dyn[0].position.x=20; shove(car, 2, 1, 0, half, 1/60);
  assert(calls.length===0, 'a barrel well out of reach is not shoved'); }

// --- build 770: bail out at speed and the car keeps coasting (momentum) ---
assert(/ejectCoast:\(v\.ejectCoast==null\?true:!!v\.ejectCoast\)/.test(extractFunction('vehicleApply')), 'vehicleApply stores the eject-coast flag (default on)');
assert(/if\(V\.ejectCoast===false\) e\.veh\.ejectCoast=0;/.test(src), 'eject-coast serialized only when turned off');
assert(/if\(\(_ecfg\.ejectCoast!==false\) && Math\.abs\(_esp\)>5\)\{ o\.userData\._coastT=6; if\(_coastingCars\.indexOf\(o\)<0\) _coastingCars\.push\(o\); \}/.test(extractFunction('exitCar')), 'exiting above 5 m/s keeps the car rolling instead of stopping it');
assert(/const _ci=_coastingCars\.indexOf\(o\); if\(_ci>=0\) _coastingCars\.splice\(_ci,1\)/.test(extractFunction('enterCar')), 'jumping back in cancels the coast');
const uc = extractFunction('_updateCoastCars');
assert(/sp \*= \(1 - Math\.min\(0\.85, 0\.5\*dt\)\);/.test(uc) && /sp -= Math\.sign\(sp\)\*Math\.min\(Math\.abs\(sp\), \(4\+Math\.abs\(sp\)\*0\.12\)\*dt\);/.test(uc), 'a coasting car decelerates (drag + roll resistance)');
assert(/if\(Math\.abs\(sp\)<1\.2 \|\| o\.userData\._coastT<=0\)\{ _stopCoast\(o\)/.test(uc), 'it parks when it slows to a crawl or the coast window ends');
assert(/if\(mvx===0 && mvz===0\)\{ _stopCoast\(o\)/.test(uc), 'a coasting car parks when it hits a wall');
assert(/if\(cfg\.wheels && typeof _updateWheels==='function'\) _updateWheels\(o, cfg, sp, 0, dt\);/.test(uc), 'the wheels keep rolling while it coasts');
assert(/if\(_coastingCars\.length\) _updateCoastCars\(dt\);/.test(src), 'the main loop advances coasting cars each frame');
assert(/<b>Keep rolling on exit<\/b>/.test(src), 'the editor exposes the keep-rolling toggle');
// executable: deceleration brings a fast coast down and never reverses sign
{ let sp=40; const step=(s,dt)=>{ s*=(1-Math.min(0.85,0.5*dt)); s-=Math.sign(s)*Math.min(Math.abs(s),(4+Math.abs(s)*0.12)*dt); return s; };
  for(let t=0;t<600;t++) sp=step(sp,1/60);   // ~10s
  assert(sp>=0 && sp<1.2, 'a 40 m/s coast decelerates to a near stop (never reverses)'); }
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
{ const asc=extractFunction('addStaticColliderFor');
  assert(/if\(o\.userData && o\.userData\.vehicle\)\{/.test(asc), 'a vehicle gets no static collider (it is moved kinematically)');
  // build 746: but it DOES get a kinematic body (no collider) so a trailer can be jointed/towed
  assert(/o\.userData\._kbody = physWorld\.createRigidBody\(RAPIER\.RigidBodyDesc\.kinematicPositionBased\(\)/.test(asc), 'build 746: a drivable car gets a kinematic body so a trailer can be hitched + towed'); }

// --- build 710 fix: the ground query excludes the car so it can't read its own roof and climb into the sky ---
assert(/function surfaceTopAt\(x, z, exclude, skipDynamic, ceilY, skipVehicles\)\{/.test(src), 'surfaceTopAt takes an exclude');
assert(/const _ex = exclude \? \(h\)=>\{ let o=h\.object; while\(o\)\{ if\(o===exclude\) return true; o=o\.parent; \} return false; \} : null;/.test(src), 'exclude drops an object (and its children) from the surface result');
assert(/const gC=_carGroundY\(o\.position\.x, o\.position\.z, o, _ceil\);/.test(src), 'driveUpdate samples its ground excluding the car itself, capped at headroom');
assert(/const _ceil=o\.position\.y \+ _h\.hh\*2 \+ 0\.6;/.test(src), 'build 739: the ground query is capped at the car\'s headroom so it ignores roofs/overhangs (no climbing onto buildings)');
assert(/const _cap = \(ceilY!=null\) \? ceilY : Infinity;/.test(src) && /if\(h\.point\.y > _cap\) continue;/.test(src), 'surfaceTopAt ignores any surface above the ceiling (the roof over a doorway)');
// build 717: ramp-aware vertical — 4-corner ground sample, surface tilt, gravity + launch
assert(/gF:_carGroundY\(o\.position\.x\+hx\*_hd[\s\S]*?_ceil\),[\s\S]*?gB:_carGroundY\(o\.position\.x-hx\*_hd/.test(src), 'samples front + back ground (heading frame) to tilt to the ramp (build 809: via the ~25Hz corner cache)');
assert(/const _ccStale=!_cc \|\| \(_ccNow-_cc\.t>40\)/.test(src) && /const gC=_carGroundY\(o\.position\.x, o\.position\.z, o, _ceil\);/.test(src), 'the centre sample stays live (rest height); only the tilt corners are cached');
assert(/_vy -= GRAV\*\(_airb\?1:0\.85\)\*dt;/.test(src), 'the car has gravity — FULL gravity in flight (build 824), so a jump arcs with weight');
assert(/const _launch=\(_slope>0\.06 && _slope<1\.2 && Math\.abs\(r\.speed\)>2\) \? Math\.min\(_slope\*Math\.abs\(r\.speed\), 18\)\*_lm : 0;/.test(src), 'build 824: launch = ramp SLOPE x speed (a kerb step no longer fires it); a wall face (slope>1.2) never launches');
assert(/_carEuler\.set\(o\.userData\.carPitch \+ o\.userData\.leanPitch, carYaw, o\.userData\.carRoll \+ o\.userData\.leanRoll\);/.test(src) && /o\.quaternion\.copy\(_carQuat\)\.multiply\(_carModelQ\);/.test(src), 'the body pitches/rolls to the surface + suspension lean (build 729)');

// --- serialize + restore (compact veh) at all three prop-load sites ---
assert(/if\(o\.userData\.vehicle\)\{ const V=o\.userData\.vehicle; e\.veh=\{ maxSpeed:V\.maxSpeed, accel:V\.accel, turn:V\.turn, reverse:V\.reverse \}; if\(V\.units==='mph'\) e\.veh\.units='mph'; if\(V\.boost>1\.01\)\{ e\.veh\.boost=V\.boost; e\.veh\.boostDur=V\.boostDur; e\.veh\.boostCd=V\.boostCd; \} if\(V\.modelYaw\) e\.veh\.modelYaw=V\.modelYaw; if\(V\.pivot\) e\.veh\.pivot=V\.pivot;/.test(src), 'vehicle (+ units + boost + model facing + pivot) serialized');
eq(src.split('if(p.veh) vehicleApply(obj, p.veh);').length - 1, 4, 'vehicle restored at all four entry-apply sites (+ prefab spawn, build 1030)');

// --- editor fold ---
assert(/edFold\(motionHost, 'vehicle', 'Vehicle \(drivable\)'/.test(src), 'a Vehicle (drivable) fold in the inspector');
assert(/row\('Top speed \('\+U\.l\+'\)','maxSpeed', 5, 200, 1, U\.f\)/.test(src) && /row\('Turn rate \(°\/s\)','turn', 20, 400, 1, 1\)/.test(src), 'top-speed (in units) + finer turn-rate controls (build 718)');
assert(/\[\['kph','km\/h'\],\['mph','mph'\]\]/.test(src) && /V\.units=o\[0\]/.test(src), 'a km/h <-> mph units toggle');
assert(/units:\(v\.units==='mph'\?'mph':'kph'\)/.test(extractFunction('vehicleApply')), 'vehicleApply stores the unit');

// --- build 719: boost (hold Shift), forward arrow, no self-crush ---
assert(/boost:Math\.max\(1, Math\.min\(4, \+v\.boost\|\|1\)\), boostDur:Math\.max\(0\.5, \+v\.boostDur\|\|3\), boostCd:Math\.max\(0, \+v\.boostCd\|\|5\)/.test(extractFunction('vehicleApply')), 'vehicleApply has boost / duration / cooldown');
assert(/else if\(boostKey && bMult>1\.01 && \(o\.userData\.boostCdT\|\|0\)<=0 && throttle>0\)\{ o\.userData\.boostT=\+cfg\.boostDur\|\|3;/.test(du), 'Shift engages boost (forward, off cooldown)');
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
assert(/const _horiz=Math\.hypot\(mvx,mvz\);/.test(du) && /const _budget=\(_horiz>0\.015 \? Math\.max\(_horiz\*1\.3, _spd\*dt\*1\.15\) : 0\);/.test(du) && /if\(_rest > _cy \+ _budget\) _rest = _cy \+ _budget;/.test(du), 'build 724/742/826: climb is capped to forward progress OR carried momentum (~52°+ slope) — a wall zeroes forward motion so the car cannot drive up it onto a roof');

// executable: a blocked car (no forward progress) cannot climb; a moving car can climb a drivable slope. build 826: the
// budget takes max(this-frame displacement, carried-speed*dt) so a ramp LIP (one stalled frame, momentum retained) keeps
// climbing — but a blocked car (_horiz==0) still gets zero regardless of the speed it WAS carrying.
{ const budget=(mvx,mvz,spd,dt=1/60)=>{ const h=Math.hypot(mvx,mvz); return (h>0.015? Math.max(h*1.3, spd*dt*1.15) : 0); };
  assert(budget(0,0,20) < 0.001, 'a fully-blocked car gets ~no climb budget even at speed (cannot drive up a wall)');
  assert(budget(0.16,0,10) > 0.16*Math.tan(45*Math.PI/180), 'a car moving 0.16/frame can still climb a 45° ramp');
  // the lip: forward displacement collapses to a crawl for one frame but momentum (speed) is retained -> budget stays open
  assert(budget(0.02,0,18) > budget(0.02,0,0), 'at a ramp lip the carried speed keeps the climb budget open (no sink/clip)'); }
assert(/const _cd=Math\.max\(2\.5, _ex\.hd\*2\.4 \+ _ex\.hw\*0\.5 \+ 4 \+ \(\+_vv\.camDist\|\|0\)\);/.test(src), 'chase-cam distance fits the model depth/width, trimmable by camDist');
assert(/const _ch=Math\.max\(1\.2, _ex\.hh\*1\.8 \+ 1\.5 \+ \(\+_vv\.camHigh\|\|0\)\);/.test(src) && /camera\.position\.set\(_tx - fx\*_cd, o\.position\.y \+ _ch, _tz - fz\*_cd\)/.test(src), 'chase-cam height fits the model height, trimmable by camHigh');
assert(/if\(V\.camDist\) e\.veh\.camDist=V\.camDist; if\(V\.camHigh\) e\.veh\.camHigh=V\.camHigh; if\(V\.rideHeight\) e\.veh\.rideHeight=V\.rideHeight;/.test(src), 'camera + ride trims serialized');
assert(/row\('Camera back \(±m\)','camDist'/.test(src) && /row\('Camera up \(±m\)','camHigh'/.test(src) && /row\('Ride height \(±m\)','rideHeight'/.test(src), 'editor exposes camera + ride-height rows');

// --- build 723: vehicle physics — ignore dynamic props as ground (no fling) + shove them out of the way ---
const st = extractFunction('surfaceTopAt');
assert(/function surfaceTopAt\(x, z, exclude, skipDynamic, ceilY, skipVehicles\)\{/.test(st), 'surfaceTopAt takes a skipDynamic + skipVehicles flag');
assert(/if\(dynamicProps\.length && !skipDynamic\)\{/.test(st), 'skipDynamic drops dynamic props from the surface result');
assert(/const s=surfaceTopAt\(x,z,exclude,true,ceilY,true\);/.test(extractFunction('_carGroundY')), 'the car ground query skips dynamic props, OTHER vehicles, + caps at the headroom ceiling');
const sh = extractFunction('_carShoveDynamics');
assert(/const b = p\.userData && p\.userData\.phys && p\.userData\.phys\.body; if\(!b\) continue;/.test(sh), 'only dynamic props with a physics body are shoved');
assert(/if\(sp < 0\.2\) return 0;/.test(sh), 'a near-stopped car does not shove (so it can rest against props); build 769 lowered the gate to a crawl');
assert(/const ahead=dx\*tx \+ dz\*tz; if\(ahead < -0\.3\) continue;/.test(sh), 'props behind the travel direction are not dragged');
assert(/pushDynamic\(p, _carShoveDir, _hor, p\.position\)/.test(sh) && /_carShoveDir\.y = \(_hor>1e-6 \? _ver\/_hor : 0\) - 0\.25;/.test(sh), 'shove pushes horizontally with a speed-only vertical arc (no launch onto the hood, build 777)');
assert(/if\(typeof NET==='undefined' \|\| NET\.mode!=='client'\)\{ const _sgn=Math\.sign\(r\.speed\)\|\|1; const _react=_carShoveDynamics\(o, r\.speed, fx\*_sgn, fz\*_sgn, _carHitExtents\(o\), dt\);/.test(du), 'the host/solo shoves dynamic props each frame along the travel direction (using the hit footprint)');

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
assert(/const handbrake=\(keys\[BINDS\.jump\]\|\|keys\['KeyB'\]\|\|\(typeof padDriveBrake!=='undefined'&&padDriveBrake\)\|\|\(typeof touchHandbrake!=='undefined'&&touchHandbrake\)\);/.test(du), 'Space (jump bind) / B / gamepad B / mobile Brake is the handbrake (build 789/910)');
assert(/const gripBase=Math\.max\(0\.5,\+cfg\.grip\|\|6\); let grip=handbrake\?gripBase\*0\.16:gripBase;/.test(du), 'the handbrake cuts grip so the travel dir lags far behind the heading (big slide)');
assert(/const vstep=grip\*dt; o\.userData\.carVelYaw \+= Math\.max\(-vstep,Math\.min\(vstep,vd\)\);/.test(du), 'the travel direction chases the heading at the grip rate');
assert(/const vYaw=o\.userData\.carVelYaw, fx=-Math\.sin\(vYaw\), fz=-Math\.cos\(vYaw\);/.test(du), 'the car MOVES along the travel direction (which may differ from the heading = drift)');
assert(/if\(!_airb && _slip>0\.15\)\{ const _f=1 - Math\.min\(0\.5,_slip\*0\.4\)\*Math\.min\(1,dt\*5\); o\.userData\.carSpeed\*=_f; r\.speed\*=_f; \}/.test(du), 'tyres scrub speed during a slide (grounded only, build 824)');
assert(/if\(V\.grip && V\.grip!==6\) e\.veh\.grip=V\.grip;/.test(src), 'grip serialized when non-default');
assert(/row\('Grip','grip', 1, 12, 0\.5, 1\)/.test(src), 'editor exposes a Grip slider');

// executable: the travel direction eases toward the heading, and slower (more slide) under handbrake
{ const ease=(velYaw, carYaw, grip, dt)=>{ let vd=carYaw-velYaw; vd=Math.atan2(Math.sin(vd),Math.cos(vd)); const s=grip*dt; return velYaw + Math.max(-s,Math.min(s,vd)); };
  const gripped = ease(0, 1.0, 6, 1/60), drifty = ease(0, 1.0, 6*0.16, 1/60);
  assert(gripped>drifty && drifty>0, 'a gripped car aligns its travel to the heading faster than a handbraking one');
  assert(Math.abs(ease(0, 0.0001, 6, 1/60)) < 0.0002, 'no heading change => travel direction barely moves'); }

// --- build 726/727: tilt clamped by ANGLE (no roll-over, correct ramp pitch at any length) + handbrake brakes ---
assert(/const _TP=0\.72, _TR=0\.42;/.test(du), 'pitch is allowed steep (ramps); roll is capped tighter (a wall leans, never flips)');
assert(/if\(_grounded\)\{[\s\S]*?let _tp=Math\.atan2\(gF-gB, 2\*_hd\), _tr=Math\.atan2\(gR-gL, 2\*_hw\);/.test(du), 'grounded: tilt is the raw surface slope (no height clamp that throttled a long vehicle on a ramp)');
assert(/_tp=Math\.max\(-_TP,Math\.min\(_TP,_tp\)\); _tr=Math\.max\(-_TR,Math\.min\(_TR,_tr\)\);/.test(du), 'final pitch/roll is angle-capped so the car never tips over and buries itself');
assert(/if\(!_airb && handbrake && Math\.abs\(r\.speed\)>0\.1\)\{ const _bk=1 - Math\.min\(0\.85, 3\.2\*dt\); o\.userData\.carSpeed\*=_bk; r\.speed\*=_bk; \}/.test(du), 'the handbrake actually brakes (slows the car) — on the ground (build 824)');

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
// --- build 781: car headlights (two forward spotlights, toggle with H) ---
assert(/headlights:!!v\.headlights, headColor:\(v\.headColor!=null\?\(v\.headColor\|0\):0xfff2cc\)/.test(extractFunction('vehicleApply')), 'vehicleApply stores the headlight flag + colour');
assert(/if\(V\.headlights\)\{ e\.veh\.headlights=1;/.test(src), 'headlights serialize when on');
const uhl = extractFunction('_updateHeadlights');
assert(/if\(!cfg\.headlights \|\| !_carHeadOn \|\| drivingCar!==o\)\{ _headlightsOff\(\); return; \}/.test(uhl), 'headlights only light the car you are driving (and only when toggled on)');
assert(/_cbVec\.set\(0, -0\.14, -1\)\.applyQuaternion\(Q\);[\s\S]*?L\.target\.position\.set\(L\.position\.x \+ _cbVec\.x\*rng, L\.position\.y \+ _cbVec\.y\*rng, L\.position\.z \+ _cbVec\.z\*rng\)/.test(extractFunction('_placeHeadlights')), 'each headlight aims forward + dipped, tilting with the car body (build 804)');
assert(/_updateHeadlights\(o, cfg\)/.test(du), 'driveUpdate positions the headlights each frame');
// build 782: toggle by INTENSITY (never visible) so the light count is stable — no shader-recompile stall
assert(/function _headlightsOff\(\)\{ if\(_headL\) _headL\.intensity=0; if\(_headR\) _headR\.intensity=0; \}/.test(src), 'off = intensity 0, the lights stay in the scene (no recompile stall)');
assert(/sp\.visible=true;/.test(extractFunction('_ensureHeadlights')), 'the spotlights are always visible (intensity does the toggling)');
assert(/if\(o\.userData\.vehicle\.headlights && typeof _ensureHeadlights==='function'\) _ensureHeadlights\(\);/.test(extractFunction('addStaticColliderFor')), 'the lights are created at deploy so the recompile is masked by load');
assert(/const _sv=\(_se && _se\.userData && _se\.userData\.vehicle\) \? _se : null; _editorHeadlightPreview\(_sv\);/.test(src), 'the editor previews the selected car’s headlights live');
assert(/e\.code==='KeyH'[\s\S]*?_carHeadOn=!_carHeadOn/.test(src), 'H toggles the headlights while driving');
assert(/_carHeadOn = \(o\.userData\.vehicle\.headStart!==false\)/.test(extractFunction('enterCar')) && /if\(typeof _headlightsOff==='function'\) _headlightsOff\(\);/.test(extractFunction('exitCar')), 'lights start per the vehicle default on enter, and go off on exit');
// build 785: getting in a car stows the held flashlight (camera-parented, breaks on the chase cam)
assert(/if\(flashlightOn && typeof toggleFlashlight==='function'\) toggleFlashlight\(\);/.test(extractFunction('enterCar')), 'the flashlight turns off when you get in a car');
assert(/<b>Headlights<\/b>/.test(src) && /row\('Range \(m\)','headRange'/.test(src), 'the editor exposes the headlight toggle + controls');

// build 771: the speed/boost shake is toned down (~40% of build 730) + a softer impact jolt
assert(/const _shk=_sf\*0\.0018 \+ _bst\*0\.0025;/.test(src), 'the high-speed camera shake is reduced');
assert(/camera\.rotation\.x \+= \(Math\.random\(\)-0\.5\)\*_hs\*1\.3;/.test(src), 'the impact jolt is softer (1.3x, was 2x)');
assert(/camera\.fov=worldCfg\.fov; camera\.updateProjectionMatrix\(\); \}   \/\/ build 730: restore the normal FOV/.test(extractFunction('exitCar')), 'exiting restores the normal FOV');

// --- build 733: impact feedback — a hard head-on wall hit jolts/thuds/throws debris (not a silent stop) ---
assert(/if\(mvx===0 && mvz===0 && _imp0>5 && o\.userData\._hitCd<=0\)\{ o\.userData\._hitCd=0\.35; o\.userData\.carSpeed=r\.speed\*0\.1; r\.speed=o\.userData\.carSpeed; _carImpactFx\(o, _imp0\); \}/.test(du), 'a hard head-on hit fires impact FX once per hit (cooldown)');
const cfx = extractFunction('_carImpactFx');
assert(/o\.userData\.hitShake=Math\.max\(o\.userData\.hitShake\|\|0, 0\.02 \+ f\*0\.06\);/.test(cfx) && /_carThud\(f\)/.test(cfx), 'impact jolts the camera + thuds, scaled by impact speed');
assert(/for\(let i=0;i<5;i\+\+\) _spawnDust\(nx, o\.position\.y\+0\.3, nz/.test(cfx), 'impact throws a debris burst at the nose');
assert(/o\.userData\.hitShake=_hs\*\(1-Math\.min\(1,dt\*5\)\);/.test(src), 'the impact jolt decays in the chase cam');
assert(/o\.userData\.hitShake=0; o\.userData\._hitCd=0;/.test(extractFunction('enterCar')), 'impact state resets on enter');

// --- build 741: drive-state animation clips (forward / back / turn / idle) ---
const sca = extractFunction('_setCarAnim');
assert(/if\(o\.userData\._carAnimCur === clipName\) return;/.test(sca), '_setCarAnim is a no-op if already on that clip');
assert(/if\(clipName && nm===clipName\)\{ a\.enabled=true;[\s\S]*?a\.fadeIn\(0\.18\); a\.play\(\); \}/.test(sca) && /else a\.fadeOut\(0\.18\);/.test(sca), 'it crossfades to the matching clip and fades the rest out');
assert(/if\(Math\.abs\(r\.speed\)<0\.6\) _as='animIdle';/.test(du), 'idle when ~stopped');
assert(/else if\(Math\.abs\(_yawRate\)>0\.4 \|\| steer!==0\)\{ const _d=\(steer!==0\)\?steer:Math\.sign\(_yawRate\); _as=_d>0\?'animLeft':'animRight'; \}/.test(du), 'turning picks turn-left/right by steer / yaw-rate');
assert(/else _as = r\.speed>0 \? 'animFwd' : 'animBack';/.test(du), 'otherwise forward / backward by speed sign');
assert(/if\(!_clip && _as!=='animIdle'\) _clip=\(r\.speed>0\?cfg\.animFwd:cfg\.animBack\)\|\|cfg\.animIdle\|\|'';/.test(du), 'a missing turn clip falls back to forward/back');
assert(/animIdle:\(''\+\(v\.animIdle\|\|''\)\), animFwd:\(''\+\(v\.animFwd\|\|''\)\)/.test(extractFunction('vehicleApply')), 'vehicleApply stores the clip names');
assert(/if\(V\.animFwd\) e\.veh\.animFwd=V\.animFwd;/.test(src), 'the clips serialize');
assert(/animRow\('Idle','animIdle'\); animRow\('Forward','animFwd'\); animRow\('Backward','animBack'\); animRow\('Turn left','animLeft'\); animRow\('Turn right','animRight'\);/.test(src), 'editor exposes the 5 animation-slot dropdowns');
assert(/_setCarAnim\(o, \(_v&&_v\.animIdle\)\|\|''\);/.test(extractFunction('exitCar')), 'parking settles to the idle clip');

// --- build 772: adjustable oriented hit area + outline + editor flame preview ---
assert(/hitLen:\(v\.hitLen==null\?1:Math\.max\(0\.3,Math\.min\(3,\+v\.hitLen\|\|0\)\)\), hitWid:\(v\.hitWid==null\?1:/.test(extractFunction('vehicleApply')) && /hitH:\(v\.hitH==null\?1:/.test(extractFunction('vehicleApply')), 'vehicleApply stores hit X/Y/Z multipliers');
assert(/if\(V\.hitLen!=null && V\.hitLen!==1\) e\.veh\.hitLen=V\.hitLen;/.test(src) && /if\(V\.hitH!=null && V\.hitH!==1\) e\.veh\.hitH=V\.hitH;/.test(src), 'hit X/Y/Z serialize when non-default');
assert(/function _carHitExtents\(o\)\{ const f=_carFoot\(o\)[\s\S]*?hh:f\.hh\*\(v\.hitH==null\?1:v\.hitH\)[\s\S]*?hd:f\.hd\*\(v\.hitLen==null\?1:v\.hitLen\)/.test(src), 'the hit extents scale the true oriented footprint on all three axes');
const hit = extractFunction('_carHitsActor');
assert(/const along=dx\*fx\+dz\*fz - ext\.oz, side=dx\*rxu\+dz\*rzu - ext\.ox;/.test(hit) && /Math\.abs\(along\) < ext\.hd\+ar && Math\.abs\(side\) < ext\.hw\+ar/.test(hit), 'the oriented overlap test recentres on the footprint and uses the hit extents');
assert(/_carShoveDynamics\(o, r\.speed, fx\*_sgn, fz\*_sgn, _carHitExtents\(o\), dt\)/.test(du), 'the shove uses the adjustable hit footprint too');
assert(/row\('Hit width \(X\)','hitWid', 0\.3, 3, 0\.05, 1\)/.test(src) && /row\('Hit height \(Y\)','hitH'/.test(src) && /row\('Hit length \(Z\)','hitLen'/.test(src), 'the editor exposes hit X/Y/Z sliders');
// build 774: the hit box can also be MOVED (offset), not just scaled
assert(/ox:f\.ox\+\(\+v\.hitOffX\|\|0\), oz:f\.oz\+\(\+v\.hitOffZ\|\|0\), oy:f\.oy\+\(\+v\.hitOffY\|\|0\)/.test(src), 'the hit extents add the X/Y/Z position offsets');
assert(/hitOffX:\(\+v\.hitOffX\|\|0\), hitOffY:\(\+v\.hitOffY\|\|0\), hitOffZ:\(\+v\.hitOffZ\|\|0\)/.test(extractFunction('vehicleApply')), 'vehicleApply stores the hit offsets');
assert(/if\(V\.hitOffX\) e\.veh\.hitOffX=V\.hitOffX;/.test(src), 'hit offsets serialize');
assert(/row\('Offset X \(m\)','hitOffX', -5, 5, 0\.05, 1\)/.test(src) && /row\('Offset Y \(m\)','hitOffY'/.test(src) && /row\('Offset Z \(m\)','hitOffZ'/.test(src), 'the editor exposes hit-box offset sliders');
assert(/function _ensureCarHitBox\(\)\{[\s\S]*?EdgesGeometry[\s\S]*?color:0xffa033/.test(src), 'an orange wireframe outlines the hit area');
assert(/hb\.scale\.set\(ext\.hw\*2, ext\.hh\*2, ext\.hd\*2\); hb\.rotation\.set\(0, _hy, 0\)/.test(src) || /hb\.scale\.set\(ext\.hw\*2, ext\.hh\*2, ext\.hd\*2\)[\s\S]*?hb\.rotation\.set\(0, _hy, 0\)/.test(src), 'the outline matches the hit extents, oriented along the heading');
assert(/if\(_se && _se\.userData && _se\.userData\.vehicle && _se\.userData\.vehicle\.boostFlame\) _editorFlamePreview\(_se, dt\)/.test(src), 'the editor previews boost flames on the selected vehicle');
assert(/function _editorFlamePreview\(o, dt\)\{/.test(src), 'there is an editor flame-preview emitter');

// --- build 775: solid vehicles — stand on top, can't walk through, cars collide with cars ---
assert(/function surfaceTopAt\(x, z, exclude, skipDynamic, ceilY, skipVehicles\)\{/.test(src), 'surfaceTopAt takes a skipVehicles flag');
assert(/if\(!skipVehicles && _vehicleMeshes\.length\)\{[\s\S]*?_downRay\.intersectObjects/.test(src), 'the player ground ray includes vehicles (stand on / ride a car)');
const rpc = extractFunction('_resolvePlayerVsCars');
assert(/const upPen=top-fy;\s*\n\s*if\(upPen<=oAlong && upPen<=oSide\) continue;/.test(rpc), 'no sideways shove when the shallowest exit is upward — you can land + stand on top (build 778)');
assert(/player\.pos\.x\+=pdx\*pen; player\.pos\.z\+=pdz\*pen;/.test(rpc), 'the player is pushed out of the car footprint (no walking through)');
const rcc = extractFunction('_resolveCarVsCars');
assert(/ov=\(aH\+bH\)-Math\.abs\(d\);/.test(rcc) && /if\(ov<=0\)\{ sep=true; break; \}/.test(rcc), 'car-vs-car uses an SAT separating-axis test');
assert(/b\.position\.x\+=nx\*mnOv\*0\.7;[\s\S]*?a\.position\.x-=nx\*mnOv\*0\.3;/.test(rcc), 'the parked car is bumped away and the mover is backed out');
assert(/if\(!editorOpen && !mountedTurret\) _resolvePlayerVsCars\(\);/.test(src) && /if\(!editorOpen && \(drivingCar \|\| _coastingCars\.length\)\) _resolveCarVsCars\(\);/.test(src), 'the loop resolves player-vs-car and car-vs-car each frame');

// --- build 744: ram damage — driving into enemies / bots / rival players hurts them, scaled by speed ---
assert(/ram:\(v\.ram==null\?50:Math\.max\(0, Math\.min\(500, \+v\.ram\|\|0\)\)\)/.test(extractFunction('vehicleApply')), 'vehicleApply stores Ram damage (default 50, on)');
const cra = extractFunction('_carRamActors');
// build 772: ram uses the oriented hit footprint (consistent with the shove + the outline)
assert(/if\(_carHitsActor\(o, ep\.x, ep\.y, ep\.z, 0\.45, 1\.7\)\)\{ en\._ramT=0\.4;[\s\S]*?enemyHurt\(en, dmg, o\.position\.x, o\.position\.z\);/.test(cra), 'a moving car hurts wave enemies inside its hit footprint (build 797: from the car position so the corpse flings away)');
assert(/if\(_carHitsActor\(o, b\.pos\.x, b\.pos\.y, b\.pos\.z, 0\.45, 1\.7\)\)\{ b\._ramT=0\.4;[\s\S]*?botHurt\(b, dmg, o\.position\.x, o\.position\.z\);/.test(cra), 'and bots');
assert(/sendToPlayer\(\+id, \{t:'pvpHit', d:dmg, kx:F\.kx, kz:F\.kz, ky:F\.ky, from:NET\.myId\}\)/.test(cra) && /sameTeam\(NET\.myId, \+id\)/.test(cra), 'and rival players (PvP, not teammates) via pvpHit (build 797: carries the knock)');
assert(/if\(en\._ramT>0\)\{ en\._ramT-=dt; continue; \}/.test(cra), 'a per-target cooldown spaces the hits (one drive-through = a few hits)');
assert(/if\(\(typeof NET==='undefined' \|\| NET\.mode!=='client'\) && cfg\.ram>0 && Math\.abs\(r\.speed\)>3\)\{/.test(du), 'host/solo authors ram damage, only above a threshold speed');
assert(/const _rdmg = cfg\.ram \* Math\.min\(1, \(Math\.abs\(r\.speed\)-3\)\/Math\.max\(1, cfg\.maxSpeed\*0\.85-3\)\);/.test(du), 'damage scales from 0 up to the full Ram value near top speed');
assert(/if\(V\.ram!=null && V\.ram!==50\) e\.veh\.ram=V\.ram;/.test(src), 'ram serialized when non-default');
assert(/row\('Ram damage','ram', 0, 300, 5, 1\)/.test(src), 'editor exposes a Ram damage slider (0 = off)');

// executable: ram damage is 0 below the threshold, scales up to the full value near top speed
{ const ram=(spd,RAM,max)=> spd<=3?0: RAM*Math.min(1,(spd-3)/Math.max(1,max*0.85-3));
  assert(ram(2,50,20)===0, 'a gentle bump does no damage');
  assert(ram(17,50,20) > ram(8,50,20) && ram(8,50,20)>0, 'faster = more damage'); }

// --- build 745: cockpit (driver POV) camera + seat offsets + C toggle ---
assert(/camView:\(v\.camView==='cockpit'\?'cockpit':'chase'\), seatF:\(\+v\.seatF\|\|0\), seatU:\(v\.seatU==null\?1:\+v\.seatU\), seatS:\(\+v\.seatS\|\|0\)/.test(extractFunction('vehicleApply')), 'vehicleApply stores the camera view + seat offsets');
assert(/function _carViewMode\(o\)\{ if\(_carViewOverride\) return _carViewOverride;/.test(src), 'the view mode prefers the session override, else the vehicle default');
assert(/if\(_carViewMode\(o\)==='cockpit'\)\{/.test(src), 'the camera has a cockpit branch');
assert(/_seatV\.set\(_sS, _sU, -_sF\)\.applyQuaternion\(_camFrameQ\);/.test(src) && /camera\.position\.set\(o\.position\.x\+_seatV\.x, o\.position\.y\+_seatV\.y, o\.position\.z\+_seatV\.z\);/.test(src), 'the cockpit camera sits at the seat offset inside the car (in the body tilt frame)');
assert(/camera\.rotation\.x=player\.pitch; camera\.rotation\.z=_cr\*0\.4;/.test(src), 'cockpit is free-look (mouse), horizon leans a touch with body roll');
assert(/if\(e\.code==='KeyC' && !e\.repeat && drivingCar[\s\S]*?_carViewOverride = \(_carViewMode\(drivingCar\)==='cockpit'\)\?'chase':'cockpit';/.test(src), 'C toggles the view live while driving');
assert(/_carViewOverride=null;/.test(extractFunction('exitCar')), 'the view override resets on exit (next car uses its default)');
assert(/if\(V\.camView==='cockpit'\) e\.veh\.camView='cockpit';/.test(src) && /if\(V\.seatU!=null && V\.seatU!==1\) e\.veh\.seatU=V\.seatU;/.test(src), 'cockpit view + seat offsets serialize');
assert(/\[\['chase','Chase'\],\['cockpit','Cockpit'\]\]/.test(src) && /row\('Seat forward \(m\)','seatF'/.test(src), 'editor exposes the view toggle + seat sliders');

// --- build 746: trailer towing — the car's kinematic body is found by the joint lookup + driven by the kinematic loop ---
assert(/for\(const c of colliders\)\{ if\(c!==self && c\.userData && c\.userData\.tag===tag && \(c\.userData\._kbody/.test(extractFunction('_findJointBody')), 'a jointed trailer finds the car by tag (its kinematic body)');
assert(/for\(const o of colliders\)\{ const kb = o\.userData && o\.userData\._kbody; if\(!kb\) continue;[\s\S]*?kb\.setNextKinematicTranslation/.test(src), 'the kinematic loop drives the car body from its pose each frame (towing the trailer)');
// build 760: tow with a clean heading-only orientation (no cosmetic lean/tilt wobble pumping the trailer joint)
assert(/if\(o\.userData\.vehicle && o\.userData\.carYaw!=null\)\{[\s\S]*?const _ty=\(o\.userData\.carYaw - \(\(o\.userData\.vehicle\.modelYaw\|\|0\)\*RAD\)\)\*0\.5;[\s\S]*?kb\.setNextKinematicRotation\(\{ x:0, y:Math\.sin\(_ty\), z:0, w:Math\.cos\(_ty\) \}\)/.test(src), 'a towing vehicle body uses a clean yaw-only orientation (kills the trailer shake)');
assert(/<b>Tow a trailer:<\/b>/.test(src), 'the joint editor explains how to hitch a trailer to a drivable car');

// --- build 756: a live hinge marker (dot + axis) so authoring the hinge offset isn't blind ---
assert(/function _setJointGiz\(o\)\{/.test(src) && /g\.position\.set\(J\.ax\|\|0, J\.ay\|\|0, J\.az\|\|0\)\.applyQuaternion\(o\.quaternion\)\.add\(o\.position\)/.test(src), 'the hinge marker sits at the world hinge point (same math as buildJoints)');
assert(/_hgAxis\.set\(0,1,0\); if\(J\.axis==='x'\) _hgAxis\.set\(1,0,0\); else if\(J\.axis==='z'\) _hgAxis\.set\(0,0,1\);/.test(src), 'the marker axis follows the chosen hinge axis');
assert(/_setJointGiz\(o\);/.test(src) && /_setJointGiz\(null\);/.test(src), 'the hinge marker tracks the selection (hidden on multi-select)');

// --- build 747: the third-person body is hidden while driving (no driver clipping inside the car) ---
assert(/if\(mountedTurret \|\| drivingCar\)\{ if\(_ownAvatar\) _ownAvatar\.visible=false; return; \}/.test(extractFunction('updateOwnAvatar')), 'driving hides the third-person avatar (like mounting a turret)');

// --- build 755: a driven car returns to its authored placement on editor entry (its position is what gets saved) ---
assert(/if\(!o\.userData\.physHome\)\{ o\.userData\.physHome = o\.position\.clone\(\); o\.userData\.physHomeQ = o\.quaternion\.clone\(\); \}/.test(extractFunction('addStaticColliderFor')), 'the car captures its authored transform (reset target) when its kinematic body is built');
assert(/for\(const o of propModels\)\{ if\(o && o\.userData && o\.userData\.vehicle && o\.userData\.physHome\)\{ o\.position\.copy\(o\.userData\.physHome\);/.test(src), 'entering the editor snaps the car back to where it was placed');
assert(/for\(const o of propModels\)\{ if\(o && o\.userData && o\.userData\.vehicle\)\{ o\.userData\.physHome=o\.position\.clone\(\);/.test(src), 'leaving the editor re-bases the car reset target to its edited placement');

// --- build 762: PROCEDURAL wheels — spin/steer named wheel meshes (no baked animation needed) ---
const wm = new Function(extractFunction('_wheelMatch') + '\nreturn _wheelMatch;')();
assert(wm('Wheel_FL','wheel')===true && wm('body','wheel')===false, 'matches a part name against the pattern (substring, case-insensitive)');
assert(wm('Wheel_FR','fl, fr')===true && wm('Wheel_RL','fl, fr')===false, 'a comma/space list marks just the front wheels');
assert(wm('anything','')===false && wm('','wheel')===false, 'an empty pattern or empty name never matches');
assert(/wheels:\(''\+\(v\.wheels\|\|''\)\), wheelsFront:\(''\+\(v\.wheelsFront\|\|''\)\), wheelAxis:\(\(v\.wheelAxis==='y'\|\|v\.wheelAxis==='z'\)\?v\.wheelAxis:'x'\)/.test(extractFunction('vehicleApply')), 'vehicleApply stores the wheel name patterns + spin axle');
assert(/wheelSteer:\(v\.wheelSteer==null\?28:/.test(extractFunction('vehicleApply')) && /wheelSpin:\(v\.wheelSpin==null\?1:/.test(extractFunction('vehicleApply')), 'vehicleApply stores steer angle (28°) + spin rate (1) defaults');
assert(/w\.spin \+= \(speed\*dt\/w\.rad\)\*gain;/.test(extractFunction('_updateWheels')), 'wheels roll by speed / radius (faster = spins faster)');
assert(/if\(w\.front && \(cfg\.wheelSteer==null\?28:cfg\.wheelSteer\)>0\)\{ _wqSteer\.setFromAxisAngle\(_wUp, steerRad\); w\.obj\.quaternion\.multiply\(_wqSteer\); \}/.test(extractFunction('_updateWheels')), 'only the front wheels yaw, by the steering input');
assert(/_updateWheels\(o, cfg, r\.speed, _sf, dt\)/.test(du), 'driveUpdate spins/steers the wheels each frame');
assert(/if\(V\.wheels\) e\.veh\.wheels=V\.wheels;[\s\S]*?if\(V\.wheelSpin!=null && V\.wheelSpin!==1\) e\.veh\.wheelSpin=V\.wheelSpin;/.test(src), 'wheel config serializes (non-default only)');
assert(/txt\('Wheel names','wheels'/.test(src) && /row\('Steer angle \(°\)','wheelSteer'/.test(src) && /row\('Spin rate','wheelSpin'/.test(src), 'the editor exposes the wheel-name + steer + spin controls');
assert(/<b>Detected parts<\/b>/.test(src), 'the editor lists the model’s named parts (build 801: as clickable chips) so you know what to type');
// build 763: pivot correction — spin/steer about each wheel's geometric centre so wheels don't orbit/fly off
assert(/const m=n\.worldToLocal\(_wCtr\.clone\(\)\);/.test(extractFunction('_buildWheelCache')) && /const pivot=new THREE\.Vector3\(m\.x\*n\.scale\.x, m\.y\*n\.scale\.y, m\.z\*n\.scale\.z\);/.test(extractFunction('_buildWheelCache')), 'each wheel caches its geometric-centre pivot offset');
assert(/_wpA\.copy\(w\.pivot\)\.applyQuaternion\(w\.baseQ\); _wpB\.copy\(w\.pivot\)\.applyQuaternion\(w\.obj\.quaternion\);\s*\n\s*w\.obj\.position\.copy\(w\.basePos\)\.add\(_wpA\)\.sub\(_wpB\);/.test(extractFunction('_updateWheels')), 'the wheel position is corrected so it rotates about its centre, not its origin');

done('build 709-762: drivable vehicles — … / cockpit / trailer towing / TP-body hide / procedural wheels');
