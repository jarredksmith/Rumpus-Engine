// (build 981) COMMAND PALETTE — Ctrl/Cmd+K (or the ⌘ topbar button) opens a "do anything" box over
// the editor: curated actions (play/undo/save/share/camera/gizmo/add-shape/mode-switch) AND every
// settings section, matched by title + its SEC_SUB description, opening + scrolling to it. Keyboard
// driven (↑↓ select, Enter run, Esc close). Closes with the editor.
import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();

assert(/function _palOpen\(\)/.test(src) && /function _palItems\(\)/.test(src) && /function _palRender\(/.test(src), 'the palette exists');
assert(/#edPal \{ position:fixed; inset:0; z-index:110;/.test(html), 'full-screen overlay above the panel');
assert(/id="edPalInput"/.test(src), 'the palette input is created in JS at open time');

// the Ctrl/Cmd+K binding, editor-only
assert(/\(e\.ctrlKey\|\|e\.metaKey\) && \(e\.key==='k'\|\|e\.key==='K'\) && typeof editorOpen!=='undefined' && editorOpen/.test(src),
  'Ctrl/Cmd+K opens it, only while the editor is open');

// curated actions
for (const a of ['Play level', 'Undo', 'Save level', 'Copy share link', 'Toggle Top view', 'Gizmo: Rotate'])
  assert(new RegExp("A\\('" + a.replace(/[:()]/g, '\\$&')).test(src), 'action "' + a + '" is offered');
assert(/for\(const s of \['box','sphere','cylinder','cone','ramp','stairs','dome','tube','torus'\]\)\s*\n\s*A\('Add '\+s/.test(src),
  'every primitive is an "Add …" action');
assert(/for\(const m of EDITOR_MODES\)\s*\n\s*A\('Go to '\+\(MODE_LABEL\[m\]\|\|m\)\+' tab'/.test(src), 'each mode is a jump action');

// settings sections, matched by title + SEC_SUB (render-independent, so cross-tab search works)
assert(/kw:\(title\+' '\+\(SEC_SUB\[key\]\|\|''\)\+' '\+\(sx\.textContent\|\|''\)\.slice\(0,900\)\)\.toLowerCase\(\)/.test(src),
  'sections match on title + their description (finds "fog" even from another tab)');
assert(/setEditorMode\(owner\); sx\.classList\.remove\('collapsed'\); setTimeout\(\(\)=>\{ try\{ sx\.scrollIntoView/.test(src),
  'running a section entry jumps to its tab, opens and scrolls to it');
assert(/kind:MODE_LABEL\[owner\]\|\|owner/.test(src), 'each section entry is tagged with its owning tab');

// keyboard + lifecycle
assert(/if\(e\.key==='ArrowDown'\)/.test(src) && /if\(e\.key==='ArrowUp'\)/.test(src) && /if\(e\.key==='Enter'\)/.test(src) && /if\(e\.key==='Escape'\)/.test(src),
  'arrows select, Enter runs, Esc closes');
assert(/id="edPalBtn"/.test(src) && /pb\.onclick=\(\)=>_palToggle\(\)/.test(src), 'a topbar ⌘ button opens it (touch has no Ctrl+K)');
assert(/if\(typeof _palClose==='function'\) _palClose\(\);/.test(src), 'the palette closes when the editor closes');

done('build 981: command palette — Ctrl+K jump to any action or setting');
