// build 1443 — a prop finally says how hard it was hit.
//
// Every enemy damage site has spawned a floating number since build 625 — the shot, the swing, the mounted
// turret. `damageProp` never did, so the shooting-range plate that builds 1390, 1391, 1397, 1421 and 1422
// exist to make shootable, resettable and scoreable was the one target in the game with no readout of the
// shot that hit it. On a range that is the headline activity.
//
// The rule this follows is read off the EXISTING call sites rather than invented: a damage number is the
// shooter's feedback on DIRECT, AIMED damage. Explosions never spawn one (a blast across twenty enemies
// would be a wall of numbers) and neither does damage another player dealt. That is why the decision is a
// parameter the aiming sites pass, not something `damageProp` infers from `byId` — a grenade you threw
// carries your own id too.
//
// Measured live through the real damageProp with the real spawnDamageNumber recorded:
//   aimed shot, 15 dmg          one number at the contact point, hp 100 -> 85
//   the same call WITHOUT it    NO number, and hp 85 -> 70 — the parameter decides, not the damage
//   UNBREAKABLE target          a number, and hp stays 100 (build 1421)
//   fused barrel, first shot    NO number — that shot only LIT it
//   ...second shot              a number
//   lethal shot                 kill styling, the same "!" an enemy's killing blow gets
//   no contact point            lands on the collider box centre, not the origin
//   dmgNumCfg.on = false        0 sprites; back on, 1
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();
const dp = extractFunction('damageProp', src);

/* ---- EXECUTED: what fires and what does not ------------------------------------------------------ */
const V = (x, y, z) => ({ x, y, z });
const prop = (o = {}) => ({
  position: V(5, 0, 5), traverse(){},
  userData: Object.assign({ shootable: true, hp: 100, maxHp: 100,
    box: { min: V(4, 0, 4), max: V(6, 2, 6) } }, o),
});

const run = (obj, dmg, point, showNum) => {
  const out = { nums: [], shattered: 0, ignited: 0 };
  const fn = new Function('OBJ', 'DMG', 'PT', 'SHOW', 'OUT', `
    const NET = { mode:'host', myId:0 };
    const performance = { now: () => 1000 };
    const spawnDamageNumber = (pos, amount, kill, head) =>
      OUT.nums.push({ x:pos.x, y:pos.y, z:pos.z, amount, kill:!!kill, head:!!head });
    const playPropHitSound = () => {};
    const shatterProp = () => { OUT.shattered++; };
    const igniteProp = () => { OUT.ignited++; };
    const defaultHpFor = () => 50;
    const _lgPropEvent = () => {};
    const _propCtx = () => ({});
    ${extractFunction('_propDmgNumber', src)}
    ${dp}
    return damageProp(OBJ, DMG, PT, {x:0,y:0,z:1}, 6, 0, SHOW);
  `);
  out.broke = fn(obj, dmg, point, showNum, out);
  out.hp = obj.userData.hp;
  return out;
};

{
  const o = prop();
  const r = run(o, 15, V(5, 1.2, 4), true);
  eq(r.nums.length, 1, 'an aimed shot at a prop shows a number — the whole subject of the build');
  eq(r.nums[0].amount, 15, '...for what it dealt');
  eq(r.nums[0].x, 5, '...at the contact point');
  eq(r.nums[0].z, 4, '...exactly, not at the prop’s origin');
  eq(r.nums[0].kill, false, '...styled as an ordinary hit while the prop survives');
  eq(r.hp, 85, '...and the damage landed');
}
{
  // THE CONTROL that makes the parameter mean something: the identical call, minus the declaration
  const o = prop();
  const r = run(o, 15, V(5, 1.2, 4), undefined);
  eq(r.nums.length, 0, 'a blast deals the same damage and shows NOTHING — the caller decides, not the hit');
  eq(r.hp, 85, '...so a splash still hurts, it just does not paint the screen with numbers');
}
{
  // the case this exists for: a bolted-down range plate that never breaks (build 1421)
  const o = prop({ breakable: false });
  const r = run(o, 15, V(5, 1.2, 4), true);
  eq(r.nums.length, 1, 'an UNBREAKABLE target shows its number — the plate a shooting range is built from');
  eq(r.hp, 100, '...while its health never drops, which is build 1421’s rule and stays true');
  eq(r.shattered, 0, '...and nothing shatters');
}
{
  // build 629: the FIRST shot on a fused explosive lights it and deals no damage at all
  const o = prop({ explosive: true, fireFuse: 2 });
  const first = run(o, 15, V(5, 1.2, 4), true);
  eq(first.ignited, 1, 'the first shot on a fused barrel LIGHTS it');
  eq(first.nums.length, 0, '...and shows no number, because no damage was dealt — a number there would lie');
  eq(first.hp, 100, '...its health is untouched');
  o.userData._fireIgnited = true;
  const second = run(o, 15, V(5, 1.2, 4), true);
  eq(second.nums.length, 1, 'the next shot does damage, so it does show one');
  eq(second.hp, 85, '...and takes it');
}
{
  const o = prop();
  const r = run(o, 999, V(5, 1.2, 4), true);
  eq(r.nums.length, 1, 'the killing blow shows a number');
  eq(r.nums[0].kill, true, '...with the kill styling — the same "!" an enemy’s killing blow gets');
  eq(r.shattered, 1, '...and the prop shatters');
  eq(r.broke, true, '...and damageProp still reports it broke, so every existing caller is unchanged');
}
{
  // an imported prop's ORIGIN can sit metres off its mass (build 1439's lesson for the aim assist)
  const o = prop();
  o.position = V(-40, 0, -40);
  const r = run(o, 7, null, true);
  eq(r.nums.length, 1, 'with no contact point a number still appears');
  eq(r.nums[0].x, 5, '...at the collider box centre');
  eq(r.nums[0].y, 1, '...vertically centred in the box');
  eq(r.nums[0].z, 5, '...not at the origin 45 metres away');
}
{
  // a prop with no box at all falls back to the origin rather than throwing mid-frame
  const o = prop();
  delete o.userData.box;
  o.position = V(9, 1, 9);
  const r = run(o, 7, null, true);
  eq(r.nums.length, 1, 'a prop with no collider box still shows one');
  eq(r.nums[0].x, 9, '...at its origin, which is all there is to go on');
}
{
  const o = prop({ shootable: false, phys: false });
  const r = run(o, 15, V(5, 1.2, 4), true);
  eq(r.nums.length, 0, 'a prop that is not damageable at all shows nothing');
}

/* ---- the wiring: which sites declare it ----------------------------------------------------------- */
// Exactly the three AIMING sites, host/solo. Counting is the point: a fourth would be an explosion or
// someone else's shot, which is the rule this build read off the enemy paths.
eq((src.match(/damageProp\([^)]*, ?true\)/g) || []).length, 3,
  'three call sites declare an aimed hit — the bullet, the swing and the mounted turret');
assert(/damageProp\(dprop, w\.dmg\*dmgMul, hp, dir, power, NET\.myId, true\)/.test(src),
  'the bullet path');
assert(/damageProp\(o, DMG, pt, dir, 8, NET\.myId, true\)/.test(src), 'the melee swing');
assert(/damageProp\(dprop,dmg,hit\.point,dir,7,NET\.myId,true\)/.test(src), 'the mounted turret');

// ...and the ones that must NOT: a blast, and a client's relayed hit arriving at the host
const blast = extractFunction('_blastProps', src);
assert(!/, ?true\)/.test(blast.match(/damageProp\([^)]*\)/g).join(' ')),
  'a blast never declares one — an explosion across a stack of crates is not twenty numbers');
assert(/damageProp\(o, _netDmg\(msg\.d\), pt, dir, msg\.s\|\|6, id\)/.test(src),
  'nor does the host when it applies a CLIENT’s shot — a damage number is the shooter’s own feedback');

// the client predicts its own, exactly as build 1305 predicts the impact sound at the same three sites
eq((src.match(/_propDmgNumber\(/g) || []).length, 5,
  'one definition, one host-side call inside damageProp, and three client predictions');
assert(/playPropHitSound\(dprop, hp\); _propDmgNumber\(dprop, w\.dmg\*dmgMul, hp, false\);/.test(src),
  'a guest shooting a prop sees its own number, or the one player who took the shot is the only one who cannot');
assert(/playPropHitSound\(o, pt\); _propDmgNumber\(o, DMG, pt, false\);/.test(src),
  '...and the same for a swing');

/* ---- what must not have changed -------------------------------------------------------------------- */
assert(/if\(showNum\) _propDmgNumber\(obj, dmg, point, _broke\);\s*\n\s*if\(_broke\)\{ shatterProp/.test(dp),
  'the number is spawned BEFORE the shatter — after it the prop is out of the scene and its box is gone');
assert(dp.indexOf('igniteProp(obj)') < dp.indexOf('if(showNum)'),
  '...and after the fuse branch, which returns early, so a lighting shot cannot show one');
assert(/const _brk = obj\.userData\.breakable !== false;/.test(dp),
  'build 1421’s unbreakable rule is untouched');
assert(/_lgPropEvent\(obj, 'damaged'/.test(dp), 'and build 1397’s on-hit signal still fires');

done('build 1443: a shot at a prop shows what it did — at the contact point, with the kill styling on the ' +
     'blow that breaks it, on an unbreakable range plate whose health never moves, and NOT on the shot ' +
     'that merely lights a fuse or on a blast that touched twenty crates at once');
