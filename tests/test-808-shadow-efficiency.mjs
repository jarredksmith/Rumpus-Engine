// (build 808) Shadow-pass efficiency: coins and short-lived debris no longer cast shadows (dozens of tiny casters made
// every shadow refresh expensive for zero visible gain), and transient movers (corpses / settling physics props) refresh
// the static sun shadow every 3rd frame instead of every frame. Fast movers (driven/coasting cars, moving platforms) stay
// live so nothing the player is focused on lags.
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();

// coins don't cast
assert(/model\.traverse\(o=>\{ if\(o\.isMesh\) o\.castShadow=false; \}\); g\.add\(model\);/.test(extractFunction('makeCoinMesh')), 'coin models never cast shadows');
// debris doesn't cast (host physics debris + client visual debris)
assert(/mesh\.position\.set\(px,py,pz\); mesh\.castShadow = false; scene\.add\(mesh\);/.test(src), 'physics debris never casts shadows');
assert(/mesh\.castShadow = false;\s*\/\/ build 808: cosmetic client debris never casts/.test(src), 'client-side visual debris never casts shadows');

// the two-tier dirty system
assert(/let _shadowTick = 0;/.test(src), 'a 3-frame shadow cadence counter exists');
const loop = extractFunction('loop');
assert(/_shadowTick=\(_shadowTick\+1\)%3;/.test(loop), 'the cadence advances every frame');
assert(/if\(_shDirty \|\| \(_shSlow && _shadowTick===0\)\) _dirtyShadows\(1\);/.test(loop), 'fast movers refresh live; transient movers only every 3rd frame');

done('build 808: shadow pass — no tiny casters, transient movers throttled');
