// (builds 134-135) Combat feel: per-weapon fire sounds, a distinct enemy shot, recoil shake on firing,
// a camera jolt when hurt, and a low-HP red vignette + quickening heartbeat.
import { gameSource, extractFunction, html, done, assert } from './harness.mjs';
const src = gameSource();

// per-weapon fire + enemy shot
assert(/if\(curWep==='shotgun'\)\{ tone\(\{freq:150/.test(src) && /else if\(curWep==='smg'\)\{ tone\(\{freq:380/.test(src), 'shotgun + smg have their own fire sound');
assert(/enemyShot\(at\)\{ tone\(\{freq:300, type:'square', dur:0\.08, vol:0\.09/.test(src), 'enemies get a distinct shot timbre');
assert(/if\(SFX && SFX\.enemyShot\) SFX\.enemyShot\(from\);/.test(extractFunction('fireEnemyShot')), 'enemy fire uses enemyShot (positioned since 1208), not the player weapon');

// shake
assert(/addShake\(curWep==='shotgun'\?0\.16:\(curWep==='smg'\?0\.045:0\.08\)\);/.test(extractFunction('shoot')), 'recoil kick on firing');
assert(/addShake\(Math\.min\(0\.5, dmg\/55\)\)/.test(src), 'camera jolt when taking damage');

// low-hp cue
assert(/#lowhp \{ position: fixed/.test(html) && /<div id="lowhp"><\/div>/.test(html), 'low-hp vignette element + style');
assert(/heartbeat\(\)\{ tone\(\{freq:60/.test(src), 'heartbeat sound');
const ul = extractFunction('updateLowHp');
assert(/frac < 0\.35/.test(ul) && /_hbT = 0\.45 \+ frac\*1\.6;/.test(ul), 'vignette + quickening heartbeat below 35% hp');
assert(/updateLowHp\(dt\);/.test(src), 'low-hp driver ticks each frame');
done('combat feel');
