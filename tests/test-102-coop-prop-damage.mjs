// (build 149) Co-op completeness: a connected client's shots now DAMAGE props (previously they only
// shoved them), so breakable props break and explosive props detonate in co-op, credited to the client.
// The host applies the damage authoritatively (damageProp -> shatter/explode), then knockback if it lived.
import { gameSource, done, assert } from './harness.mjs';
const src = gameSource();

// client side: prop shots report damage, not just an impulse
assert(/NET\.conn\.send\(\{t:'propHit', nid:dprop\.userData\.nid, d:w\.dmg\*dmgMul, dir:\[dir\.x,dir\.y,dir\.z\], s:power, pt:\[hp\.x,hp\.y,hp\.z\]\}\)/.test(src), 'client prop-shot sends damage (propHit)');
// host side: applies damage with the client as destroyer, falls back to knockback if it did not break
assert(/else if\(msg\.t==='propHit'\)\{ const o=propByNid\(msg\.nid\)/.test(src), 'host handles client propHit');
// build 1130: the claimed damage now goes through _netDmg, which clamps it to what the level's own
// weapons could produce and drops non-finite or negative values.
assert(/const broke=damageProp\(o, _netDmg\(msg\.d\), pt, dir, msg\.s\|\|6, id\); if\(!broke\) pushDynamic\(o, dir, msg\.s\|\|6, pt\);/.test(src), 'host damages (credited to client) then knockback if it survived');
// legacy push handler kept intact (non-breaking)
assert(/else if\(msg\.t==='push'\)\{ const o=propByNid\(msg\.nid\); if\(o\) pushDynamic/.test(src), 'legacy push handler retained');
done('co-op prop damage');
