// (build 993) JUMP PADS CATCH ENEMIES. The enemy check handed the mesh CENTRE (ground + 1.4) to a
// band test written for FEET (feetY <= baseY+h): any pad with height under ~1.5 — or ground rising
// a little above the pad base — launched the player fine and silently ignored every enemy. The
// enemy pad-cooldown also only decayed while standing inside the pad, freezing after one launch.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
const fn = extractFunction('updateJumpPads');

function run(pad, enemy){
  const env = {
    jumpPads: [pad], gameOn: true, editorOpen: false, gameOver: false,
    _cineActive: false, _levelLoaderActive: false, paused: false,
    player: { pos: { x: 50, y: 1.7, z: 50 }, vel: { y: 0 }, onGround: true },
    EYE: 1.7, SFX: {}, bots: [], enemies: [enemy], _jpPlayerCd: 0,
  };
  const keys = Object.keys(env);
  new Function('dt', ...keys, fn + '\nupdateJumpPads(dt);')(0.016, ...keys.map(k => env[k]));
  return enemy;
}
const stand = (y) => ({ hp: 10, mesh: { position: { x: 0, y, z: 0 } }, grounded: true, vy: 0 });

// the regression case: a SHORT pad (h=1) — feet in band, centre 1.4 above it
{
  const en = run({ x:0, z:0, r:6, y:0, h:1, power:22 }, stand(1.4));
  eq(en.vy, 22, 'a short pad (h=1) launches a standing enemy (centre-based test could never fire)');
  eq(en.grounded, false, 'launched enemy goes airborne');
}
// the default pad still works
{
  const en = run({ x:0, z:0, r:6, y:0, h:2, power:22 }, stand(1.4));
  eq(en.vy, 22, 'the default pad (h=2) launches');
}
// ground slightly ABOVE the pad base (terrain rise) — feet still in band
{
  const en = run({ x:0, z:0, r:6, y:0, h:2, power:22 }, stand(0.8 + 1.4));
  eq(en.vy, 22, 'an enemy standing 0.8 above the pad base still launches (feet 0.8 <= band top 2)');
}
// an enemy flying high above the pad must NOT relaunch
{
  const en = run({ x:0, z:0, r:6, y:0, h:2, power:22 }, { hp:10, mesh:{ position:{ x:0, y:6, z:0 } }, grounded:false, vy:5 });
  eq(en.vy, 5, 'airborne high above the pad: no relaunch (feet 4.6 above the band)');
}
// the cooldown decays even OUTSIDE the pad now
{
  const en = { hp:10, mesh:{ position:{ x:40, y:1.4, z:40 } }, grounded:true, vy:0, _jpCd:0.45 };
  run({ x:0, z:0, r:6, y:0, h:2, power:22 }, en);
  assert(en._jpCd < 0.45, 'the pad cooldown decays for an enemy far from any pad (used to freeze forever)');
}
// dead enemies are ignored
{
  const en = run({ x:0, z:0, r:6, y:0, h:2, power:22 }, { hp:0, mesh:{ position:{ x:0, y:1.4, z:0 } }, grounded:true, vy:0 });
  eq(en.vy, 0, 'a dead enemy is never launched');
}
// the shipped source really uses feet for enemies now
assert(/if\(!inBand\(ep\.y-1\.4,z\)\) continue;/.test(src), 'the enemy band test subtracts the 1.4 centre offset (feet, like the player)');
assert(/if\(\(en\._jpCd\|\|0\)>0\) en\._jpCd=Math\.max\(0,en\._jpCd-dt\);/.test(src), 'cooldown decay runs before the radius gate');

done('build 993: jump pads launch enemies — feet-based band + always-decaying cooldown');
