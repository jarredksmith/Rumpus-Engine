import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1254: THE REMIX TRAP closed (the audit's #1 editor data-loss finding). A level that arrives
// from outside — share link, ?game= URL, gallery, import, example — is FOREIGN: every automatic save
// path stands down until an explicit Save adopts it, and a foreign load over UNSAVED work stashes
// that work to a rescue slot first. Executed here: the real markForeignLevel + autoSaveNow in a
// stubbed scope through every state; pinned: all five entry points, the adopt, the tab-close gate.

function rig(opts = {}) {
  const store = {};
  const world = { toasts: [], saves: 0, status: [] , store };
  const mk = new Function('localStorage', 'serializeLevel', 'flashToast', '_autoSaveStatus', 'saveLevel',
    'pvpMode', '_edRescueRefresh', 'Date', 'world', `
    let _levelDirty = ${opts.dirty ? 'true' : 'false'}, _newLevelPending = false;
    let _autoSaveOn = ${opts.autosave === false ? 'false' : 'true'};
    let _foreignLevel = false;
    const RESCUE_KEY = 'breach_level_rescue_v1';
    ${extractFunction('markForeignLevel')}
    ${extractFunction('autoSaveNow')}
    return { mark: markForeignLevel, tick: (r)=>autoSaveNow(r),
      get foreign(){ return _foreignLevel; }, set foreign(v){ _foreignLevel = v; },
      get dirty(){ return _levelDirty; }, set dirty(v){ _levelDirty = v; } };
  `);
  const r = mk(
    { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    () => ({ props: ['MY-WORK'] }),
    (t) => world.toasts.push(t),
    (t) => world.status.push(t),
    () => { world.saves++; return true; },
    () => false,
    null,
    // Date is used two ways in the extracted code: markForeignLevel calls Date.now(), autoSaveNow news it
    Object.assign(function(){ return { getHours: () => 12, getMinutes: () => 34 }; }, { now: () => 1234567 }),
    world);
  r.world = world; r.store = store;   // NOT a spread — {...r} would snapshot the getters and drop the setters
  return r;
}

{ // the trap itself, replayed: dirty level + gallery open + autosave tick — the save slot survives
  const r = rig({ dirty: true });
  r.mark('"someone else\'s level"');
  assert(r.foreign, 'the level is marked foreign');
  const stash = JSON.parse(r.store['breach_level_rescue_v1']);
  eq(stash.level.props[0], 'MY-WORK', 'the UNSAVED work was stashed before being replaced');
  eq(stash.t, 1234567, 'stamped');
  assert(r.world.toasts.some(t => /backed up/.test(t)), 'and the creator is told where it went');
  r.tick(); r.tick(); r.tick();
  eq(r.world.saves, 0, 'the 20s autosave NEVER fires on a foreign level — the trap that overwrote real work');
}
{ // a clean working level stashes nothing — the save slot already holds it
  const r = rig({ dirty: false });
  r.mark('a shared level');
  assert(!('breach_level_rescue_v1' in r.store), 'no rescue needed: nothing unsaved existed');
  assert(r.foreign, 'still foreign — autosave still must not adopt it');
}
{ // adoption: clearing the flag (what the Save button does on success) resumes autosave exactly
  const r = rig({ dirty: true });
  r.mark('x');
  r.foreign = false;   // the explicit-Save adoption
  r.tick();
  eq(r.world.saves, 1, 'after adopting, autosave works again');
}
{ // a native level is untouched by any of this
  const r = rig({ dirty: true });
  r.tick();
  eq(r.world.saves, 1, 'normal autosave behaviour is byte-identical when nothing foreign happened');
}
{ // the status line names the state
  const r = rig({ dirty: false });
  r.mark('"Cool Arena"');
  assert(r.world.status.some(t => /Cool Arena/.test(t) && /autosave paused/.test(t)), 'the autosave status says what is happening and why');
}

// --- wiring pins -------------------------------------------------------------------------------------
assert(/if\(_foreignLevel\) return;   \/\/ build 1254: never silently overwrite YOUR save/.test(src),
  'the autosave gate ships in autoSaveNow (covers the 20s timer, visibilitychange, before-play and on-close flushes)');
assert(/if\(!_newLevelPending && !_foreignLevel && _autoSaveOn && _levelDirty\) saveLevel\(\);/.test(src),
  'the beforeunload flush honours it too — closing the tab must not commit a foreign level');
assert(/const _ok = saveLevel\(\); if\(_ok\) _foreignLevel = false;/.test(src),
  'an explicit Save adopts the level as yours (Ctrl+S clicks the same button)');
// the five entry points
assert(/markForeignLevel\('a shared level'\); restoreLevel\(lvl\);/.test(src), 'entry 1: a #lvl= share link');
assert(/markForeignLevel\('"'\+slug\+'"'\); restoreLevel\(lvl\); loaded=true;/.test(src), 'entry 2: a ?game= URL');
assert(/markForeignLevel\('"'\+\(entry\.name\|\|file\)\+'"'\);   \/\/ build 1254: a gallery level never autosaves over yours/.test(src), 'entry 3: the community gallery (Play AND Open in editor)');
assert(/markForeignLevel\('an imported level'\);/.test(src), 'entry 4: file import (one explicit Save adopts your own backup)');
assert(/markForeignLevel\('an example project'\);/.test(src), 'entry 5: help-modal example projects');
// the rescue row
assert(/id="edRescueRow"/.test(src) && /id="edRescue"/.test(src), 'the Save tab carries a Restore backup row');
assert(/_foreignLevel=false; _levelDirty=true;   \/\/ it is YOURS and unsaved again — Save commits it/.test(src),
  'restoring the backup makes it yours-and-unsaved, so one Save commits it');
assert(/localStorage\.removeItem\(RESCUE_KEY\)/.test(src), 'a restored backup clears the slot');

done('build 1254: the remix trap closed — foreign gate executed through the trap replay, clean load, adoption and native behaviour; all five entry points, the tab-close gate, and the rescue slot pinned');
