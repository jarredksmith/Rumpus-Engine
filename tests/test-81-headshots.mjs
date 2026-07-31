// (build 117) Headshot zones: enemies + player avatars get an invisible head-sphere proxy above a
// shortened body proxy. A head hit applies HEADSHOT_MUL with gold feedback across all three shot paths.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

assert(/const HEADSHOT_MUL = 2;/.test(src), 'headshot multiplier defined');
assert(/function _mkHeadProxy\(y, r\)\{.*isHead=true; return hd; \}/.test(src), 'head proxy helper tags isHead');

// enemy hitbox: shortened body + head zone
const sep = extractFunction('setEnemyHitProxy');
assert(/const hb = h\*0\.82;/.test(sep) && /CylinderGeometry\(r, r, hb, 10\)/.test(sep), 'enemy body proxy shortened to the neck');
assert(/const hd = _mkHeadProxy\(\(h - rs\) - 1\.4, rs\);/.test(sep) && /body\.userData\.headProxy = hd;/.test(sep), 'enemy head zone added');
assert(/if\(body\.userData\.headProxy\)\{/.test(sep), 'old head proxy disposed on rebuild');

// avatar hitboxes (both paths) + cleanup
const bav = extractFunction('buildAvatarVisual');
assert(/if\(g\.userData\.headProxy\)\{ g\.remove\(g\.userData\.headProxy\); g\.userData\.headProxy=null; \}/.test(bav), 'avatar head proxy cleared on rebuild');
assert(/head\.raycast=\(\)=>\{\};/.test(bav) && /_mkHeadProxy\(1\.66, 0\.32\)/.test(bav), 'capsule avatar head zone');
assert(/const hb=h\*0\.82;.*CylinderGeometry\(fr,fr,hb,10\)/.test(bav) && /_mkHeadProxy\(h-rs, rs\)/.test(bav), 'GLB avatar shortened body + head zone');

// shot resolution
const sh = extractFunction('shoot');
assert(/const isHead = !!\(hit\.object\.userData && hit\.object\.userData\.isHead\);/.test(sh), 'hit detects the head proxy');
assert(/const hsMul = isHead \? HEADSHOT_MUL : 1;/.test(sh), 'headshot multiplier resolved');
assert(/const dmg=w\.dmg\*dmgMul\*hsMul;/.test(sh), 'pvp damage scaled by headshot');
assert(/NET\.conn\.send\(\{t:'hit', e:id, d:w\.dmg\*dmgMul\*hsMul\}\)/.test(sh), 'client->host enemy damage scaled');
assert(/let dealt = w\.dmg\*dmgMul\*hsMul;/.test(sh), 'host/solo enemy damage scaled (let: a Shieldbearer can reduce it on a frontal hit)');
assert(/showHitmarker\(_ek\?'kill':\(isHead\?'head':'hit'\)\)/.test(sh), 'headshot hitmarker shows the head state (kill>head>hit) since build 1212 — a non-lethal headshot is no longer a false kill-confirm');
assert(/spawnDamageNumber\(hit\.point, dealt, _ek, isHead\)/.test(sh), 'damage number flagged as head');
done('headshot zones');
