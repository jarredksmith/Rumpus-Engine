// build 1206: the vertex-AO bake only re-runs when the BAKE SET changes, and yields to the scaler.
//
// The perf critic's CRITICAL: _bakeTick early-outed on `_bakeDoneN === colliders.length`, so ANY change to
// the collider count re-queued the FULL bake — every hidden wall, every dynamic-crate toggle, every
// shattered physics breakable, every frame of an xa door's animation (all of which _bakeCollect already
// EXCLUDES) restarted a whole-level re-shade at 6 ms/frame. A logic graph blinking an xa door on an
// interval made that perpetual. The gate is now a SIGNATURE — the count of colliders the bake would
// actually gather — so a change that misses the bake set costs one cheap loop and returns; and the job's
// per-frame budget drops to 2 ms once the adaptive resolution scaler has engaged, so a background bake can
// never buy a visible downshift.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- _bakeSig, executed over a mixed collider set
{
  const sig = new Function('colliders', extractFunction('_bakeSig') + '\nreturn _bakeSig();');
  const C = (u) => ({ userData: u });
  const set = [
    C({ src: 'a.glb' }),                    // static bake prop — counts
    C({ src: 'b.glb' }),                    // static bake prop — counts
    C({ src: 'c.glb', phys: {} }),          // dynamic crate — excluded
    C({ src: 'd.glb', vehicle: {} }),       // vehicle — excluded
    C({ src: 'e.glb', xa: { on: true } }),  // animating door — excluded
    C({ src: 'f.glb', xa: { on: false } }), // an xa prop NOT animating — counts
    C({}),                                  // arena wall / kit piece (no src) — excluded
  ];
  eq(sig(set), 3, 'the signature counts exactly the static, non-mover, src-bearing props (2 glb + 1 idle-xa)');
  // the operations that used to force a full re-bake and now must NOT change the signature:
  const hideWall = set.filter(c => c.userData.src || c.userData.phys);            // a no-src wall removed
  eq(sig(hideWall), 3, 'hiding an arena wall does not change the bake set');
  const toggleDynamic = set.filter((c, i) => i !== 2);                            // the phys crate removed
  eq(sig(toggleDynamic), 3, 'toggling/removing a dynamic crate does not change the bake set');
  const doorOpens = set.map(c => c.userData.xa && !c.userData.xa.on ? C({ src: c.userData.src, xa: { on: true } }) : c);
  eq(sig(doorOpens), 2, 'an xa door STARTING to animate leaves the bake set (it was counted idle, now excluded) — one legitimate change, bounded');
  const shatterStatic = set.filter((c, i) => i !== 0);                            // a static bake prop destroyed
  eq(sig(shatterStatic), 2, 'shattering a STATIC bake prop DOES change the set — that occlusion really left, so a re-bake is correct');
}

// ---------------------------------------------------------------- the gate wiring
{
  const tick = extractFunction('_bakeTick');
  assert(/if\(_bakeDoneN === colliders\.length\) return;/.test(tick),
    'the O(1) fast path survives: an unchanged collider count returns immediately, no signature walk');
  assert(/const sig = _bakeSig\(\);\s*\n\s*if\(sig === _bakeDoneSig\)\{ _bakeDoneN = colliders\.length; return; \}/.test(tick),
    'a length change that leaves the SIGNATURE unchanged updates the cached length and returns — no re-bake');
  assert(/_bakeWant = true;\s+\/\* a STATIC bake prop genuinely arrived or left \*\//.test(tick),
    'only a real bake-set change arms the bake');
  assert(/_bakeDoneN = colliders\.length; _bakeDoneSig = _bakeSig\(\); return;/.test(tick),
    'completion records BOTH the length (fast path) and the signature (change detector)');
  assert(/const budget = \(typeof _prStepI !== 'undefined' && _prStepI > 0\) \? 2 : BAKE_MS;/.test(tick),
    'the budget yields to the resolution scaler');
  assert(!/performance\.now\(\) - t0 < BAKE_MS/.test(tick), 'the raw BAKE_MS ceiling is gone from the loops — both use the scaled budget');
  const un = extractFunction('unbakeScene');
  assert(/_bakeDoneSig = -1;/.test(un), 'unbake resets the signature so a re-enable re-bakes from scratch');
}

done('build 1206: the bake gate is a set signature, not a collider count — executed over a mixed set proving wall/dynamic/vehicle/animating-door changes do NOT re-bake while a static bake prop leaving DOES, the O(1) fast path preserved, and the per-frame budget halved-and-more once the resolution scaler engages so the background job never buys a downshift');
