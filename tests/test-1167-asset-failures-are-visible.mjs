// build 1167: a failed model load is a VISIBLE fact, not a console line.
//
// The commonest failure a creator ever hits — a model url that 404s or CORS-fails — was
// `console.warn('Prop load failed...')` plus a silent null hole in propModels. Unless the creator had
// devtools open, the conclusion was "the engine ate my prop". Failures now feed the Level Check panel,
// deduped by url with a repeat count, healed by a later successful load, and cleared whenever the prop set
// is rebuilt from scratch.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the recorder, executed
{
  const failures = new Map();
  const note = new Function('assetLoadFailures', 'renderLevelIssues', 'editorOpen',
    extractFunction('_noteAssetFailure') + '\nreturn _noteAssetFailure;')(failures, () => {}, false);
  note('https://x.example/crate.glb', new Error('Failed to fetch'));
  eq(failures.size, 1, 'a failure is recorded');
  eq(failures.get('https://x.example/crate.glb').msg, 'Failed to fetch', '...with its reason');
  note('https://x.example/crate.glb', new Error('Failed to fetch'));
  eq(failures.size, 1, 'the same url dedupes');
  eq(failures.get('https://x.example/crate.glb').n, 2, '...into a repeat count');
  note('https://x.example/door.glb', 'CORS');
  eq(failures.size, 2, 'distinct urls are distinct entries');
  for (let i = 0; i < 60; i++) note('https://x.example/m' + i + '.glb', 'x');
  assert(failures.size <= 42, 'the map is capped — a level of 500 broken urls cannot grow it unbounded (' + failures.size + ')');
}

// ---------------------------------------------------------------- wired into the panel and the lifecycle
{
  const li = extractFunction('levelIssues');
  assert(/for\(const \[src, e\] of assetLoadFailures\)/.test(li), 'the Level Check panel reports the failures');
  assert(/'…'\+src\.slice\(-45\)/.test(li), "...showing the url's TAIL, because Poly Pizza urls only differ there");
  assert(/\(e\.n>1\?' ×'\+e\.n:''\)/.test(li), '...with the repeat count');
  const idx = li.indexOf('assetLoadFailures'), lockIdx = li.indexOf('locks');
  assert(idx > 0 && idx < lockIdx, 'and they LEAD the list — the most actionable entry comes first');
}
{
  const sp = extractFunction('spawnProp');
  assert(/_noteAssetFailure\(src, err\)/.test(sp), 'the spawn error branch records the failure');
  assert(/assetLoadFailures\.delete\(String\(src\|\|''\)\.slice\(0, 300\)\)/.test(sp),
    'and a later SUCCESS for the same url heals the report — a flaky network self-clears');
  assert(/console\.warn\('Prop load failed for', src/.test(sp), 'the console line stays for developers');
}
{
  assert(/assetLoadFailures\.clear\(\);   \/\/ build 1167: stale failures about a previous level/.test(src),
    'restoreLevel clears the report — entries about a previous level are their own kind of lie');
  assert(/assetLoadFailures\.clear\(\);   \/\/ build 1167: a fresh scene starts with a clean report/.test(src),
    '...and so does the scene wipe');
  assert(/editorOpen\) renderLevelIssues\(\)/.test(extractFunction('_noteAssetFailure')),
    'a failure that lands while the editor is open refreshes the panel live');
}

done('build 1167: failed model loads feed the Level Check panel — deduped by url with repeat counts and reasons, leading the list, healed by later success, cleared on scene rebuild — so "the engine ate my prop" finally has an answer the creator can see');
