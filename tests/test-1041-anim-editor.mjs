// (build 1041) THE ANIMATION EDITOR WORKSPACE — full-screen in-browser clip authoring over the
// build-1040 foundation: bone tree, orbit viewport with joint posing, inspector, canvas
// timeline with draggable keys, auto-key, clip management with dependency-checked delete,
// one-click state assignment through the existing per-state override map, modal-local
// undo/redo, and full viewport disposal on close.
import { gameSource, html, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- executable: the pure keyframe-list helpers ----
const env = new Function(
  extractFunction('_aeUpsertKey', src) + '\n' + extractFunction('_aeDeleteKeyAt', src) + '\n'
  + extractFunction('_aeSnapT', src) + '\n' + extractFunction('_aeKeyTimes', src)
  + '\nreturn { up:_aeUpsertKey, del:_aeDeleteKeyAt, snap:_aeSnapT, times:_aeKeyTimes };')();
{
  const arr = [];
  env.up(arr, [0.5, 1]); env.up(arr, [0.1, 2]); env.up(arr, [0.9, 3]);
  eq(arr.map(k => k[0]).join(','), '0.1,0.5,0.9', 'keys insert sorted by time');
  env.up(arr, [0.5, 99]);
  eq(arr.length, 3, 'a key at an existing time replaces (within epsilon)');
  eq(arr[1][1], 99, '...with the new value');
  env.up(arr, [0.50005, 7]);
  eq(arr.length, 3, '...and epsilon catches float drift');
  assert(env.del(arr, 0.1), 'delete by time works');
  eq(arr.length, 2, '...and removes exactly one');
  assert(!env.del(arr, 0.33), 'deleting a missing time is a clean false');
}
{
  near(env.snap(0.337, 30, true), 0.333, 1e-3, 'snap rounds to the frame grid');
  near(env.snap(0.337, 30, false), 0.337, 1e-9, 'snap off keeps milliseconds');
  eq(env.snap(-5, 30, true), 0, 'time never goes negative');
  const clip = { tracks: { head: { q: [[0, 0, 0, 0, 1], [1, 0, 0, 0, 1]] }, hips: { q: [[0.5, 0, 0, 0, 1]], p: [[0.25, 0, 0, 0]] } } };
  eq(env.times(clip).join(','), '0,0.25,0.5,1', 'key times gather across all tracks, deduped and sorted');
  eq(env.times(null).length, 0, 'no clip, no times');
}

// ---- executable: per-model attach naming (collision suffix mirrors _caClipsFor) ----
{
  const fn = new Function('customAnims', '_aeClip', '_aeGltf',
    extractFunction('_aeAttachName', src) + '\nreturn _aeAttachName();');
  eq(fn([{ id: 'ca_a', name: 'Wave' }], { id: 'ca_a', name: 'Wave' }, { animations: [{ name: 'Idle' }] }), 'Wave',
    'no collision -> the raw clip name');
  eq(fn([{ id: 'ca_a', name: 'Idle' }], { id: 'ca_a', name: 'Idle' }, { animations: [{ name: 'Idle' }] }), 'Idle (custom)',
    'a name colliding with a model clip answers to its suffixed attach name');
}

// ---- executable: the delete safety net scans every character config ----
{
  const fn = new Function('playerModelCfg', 'charRoster', 'ANIM_SLOTS',
    extractFunction('_aeAssignments', src) + '\nreturn _aeAssignments("My Reload");');
  const out = fn({ clips: { reload: 'My Reload', idle: 'Other' } },
    [{ name: 'Guard', clips: { attack: 'My Reload' } }],
    [{ k: 'reload', l: 'Reload', g: 'x' }, { k: 'attack', l: 'Attack', g: 'x' }, { k: 'idle', l: 'Idle', g: 'x' }]);
  eq(out.join(' | '), 'Player · Reload | Guard · Attack', 'assignments list every user of the clip by friendly state name');
}

// ---- the two-clone architecture: display clone is posed, rest clone builds clips ----
const openFn = extractFunction('_aeOpen', src);
eq((openFn.match(/THREE\.cloneSkinned\(gltf\.scene\)/g) || []).length, 2, 'TWO clones: display + pristine rest');
assert(/_caBuildClip\(_aeRestRoot, clean\)/.test(src), 'preview clips always build from the REST clone (bind pose can never drift into the data)');
assert(/const delta=wq\.multiply\(rw\.clone\(\)\.invert\(\)\);/.test(extractFunction('_aeKeySlot', src)),
  'keys capture world-space deltas against rest — the 1040 rig-independent representation');
assert(/\.sub\(_aeHipRestW\)\.divideScalar\(_aeHipH\)/.test(extractFunction('_aeKeySlot', src)), 'hips offsets store hip-height-normalized');

// ---- workspace wiring ----
assert(/id="aeClipSel"|'aeClipSel'/.test(src) && /#aeTree/.test(src) && /#aeTL/.test(src) && /#aeInsp/.test(src), 'the workspace has its clip selector, bone tree, timeline and inspector');
assert(/Animation editor'/.test(src) && /_aeOpen==='function'\) _aeOpen\(\)/.test(src), 'the Player tab (and palette) launch it');
assert(/isTouch\)\{ if\(typeof toast==='function'\) toast\('The Animation editor needs a desktop/.test(src), 'authoring is desktop-gated (clips still play everywhere)');
assert(/_aeRigMode=\(_aeBones\.size>1\)\?'bones':'root';/.test(src), 'a non-humanoid model falls back to its own bones — or the whole model — instead of a dead end (build 1064)');
assert(/if\(_aeAutoKey\)\{ _aeKeySlot\(_aeSel, _aeTime\);/.test(src), 'auto-key writes keys live while dragging a joint');
assert(/_aeClip\.dur=Math\.round\(last\*1000\)\/1000; if\(typeof toast==='function'\) toast\('Duration extended/.test(src),
  'saving with keys past the end extends the duration instead of silently truncating');

// ---- save / assign integrate with the level systems ----
{
  const save = extractFunction('_aeSave', src);
  assert(/pushUndoSnapshot/.test(save) && /_caRev\+\+/.test(save) && /_levelDirty=true/.test(save) && /rebuildAvatars/.test(save),
    'save: level undo snapshot, cache invalidation, dirty flag, live avatar rebuild');
  assert(/customAnims\[at\]=clean; else customAnims\.push\(clean\)/.test(save), 'clips replace by stable id, never duplicate');
}
assert(/_aeCfg\.clips\[state\]=_aeAttachName\(\);/.test(extractFunction('_aeAssign', src)),
  'assignment writes the existing per-state override map (build 1046: of whichever character the session targets) — the runtime state machine needs nothing new');
{
  const del = extractFunction('_aeDelete', src);
  assert(/_aeAssignments\(_aeAttachName\(\)\)/.test(del) && /uiConfirm/.test(del) && /assignments will be cleared/i.test(del),
    'delete shows where the clip is used (themed dialog) and clears assignments');
}

// ---- undo/redo: modal-local, capped, keyboard-driven in capture phase ----
assert(/_aeUndo\.push\(JSON\.stringify\(_aeClip\)\);\s*\n\s*if\(_aeUndo\.length>60\) _aeUndo\.shift\(\);/.test(src), 'undo stack snapshots the clip, capped at 60');
{
  const keys = extractFunction('_aeKeys', src);
  assert(/e\.stopPropagation\(\);/.test(keys), 'modal keys never reach the game editor handlers');
  assert(/KeyZ' && !e\.shiftKey\)\{ e\.preventDefault\(\); _aeUndoOp\(\);/.test(keys) && /_aeRedoOp\(\);/.test(keys), 'Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) undo and redo');
  assert(/e\.code==='Space'\)\{ e\.preventDefault\(\); _aeSetPlaying\(!_aePlaying\);/.test(keys), 'Space toggles playback');
}
assert(/addEventListener\('keydown', _aeKeys, true\);/.test(src), '...registered in the capture phase');

// ---- disposal: nothing leaks when the modal closes ----
{
  const close = extractFunction('_aeClose', src);
  assert(/cancelAnimationFrame\(_aeRAF\)/.test(close), 'the render loop stops');
  assert(/_aeMixer\.stopAllAction\(\); _aeMixer\.uncacheRoot\(_aeRoot\);/.test(close), 'the mixer uncaches');
  assert(/d\.geometry\.dispose\(\)/.test(close) && /_aeR\.dispose\(\)/.test(close), 'dots, helpers and the renderer dispose');
  assert(/_aeUndo\.length=0; _aeRedo\.length=0;/.test(close), 'editor state clears');
}

// ---- presentation ----
assert(/#animEd \{ position:fixed; inset:0; z-index:300;/.test(html), 'the workspace is a full-screen layer');
assert(/#animEd #aeTL \{ display:block; position:relative; inset:auto;/.test(html),
  'the timeline canvas overrides the global canvas{position:fixed} rule (it used to cover the header and eat clicks)');
assert(/ctx\.fillStyle=selK\?'#ffd166':\(isSel\?UI_ACCENT:'#7fb8a6'\);/.test(src), 'timeline keys draw in the THEME accent (build 1048: selected row accent, other rows dimmed)');

done('build 1041: pose, key, scrub, play, save, assign — custom clips authored entirely in the browser');
