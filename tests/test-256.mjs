import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 358: three quick perf wins — high-performance GPU hint, static shadow maps, tab-hide pause.

// --- WIN 1: discrete-GPU hint ---
assert(/new THREE\.WebGLRenderer\(\{ antialias: true, powerPreference: 'high-performance' \}\)/.test(src), 'renderer asks for the discrete GPU');

// --- WIN 2: static shadow maps ---
assert(/renderer\.shadowMap\.autoUpdate = false; renderer\.shadowMap\.needsUpdate = true;/.test(src), 'shadows static by default, dirty once at startup');
assert(/function _dirtyShadows\(n\)\{ _shadowDirtyFrames = Math\.max\(_shadowDirtyFrames, n\|\|2\); \}/.test(src), '_dirtyShadows raises the dirty-frame countdown');
const loop = extractFunction('loop');
assert(/if\(_shadowDirtyFrames>0\)\{ renderer\.shadowMap\.needsUpdate = true; _shadowDirtyFrames--; \}\s*else renderer\.shadowMap\.needsUpdate = false;/.test(loop), 'loop drains the countdown, else leaves shadows frozen');
assert(/if\(editorOpen \|\| _cineActive\) _dirtyShadows\(1\);/.test(loop), 'editing + cinematics keep shadows live');
assert(/a\.on&&a\.ph>0&&a\.ph<1\)\{ _shDirty=true; break; \}/.test(loop), 'a mechanism mid-travel keeps shadows live');
// build 807/808: movers refresh the (otherwise static) sun shadow, in two tiers — fast movers live, transient every 3rd frame
assert(/let _shDirty = !!drivingCar \|\| \(typeof _coastingCars!=='undefined' && _coastingCars\.length>0\);/.test(loop), 'a driven/coasting car keeps shadows live every frame (fast tier)');
assert(/let _shSlow = !_shDirty && \(typeof _corpses!=='undefined' && _corpses\.length>0\);/.test(loop), 'ragdoll corpses are the TRANSIENT tier (build 808)');
assert(/if\(b && typeof b\.isSleeping==='function' && !b\.isSleeping\(\)\)\{ _shSlow=true; break; \}/.test(loop), 'an AWAKE (moving) physics prop is transient too; a settled one lets shadows stay static');
assert(/_shadowTick=\(_shadowTick\+1\)%3;/.test(loop) && /if\(_shDirty \|\| \(_shSlow && _shadowTick===0\)\) _dirtyShadows\(1\);/.test(loop), 'transient movers refresh every 3rd frame, fast movers every frame');

// --- WIN 3: tab-hide pause ---
assert(/addEventListener\('visibilitychange', \(\)=>\{/.test(src), 'listens for tab visibility');
assert(/_tabHidden = \(document\.visibilityState === 'hidden'\);/.test(src), 'tracks hidden state');
assert(/if\(_tabHidden\) return;/.test(loop), 'loop fully early-outs when hidden (no render, no physics step)');
// returning from background must drop the giant accumulated dt so nothing teleports
assert(/else \{ try\{ clock\.getDelta\(\); \}catch\(e\)\{\} _dirtyShadows\(2\); _adaptLast=0; _adaptNext=0; \}/.test(src), 'on return: flush accumulated dt, refresh shadows, reset the scaler timer (build 359)');
// the early-out sits before the heavy work but after the rAF re-arm (so the loop keeps polling to detect un-hide)
assert(loop.indexOf('requestAnimationFrame(loop);') < loop.indexOf('if(_tabHidden) return;'), 'rAF re-armed before the early-out');
done();
