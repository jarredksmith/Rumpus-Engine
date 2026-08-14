import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
const rcp = extractFunction('renderCampaignPanel');
/* build 1497 moved the declaration onto a persisted-key initializer and made Add ATTACH — the old
   "clears any edit pointer" half of this pin was the DEFECT (the copy started going stale on the very
   next edit), so that half is inverted rather than restated. */
assert(/let campaignEditIdx = \(function\(\)\{/.test(src), 'campaignEditIdx not declared');
assert(/lv\.name='Level '\+\(campaign\.levels\.length\+1\); campaign\.levels\.push\(lv\); saveCampaign\(\); _campTrack\(campaign\.levels\.length-1\)/.test(rcp), 'add names the level and ATTACHES to it');
// each row has an editable name field bound to lv.name
assert(/nm\.value=\(lv\.name!=null\?lv\.name:\('Level '\+\(i\+1\)\)\)/.test(rcp), 'row missing name field');
assert(/nm\.onchange=\(\)=>\{ lv\.name=nm\.value\.trim\(\)\|\|\('Level '\+\(i\+1\)\); saveCampaign\(\); \}/.test(rcp), 'renaming not persisted');
// Edit re-opens the level into the editor and remembers the slot
assert(/ed\.onclick=\(\)=>\{[\s\S]*?restoreLevel\(campaign\.levels\[i\]\); _campTrack\(i\);[\s\S]*?renderEditorFields\(\)/.test(rcp), 'Edit does not load the level for editing');
// save-back writes the current level into the edited slot, preserving the name
assert(/if\(campaignEditIdx>=0 && campaign\.levels\[campaignEditIdx\]\)\{/.test(rcp), 'no save-back banner when editing');
assert(/const lv=serializeLevel\(\); lv\.name=_enm; campaign\.levels\[campaignEditIdx\]=lv; saveCampaign\(\)/.test(rcp), 'save-back does not write the slot / keep the name');
/* What this always meant: save-back can never target the WRONG slot after the list changes. Build 1497
   serves it better than releasing the pointer did — reorder REMAPS it, delete SHIFTS or detaches, clear
   detaches — so the assertion moved from "count the resets" to the routing that keeps the slot true. */
assert(/const _remap=\(from,to\)=>/.test(rcp), 'reorder remaps the edit pointer');
assert(/campaignEditIdx===i \? -1 : \(campaignEditIdx>i \? campaignEditIdx-1 : campaignEditIdx\)/.test(rcp),
  'delete detaches the edited slot or shifts the pointer past the gap');
assert(/campaign\.levels=\[\]; saveCampaign\(\); _campTrack\(-1\)/.test(rcp), 'clear releases it');
done();
