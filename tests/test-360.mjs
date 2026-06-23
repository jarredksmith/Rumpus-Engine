import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 480: during the pre-match "GENERATING ARENA / countdown" (matchWarmup>0) the player could still run
// around while bots were frozen — an unfair head start. Freeze player translation AND jump during warmup,
// mirroring the existing duelDead / level-load freezes.
assert(/if\(matchWarmup>0\)\{ wish\.set\(0,0,0\); moveScale=0; \}/.test(src), 'movement wish is zeroed during warmup');
assert(/if\(!_ledge && _jPressed && player\.onGround && \(player\.jumpCd\|\|0\)<=0 && !_levelLoaderActive && matchWarmup<=0 && !mountedTurret\)\{ player\.vel\.y = JUMP/.test(src), 'jump is blocked during warmup');
// the freeze sits alongside the other movement freezes (consistent gating)
assert(/if\(pvpMode\(\) && duelDead\)\{ wish\.set\(0,0,0\); moveScale=0; \}/.test(src), 'duelDead freeze still present');
assert(/if\(_levelLoaderActive\)\{ wish\.set\(0,0,0\); moveScale=0; \}/.test(src), 'level-load freeze still present');
// build 481: also block firing and grenade throws during warmup (was still able to shoot/kill bots)
assert(/function shoot\(\)\{\s*if\(matchWarmup>0\) return;/.test(src), 'primary fire blocked during warmup');
assert(/function throwGrenade\(\)\{\s*if\(matchWarmup>0\) return;/.test(src), 'grenade throw blocked during warmup');
done();
