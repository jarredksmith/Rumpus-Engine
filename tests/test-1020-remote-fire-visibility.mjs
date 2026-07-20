// (build 1020) EVERYONE'S GUNFIRE READS — field report: "I only see mine in multiplayer."
// Three gaps, all fixed:
//  1) The N key toggled the dev bot-nav grid overlay in live play — a fat-finger tanked the
//     frame rate. Dev-only tool; the binding is gone (the overlay code remains for dev use).
//  2) Remote shots (joiners + host bots) drew a blind 60m streak through walls with NO impact
//     FX. remoteFire now casts the same ray locally: the tracer stops at the surface it hit
//     and sparks there, matching what the shooter sees.
//  3) Co-op joiners never saw ENEMY gunfire at all — enemy bolts lived only on the host.
//     Each shot relays {t:'eshot'}; clients fly a cosmetic copy that impacts and dies like
//     the real one but never re-applies damage (that already rides {t:'hurt'}).
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- 1) the dev grid key is out of live play ----
assert(!/e\.code==='KeyN'/.test(src), 'no gameplay keybind on N anymore');
assert(/function navOverlayToggle\(\)/.test(src), 'the overlay itself survives for dev use');

// ---- 2) remote shots land ----
const rf = extractFunction('remoteFire', src);
assert(/const _rt=\[\.\.\.colliders, \.\.\.dynamicProps, floor\]\.filter\(x=>x&&x\.isObject3D\);/.test(rf),
  'the relayed shot raycasts world geometry + dynamic props (actor FX ride the damage paths)');
assert(/const _far=raycaster\.far; raycaster\.far=60; raycaster\.set\(from, dir\);/.test(rf) && /raycaster\.far=_far;/.test(rf),
  'reuses the shared raycaster, capped at the tracer reach, and restores it');
assert(/if\(_h\.length\)\{ end=_h\[0\]\.point\.clone\(\); spark\(end, fxCfg\.color\); \}/.test(rf),
  'impact sparks where a remote shot lands — the level-authored impact FX, same as your own');
assert(/tracer\(from, end \|\| from\.clone\(\)\.addScaledVector\(dir, 60\)\)/.test(rf),
  'the tracer stops at the wall; the 60m streak only on a clean miss');

// ---- 3) enemy gunfire reaches co-op joiners ----
const fes = extractFunction('fireEnemyShot', src);
assert(/if\(NET\.mode==='host'\)\{ const m=\{ t:'eshot', o:\[/.test(fes), 'the host relays each enemy shot');
assert(/if\(SFX && SFX\.enemyShot\) SFX\.enemyShot\(\);/.test(fes), 'host/solo still HEAR enemy fire (regression guard: the relay must not eat the SFX call)');
const res = extractFunction('remoteEnemyShot', src);
assert(/dmg:0, noDmg:true/.test(res), 'the client copy is cosmetic — zero damage, flagged');
assert(/makeEnemyBolt\(\)/.test(res) && /playFlipbook\('muzzle', from, 0\.7\*boltCfg\.muzzle\)/.test(res),
  'the client copy looks like the real bolt — authored style + muzzle flash');
assert(/else if\(msg\.t==='eshot'\)\{ if\(typeof remoteEnemyShot==='function'\) remoteEnemyShot\(msg\.o, msg\.v\); \}/.test(src),
  'clients handle the relay');

// ---- executable: a cosmetic bolt impacts and dies WITHOUT hurting the local player ----
const ues = extractFunction('updateEnemyShots', src);
const hurts = [];
const run = new Function('enemyShots', 'allPlayers', 'performance', 'emitBoltTrail', 'colliders', 'terrainHeightAt', 'boltImpact', 'scene', 'boltCfg', 'player', 'applyEnemyDamageToSelf', 'dt',
  ues + '\nupdateEnemyShots(dt);');
const mkShot = (extra) => ({ mesh:{ position:{ x:0, y:1.4, z:0, addScaledVector(){ /* park it on the player */ } } }, vel:{}, dmg:25, born:1000, life:3500, from:{ x:9, z:9 }, ...extra });
const players = [{ pos:{ x:0, y:1.7, z:0 }, eyeY:1.7, hurt:(d)=>hurts.push(d) }];
{ // a REAL bolt hurts
  const shots=[mkShot({})];
  run(shots, ()=>players, { now:()=>1100 }, ()=>{}, [], ()=>-99, ()=>{}, { remove(){} }, { impactColor:0xffc070 }, {}, ()=>{}, 0.016);
  eq(hurts.length, 1, 'a host-owned bolt applies damage on contact');
  eq(shots.length, 0, 'and the bolt dies');
}
{ // a COSMETIC bolt impacts identically but never double-dips
  const shots=[mkShot({ dmg:0, noDmg:true })];
  run(shots, ()=>players, { now:()=>1100 }, ()=>{}, [], ()=>-99, ()=>{}, { remove(){} }, { impactColor:0xffc070 }, {}, ()=>{}, 0.016);
  eq(hurts.length, 1, 'a relayed cosmetic bolt applies NO damage (the host already sent {t:\'hurt\'})');
  eq(shots.length, 0, 'but still impacts and dies on contact like the real one');
}

done('build 1020: remote + bot shots spark where they land, enemy fire reaches joiners, dev grid key retired');
