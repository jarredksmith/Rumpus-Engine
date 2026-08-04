// (build 1359) THE LIBRARY REPORTED SAVES IT NEVER CHECKED, AND SAVE SILENTLY DETACHED ON RELOAD.
//
// From the AAA editor review, and it is the only CRITICAL in that report: two silent data-loss paths in
// build 1262's level library.
//
// 1. `_libPut` fired both stores and discarded both answers; `libSaveAs`/`libCommit` never looked either, so
//    the caller flashed `Saved as "Warehouse"` whether or not a byte landed. The INDEX is a tiny localStorage
//    write that succeeds when the multi-megabyte payload does not — which is exactly what hid it: the library
//    LISTS a level that does not exist, and Open, days later, says "that level could not be read". The
//    author already knew to do this: `saveLevel()` verifies its own write by reading it back and reports
//    "Autosave failed — storage full". The library did not inherit it.
// 2. `_libCurrent` was module-level and never persisted, so a reload — a crash, a restore, the next morning —
//    detached Save from the entry you had been working in, with no signal but a badge vanishing from a row.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- the write is answerable now ----
{
  const f = extractFunction('_libPut', src);
  assert(/return idb\.then\(ok=>!!\(ok \|\| mirror\)\)/.test(f),
    '_libPut answers whether EITHER store took it — the localStorage mirror is a real fallback, not decoration');
  assert(/catch\(e\)\{ return false; \}/.test(f), 'and a throwing mirror counts as a failure, not a success');
  assert(!/^\s*if\(typeof _levelDB==='function'\) _levelDBPutKey/m.test(f),
    'the fire-and-forget call is gone, not merely wrapped');
}

// ---- a failed write takes its own index row with it ----
{
  const f = extractFunction('_libVerify', src);
  assert(/_libIndex\(\)\.filter\(e=>e\.id!==id\); _libWriteIndex\(list\)/.test(f),
    'a row pointing at nothing is WORSE than no row — libOpen loads it over live work and only then ' +
    'reports the read failure. It is rolled back');
  assert(/if\(_libCurrent===id\) _libCurrent=null;/.test(f),
    '...and Save stops tracking an entry that was never written');
  assert(/localStorage\.removeItem\(LVLIB_CUR\)/.test(f), '...in storage too');
  assert(/FAILED \\u2014 storage is full/.test(f), 'and it says so — the whole defect was a false success');
  assert(/renderEditorFields\(\)/.test(f), 'the phantom row leaves the panel now');
}

// ---- executed: the exact failure the review reproduced ----
{
  // the real _libPut, against stores that fail in each of the three interesting combinations
  const mk = (idbOk, lsOk) => new Function('_levelDBPutKey', 'localStorage',
    'return ' + extractFunction('_libPut', src).replace(/^function _libPut/, 'function') + ';')(
      () => Promise.resolve(idbOk),
      { setItem: () => { if (!lsOk) throw new Error('QuotaExceededError'); } });

  const cases = [[true, true, true], [true, false, true], [false, true, true], [false, false, false]];
  await Promise.all(cases.map(([i, l, want]) => mk(i, l)('x', 'body').then(got =>
    eq(got, want, 'idb=' + i + ' mirror=' + l + ' -> ' + want)))).then(() => {
    // and a rejecting IndexedDB still reports the mirror honestly
    const rej = new Function('_levelDBPutKey', 'localStorage',
      'return ' + extractFunction('_libPut', src).replace(/^function _libPut/, 'function') + ';')(
        () => Promise.reject(new Error('gone')), { setItem: () => {} });
    return rej('x', 'body').then(got => eq(got, true, 'a rejected IndexedDB falls back to the mirror'));
  });
}
{
  // ---- the tracked entry survives a reload ----
  {
    assert(/const LVLIB_CUR='breach_lib_cur';/.test(src), 'the tracked entry has a storage key');
    assert(/let _libCurrent=\(\(\)=>\{ try\{ return localStorage\.getItem\(LVLIB_CUR\)\|\|null; \}catch\(e\)\{ return null; \} \}\)\(\);/.test(src),
      '...read at boot, so Save still writes back to the entry you were working in after a crash');
    const t = extractFunction('_libTrack', src);
    assert(/_libCurrent = id \|\| null;/.test(t) && /localStorage\.setItem\(LVLIB_CUR/.test(t) && /removeItem\(LVLIB_CUR\)/.test(t),
      'ONE writer for the memory and the storage, so they cannot disagree');
    // every site that changed it now goes through the one writer
    assert(/_libTrack\(id\); if\(typeof _foreignLevel/.test(src), 'libSaveAs tracks through it');
    assert(/if\(!e\)\{ _libTrack\(null\); return false; \}/.test(src), 'a deleted entry stops tracking through it');
    assert(/function _libStopTracking\(\)\{ if\(typeof _libTrack==='function'\) _libTrack\(null\); \}/.test(src),
      'and build 1262’s New / foreign-load path does too');
    assert(/_libTrack\(id\); if\(typeof _foreignLevel!=='undefined'\) _foreignLevel=false;/.test(src),
      'as does opening one');
  }

  // ---- a restored id that no longer exists must not resurrect anything ----
  {
    const c = extractFunction('libCommit', src);
    assert(/const list=_libIndex\(\); const e=list\.find\(x=>x\.id===_libCurrent\);/.test(c) &&
           /if\(!e\)\{ _libTrack\(null\); return false; \}/.test(c),
      'build 1262’s guard still holds and now clears the PERSISTED id too — a tab that deleted the entry ' +
      'while another had it open must not write it back from storage');
  }

  // ---- everything the library already promised is untouched ----
  {
    const sa = extractFunction('libSaveAs', src);
    assert(/if\(list\.length>=LVLIB_MAX\) return \{ err:/.test(sa), 'the 40-level cap still refuses first');
    assert(/if\(!_libWriteIndex\(list\)\) return \{ err:/.test(sa), '...and a full index still refuses');
    assert(/_libName\(name, list\)/.test(sa), 'and a namesake is still never silently overwritten');
    assert(/const LVLIB_KEY='breach_levels_v1', LVLIB_MAX=40;/.test(src), 'the 40-level cap is unchanged');
  }

  done('build 1359: the library verifies its own writes, and Save survives a reload');
}
