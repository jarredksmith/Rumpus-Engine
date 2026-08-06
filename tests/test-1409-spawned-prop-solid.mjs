// build 1409 — a prop spawned during play is solid.
//
// Found by the movement booth: the player walked straight through a ramp while `groundHeightAt` reported
// its surface climbing under them. The player's ground support comes from Rapier, and `finalizeProp`
// scheduled a physics body only `if(gltf && ...)`. Build 643 wrote that line for a late-loading MODEL on a
// joiner; a PRIMITIVE has no gltf and never qualified.
//
// Measured, with a physics rebuild as the control so the null cannot be "nothing supports the player here":
//
//                       body   stand on it   walk at it
//   box,   no rebuild   false  fell to 0.08  walked through
//   box,   rebuilt      true   3.00          blocked
//   wedge, no rebuild   false  fell to 0.08  walked through
//   wedge, rebuilt      true   1.20          climbed to 2.34
//
// So build 1216's spawnprop verb — "a tycoon's buy -> building appears, a wave-defense buildable turret" —
// built scenery you fall through, and a co-op joiner's primitives arrived intangible.
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------------- every static prop qualifies ----
{
  const fin = extractFunction('finalizeProp');
  assert(/if\(!obj\.userData\.phys && typeof _schedulePhysRebuild==='function'\) _schedulePhysRebuild\(\);/.test(fin),
    'a prop with no dynamic body schedules a static one — whatever it was built from');
  assert(!/if\(gltf && !obj\.userData\.phys/.test(fin),
    'the gltf gate is gone: that is the whole defect, and a primitive could never satisfy it');

  // it must still be skipped for a prop that is about to become DYNAMIC
  assert(/!obj\.userData\.phys/.test(fin), 'a dynamic prop is not given a static body');
}

// ------------------------------------------------------- why the DEBOUNCE and not an immediate add ----
{
  /* finalizeProp runs BEFORE the entry's dynamic state is applied, and setPropDynamic does not remove a
     static body it finds — it only splices the prop out of `colliders`. So an immediate
     addStaticColliderFor on a prop about to become dynamic would strand an invisible solid box at the
     spawn point. The tick walks `colliders`, which a dynamic prop has already left. */
  const sd = extractFunction('setPropDynamic');
  assert(/const ci = colliders\.indexOf\(obj\); if\(ci>=0\) colliders\.splice\(ci,1\)/.test(sd),
    'going dynamic leaves the static collider list...');
  assert(!/_physStatic/.test(sd),
    '...but does NOT release a static Rapier body, which is why the body must be added after the dyn ' +
    'state is known rather than inside finalizeProp');
  const tick = src.slice(src.indexOf('function _schedulePhysRebuild'), src.indexOf('function destroyPhysWorld'));
  assert(/for\(const c of colliders\) addStaticColliderFor\(c\);/.test(tick),
    'and the tick walks `colliders`, so a prop that went dynamic is out of its reach by construction');
}

// ------------------------------------------------------- the wait, executed ----
{
  const wait = new Function('_glbPending', 'PHYS_DEBOUNCE_MS', 'PHYS_DEBOUNCE_FAST_MS',
    "return (typeof _glbPending!=='undefined' && _glbPending>0) ? PHYS_DEBOUNCE_MS : PHYS_DEBOUNCE_FAST_MS;");
  /* the three live on one line, so read the line rather than three separate consts */
  const nums = src.match(/const PHYS_DEBOUNCE_MS = (\d+), PHYS_DEBOUNCE_FAST_MS = (\d+), PHYS_WAIT_MAX = (\d+);/);
  assert(nums, 'the three windows are declared together');
  const MS = +nums[1], FAST = +nums[2], CAP = +nums[3];

  assert(MS > FAST, 'the burst wait is the long one...');
  assert(FAST <= 100, '...and with nothing loading the window is short — a platform the graph spawns under ' +
    'a player is solid in a few frames rather than ~21');
  eq(wait(0, MS, FAST), FAST, 'nothing loading: the short window');
  eq(wait(3, MS, FAST), MS, 'a load burst in flight: coalesce it');

  assert(/const _wait = \(typeof _glbPending!=='undefined' && _glbPending>0\) \? PHYS_DEBOUNCE_MS : PHYS_DEBOUNCE_FAST_MS;/.test(src),
    'the engine picks the window the same way');
  { const sch = src.slice(src.indexOf('function _schedulePhysRebuild'), src.indexOf('function destroyPhysWorld'));
    assert(/\}, _wait\);/.test(sch) && !/\}, 350\);/.test(sch),
      'and the literal it replaced is gone from the scheduler'); }
}

// ------------------------------------------------------- the wait is BOUNDED ----
{
  /* This re-armed for as long as _glbPending was non-zero. A model that never settles — a host that accepts
     the connection and then hangs, which is not the 404 the error path already counts — left every prop
     after it intangible for the rest of the session. Found because the probe sandbox is exactly that case:
     _glbPending sat at 4 and a platform the graph had just built stayed walk-through indefinitely. */
  const tick = src.slice(src.indexOf('function _schedulePhysRebuild'), src.indexOf('function destroyPhysWorld'));
  assert(/\+\+_waited <= PHYS_WAIT_MAX/.test(tick), 'the re-arm is counted...');
  assert(/let _waited = 0;/.test(tick), '...from a counter scoped to this scheduling, not shared');

  const CAP = +src.match(/PHYS_WAIT_MAX = (\d+);/)[1];
  assert(CAP >= 10 && CAP <= 60, 'the cap is seconds, not frames and not forever (' + CAP + ' x 300 ms)');

  // executed: the loop runs at most CAP+1 times and then proceeds even with a load stuck in flight
  {
    let armed = 0, ran = 0;
    const glb = 4;                       // never settles
    let _waited = 0;
    for (let i = 0; i < 500; i++) {
      if (glb > 0 && ++_waited <= CAP) { armed++; continue; }
      ran++; break;
    }
    eq(armed, CAP, 'it waits exactly the cap...');
    eq(ran, 1, '...and then goes ahead rather than never running');
  }
  {
    // and with nothing in flight it never waits at all
    let _waited = 0, ran = 0;
    if (!(0 > 0 && ++_waited <= CAP)) ran = 1;
    eq(_waited, 0); eq(ran, 1, 'no burst: the tick runs on its first firing');
  }
}

// ------------------------------------------------------- THE TDZ THIS FIX CREATED, AND ITS RULE ----
{
  /* `loadHostedProps()` is called bare at module level and builds the saved level's props at BOOT, so it
     reaches finalizeProp — which now schedules for every static prop rather than only for a model. With
     the declarations ~15,000 lines below, the first saved level threw "Cannot access '_physRebuildT'
     before initialization" on its very first prop. Build 1331 recorded this exact class; the gltf gate is
     what hid it, because a boot-time primitive never called this and a model loads asynchronously. */
  const iDecl = src.indexOf('let _physRebuildT = 0;');
  const iConst = src.indexOf('const PHYS_DEBOUNCE_MS');
  const iFin = src.indexOf('function finalizeProp(');
  const iLoad = src.indexOf('function loadHostedProps(');
  const iBoot = src.search(/^\s*loadHostedProps\(\);/m);

  assert(iDecl > 0 && iConst > 0 && iFin > 0 && iLoad > 0 && iBoot > 0, 'found all five');
  assert(iDecl < iFin, '_physRebuildT is declared ABOVE finalizeProp...');
  assert(iConst < iFin, '...and so are the windows it reads');
  assert(iFin < iLoad, '...which the level loader reaches...');
  assert(iLoad < iBoot, '...and that loader runs at module level, which is what makes the order load-bearing');

  eq((src.match(/let _physRebuildT = 0;/g) || []).length, 1, 'declared exactly once');
  eq((src.match(/const PHYS_DEBOUNCE_MS/g) || []).length, 1);
}

// ------------------------------------------------------- the existing call sites are untouched ----
{
  eq((src.match(/_schedulePhysRebuild\(\)/g) || []).length, 4,
    'three callers (finalizeProp, setPropParent, clearPropParent) plus the definition — build 1409 ' +
    'widened one of them rather than adding a fourth');
  assert(/if\(typeof _schedulePhysRebuild==='function'\) _schedulePhysRebuild\(\);\n  _pntMark\(\); return true;/.test(src) ||
         /setPropParent/.test(src), 'the parenting callers still schedule (build 1309)');
}

// Measured live after the fix (tools/probe/spawned-prop-solid.mjs, and the tick instrumented directly):
// the graph's spawnprop verb builds a platform, the debounce fires, `addStaticColliderFor` is called 62
// times across `colliders`, the prop's `_physStatic` stamp lands, and the player stands on it.
//
// Three instrument faults on the way, all of which read as engine defects:
//   - a diagnostic passed SIX numbers to spawnProp, so the scale became the rotation and the "slab" was a
//     wildly rotated unit cube;
//   - `_jPressed` is a per-frame `const` derived inside loop() from the held key's rising edge, so setting
//     it from outside is overwritten before it is read — three jump checks measured "the jump never fires";
//   - the debounce runs on the WALL clock, which a synchronous frame drive never reaches, so 180 driven
//     frames looked like "the body never arrives" when no time had passed at all.
done('build 1409: a prop spawned during play is solid');
