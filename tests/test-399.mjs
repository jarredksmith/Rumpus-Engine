import { gameSource, extractFunction, assert, near, done } from './harness.mjs';
const src = gameSource();

// build 524: the held-gun grip is baked into a roster character so it travels with the level to MP users.
// 1) char cfg sanitizer carries a per-weapon grip map
assert(/grip:_sanitizeGripMap\(c\.grip\)/.test(src), 'sanitizeCharCfg keeps a grip map');
// 2) snapshotting a roster character captures the current per-weapon grips
assert(/grip:_sanitizeGripMap\(tpGunGrips\)/.test(src), 'snapshotPlayerCharCfg bakes tpGunGrips into the character');
// 3) the grip is serialized into the level roster (so it reaches every client)
assert(/clipInPlace:Object\.assign\(\{\},c\.clipInPlace\|\|\{\}\), grip:_sanitizeGripMap\(c\.grip\), view:_sanitizeView\(c\.view\) \}\)\),/.test(src), 'serializeLevel roster includes grip + view (build 526)');
// 4) the authored character grip is preferred for the broadcast + own avatar
assert(/function _packGrip\(\)\{[^}]*activeCharGrip\(wk\)\|\|tpGunGrip\(wk\)/.test(src), '_packGrip prefers the character grip');
assert(/attachAvatarGun\(a, curWep, activeCharGrip\(curWep\)\)/.test(src), 'own avatar uses the character grip');
// 5) loading a character back into the editor restores its grip into the tuning map
assert(/tpGunGrips\[k\]=Object\.assign\(\{\}, TP_GUN_DEFAULT, c\.grip\[k\]\)/.test(src), 'loadCharIntoEditor round-trips the grip');

// executable: the sanitizer normalizes a messy per-weapon grip map (drops junk, coerces numbers, defaults scale)
const _sanitizeGrip1 = extractFunction('_sanitizeGrip1');
const _sanitizeGripMap = new Function('_sanitizeGrip1', 'return (' + extractFunction('_sanitizeGripMap') + ')')(
  new Function('return (' + _sanitizeGrip1 + ')')()
);
const out = _sanitizeGripMap({ rifle:{ x:'0.5', y:1, z:-0.3, yaw:0.2, pitch:0, roll:0.1 }, bad:42, pistol:{ x:0, y:0, z:0, yaw:0, pitch:0, roll:0, scale:'2' } });
assert(!('bad' in out), 'non-object grip entry dropped');
near(out.rifle.x, 0.5, 1e-9, 'string number coerced');
near(out.rifle.scale, 1, 1e-9, 'missing scale defaults to 1');
near(out.pistol.scale, 2, 1e-9, 'string scale coerced');
done();
