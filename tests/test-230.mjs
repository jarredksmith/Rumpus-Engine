import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();
// build 322: sniper is a placeable pickup
assert(/const WEAPON_PICKUP_KINDS = \{ pistol:1, rifle:1, smg:1, shotgun:1, sniper:1, launcher:1 \}/.test(src), 'sniper grants the weapon when picked up');
assert(/\['shotgun','Shotgun'\],\['sniper','Sniper'\],\['launcher','Rocket'\]/.test(src), 'sniper in the editor pickup dropdown');
// build 324: sniper present in POWERUP_KINDS so the pad colors correctly + the pickup shows a toast (a missing
// entry granted the weapon SILENTLY, which read as 'nothing happened')
assert(/sniper: \{ c:0xc6ff7a, label:'SNIPER RIFLE' \}/.test(src), 'sniper has a powerup color + label');
done();
