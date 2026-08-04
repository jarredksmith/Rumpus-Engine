// (builds 134-135) Combat feel: per-weapon fire sounds, a distinct enemy shot, recoil shake on firing,
// a camera jolt when hurt, and a low-HP red vignette + quickening heartbeat.
import { gameSource, extractFunction, html, done, assert } from './harness.mjs';
const src = gameSource();

// per-weapon fire + enemy shot
assert(/shotgun:\{ sub:\[52[^}]*body:\{freq:150/.test(src) && /smg:    \{ sub:\[70[^}]*body:\{freq:380/.test(src), 'shotgun + smg have their own fire sound (the tuned body values ride _SHOT_LAYERS since 1211, byte-identical)');
assert(/enemyShot\(at\)\{ tone\(\{freq:300, type:'square', dur:0\.08, vol:0\.09/.test(src), 'enemies get a distinct shot timbre');
assert(/if\(SFX && SFX\.enemyShot\) SFX\.enemyShot\(from\);/.test(extractFunction('fireEnemyShot')), 'enemy fire uses enemyShot (positioned since 1208), not the player weapon');

// shake
// build 1358: retuned when the amplitude curve went from `shake*shake` to linear — squaring a trauma value
// that never approaches 1 was costing gunfire 85-96% of its amplitude. The RELATION this pin is about
// (a shotgun kicks hardest, an SMG least) is unchanged and is asserted directly.
{
  const sh = extractFunction('shoot').match(/addShake\(curWep==='shotgun'\?([\d.]+):\(curWep==='smg'\?([\d.]+):([\d.]+)\)\)/);
  assert(sh, 'recoil kick on firing');
  const [, shot, smg, rest] = sh.map(Number);
  assert(shot > rest && rest > smg, '...shotgun hardest, SMG lightest');
  assert(rest >= 0.1, '...and a rifle shot is now visible rather than a tenth of a pixel');
}
assert(/addShake\(Math\.min\(0\.5, dmg\/55\)\)/.test(src), 'camera jolt when taking damage');

// low-hp cue
assert(/#lowhp \{ position: fixed/.test(html) && /<div id="lowhp"><\/div>/.test(html), 'low-hp vignette element + style');
assert(/heartbeat\(\)\{ tone\(\{freq:60/.test(src), 'heartbeat sound');
const ul = extractFunction('updateLowHp');
assert(/frac < 0\.35/.test(ul) && /_hbT = 0\.45 \+ frac\*1\.6;/.test(ul), 'vignette + quickening heartbeat below 35% hp');
assert(/updateLowHp\(dt\);/.test(src), 'low-hp driver ticks each frame');
done('combat feel');
