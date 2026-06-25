import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 695: simple NPC dialogue. A prop with dialogue lines becomes a talkable NPC (E Talk); click/E steps through
// the lines. The first line fires the prop's 'interacted' signals, so a chat can give a quest / drop a checkpoint.

// --- a prop with dialogue is detected as an NPC interact target ---
assert(/const dl=o&&o\.userData&&o\.userData\.dialogue; if\(!dl\|\|!dl\.length\) continue;[\s\S]*?nearTarget = \{ type:'npc', obj:best \}/.test(src), 'a prop with dialogue is an NPC target');
assert(/nearTarget\.type==='npc'\)\{\s*const nm=nearTarget\.obj\.userData\.npcName;/.test(src), 'the prompt shows E Talk');

// --- the dialogue box: open / advance / close, escaped, signal on open ---
const od = extractFunction('openDialogue');
assert(/_dlg\.open=true; _dlg\.lines=dl\.slice\(0,12\); _dlg\.i=0;/.test(od), 'opening seeds the lines');
assert(/fireSignals\(obj, 'interacted'\)/.test(od), 'talking fires the NPC’s interacted signals');
const rd = extractFunction('_renderDialogue');
assert(/_creditEsc\(_dlg\.lines\[_dlg\.i\]\|\|''\)/.test(rd), 'dialogue text is escaped');
const ad = extractFunction('advanceDialogue');
assert(/_dlg\.i\+\+;[\s\S]*?if\(_dlg\.i >= _dlg\.lines\.length\) closeDialogue\(\);\s*else _renderDialogue\(\);/.test(ad), 'advance steps to the next line or closes');

// --- interact() routes to dialogue ---
const it = extractFunction('interact');
assert(/if\(_dlg\.open\)\{ advanceDialogue\(\); return; \}/.test(it), 'E advances an open conversation');
assert(/if\(nearTarget && nearTarget\.type==='npc'\)\{ openDialogue\(nearTarget\.obj\); return; \}/.test(it), 'E starts a conversation with an NPC');

// --- editor authoring ---
const panel = extractFunction('renderEditorFields');
assert(/edFold\(animHost, 'dialogue', 'Dialogue \(NPC\)'/.test(panel), 'a Dialogue fold in the prop inspector');
assert(/sel\.userData\.dialogue=lines/.test(panel) && /sel\.userData\.npcName=v/.test(panel), 'it writes dialogue lines + name');

// --- persistence (serialize + 3 load paths) ---
const pe = extractFunction('propEntry');
assert(/e\.dlg=o\.userData\.dialogue\.slice\(0,12\)\.map\(s=>String\(s\)\.slice\(0,200\)\)/.test(pe) && /e\.npc=String\(o\.userData\.npcName\)\.slice\(0,40\)/.test(pe), 'dialogue + name serialized');
assert((src.match(/if\(Array\.isArray\(p\.dlg\)\) obj\.userData\.dialogue=p\.dlg\.map\(s=>String\(s\)\.slice\(0,200\)\); if\(p\.npc\) obj\.userData\.npcName=String\(p\.npc\)\.slice\(0,40\);/g)||[]).length===3, 'restored in all three load paths');

// --- closed on game start / end ---
assert(/run = \{ \.\.\.RUN0 \}; _checkpoint=null; if\(typeof closeDialogue==='function'\) closeDialogue\(\);/.test(src), 'a fresh run closes any dialogue');

done('build 695: simple NPC dialogue');
