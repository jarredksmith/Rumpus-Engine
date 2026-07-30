// (build 79) The "black gun" fix: the viewmodel scene had no environment map, so metallic gun materials
// rendered black. Sync the world environment into vmScene, with a neutral fallback when there's no sky.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();
const rv = extractFunction('_drawViewmodel');   // build 1140: the drawing half of the old renderViewmodel
assert(/vmScene\.environment = scene\.environment \|\| _vmEnvFallback/.test(rv), 'viewmodel reflects the world env (or a fallback)');
assert(/_ensureVmEnv\(\);/.test(rv), 'the fallback env is ensured before rendering');
const ev = extractFunction('_ensureVmEnv');
assert(/PMREMGenerator/.test(ev) && /fromEquirectangular/.test(ev), 'fallback env is a PMREM-processed neutral gradient');
assert(/_vmEnvTried = true/.test(ev), 'fallback build is attempted only once');
done('viewmodel environment (no more black gun)');
