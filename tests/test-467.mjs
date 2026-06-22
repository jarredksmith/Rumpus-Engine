import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 613: preview a single shot, not just the whole cutscene.

assert(/prevShot\.textContent='\\u25b6 This shot'/.test(src), 'editor has a "This shot" preview button');
assert(/const _selShot=\(\)=>\{ const a=cineAllShots\(\); return a\[Math\.min\(_cineShotSel, a\.length-1\)\]; \}/.test(src), 'it resolves the currently-selected shot');
assert(/prevShot\.onclick=\(\)=>\{ const _cc=_curCutscene\(\), s=_selShot\(\); if\(s && s\.path && s\.path\.length\) startCinematic\(\{ shots:\[s\], audio:_cc\.audio \}, true\); \}/.test(src), 'plays ONLY the selected shot, as an editor preview');
assert(/\{ const s=_selShot\(\); prevShot\.disabled=!\(s && s\.path && s\.path\.length>=1\); \}/.test(src), 'disabled when the selected shot has no path');
// the whole-cutscene preview still exists and plays every shot
assert(/prevAll\.textContent='\\u25b6 Cutscene'/.test(src), 'whole-cutscene preview is still present');
assert(/prevAll\.onclick=\(\)=>\{ const _cc=_curCutscene\(\); startCinematic\(\{ shots: cineShotsOf\(_cc\), audio: _cc\.audio \}, true\); \}/.test(src), 'cutscene preview plays the full shot list');

done('single-shot preview: play just the selected shot (build 613)');
