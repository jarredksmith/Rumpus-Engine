import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 490: wire the combat/damage half of the taxonomy onto the player's third-person body. A timed one-shot
// override (playOwnAnim) drives equip (weapon swap), melee (light/heavy), throw (grenade) and directional
// hit-reacts; the killing hit picks a directional death; long idle plays a fidget. Priority sits below death
// but above firing/locomotion so reactions read immediately.

// ---- the one-shot override + triggers ----
assert(/function playOwnAnim\(slot, dur\)\{ _ownEvt = \{ slot, until: performance\.now\(\) \+ \(dur\|\|300\) \}; \}/.test(src), 'playOwnAnim sets a timed slot override');
const sw = extractFunction('switchWeapon');
assert(/playOwnAnim\('equip', 320\)/.test(sw), 'weapon swap -> equip');
const me = extractFunction('meleeAttack');
assert(/const _mslot = wep \? \(wep\.dmg>=50\?'meleeHeavy':'meleeCombo'\) : 'meleeLight';/.test(me), 'melee -> heavy for the crowbar, combo for light weapons, light for the bare key (build 933)');
const tg = extractFunction('throwGrenade');
assert(/playOwnAnim\('throw', 480\)/.test(tg), 'grenade -> throw');
const hd = extractFunction('hurtDir');
assert(/playOwnAnim\('hit'\+dir, 240\)/.test(hd), 'taking damage -> directional hit-react');

// ---- picker priority + fidget ----
const uoa = extractFunction('updateOwnAvatar');
assert(/if\(dead\) st=_lastDieVariant\|\|'die';/.test(uoa), 'death uses the directional variant');
assert(/else if\(evtLive\) st=_ownEvt\.slot;/.test(uoa), 'one-shot events win over firing/locomotion (below death)');
// order: death -> event -> attack -> reload -> slide -> air -> aim -> crouch -> loco
const iDead=uoa.indexOf('if(dead) st='), iEvt=uoa.indexOf('else if(evtLive)'), iAtk=uoa.indexOf('performance.now()-lastShot < 250'), iLoco=uoa.indexOf('_locoSlot(mvx,mvz,player.yaw,tier,cur)');
assert(iDead<iEvt && iEvt<iAtk && iAtk<iLoco, 'priority chain ordered death > event > attack > locomotion');
assert(/st='idleFidget'/.test(uoa) && /_ownFidgetUntil/.test(uoa), 'long idle plays a fidget');
// spawn clears the action state so a corpse pose / stale event never carries into the next life
assert(/_ownEvt=null; _lastDieVariant='die';/.test(src), 'respawn resets the action overrides');

// ---- executable: directional hit quadrant + death mapping (same construction as hurtDir) ----
function hitDir(sx,sz,yaw){
  const dx=sx, dz=sz;
  const fx=-Math.sin(yaw), fz=-Math.cos(yaw), rx=Math.cos(yaw), rz=-Math.sin(yaw);
  const f=dx*fx+dz*fz, r=dx*rx+dz*rz;
  if(Math.abs(f)>=Math.abs(r)) return f>=0?'Front':'Back';
  return r>0?'Right':'Left';
}
const dieOf = d => d==='Front' ? 'dieBack' : (d==='Back' ? 'dieFront' : 'die');
// facing forward (yaw 0 -> faces -Z)
assert(hitDir(0,-1,0)==='Front', 'shot from ahead -> Front');
assert(hitDir(0, 1,0)==='Back',  'shot from behind -> Back');
assert(hitDir(1, 0,0)==='Right', 'shot from the right -> Right');
assert(hitDir(-1,0,0)==='Left',  'shot from the left -> Left');
// rotated facing (yaw 90deg -> faces -X)
assert(hitDir(-1,0,Math.PI/2)==='Front', 'rotated: ahead is -X');
assert(hitDir(1, 0,Math.PI/2)==='Back',  'rotated: behind is +X');
// death mapping: a frontal hit knocks you backward
assert(dieOf('Front')==='dieBack', 'front hit -> dieBack');
assert(dieOf('Back')==='dieFront', 'back hit -> dieFront');
assert(dieOf('Left')==='die',      'side hit -> generic die');

// ---- event window expiry ----
let now=1000; const evt={slot:'throw', until: now+480};
assert((now < evt.until), 'event live right after trigger');
assert(!(now+500 < evt.until), 'event expired after its duration');
done();
