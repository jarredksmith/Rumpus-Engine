// (build 844) UI-AUDIT CLEANUP, pass 1 — dead UI removed, stale strings fixed, Material explains itself:
//  - the orphaned Sounds editor (populateSoundEditor + #edSounds host that was never created + its
//    defaultCollapsed entry) is deleted — audio long ago moved to World > Audio and the Weapons tab;
//  - selecting an imported model no longer HIDES the Material section: it renders a note explaining that
//    imported models keep their own materials (first-timers thought colour wasn't editable at all);
//  - stale error strings that referenced removed fields ('token above', 'paste its URL above') are truthful now;
//  - the six model-search headers use ONE phrase ('Search free models — Poly Pizza / Sketchfab') instead of
//    four different labels; the Object section subtitle no longer undersells what lives inside it.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// dead Sounds path fully gone
assert(!/function populateSoundEditor/.test(src), 'the orphaned Sounds editor is deleted');
assert(!/querySelector\('#edSounds'\)/.test(src), 'nothing looks up the never-created #edSounds host');
assert(!/sounds:true/.test(src.match(/const defaultCollapsed = \{[^}]*\}/)[0]), 'its collapse default is gone too');
assert(/renderFreesoundBrowser\(b, \(\)=>renderEditorFields\(\)\)/.test(src), 'the Freesound browser still lives in World > Audio');

// Material explains itself for imported models
assert(/const matNote = matInMode && !matOn && !!selObj;/.test(src), 'imported-model selections keep the section visible');
assert(/Imported models keep their own materials\./.test(src), '...with a plain-language note');

// stale strings fixed
assert(!/Enter your Freesound API token above first/.test(src), 'no more “token above” (that field does not exist)');
assert(!/paste its URL above/.test(src), 'no more “paste its URL above” (that field does not exist)');
assert(/set localStorage "pp_proxy" to its URL/.test(src), 'the proxy override instruction is truthful (localStorage)');

// one search-header phrase everywhere
eq((src.match(/Search free models<\/b>/g)||[]).length >= 6, true, 'the model-search headers share one phrase');
assert(!/<b>Poly Pizza<\/b> — search/.test(src) && !/'Poly Pizza<\/b> — search free models/.test(src), 'the bare “Poly Pizza” header variants are gone');

// the Object subtitle tells the truth about its contents
assert(/object:\s*'Swap or search the model, then set up animation, physics, vehicle, signals, locks and more\.'/.test(src), 'SEC_SUB.object covers what the section actually holds');

done('build 844: UI cleanup — dead Sounds editor removed, Material self-explains, stale strings + headers normalized');
