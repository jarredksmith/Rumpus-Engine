import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 488: wire the animation taxonomy to live movement. _locoSlot turns a planar move vector + facing
// into forward/back/strafe locomotion (walk/run/sprint/crouch families); _airborneSlot turns grounded +
// vertical velocity into jumpStart/jump/fall/jumpLand/hardLand. Both the local third-person avatar and the
// host bots select through these, so strafing, back-pedalling, sprinting and jumping all read correctly.

// ---- wiring: both pickers use the helpers ----
const uoa = extractFunction('updateOwnAvatar');
assert(/_airborneSlot\(a\.userData\._air/.test(uoa), 'local avatar resolves airborne sub-states');
assert(/_locoSlot\(mvx,mvz,player\.yaw,tier,cur\)/.test(uoa), 'local avatar resolves directional locomotion');
assert(/_locoSlot\(mvx,mvz,player\.yaw,'crouch',/.test(uoa), 'local avatar resolves directional crouch');
assert(/else if\(reloading\) st='reload';/.test(uoa), 'reload pose wired');
assert(/sprinting\(\)\) tier='sprint'/.test(uoa), 'sprint tier wired');
const ub = extractFunction('updateBots');
assert(/_airborneSlot\(b\._air/.test(ub), 'bots resolve airborne sub-states');
assert(/_locoSlot\(mvx,mvz,b\.yaw,\(b\._crouch&&tier==='walk'\)\?'crouch':tier\)/.test(ub), 'bots resolve directional locomotion (strafe/back when orbiting; crouch family while holding cover, build 1006)');

// ---- executable: _locoSlot directional resolution ----
const _locoSlot = new Function('return ('+extractFunction('_locoSlot')+')')();
// yaw 0: forward = -Z, right = +X
assert(_locoSlot(0,-1,0,'walk')==='walk',       'forward -> walk');
assert(_locoSlot(0, 1,0,'walk')==='walkBack',   'backward -> walkBack');
assert(_locoSlot(1, 0,0,'walk')==='strafeR',    '+X -> strafe right');
assert(_locoSlot(-1,0,0,'walk')==='strafeL',    '-X -> strafe left');
assert(_locoSlot(0,-1,0,'run')==='run',         'forward run');
assert(_locoSlot(0, 1,0,'run')==='runBack',     'back run');
assert(_locoSlot(1, 0,0,'run')==='runStrafeR',  'run strafe right');
assert(_locoSlot(0,-1,0,'sprint')==='sprint',   'sprint forward stays sprint');
assert(_locoSlot(0, 1,0,'sprint')==='runBack',  'sprint backward falls to runBack');
assert(_locoSlot(-1,0,0,'sprint')==='runStrafeL','sprint strafe -> runStrafeL');
assert(_locoSlot(0,-1,0,'crouch')==='crouchWalk',  'crouch forward');
assert(_locoSlot(0, 1,0,'crouch')==='crouchBack',  'crouch backward');
assert(_locoSlot(1, 0,0,'crouch')==='crouchStrafeR','crouch strafe right');
assert(_locoSlot(0, 0,0,'crouch')==='crouch',   'crouch, no movement -> crouch idle');
assert(_locoSlot(0, 0,0,'walk')==='idle',       'no movement -> idle');
// facing rotated 90deg: forward = -X
assert(_locoSlot(-1,0,Math.PI/2,'walk')==='walk',    'rotated facing: moving along facing -> forward');
assert(_locoSlot(1, 0,Math.PI/2,'walk')==='walkBack','rotated facing: moving against facing -> back');
assert(_locoSlot(0,-1,Math.PI/2,'walk')==='strafeR', 'rotated facing: lateral -> strafe');

// ---- executable: _airborneSlot transitions ----
const _airborneSlot = new Function('return ('+extractFunction('_airborneSlot')+')')();
let s={};
assert(_airborneSlot(s,true,0,0.016)===null,        'grounded + idle -> null (use locomotion)');
s={};
assert(_airborneSlot(s,false,6,0.016)==='jumpStart','leaving ground ascending -> jumpStart');
assert(_airborneSlot(s,false,6,0.2)==='jump',       'past takeoff window, ascending -> jump');
assert(_airborneSlot(s,false,-6,0.05)==='fall',     'descending -> fall');
assert(_airborneSlot(s,true,0,0.05)==='jumpLand',   'soft touchdown -> jumpLand');
assert(_airborneSlot(s,true,0,0.05)==='jumpLand',   'land pose holds briefly');
_airborneSlot(s,true,0,0.3);                         // exhaust the land window
assert(_airborneSlot(s,true,0,0.05)===null,         'after land window -> null (locomotion resumes)');
let h={};
_airborneSlot(h,false,5,0.016); _airborneSlot(h,false,-20,0.05);
assert(_airborneSlot(h,true,0,0.05)==='hardLand',   'fast descent (vy<-16) -> hardLand on touchdown');
done();
