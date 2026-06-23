import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 661: the cinematic camera-preview window (panel + frame border) lingered on screen during a cutscene
// preview and sometimes in live play. Cause: _renderCinePvWindow() owns the hide logic but the loop returns
// early for cutscene/loader/campaign-card branches (never reaching it) and gates the normal call behind
// editorOpen. Fix: hide the panel near the top of the loop, before ANY early-out.

// the guard exists and runs before the early-return branches
assert(/if\(_cinePvPanel && \(!editorOpen \|\| _cineActive \|\| !_cinePvOn\)\)\{ _cinePvPanel\.style\.display='none'; if\(typeof _blankCinePvWindow==='function'\) _blankCinePvWindow\(\); \}/.test(src), 'a top-of-loop guard hides the preview (+ blanks the pop-out) when not actively editing');

// it sits BEFORE the level-loader / cutscene early returns (so those paths can't skip it)
const guard = src.indexOf("if(_cinePvPanel && (!editorOpen || _cineActive || !_cinePvOn)){ _cinePvPanel.style.display='none';");
const loader = src.indexOf('if(_levelLoaderActive){ pollGamepad(dt); renderScene(scene,camera); renderViewmodel(); return; }');
const cine = src.indexOf('if(_cineActive){ updateCinematic(rawDt);');
assert(guard > 0 && loader > guard && cine > guard, 'the guard runs before the cutscene + loader early-returns');

// the in-function hide is still there for the normal editor frame (no shot / preview toggled off)
assert(/function _renderCinePvWindow\(\)\{\s*\n\s*if\(!editorOpen \|\| !_cinePvOn \|\| _cineActive\)\{ if\(_cinePvPanel\) _cinePvPanel\.style\.display='none'; _blankCinePvWindow\(\); return; \}/.test(src), 'the per-frame render still self-hides too');

done('build 661: cinematic preview window no longer lingers into cutscenes / play');
