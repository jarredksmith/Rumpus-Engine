import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 651: editor declutter — the single dense always-on instruction paragraph is replaced by a compact,
// mode-aware one-liner (what THIS mode is for + the gestures that matter), and secondary sections start
// collapsed so each mode opens to its primary panel instead of a wall of open accordions.

// --- mode-aware hint ---
assert(/<div class="hint" id="edHint"><\/div>/.test(src), 'the top hint is now an empty, JS-filled element');
assert(!/Click an object to select it\. <b>Shift\+click<\/b> props to multi-select\. In <b>Top view<\/b>/.test(src), 'the old dense always-on paragraph is gone');
const mh = src.match(/const MODE_HINT = \{([\s\S]*?)\};/);
assert(mh, 'MODE_HINT map exists');
for(const m of ['build','scene','enemies','rules','kit','files']) assert(new RegExp('\\b'+m+':').test(mh[1]), 'MODE_HINT covers the '+m+' mode');
assert(/const HINT_SHORTCUTS = /.test(src) && /Shift\+D/.test(src) && /Alt\+drag<\/b> a prop to clone/.test(src), 'universal shortcuts trail every hint');
assert(/hint\.innerHTML = \(MODE_HINT\[editorMode\]\|\|''\) \+ HINT_SHORTCUTS/.test(src), 'applyEditorMode fills the hint for the active mode');

// --- the build hint keeps the useful selection gestures (marquee, shift-click) ---
assert(/marquee-select props/.test(mh[1]), 'the Build hint still documents marquee-select');

// --- collapse defaults: secondary panels start closed ---
const dc = src.match(/const defaultCollapsed = \{([^}]*)\};/);
assert(dc, 'defaultCollapsed map exists');
for(const k of ['generate','invitems','impactfx','tracerfx','crosshair','boltfx','characters','material','loot','campaign'])
  assert(new RegExp('\\b'+k+':true').test(dc[1]), 'secondary section "'+k+'" starts collapsed');

// the primary panels are NOT force-collapsed (they open with the mode)
for(const k of ['object','transform','world','zones','enemies','game','pickups','levelfile'])
  assert(!new RegExp('\\b'+k+':true').test(dc[1]), 'primary section "'+k+'" stays open by default');

done('build 651: mode-aware hint + cleaner collapse defaults');
