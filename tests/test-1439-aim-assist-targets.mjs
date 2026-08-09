// build 1439 — the aim assist knows what you can shoot, and what you must not.
//
// Found by a four-critic audit. Build 1316's PvE branch was one line:
//
//   for(const en of enemies){ if(!en || en.dead || !en.mesh) continue; consider(...); }
//
// Two things follow from that, and the second is the one the shooting range hits:
//
//  * NO FILTER. The PvP branch above it has skipped teammates since 1316; this one skipped nothing, so a
//    stick or thumb player sweeping past a build-1226 villager or a build-1355 ally had their crosshair
//    DRAGGED ONTO THEM — while killEnemy (1226/1355) refuses to reward the kill.
//  * NO PROPS. A range is built from build-1390 static targets, which are in neither `enemies` nor
//    `dynamicProps`. So the plates felt slippery while the enemies beside them felt magnetic, for reasons
//    nothing on screen explains.
//
// And the scan ran every frame for everyone, though `_aaSlow` is read only by the pad look and the two
// touch look axes — a mouse is never assisted, by design.
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';

const src = gameSource();
const scanSrc = extractFunction('_aimAssistScan', src);

/* ---- EXECUTED: the whole target decision -------------------------------------------------------- */
const CONE = parseFloat(extractConst('AA_CONE', src));
const RANGE = parseFloat(extractConst('AA_RANGE', src));
assert(CONE > 0 && RANGE > 0, 'lifted the real cone and range from source');

const V = (x, y, z) => ({ x, y, z });
const prop = (x, y, z, o = {}) => ({
  visible: o.visible !== false, position: V(x, y, z),
  userData: Object.assign({ box: { min: V(x - .5, y - .5, z - .5), max: V(x + .5, y + .5, z + .5) } }, o.ud || {}),
});

const run = (w) => {
  const out = { blocked: [] };
  const fn = new Function('W', 'OUT', `
    let _aaSlow = 1, _aaYaw = 0, _aaPitch = 0, _aaK = 0;
    const AA_CONE = ${CONE}, AA_RANGE = ${RANGE}, AA_SLOW_MIN = ${parseFloat(extractConst('AA_SLOW_MIN', src))};
    const padPrefs = W.padPrefs || { aim: 1 };
    const gameOn = W.gameOn !== false, editorOpen = false, paused = false;
    const drivingCar = false, mountedTurret = null;
    const isTouch = !!W.isTouch, padSeen = !!W.padSeen;
    const player = W.player;
    const enemies = W.enemies || [];
    const _enFac = (e)=> (e && e.faction != null ? (e.faction|0) : 1);
    const damageableProps = W.props ? (()=>W.props) : undefined;
    const pvpMode = ()=>false;
    const _aaF = { x:0, y:0, z:0, set(a,b,c){ this.x=a; this.y=b; this.z=c; return this; } };
    const _aaForward = (v)=>{ v.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)); };
    const segmentBlocked = (px,pz,tx,tz,ty)=>{ OUT.blocked.push([tx,tz]); return !!(W.wall && W.wall(tx,tz)); };
    ${scanSrc}
    _aimAssistScan();
    return { slow:_aaSlow, yaw:_aaYaw, pitch:_aaPitch, k:_aaK };
  `);
  return Object.assign(fn(w, out), out);
};

const P = { pos: V(0, 1.7, 0), yaw: 0, hp: 100 };   // facing -Z: forward is (-sin 0, 0, -cos 0) = (0,0,-1)
const enemy = (x, z, o = {}) => Object.assign({ mesh: { position: V(x, 1.1, z) }, dead: false }, o);

/* --- a hostile dead ahead is assisted (the control that makes every null below mean something) --- */
{
  const r = run({ padSeen: true, player: P, enemies: [enemy(0, -20)] });
  assert(r.k > 0, 'PREMISE: a hostile in the cone is assisted at all — k = ' + r.k.toFixed(3));
  assert(r.slow < 1, '...the look slows');
}

/* --- an ally is never a target --- */
{
  const r = run({ padSeen: true, player: P, enemies: [enemy(0, -20, { friendly: true })] });
  eq(r.k, 0, 'a wandering NPC (build 1226) does not pull the crosshair');
  eq(r.slow, 1, '...and does not slow the look');
}
{
  const r = run({ padSeen: true, player: P, enemies: [enemy(0, -20, { faction: 0 })] });
  eq(r.k, 0, 'nor does an ally on the player’s own faction (build 1355)');
}
{
  const r = run({ padSeen: true, player: P, enemies: [enemy(0, -20, { faction: 2 })] });
  assert(r.k > 0, 'but a third-party faction is still hostile to you, and is assisted');
}
{
  // the case that actually bites: an ally standing between you and the enemy you want
  const r = run({ padSeen: true, player: P,
    enemies: [enemy(0.4, -10, { friendly: true }), enemy(-0.2, -22)] });
  assert(r.k > 0, 'with an ally nearer the centre than a hostile, the assist still finds the hostile');
  // forward is (-sin yaw, 0, -cos yaw), so aiming further -X means yaw INCREASES. The hostile is the
  // one at -x, so a correct pull is positive; the ally at +x would pull the other way.
  assert(r.yaw > 0, '...and pulls toward it, not toward the ally');
}

/* --- the range's plates --- */
{
  const r = run({ padSeen: true, player: P, enemies: [], props: [prop(0, 1.6, -18)] });
  assert(r.k > 0, 'with no enemy in the cone, a damageable prop IS a target — the range booth');
  assert(r.slow < 1, '...and slows the look like anything else worth tracking');
}
{
  // a live threat outranks scenery: a crate must not steal the crosshair from the brute behind it
  const r = run({ padSeen: true, player: P, enemies: [enemy(0.5, -20)], props: [prop(0, 1.6, -8)] });
  assert(r.k > 0, 'with both in the cone the assist still engages');
  assert(r.yaw < 0, '...on the ENEMY (at +x, so a negative yaw correction), not the more-centred crate');
}
{
  const r = run({ padSeen: true, player: P, enemies: [],
    props: [prop(0, 1.6, -18, { visible: false })] });
  eq(r.k, 0, 'a hidden prop is not a target');
}
{
  const r = run({ padSeen: true, player: P, enemies: [],
    props: [prop(0, 1.6, -18, { ud: { _shattered: true } })] });
  eq(r.k, 0, 'nor a shattered one');
}
{
  // the aim point is the collider box's CENTRE — an imported wall's origin can sit metres off its mass
  const off = { visible: true, position: V(0, 1.7, -60),
    userData: { box: { min: V(-1, 1.2, -19), max: V(1, 2.2, -17) } } };
  const r = run({ padSeen: true, player: P, enemies: [], props: [off] });
  assert(r.k > 0, 'a prop whose origin is far from its mass is found by its box');
  assert(Math.abs(r.yaw) < 0.02, '...and the correction points at the box, not the origin');
}
{
  const r = run({ padSeen: true, player: P, enemies: [], props: [prop(0, 1.6, -18)],
    wall: () => true });
  eq(r.k, 0, 'and a prop behind a wall is refused by the same sightline test enemies get');
}

/* --- who pays for the scan --- */
{
  const r = run({ player: P, enemies: [enemy(0, -20)], props: [prop(0, 1.6, -18)] });
  eq(r.k, 0, 'a mouse-only session runs no scan at all');
  eq(r.blocked.length, 0, '...not even a sightline test');
  eq(r.slow, 1, '...and is never slowed, which is build 1316’s rule');
}
{
  const r = run({ isTouch: true, player: P, enemies: [enemy(0, -20)] });
  assert(r.k > 0, 'a touch session is assisted');
}
{
  const r = run({ padSeen: true, padPrefs: { aim: 0 }, player: P, enemies: [enemy(0, -20)] });
  eq(r.k, 0, 'and 0 on the slider still turns it fully off');
}

/* ---- the shape ----------------------------------------------------------------------------------- */
assert(/if\(!isTouch && !padSeen\) return;/.test(scanSrc), 'the device gate is one line, before any work');
const iGate = scanSrc.indexOf('!isTouch && !padSeen'), iFwd = scanSrc.indexOf('_aaForward(_aaF)');
assert(iGate > 0 && iFwd > iGate, '...and before the forward vector is even computed');
assert(/if\(en\.friendly \|\| \(typeof _enFac==='function' && _enFac\(en\) === 0\)\) continue;/.test(scanSrc),
  'allies are skipped by the same two tests killEnemy uses to refuse a reward');
assert(/if\(bestC < 0 && typeof damageableProps === 'function'\)/.test(scanSrc),
  'props are considered only when no enemy qualified — a live threat outranks scenery');
// pin the STATEMENT, never the bare word — this file's own comment names dynamicProps in prose, and a
// bare grep would be defeated by it (builds 164, 1393, 1395, 1411, 1421 all record this trap)
assert(/for\(const o of damageableProps\(\)\)/.test(scanSrc) && !/of dynamicProps/.test(scanSrc),
  'through build 1392’s canonical set, not a second opinion about what can be hurt');
// the PvP branch is deliberately untouched: it already filters teammates, and PvP is out of scope here
assert(/sameTeam\(NET\.myId, bt\.id\)/.test(scanSrc), 'the PvP branch still filters teammates as it did');

done('build 1439: the aim assist skips allies rather than sticking to them, treats the props you can ' +
     'actually shoot as targets when nothing is shooting back, aims at their collider box rather than ' +
     'their origin, and no longer runs at all for a mouse it is forbidden to help');
