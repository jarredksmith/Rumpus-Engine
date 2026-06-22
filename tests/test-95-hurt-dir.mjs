// (build 141) Damage-direction indicator: a red arc rotates toward where a hit came from, fading out.
// Source position is threaded from enemy shots (stored on the projectile), melee, and PvP hits.
import { gameSource, extractFunction, html, done, assert } from './harness.mjs';
const src = gameSource();

assert(/#hurtDir \{ position: fixed/.test(html) && /<div id="hurtDir"><svg/.test(html), 'indicator overlay element + style');
assert(/function hurtDir\(sx,sz\)\{ if\(sx==null\|\|sz==null\) return; _hurtFrom=\{x:sx,z:sz\}; _hurtDirT=0\.7;/.test(src), 'setter stores source + lifetime');
// build 490: hurtDir also drives a directional hit-react + remembers the death variant
assert(/playOwnAnim\('hit'\+dir, 240\)/.test(src), 'hurtDir fires a directional hit-react on the third-person body');
assert(/_lastDieVariant = \(dir==='Front'\) \? 'dieBack'/.test(src), 'front hit -> fall backward (directional death)');
const u = extractFunction('updateHurtDir');
assert(/Math\.atan2\(_hurtFrom\.x-player\.pos\.x, _hurtFrom\.z-player\.pos\.z\) - Math\.atan2\(_HURT_FWD\.x, _HURT_FWD\.z\)/.test(u), 'angle = source heading minus camera heading');
assert(/updateHurtDir\(dt\);/.test(src), 'ticks each frame');

assert(/function applyEnemyDamageToSelf\(dmg, sx, sz\)\{/.test(src) && /if\(sx!=null\) hurtDir\(sx,sz\)/.test(src), 'enemy damage points the indicator');
assert(/if\(rp&&rp\.posEye\) hurtDir\(rp\.posEye\.x, rp\.posEye\.z\)/.test(src), 'pvp hits point toward the attacker');
assert(/life: 3500, from: from\.clone\(\)/.test(src), 'enemy shots remember their origin');
assert(/_tn\.hurt\(en\.dmg \|\| 9, en\.mesh\.position\.x, en\.mesh\.position\.z\)/.test(src), 'melee points toward the enemy (telegraphed strike, build 627)');
done('hurt direction');
