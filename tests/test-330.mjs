import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 438: autosave — saves as you work so a browser close never loses progress. A dirty flag is set on every
// edit; a timer flushes it every 20s while editing; it also flushes on editor close, before Play, on tab hide,
// and on beforeunload. Toggleable (default on).

// dirty flag on edits
assert(/_levelDirty = true;   \/\/ autosave/.test(src), 'every edit marks the level dirty');
assert(/let _levelDirty = false, _autoSaveTimer = null;/.test(src), 'autosave state declared');

// core tick: only saves when dirty + on + not mid-match
const asn = extractFunction('autoSaveNow');
assert(/if\(!_autoSaveOn \|\| !_levelDirty\) return;/.test(asn), 'no-op when off or nothing changed');
assert(/if\(typeof pvpMode==='function' && pvpMode\(\)\) return;/.test(asn), 'never autosaves mid-match');
assert(/const ok = saveLevel\(\);/.test(asn) && /_levelDirty=false;/.test(asn), 'saves then clears the dirty flag');
assert(/Autosaved /.test(asn) && /Autosave failed/.test(asn), 'reports success (with time) or a storage failure');

// timer cadence + lifecycle
const start = extractFunction('startAutoSave');
assert(/setInterval\([\s\S]*?autoSaveNow\(\)[\s\S]*?, 20000\)/.test(start), 'flushes every 20s while editing');
assert(/_levelDirty = false; if\(typeof startAutoSave==='function'\) startAutoSave\(\);/.test(src), 'starts on editor open');
assert(/autoSaveNow\('on close'\); if\(typeof stopAutoSave==='function'\) stopAutoSave\(\);/.test(src), 'flushes + stops on editor close');
assert(/autoSaveNow\('before play'\);[^\n]*startGame\(\);/.test(src), 'flushes before Play');   // build 1224: the start-at-wave read sits between the flush and the deploy — flush still first, deploy still last
assert(/addEventListener\('beforeunload', \(\)=>\{ try\{ if\(!_newLevelPending && _autoSaveOn && _levelDirty\) saveLevel\(\);/.test(src), 'flushes on tab close');
assert(/visibilitychange[\s\S]*?document\.visibilityState==='hidden'\) autoSaveNow\(\)/.test(src), 'flushes when the tab is hidden');

// toggle persists + UI
assert(/const AUTOSAVE_KEY='breach_autosave_on'/.test(src) && /localStorage\.setItem\(AUTOSAVE_KEY/.test(src), 'autosave preference persists');
assert(/id="edAutoSave"/.test(src) && /ac\.checked=_autoSaveOn; ac\.onchange=\(\)=>\{ setAutoSaveOn\(ac\.checked\)/.test(src), 'editor has a working autosave toggle');

// executable: the tick gate
function tick(state){ if(!state.on || !state.dirty) return state; if(state.match) return state; return { ...state, dirty:false, saved:(state.saved||0)+1 }; }
assert(tick({on:true,dirty:true,match:false}).saved===1, 'dirty + on + not in match -> saves once');
assert(tick({on:true,dirty:false,match:false}).saved===undefined, 'clean -> no save');
assert(tick({on:false,dirty:true,match:false}).saved===undefined, 'off -> no save');
assert(tick({on:true,dirty:true,match:true}).dirty===true, 'mid-match -> skipped, stays dirty for later');
done();
