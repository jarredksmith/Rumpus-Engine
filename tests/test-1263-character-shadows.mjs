import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1263: reported from play the moment 1261 shipped — "the character runs nicely and the shadow
// is super janky" in third person. Builds 807/808 listed cars, animated props, corpses and settling
// physics as shadow movers and never the PLAYER or the ENEMIES; their shadows stayed current only as
// a SIDE EFFECT of _fitSunShadow returning true on almost every moving frame. 1261's deadband removed
// that side effect and with it an unstated dependency, so the character's shadow fell to the refit
// rate while the character moved at 60fps. The movers are now named honestly.

// Execute the real mover predicate: pull the block out of loop() and drive it.
const loopSrc = src.slice(src.indexOf('let _shDirty = !!drivingCar'), src.indexOf('let _shSlow ='));
assert(loopSrc.length > 200 && loopSrc.length < 3000, 'the mover block is where expected');
function movers(o = {}) {
  return new Function('drivingCar','_coastingCars','player','enemies','NET','propModels',
    loopSrc + '; return _shDirty;')(
      o.drivingCar || null, o.coasting || [],
      o.player === null ? undefined : (o.player || { vel:{ x:0, y:0, z:0 } }),
      o.enemies || [], o.net || { mode:'off' }, o.props || []);
}

{ // THE REPORT: a running character must refresh its own shadow
  assert(movers({ player:{ vel:{ x:6, y:0, z:0 } } }) === true, 'a running player is a shadow mover — the reported bug');
  assert(movers({ player:{ vel:{ x:0, y:0, z:-9 } } }) === true, '...in any direction');
  assert(movers({ player:{ vel:{ x:0, y:12, z:0 } } }) === true, '...including a jump, where the shadow separates from the feet');
}
{ // and a still player in an empty scene still costs nothing — the optimization keeps its real case
  eq(movers({ player:{ vel:{ x:0, y:0, z:0 } } }), false, 'standing still in a quiet scene: no refresh');
  eq(movers({ player:{ vel:{ x:0.01, y:0, z:0.02 } } }), false, 'nor does physics jitter below the threshold');
  eq(movers({ player:{ vel:{ x:0.01, y:0.01, z:0.01 } } }), false, 'the threshold sums the axes (0.03 total), so tiny drift on all three is still still');
  assert(movers({ player:{ vel:{ x:0.03, y:0.03, z:0.03 } } }) === true, '...but 0.09 of real drift does refresh — the sum is deliberately sensitive');
}
{ // living enemies animate even when they hold position — a skinned pose changes every frame
  assert(movers({ enemies:[{ hp:5 }] }) === true, 'a living enemy refreshes shadows');
  eq(movers({ enemies:[{ hp:0 }, { hp:0 }] }), false, 'corpses do not (build 808 already gives them the slow tier)');
  assert(movers({ enemies:[{ hp:0 }, { hp:3 }] }) === true, 'one live enemy among the dead is enough');
  eq(movers({ enemies:[] }), false, 'an empty wave costs nothing');
}
{ // multiplayer: other players are casters you do not control
  assert(movers({ net:{ mode:'host', players:{ 2:{} } } }) === true, 'a remote player refreshes shadows');
  eq(movers({ net:{ mode:'host', players:{} } }), false, 'an empty room does not');
  eq(movers({ net:{ mode:'off', players:{ 2:{} } } }), false, 'and solo ignores the stale player map entirely');
}
{ // the pre-existing movers are untouched
  assert(movers({ drivingCar:{} }) === true, 'a driven car still refreshes (build 807)');
  assert(movers({ coasting:[{}] }) === true, 'so does a coasting one (build 808)');
  eq(movers({ player:null }), false, 'and a missing player never throws');
}

// --- the regression this closes -----------------------------------------------------------------------
assert(/A perf change is allowed to remove[\s\S]{0,20}work; it is not allowed to remove work something else was silently relying on\./.test(src),
  'the lesson is recorded beside the fix');
{
  // 1261's deadband stays — it was right about the VOLUME. What was wrong was the claim that nothing
  // depended on the refit firing. Both must remain true together: lazy volume, eager casters.
  assert(/const SHADOW_REFIT_TEXELS = 8;/.test(src), 'the volume deadband is still in place');
  assert(/if\(!_shDirty && typeof player!=='undefined' && player && player\.vel\)/.test(src),
    'and the caster refresh no longer rides on it');
}

done('build 1263: character shadows — the player, living enemies and remote players are named shadow movers (the running-character report), while a still player in a quiet scene still costs nothing');
