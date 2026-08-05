// (build 171) Prop lifecycle: radial-deployed props are session-only (userData.runtime) — never serialized,
// cleared on (re)deploy and on entering the editor. Authored props destroyed in play are kept (hidden) and
// respawn at their home with full HP on the next deploy/reset, instead of being permanently removed.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// radial props flagged runtime
const dp = extractFunction('deployProp');
assert(/obj\.userData\.runtime = true;/.test(dp), 'radial props flagged session-only');
// not serialized
assert(/props:\s*propModels\.filter\(o=>o && !o\.userData\.runtime\)\.map\(propEntry\)/.test(src), 'runtime props excluded from the saved level');
// helpers exist
assert(/function clearRuntimeProps\(\)\{/.test(src) && /o\.userData\.runtime && typeof removeProp==='function'\) removeProp\(i\)/.test(src), 'clearRuntimeProps removes radial props');
/* build 1391: the per-prop body is `_restoreDestroyedProp`, which `restoreDestroyedProps` loops over and
   the `resetprop` verb calls for ONE prop. The intent pinned here is unchanged. */
assert(/function restoreDestroyedProps\(\)\{/.test(src) && /if\(!o \|\| !o\.userData\._destroyed\) return false;/.test(src), 'restoreDestroyedProps brings back destroyed authored props');
assert(/for\(const o of propModels\) _restoreDestroyedProp\(o\);/.test(src), '...by looping the one shared body');
// shatter keeps authored props for respawn
const sh = extractFunction('shatterProp');
assert(/if\(idx>=0 && !obj\.userData\.runtime\)\{/.test(sh) && /obj\.userData\._destroyed = true;/.test(sh), 'authored props kept (hidden) on destroy');
assert(/obj\.userData\._destroyHome = \{ p:\(obj\.userData\.physHome\|\|obj\.position\)\.clone\(\)/.test(sh), 'authored home stashed for respawn');
// reset path runs both
const rd = extractFunction('resetDynamicProps');
assert(/clearRuntimeProps\(\);/.test(rd) && /restoreDestroyedProps\(\);/.test(rd), 'redeploy clears radial + restores destroyed authored props');
done('prop lifecycle: runtime radial + authored respawn');
