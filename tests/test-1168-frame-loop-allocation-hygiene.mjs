// build 1168: the frame loop stops manufacturing garbage.
//
// The perf critic measured the residue: ~9 vector allocations + a full-subtree Box3 traversal per frame in
// the loop, a fresh array with two closures per entry from allPlayers() every frame, per-OBJECT array+closure
// allocations in _aoHideNoDepth (×2 scenes, every frame AO is on), and a dynamicProps.filter() per
// surface query the whole time a prop was held. None individually fatal; collectively the steady-state
// garbage behind the periodic GC pauses the adaptive ladder exists to forgive. All hoisted to module
// scratch — the codebase's own _lp/_pcV pattern — with behaviour pinned identical.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- movement basis
{
  assert(/const forward = _mvFwd\.set\(-Math\.sin\(player\.yaw\),0,-Math\.cos\(player\.yaw\)\);/.test(src),
    'the movement forward vector is module scratch');
  assert(/const right = _mvRight\.set\(Math\.cos\(player\.yaw\),0,-Math\.sin\(player\.yaw\)\);/.test(src), '...and right');
  assert(/const wish = _mvWish\.set\(0,0,0\);/.test(src), '...and wish');
  assert(/wish\.addScaledVector\(right, mvx\);/.test(src) && /wish\.addScaledVector\(forward, -mvz\);/.test(src),
    'stick input composes via addScaledVector — no clones (it reads, never mutates, its argument)');
  assert(!/wish\.add\(right\.clone\(\)/.test(src), 'the clone-per-frame is gone');
  assert(/const fwd = _flyFwd\.set\(/.test(src) && /const right = _flyRight\.set\(/.test(src),
    'the editor-fly basis is scratch too');
}

// ---------------------------------------------------------------- ledge probe
{
  assert(/if\(_nw-_avHCacheT>1000\)\{ _avHCacheT=_nw; const _bb=_avHBox\.setFromObject\(_ownAvatar\);/.test(src),
    'the avatar-height Box3 traversal runs at most once a second, not every airborne-forward frame');
  assert(/_avHCache=\(_h2>1\.1 && _h2<3\)\?_h2:1\.7;/.test(src), '...cached with the same 1.1..3 sanity band as before');
  assert(!/const _bb=new THREE\.Box3\(\)\.setFromObject\(_ownAvatar\)/.test(src), 'the per-frame Box3 allocation is gone');
}

// ---------------------------------------------------------------- allPlayers per-frame cache
{
  const fn = extractFunction('allPlayers');
  assert(/if\(_apFrame===_frameNo && _apList\) return _apList;/.test(fn), 'allPlayers returns the same-frame cache');
  assert(/_apFrame=_frameNo; _apList=list; return list;/.test(fn), '...and stores it keyed on the frame counter');
  assert(/_frameNo\+\+;/.test(extractFunction('loop')), 'the loop bumps the frame counter, so the cache expires every frame');
  // executable: same frame = same array; next frame = fresh (players may have joined)
  let frame = 7;
  const api = new Function('NET', 'player', 'effEyeY', 'credits', 'SFX', 'updateHUD', 'applyEnemyDamageToSelf', 'duelDead', 'sameTeam',
    'let _apFrame=-1, _apList=null; const _frameNo_get=()=>_fn(); let _fn=arguments[9];\n' +
    extractFunction('allPlayers').replace(/_frameNo/g, '_frameNo_get()') + '\nreturn allPlayers;'
  )({ myId: 0, mode: 'off', players: {}, conns: {} }, { pos: {} }, () => 1.7, 0, { coin(){} }, () => {}, () => {}, false, () => false, () => frame);
  const a = api(), b = api();
  assert(a === b, 'two calls in one frame return the SAME array — zero allocation on the second');
  frame = 8;
  assert(api() !== a, 'a new frame rebuilds it, so joins/leaves are never stale for more than a frame');
}

// ---------------------------------------------------------------- _aoHideNoDepth without allocation
{
  const fn = extractFunction('_aoHideNoDepth');
  assert(!/Array\.isArray\(m\)\?m:\[m\]/.test(fn), 'the array-per-object wrap is gone');
  assert(!/\.some\(/.test(fn), '...and the closure-per-object');
  assert(/for\(let i=0;i<m\.length;i\+\+\)/.test(fn), 'multi-material arrays are walked in place');
  // behaviour identical: the 1152/1158 predicate still holds (their tests also re-run it; this is the diff check)
  // build 1285: the predicate is its own module-scope function now — lifted from source, not restated
  const run = new Function('root', 'out', extractFunction('_aoNoDepthMat') + '\n' + fn + '\nreturn _aoHideNoDepth(root, out);');
  const mk = (name, material, visible) => ({ name, material, visible: visible !== false });
  const kids = [
    mk('flash', { transparent: true, depthWrite: false }),
    mk('multi', [{ transparent: false, depthWrite: true }, { transparent: true, depthWrite: false }]),
    mk('gun', { transparent: false, depthWrite: true }),
    mk('gizmo', { transparent: true, depthWrite: false }, false),
    mk('nomat', null),
  ];
  const hid = run({ visible: true, traverse(f){ f(this); for (const k of kids) f(k); } }, []);
  eq(hid.map(o => o.name).sort().join(','), 'flash,multi', 'same sweep result: sprites and one-bad-slot arrays hidden, opaque and already-hidden untouched');
}

// ---------------------------------------------------------------- surfaceTopUnder without filter()
{
  const fn = extractFunction('surfaceTopUnder');
  assert(!/dynamicProps\.filter\(/.test(fn), 'the filter-per-query is gone');
  assert(/_stuDyn\.length=0; for\(const o of dynamicProps\) if\(o!==heldProp\) _stuDyn\.push\(o\); list=_stuDyn;/.test(fn),
    '...replaced by one reused module array that still excludes the held prop');
}

done('build 1168: the frame loop\'s allocation residue is gone — movement/fly bases and the ledge Box3 are module scratch, allPlayers caches per frame (proven: same array within a frame, fresh next frame), _aoHideNoDepth sweeps with zero per-object allocation to an identical result, and surface queries stop filtering per call');
