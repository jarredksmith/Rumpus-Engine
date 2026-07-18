// (build 999) THE EDIT-MODEL-PARTS FOLD NEVER HIDES SILENTLY. Adding a model re-rendered the panel
// before the download finished (zero meshes yet), so the build-996 fold skipped and looked like it
// didn't exist; Sketchfab-search imports (sketchfab: sources) skipped silently too. Now: a loading
// note + a poller that re-renders when the meshes land; an honest explanation for un-repackable
// imports; primitives alone stay foldless (nothing to edit).
import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();

assert(/if\(typeof isPrimitive==='function' && isPrimitive\(url\)\) return;/.test(src),
  'built-in shapes show no fold (nothing to edit)');
assert(/Sketchfab imports can\\u2019t be re-edited here/.test(src) && /use Upload \.glb above \\u2014 then this fold unlocks/.test(src),
  'sketchfab imports get an honest note with the workaround, not silence');
assert(/'Waiting for the model to finish loading\\u2026'/.test(src),
  'a still-downloading model shows the fold with a loading subtitle');
assert(/Model still downloading \\u2014 this fold fills in automatically when it arrives\./.test(src),
  '...and says it will fill in by itself');
assert(/if\(!obj\.userData\._mpeWaiting\)\{/.test(src) && /obj\.userData\._mpeWaiting=true; let _tries=0;/.test(src),
  'one poller per prop (no timer pile-up on re-renders)');
assert(/if\(_meshOrderOf\(obj\)\.length\)\{ obj\.userData\._mpeWaiting=false; renderEditorFields\(\); return; \}/.test(src),
  'the poller re-renders the panel the moment the meshes land');
assert(/if\(!editorOpen \|\| !tgt\.obj \|\| tgt\.obj\(\)!==obj\)\{ obj\.userData\._mpeWaiting=false; return; \}/.test(src),
  'the poller stops when the editor closes or the selection moves on');
assert(/if\(\+\+_tries<40\) setTimeout\(_poll, 700\); else obj\.userData\._mpeWaiting=false;/.test(src),
  'bounded polling (~28s), never a runaway timer');

done('build 999: the parts fold always explains itself — loading, unsupported, or ready');
