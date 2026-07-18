// (build 102) Enemies crossfade between idle/walk/run/attack clips based on movement + attacks, with
// per-state clip overrides in the editor (auto-resolved by clip name otherwise).
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

assert(/clips:\{ idle:'', walk:'', run:'', attack:'' \}/.test(src), 'ENEMY_MODEL0 carries a per-state clip map');
assert(/clips: Object\.assign\(\{ idle:'', walk:'', run:'', attack:'' \}, src\.clips\|\|\{\}\)/.test(src), 'applyEnemyModelData carries clips');
assert(/clips:Object\.assign\(\{\}, m\.clips\)/.test(src), 'serializeLevel writes clips');

const pes = extractFunction('playEnemyStates');
assert(/for\(const _slot of ANIM_SLOTS\)\{ const st = _slot\.k;/.test(pes), 'builds an action per taxonomy slot (build 486)');
assert(/setEffectiveWeight\(0\); a\.play\(\)/.test(pes), 'all states play at weight 0');
assert(/root\.userData\.stateActions = actions/.test(pes), 'stores the state actions');

const sas = extractFunction('setEnemyAnimState');
assert(/crossFadeTo\(next, 0\.18, false\)/.test(sas), 'crossfades between states');

const rsc = extractFunction('_resolveStateClip');
assert(/const re = _STATE_RE\[state\]; if\(!re\) return null;/.test(rsc) && /re\.test\(a\.name/.test(rsc), 'auto-resolves clips by name, guarding a missing pattern (build 374)');

// runtime drives state from movement + attack window
assert(/if\(en\._attackT && nowMs < en\._attackT\) st = 'attack';/.test(src), 'attack window -> attack state');
assert(/else if\(en\._mvAvg > 0\.012\)\{ st = en\._chase \? 'run' : 'walk'; en\._locoSt = st; \}/.test(src), 'moving -> run (chase) / walk (patrol) — judged on the build-995 smoothed displacement, not the raw frame');
assert(/setEnemyAnimState\(en\.mesh, st\)/.test(src), 'applies the state each frame');
assert(/en\.cooldown = 0\.8; en\._attackT = nowMs \+ 550/.test(src), 'melee attack opens the attack window');
assert(/en\.shootCd = en\.fireCd; en\._attackT = nowMs \+ \(en\.burst>1 \? 450 \+ en\.burst\*en\.burstGap\*1000 : 450\)/.test(src), 'ranged attack opens the attack window (spanning a burst)');

// buildEnemyVisual uses the state machine with legacy clip -> idle
assert(/playEnemyStates\(model, gltf, _clipMap\)/.test(src), 'enemy build uses the state machine');
assert(/if\(mc\.clip && !_clipMap\.idle\) _clipMap\.idle = mc\.clip/.test(src), 'legacy single clip maps to idle');

// editor: four state dropdowns
assert(/'edEnemyClip_'\+stKey/.test(src), 'editor builds a dropdown per state');
assert(/mc\.clips\[stKey\]=sel\.value/.test(src), 'dropdown writes the per-state override');
done('enemy animation state machine');
