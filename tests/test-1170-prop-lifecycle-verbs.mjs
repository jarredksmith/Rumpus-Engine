// build 1170: props gain a runtime lifecycle — show, hide, move, destroy, by tag.
//
// The feature audit's single biggest expressiveness gap: no verb could touch a PROP at runtime, so the ball
// in a sports level could not be reset and a bridge could not drop. Four verbs now ride the existing
// world-action plumbing (host-authoritative, wact-mirrored to clients):
//   hide  — invisible AND intangible (collider out, a dynamic body removed and remembered)
//   show  — reverses every part of hide
//   move  — teleport to a place, preserving height ABOVE GROUND; dynamic bodies re-seat
//   del   — rides shatterProp, so debris, the prop's own 'destroyed' signals, deploy-restore and the
//           existing net reconcile are all inherited; deliberately NOT removeProp, which would edit the level
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- executed: the verb core
{
  const build = () => {
    const colliders = [], calls = [];
    const api = new Function('colliders', 'terrainHeightAt', 'removeDynamicProp', 'setPropDynamic', 'refreshPropCollider', 'shatterProp', 'propModels',
      extractFunction('_pvApplyOne') + '\n' + extractFunction('_lgPropVerb') + '\nreturn { _pvApplyOne, _lgPropVerb };'
    )(colliders, (x, z) => (x >= 50 ? 5 : 0),                       // ground: a 5-high plateau east of x=50
      (o) => { calls.push(['rmDyn', o]); o.userData.phys = null; },
      (o, v) => { calls.push(['setDyn', o, v]); if (v) o.userData.phys = {}; },
      (o) => calls.push(['refresh', o]),
      (o) => { calls.push(['shatter', o]); o.userData._shattered = true; },
      []);
    return { ...api, colliders, calls };
  };
  const prop = (tag, x, y, z, dyn) => ({ visible: true, position: { x, y, z },
    userData: { tag, phys: dyn ? {} : null } });

  { // hide is invisible AND intangible; show reverses all of it
    const t = build();
    const a = prop('door', 0, 1, 0, false), b = prop('door', 2, 1, 0, true);
    t.colliders.push(a, b);
    const props = [a, b, prop('other', 9, 0, 9, false), null];
    const run = new Function('colliders', 'propModels', '_pvApplyOne',
      extractFunction('_lgPropVerb') + '\nreturn _lgPropVerb;')(t.colliders, props, t._pvApplyOne);
    run('hide', 'door', null);
    eq(a.visible, false, 'a hidden prop is invisible');
    eq(t.colliders.indexOf(a), -1, '...and OUT of the collider list — an invisible wall is worse than no verb');
    assert(t.calls.some(c => c[0] === 'rmDyn' && c[1] === b), 'a hidden dynamic prop loses its physics body');
    eq(props[2].visible, true, 'other tags are untouched');
    run('show', 'door', null);
    eq(a.visible, true, 'show restores visibility');
    assert(t.colliders.indexOf(a) >= 0, '...the collider');
    assert(t.calls.some(c => c[0] === 'setDyn' && c[1] === b && c[2] === true), '...and the dynamic body');
    run('hide', 'door', null); run('hide', 'door', null);
    eq(t.colliders.filter(c => c === a).length, 0, 'hide is idempotent — a double hide cannot corrupt the collider list');
  }
  { // move preserves height above ground
    const t = build();
    const ball = prop('ball', 0, 1.2, 0, false);       // 1.2 above ground 0
    t._pvApplyOne(ball, 'move', { x: 60, z: 0 });      // ground there is 5
    eq(ball.position.x, 60, 'the ball moved');
    near(ball.position.y, 6.2, 1e-9, '...landing 1.2 above the NEW ground (5+1.2), not hovering at its old altitude');
    assert(t.calls.some(c => c[0] === 'refresh'), 'a static prop refreshes its collider at the new spot');
  }
  { // move on a dynamic prop re-seats the body around the teleport
    const t = build();
    const crate = prop('crate', 0, 0.5, 0, true);
    t._pvApplyOne(crate, 'move', { x: 60, z: 2 });
    const rm = t.calls.findIndex(c => c[0] === 'rmDyn'), re = t.calls.findIndex(c => c[0] === 'setDyn');
    assert(rm >= 0 && re > rm, 'body removed, THEN re-added after the move — physHome recaptured at the new home');
  }
  { // del rides shatterProp
    const t = build();
    const wall = prop('wall', 0, 1, 0, false);
    t._pvApplyOne(wall, 'del', null);
    assert(t.calls.some(c => c[0] === 'shatter' && c[1] === wall), 'destroy IS a shatter — debris, destroyed-signals, deploy-restore and net sync inherited');
    // and an already-shattered prop is skipped by the tag walk
    const props2 = [wall];
    const run2 = new Function('colliders', 'propModels', '_pvApplyOne',
      extractFunction('_lgPropVerb') + '\nreturn _lgPropVerb;')(t.colliders, props2, t._pvApplyOne);
    const n0 = t.calls.length; run2('del', 'wall', null);
    eq(t.calls.length, n0, 'a shattered prop is not shattered twice');
  }
}

// ---------------------------------------------------------------- the plumbing
{
  const wa = extractFunction('_applyWorldAction');
  assert(/s\.do==='showprop'\|\|s\.do==='hideprop'\|\|s\.do==='delprop'\|\|s\.do==='moveprop'/.test(wa),
    'the world-action dispatch handles all four');
  assert(/const act=s\.do\.slice\(0, -4\);/.test(wa), '...deriving the act from the verb name');
  assert(/if\(s\.do==='moveprop' && !at\) return;/.test(wa), 'a move to a nonexistent place does nothing (the command pattern)');
  assert(/_wactSend\(\{ pv:\[act, tg, at\?\[at\.x, \+at\.y\|\|0, at\.z\]:0\] \}\);/.test(wa),
    'and mirrors to clients through the existing wact channel');
  assert(/if\(msg\.pv && typeof _lgPropVerb==='function'\)/.test(src), 'the client receiver applies the mirror');
  assert(!/removeProp\(/.test(extractFunction('_pvApplyOne')),
    'del never calls removeProp — that splices the prop out of propModels and the next SAVE would lose it');
}
{
  assert(/\['showprop','Show props'\],\['hideprop','Hide props'\],\['moveprop','Move props'\],\['delprop','Destroy props'\]/.test(src),
    'the Do node offers all four');
  assert(/'unlock','showprop','hideprop','moveprop','delprop','resetprop','pushprop'[^\]]*\]\]/.test(src), 'the tag field appears for them');
  assert(/'teleport','command','moveprop','spawnprop','pushprop'/.test(src), 'and the place field for move (and spawnprop since 1216, pushprop since 1258, the area verbs since 1288)');
  assert(/if\(o && o\.userData && o\.userData\._pvHidden && typeof _pvApplyOne==='function'\) _pvApplyOne\(o, 'show', null\);/.test(src),
    'deploy un-hides everything — hide is MATCH state, not a level edit');
}

done('build 1170: props gain show/hide/move/destroy by tag — hide is intangible too, move preserves height-above-ground and re-seats dynamic bodies, destroy rides shatterProp so signals/restore/net-sync are inherited, deploy resets hides, and clients mirror through the existing wact channel. The ball can be reset; the bridge can drop.');
