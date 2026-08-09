// build 1460 — a per-frame sweep, with the third item MEASURED AND DECLINED.
//
// The performance audit named three per-frame costs. Two are real and are fixed here; the third is
// arithmetic and is left alone, which is recorded so it is not "fixed" later on the audit's word.
//
//   1. `_lodGeoTick` — a full-subtree traverse AND a closure allocation per prop, 128 props a frame,
//      whether or not that prop had a level to swap. `_lodGeoN` gates the whole tick but says nothing
//      about the individual prop, so ONE simplified model made the entire level pay. FIXED.
//   2. the client prop pin — setTranslation + setRotation + setLinvel + setAngvel per dynamic prop per
//      frame on every joiner, for bodies pinned to host poses and never simulated. FIXED, gated on the
//      body being ASLEEP and already where it would be pinned.
//   3. `_vehicleMeshes` — rebuilt by a full `propModels` walk every frame. DECLINED: see the last
//      section. It is a flag test and a push over an array the frame already walks several times, and
//      the alternatives all trade a measured non-cost for a correctness hazard.

import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. the flag and the level are one act
// A prop flagged without a level is a wasted traverse; one levelled without the flag is a level that
// never swaps. Both are silent, so they are set together and asserted together.
{
  const build = src.slice(src.indexOf('_lodGeoReady = true;'), src.indexOf('_lodGeoReady = true;') + 2200);
  assert(/want\.push\(\[m, o\]\)/.test(build), 'the gather carries the ROOT beside the mesh');
  assert(/for\(const \[m, root\] of want\)/.test(build), '...and the build loop destructures it');
  const i = build.indexOf('m.userData._lodHi = m.geometry');
  const j = build.indexOf('root.userData._hasGeoLod = true');
  assert(i >= 0 && j > i && (j - i) < 500,
    'the root flag is raised in the same act as the mesh level, so the two cannot disagree');
  // ...and only when a level actually landed
  const k = build.indexOf('if(!lo) continue;');
  assert(k >= 0 && k < i, 'a mesh the simplifier declined sets neither');
}

// ---------------------------------------------------------------- 2. the tick skips a prop with no level
{
  const tick = extractFunction('_lodGeoTick');
  assert(/if\(!u0\._hasGeoLod\) continue;/.test(tick), 'a prop with no level is skipped outright');
  const skip = tick.indexOf('if(!u0._hasGeoLod) continue;');
  const trav = tick.indexOf('o.traverse(');
  assert(skip >= 0 && trav > skip,
    '...BEFORE the traverse and the closure, which is the entire cost being removed');

  // executed: count the traverses and closures a mixed level pays
  const run = new Function('N', 'WITH_LOD', `
    let traversals = 0, closures = 0;
    const propModels = [];
    for(let i = 0; i < N; i++){
      const has = i < WITH_LOD;
      propModels.push({ position:{x:i*10,y:0,z:0}, userData:{ _hasGeoLod: has || undefined, _lodR:1 },
        traverse(fn){ traversals++; closures++; } });
    }
    const camera = { position:{x:0,y:0,z:0} };
    const LOD_BUDGET = 128, LOD_NEAR_KEEP = 40, LOD_GEO_PX = 12, LOD_HYST = 1.4;
    let _lodGeoCursor = 0, _lodGeoN = WITH_LOD;
    const renderer = { domElement:{ clientHeight: 720 } };
    ${extractFunction('_lodGeoTick')}
    _lodGeoTick();
    return { traversals, closures, examined: Math.min(N, LOD_BUDGET) };`);

  const none = run(600, 0);
  eq(none.traversals, 0, '600 props and no levels: zero traverses (the tick would not even run, but it is free if it does)');
  eq(none.closures, 0, '...and zero closures');

  const one = run(600, 1);
  eq(one.examined, 128, 'the budget still examines 128 props a frame');
  eq(one.traversals, 1, '...and ONE simplified model costs exactly one traverse, not 128');

  const many = run(600, 200);
  assert(many.traversals <= 128, 'a level full of levels still pays only its budget');
  assert(many.traversals > 100, '...and genuinely does the work for the props that have one');
}

// ---------------------------------------------------------------- 3. the restore skips it too
{
  const rest = extractFunction('_lodGeoRestoreAll');
  assert(/_hasGeoLod/.test(rest), 'the teardown skips props with no level as well');
  assert(/m\.userData\._lodHi && m\.geometry !== m\.userData\._lodHi/.test(rest),
    '...while still restoring every mesh that has one — build 1431\'s rule, that a teardown must not leave a decimated silhouette');
}

// ---------------------------------------------------------------- 4. the client pin, executed
// The SLEEP test is what makes this safe rather than merely cheaper: a sleeping body does not integrate,
// so re-stating where it already is buys nothing. An awake one is pinned exactly as before.
{
  const run = new Function('PROPS', `
    let calls = 0;
    const dynamicProps = PROPS.map(p => ({
      position: p.pos, quaternion: p.q,
      userData: { phys: { body: {
        _sleep: p.sleeping,
        isSleeping(){ return this._sleep; },
        setTranslation(){ calls++; }, setRotation(){ calls++; },
        setLinvel(){ calls++; }, setAngvel(){ calls++; },
      } } },
    }));
    const physWorld = { step(){} };
    let physAccum = 0; const PHYS_DT = 1/60, PHYS_MAX_SUBSTEPS = 1;
    ${extractFunction('stepClientPlayerPhys')}
    const first = (() => { const c0 = calls; stepClientPlayerPhys(1/60); return calls - c0; })();
    const second = (() => { const c0 = calls; stepClientPlayerPhys(1/60); return calls - c0; })();
    /* the host moves one of them */
    if(dynamicProps[0]) dynamicProps[0].position.x += 1;
    const third = (() => { const c0 = calls; stepClientPlayerPhys(1/60); return calls - c0; })();
    return { first, second, third };`);

  const P = (n, sleeping) => Array.from({ length: n }, (_, i) => ({
    pos: { x: i, y: 0, z: 0 }, q: { x:0, y:0, z:0, w:1 }, sleeping }));

  const asleep = run(P(200, true));
  eq(asleep.first, 800, 'the FIRST frame pins all 200 bodies — 4 crossings each, exactly as before');
  eq(asleep.second, 0, '...and the second frame pins NONE of them: asleep, and already where they belong');
  eq(asleep.third, 4, '...while a body the host moved is pinned again, and only that one');

  const awake = run(P(200, false));
  eq(awake.first, 800, 'an AWAKE body is pinned every frame...');
  eq(awake.second, 800, '...every frame, because that is the case the pin exists for');

  // a Rapier build without isSleeping must degrade to the old behaviour, never to an unpinned body
  const noSleepApi = new Function(`
    let calls = 0;
    const dynamicProps = [{ position:{x:0,y:0,z:0}, quaternion:{x:0,y:0,z:0,w:1},
      userData:{ phys:{ body:{ setTranslation(){calls++;}, setRotation(){calls++;}, setLinvel(){calls++;}, setAngvel(){calls++;} } } } }];
    const physWorld = { step(){} }; let physAccum = 0; const PHYS_DT = 1/60, PHYS_MAX_SUBSTEPS = 1;
    ${extractFunction('stepClientPlayerPhys')}
    stepClientPlayerPhys(1/60); const a = calls;
    stepClientPlayerPhys(1/60); return { a, b: calls - a };`)();
  eq(noSleepApi.b, 4, 'a body with no isSleeping is pinned every frame — the skip fails CLOSED');
}

// ---------------------------------------------------------------- 5. `_vehicleMeshes` — measured, declined
// The audit listed this beside the two above. It is a `userData.vehicle` test and a push over an array
// the frame already walks several times for other reasons (build 1451's proximity pass among them) —
// roughly 57,000 branch tests a second on a 959-prop level, which is arithmetic, not a hotspot.
//
// Every way of removing it trades that non-cost for a correctness hazard. Maintaining the list at
// spawn/despawn needs every site that WRITES `userData.vehicle` to remember — the editor checkbox,
// `setPropDynamic`, `_applyPropEntry` — which is the hand-kept-list defect this file records more than
// any other. Rebuilding only when `propModels.length` changes misses a flag toggled in place.
//
// So it stays, and this asserts it stays, so a later reader does not "finish the sweep" on the audit's
// word without re-deriving the trade.
{
  assert(/_vehicleMeshes\.length=0; if\(typeof propModels!=='undefined'\) for\(const _p of propModels\)/.test(src),
    'the vehicle list is still rebuilt per frame — measured as arithmetic, and every alternative is a hand-kept list');
  // it is genuinely cheap: no allocation, no traverse, one property test
  const line = (src.match(/_vehicleMeshes\.length=0;[^\n]*/) || [''])[0];
  assert(!/traverse|new |\.filter\(|\.map\(/.test(line),
    '...and the walk itself allocates nothing and traverses nothing');
}

// ---------------------------------------------------------------- 6. build 1168 still holds here
{
  const tick = extractFunction('_lodGeoTick');
  const before = tick.slice(0, tick.indexOf('if(!u0._hasGeoLod) continue;'));
  assert(!/=>/.test(before) && !/\bnew\b/.test(before),
    'nothing is allocated before the skip, so a prop with no level costs a property read and a branch');
}

done('build 1460 (performance audit sweep): TWO of the three named per-frame costs were real and are fixed; the third is arithmetic and is deliberately left, which this file asserts so it is not "finished" later on the audit\'s word. `_lodGeoTick` ran a full-subtree traverse AND allocated a closure for every prop it examined — 128 a frame — whether or not that prop had a level to swap, because `_lodGeoN` gates the whole tick and says nothing about the individual prop; ONE simplified model therefore made an entire level pay. A `_hasGeoLod` flag on the root, raised in the same act as the mesh\'s own `_lodHi` so the two cannot disagree, skips it: executed, 600 props with one level go from 128 traverses to exactly 1, and the teardown skips the same way while still restoring every mesh that has a level (build 1431\'s rule). The client prop pin wrote four JS-to-WASM crossings per dynamic prop per frame on every joiner — 800 a frame at 200 props — for bodies pinned to host poses and never simulated; it is now skipped when the body is ASLEEP and already at the pose it would be pinned to, which is what makes it safe rather than merely cheaper, since a sleeping body does not integrate. Executed: 800 crossings on the first frame, ZERO on the second, 4 when the host moves one prop, 800 every frame for an awake body, and 4 every frame on a Rapier build with no isSleeping — the skip fails closed. `_vehicleMeshes` is DECLINED with its reason: a property test and a push over an array the frame already walks, against alternatives that all require every site writing `userData.vehicle` to remember a list');
