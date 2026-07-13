// (build 959) NO BROWSER DIALOGS IN THE SUBMIT FLOW. window.prompt()/alert() are browser-chrome
// popups — they yank the game out of fullscreen and stall the loop. The community submit now
// collects level name + author name in ONE themed in-game modal: uiPromptForm (the _uiDialog
// look with text inputs; Enter submits, Escape/backdrop/Cancel cancels, first field focused
// and selected, values prefilled from last time). Verified headless with window.prompt stubbed
// to THROW: modal renders 2 fields, Escape cancels ("Submission cancelled."), filled values
// flow through to the POST and persist to localStorage; screenshot eyeballed.
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

// the helper exists beside its dialog siblings and never uses browser chrome
assert(/function uiPromptForm\(title, fields, cb\)\{/.test(src), 'uiPromptForm exists');
const fn = src.match(/function uiPromptForm\(title, fields, cb\)\{[\s\S]{0,3200}/)[0];
assert(/inp\.type='text'/.test(fn) && /inputs\.push\(inp\)/.test(fn), 'it builds real text inputs');
assert(/e\.key==='Escape'/.test(fn) && /close\(null\)/.test(fn), 'Escape cancels with null');
assert(/e\.key==='Enter'/.test(fn) && /close\(inputs\.map\(i=>i\.value\)\)/.test(fn), 'Enter submits the values');
assert(/inputs\[0\]\.focus\(\); inputs\[0\]\.select\(\)/.test(fn), 'first field focused and selected');
assert(/if\(e\.target===back\) close\(null\)/.test(fn), 'backdrop click cancels');

// the submit flow uses it — and no prompt() remains anywhere in the flow
const sub = src.match(/#edSubmitComm[\s\S]{0,5200}/)[0];
assert(/uiPromptForm\('Submit to the community library'/.test(sub), 'submit collects both fields in the modal');
assert(/\{ label:'LEVEL NAME', value:name, max:60 \}/.test(sub) && /max:40/.test(sub), 'fields carry the pipeline caps');
assert(!/\bprompt\('/.test(sub), 'no window.prompt calls anywhere in the submit flow');
assert(/Submission cancelled\./.test(sub), 'cancelling is acknowledged, not an error');
assert(/breach_last_level_name/.test(sub) && /breach_author_name/.test(sub), 'both values are remembered for next time');

done('build 959: community submit uses a themed in-game modal — fullscreen survives');
