import { gameSource, extractFunction, html, assert, done } from './harness.mjs';
const src = gameSource();
// build 312: bot difficulty tiers
assert(/const BOT_DIFF = \{/.test(src), 'BOT_DIFF table exists');
for(const t of ['recruit','regular','veteran','elite']) assert(new RegExp(t+':\\s*\\{').test(src), 'tier '+t+' defined');
assert(/function botDiff\(\)\{ return BOT_DIFF\[NET\.botDiff\] \|\| BOT_DIFF\.regular; \}/.test(src), 'botDiff() resolver');
assert(/botDiff:'regular'/.test(src), 'NET seeds a default tier');
assert(/localStorage\.getItem\('breach_botdiff'\)/.test(src), 'persisted tier loaded at boot');

// the AI loop consumes the tier instead of hardcoded values
const ub = extractFunction('updateBots');
assert(/const D=botDiff\(\)/.test(ub), 'updateBots resolves the tier');
assert(/spd=SPEED\*D\.spd/.test(ub), 'move speed uses tier');
// build 1297: both still come from the tier for a GUN — a melee weapon uses its own reach and swing
// interval instead, which is the one thing about a bot that its weapon now decides.
assert(/const _bRange = _bMelee \? Math\.max\(1, \(_bw\.reach \|\| 3\.4\)\) : D\.range;/.test(ub), 'engagement range uses tier');
assert(/b\.fireCd = _bMelee \? Math\.max\(0\.25, \(_bw\.fireRate\|\|500\)\/1000\) : \(D\.cdMin\+Math\.random\(\)\*D\.cdRand\);/.test(ub), 'fire cooldown uses tier');
assert(/D\.spread/.test(ub), 'aim spread uses tier');
assert(/Math\.random\(\)<D\.hit/.test(ub), 'hit chance uses tier');
assert(/D\.dmgMin\+Math\.random\(\)\*D\.dmgRand/.test(ub), 'damage uses tier');
// no leftover hardcoded values
assert(!/fdist<52 &&/.test(ub), 'old hardcoded range gone');
assert(!/Math\.random\(\)<0\.6\) _botDamage/.test(ub), 'old hardcoded hit chance gone');

// bot HP scales with the tier
const sb = extractFunction('spawnBots');
assert(/const D=botDiff\(\)/.test(sb), 'spawnBots resolves the tier');
assert(/hp:D\.hp, maxHp:D\.hp/.test(sb), 'bot HP uses tier');

// UI: selector exists, is read+persisted, and seeds on open
assert(/id="mpBotDiff"/.test(html), 'difficulty selector in host setup');
assert(/NET\.botDiff=di\.value;[^]*localStorage\.setItem\('breach_botdiff'/.test(src), 'selection read + persisted');
assert(/di\.value=NET\.botDiff; openModal\('mpModal'\)/.test(src), 'selector seeds to persisted tier on open');
done();
