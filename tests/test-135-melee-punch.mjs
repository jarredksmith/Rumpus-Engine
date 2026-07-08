// (build 192) Melee / punch. V key or a fully-dry trigger pull throws a punch: nearest enemy/bot/player in
// a forward cone takes damage + a shove along your aim (same launch channel as the trebuchet/explosions),
// and a prop in front gets broken/shoved. A quick viewmodel thrust sells it.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

const m = extractFunction('meleeAttack');
assert(/now - _meleeT < \(wep \? 0 : MELEE_CD\)/.test(m), 'punch respects a cooldown');
assert(/const cone=\(tx,ty,tz\)=>/.test(m) && />0\.35 \? dist : -1/.test(m), 'punch only hits within a forward cone');
assert(/best\.evx=\(best\.evx\|\|0\)\+fwd\.x\/fh\*KB; best\.evz=\(best\.evz\|\|0\)\+fwd\.z\/fh\*KB; best\.vy=Math\.max\(best\.vy\|\|0,UP\)/.test(m), 'punch shoves the target along aim + pops it up');
assert(/sendToPlayer\(bestId,\{t:'pvpHit', d:DMG, from:NET\.myId\}\)/.test(m), 'punch damages a remote player in PvP');
assert(/enemyHurt\(best,/.test(m) && /botHurt\(best,/.test(m), 'punch can kill enemies (solo) and bots (pvp)');
assert(/damageProp\(o, DMG,.*\); if\(!broke\) pushDynamic\(o, dir, 8/.test(m), 'punch breaks or shoves a prop in front');

// dry-fire routes to a punch; V key bound; jab thrust in the viewmodel
assert(/if\(w\.mag<=0\)\{ if\(w\.reserve<=0\)\{ meleeAttack\(\); return; \}/.test(src), 'firing fully dry throws a punch');
assert(/if\(e\.code===BINDS\.melee\) meleeAttack\(\);/.test(src) && /melee:'KeyV'/.test(src), 'V (rebindable) bound to melee');
assert(/const j=Math\.sin\(_mp\*Math\.PI\); gun\.position\.z -= j\*0\.55/.test(src), 'viewmodel does a punch thrust');

done();
