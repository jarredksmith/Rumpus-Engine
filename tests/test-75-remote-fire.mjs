// (build 110) Remote gunfire is networked: each shot broadcasts origin+direction so other players see a
// tracer + muzzle flash from the shooter and their avatar plays its attack clip. Host relays client shots.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// local shot broadcasts
const sh = extractFunction('shoot');
assert(/netFire\(player\.pos, _fd\)/.test(sh), 'shoot broadcasts a fire event');

// sender
const nf = extractFunction('netFire');
assert(/t:'fire', from:NET\.myId/.test(nf), 'fire message carries the shooter id');
assert(/NET\.conn\.send\(m\)/.test(nf) && /NET\.conns\[id\]\.send\(m\)/.test(nf), 'client sends to host; host broadcasts');

// receiver render
const rf = extractFunction('remoteFire');
assert(/tracer\(from, from\.clone\(\)\.addScaledVector\(dir, 60\)\)/.test(rf), 'draws a tracer from the shooter');
assert(/muzzleFlashAt\(from\)/.test(rf), 'spawns a muzzle flash');
assert(/rp\._fireT = performance\.now\(\)\+480/.test(rf) && !/setEnemyAnimState\(rp\.mesh,'attack'\)/.test(rf), 'flags the fire pose; netInterpolate owns the state (build 519)');
assert(/SFX\.shootAt\(from\)/.test(rf), 'plays the distance-attenuated shot');
assert(/function muzzleFlashAt/.test(src), 'muzzle flash helper exists');
assert(/flashLightAt\(pos\);/.test(extractFunction('muzzleFlashAt')), 'muzzle flash falls back to a light glow (no solid sphere)');
assert(/function flashLightAt/.test(src) && /new THREE\.PointLight\(0xffcf6b/.test(src), 'pooled muzzle light');
assert(/flash\.visible = false;/.test(src), 'local solid muzzle sphere hidden (light only)');
assert(/_muzFlashes\.splice/.test(src), 'muzzle flashes are ticked + removed');

// attack pose held during interpolation
const ni = extractFunction('netInterpolate');
assert(/if\(rp\._fireT && performance\.now\(\) < rp\._fireT\)\{/.test(ni) && /_fireSlot\(_rf\)\|\|'attack'/.test(ni), 'attack / move+fire pose held while _fireT active (build 518)');

// relay + receive
assert(/else if\(msg\.t==='fire'\)\{ remoteFire\(id, msg\.o, msg\.d, msg\.w\); for\(const cid in NET\.conns\)/.test(src), 'host renders + relays client fire');
assert(/else if\(msg\.t==='fire'\)\{ remoteFire\(msg\.from, msg\.o, msg\.d, msg\.w\); \}/.test(src), 'client renders a fire event');

// attenuated sound
assert(/shootAt\(pos\)\{/.test(src), 'SFX.shootAt exists');
done('remote fire visuals');
