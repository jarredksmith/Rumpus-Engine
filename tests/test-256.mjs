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
// build 807: a moving car / coasting car / ragdoll / awake physics prop also refreshes the (otherwise static) sun shadow
assert(/let _shDirty = !!drivingCar \|\| \(typeof _coastingCars!=='undefined' && _coastingCars\.length>0\) \|\| \(typeof _corpses!=='undefined' && _corpses\.length>0\);/.test(loop), 'a driven/coasting car or a ragdoll keeps shadows live (build 807)');
assert(/if\(b && typeof b\.isSleeping==='function' && !b\.isSleeping\(\)\)\{ _shDirty=true; break; \}/.test(loop), 'an AWAKE (moving) physics prop keeps shadows live; a settled one lets them stay static');
assert(/if\(_shDirty\) _dirtyShadows\(1\);/.test(loop), 'shadows refresh only when something actually moved');

// --- WIN 3: tab-hide pause ---
assert(/addEventListener\('visibilitychange', \(\)=>\{/.test(src), 'listens for tab visibility');
assert(/_tabHidden = \(document\.visibilityState === 'hidden'\);/.test(src), 'tracks hidden state');
assert(/if\(_tabHidden\) return;/.test(loop), 'loop fully early-outs when hidden (no render, no physics step)');
// returning from background must drop the giant accumulated dt so nothing teleports
assert(/else \{ try\{ clock\.getDelta\(\); \}catch\(e\)\{\} _dirtyShadows\(2\); _adaptLast=0; _adaptNext=0; \}/.test(src), 'on return: flush accumulated dt, refresh shadows, reset the scaler timer (build 359)');
// the early-out sits before the heavy work but after the rAF re-arm (so the loop keeps polling to detect un-hide)
assert(loop.indexOf('requestAnimationFrame(loop);') < loop.indexOf('if(_tabHidden) return;'), 'rAF re-armed before the early-out');
done();
