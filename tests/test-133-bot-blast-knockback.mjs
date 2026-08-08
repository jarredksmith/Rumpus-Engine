// (build 190) Explosions now knock bots back, not just damage them. explodeAt's bot loop pushes each
// surviving bot away from the blast center (horizontal evx/evz) and pops it up (vy), scaled by proximity
// falloff and Launch Power — so an explosive barrel / grenade trap launches enemies like the trebuchet does.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const ex = (extractFunction('explodeAt') + extractFunction('_blastProps'));

assert(/const f=1-d\/R;[\s\S]*?botHurt\(bt, dmg\*f,/.test(ex), 'blast damage uses the falloff factor');
assert(/bt\.evx=\(bt\.evx\|\|0\)\+\(_kx\/_kh\)\*_kb; bt\.evz=\(bt\.evz\|\|0\)\+\(_kz\/_kh\)\*_kb;/.test(ex), 'bots get shoved away from the blast center');
assert(/bt\.vy=Math\.max\(bt\.vy\|\|0,\(5\+R\*0\.6\)\*f\*_LP\); bt\.grounded=false;/.test(ex), 'bots get popped upward and go airborne');
assert(/_LP=\(worldCfg&&\+worldCfg\.launchPower\)\|\|1/.test(ex), 'knockback scales with Launch Power');

done();
