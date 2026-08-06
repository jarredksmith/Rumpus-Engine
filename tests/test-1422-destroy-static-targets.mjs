// build 1422: a Destroy mission counts the STATIC targets a creator marked.
//
// `_setupDestroyTargets` walked `dynamicProps`. Build 1390 made a target static and bolted down, the editor
// offers the Objective checkbox on it, and build 1398 taught the loader to restore the flag — so a plate was
// authored, saved, reloaded, and INVISIBLE to the mission that consumes it. A range whose targets are all
// plates reads "NO TARGETS SET" and can never be won.
//
// FIFTH arrival of build 1392's defect: the bullet walk, the turret walk and the melee block were the first
// three, 1395's flash decay the fourth. Every one is the same question — "which props can be hurt" — asked
// of the dynamic list instead of the function that answers it.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- executed over the real selector
{
  // The set-up loop, lifted from source and driven over props of both kinds. `damageableProps` is supplied
  // as the real predicate build 1392 established, so this tests the ROUTING rather than a copy of it.
  const fn = extractFunction('_setupDestroyTargets');
  // Both ends asserted: an indexOf that misses is not an error, it is a wrong answer that quietly tests
  // an empty string (build 1392's recorded hazard), and the trailing brace of the function itself has to go.
  const iA = fn.indexOf('_clearDestroyMarkers();'), iB = fn.lastIndexOf('}');
  assert(iA > 0 && iB > iA, 'the body extracted');
  const body = fn.slice(iA, iB);
  const run = (props) => {
    const markers = [];
    const scope = {
      _clearDestroyMarkers() { markers.length = 0; },
      damageableProps: () => props.filter(o => o.userData.phys || o.userData.shootable),
      scene: { add() {} },
      _destroyMarkers: markers,
      THREE: { Mesh: class { constructor() { this.userData = {}; } }, OctahedronGeometry: class {}, MeshBasicMaterial: class {} },
    };
    new Function('_clearDestroyMarkers', 'damageableProps', 'scene', '_destroyMarkers', 'THREE',
      'let _destroyTotal, _destroyRemain;\n' + body + '\n return [_destroyTotal, _destroyRemain];')(
      scope._clearDestroyMarkers, scope.damageableProps, scope.scene, scope._destroyMarkers, scope.THREE);
    return markers.map(m => m.userData.prop.userData.tag);
  };
  const P = (tag, ud) => ({ userData: Object.assign({ tag }, ud) });

  {
    const r = run([
      P('plate', { shootable: true, objective: true }),
      P('crate', { phys: {}, objective: true }),
    ]);
    assert(r.indexOf('crate') >= 0, 'CONTROL: a dynamic objective crate is counted, as it always was');
    assert(r.indexOf('plate') >= 0,
      'and a STATIC objective target is counted — the flag is authored, saved and restored, so the ' +
      'mission that consumes it has to see the prop');
    eq(r.length, 2, 'both, and nothing else');
  }
  {
    // An objective that cannot be destroyed makes the mission unwinnable, which is a worse failure than
    // not counting it — and build 1421 made an unbreakable prop take hits forever, so this matters now.
    const r = run([
      P('wall',  { shootable: true, objective: true, breakable: false }),
      P('plate', { shootable: true, objective: true }),
    ]);
    eq(r.join(), 'plate', 'an UNBREAKABLE objective is refused — counting it would lock the level');
  }
  {
    const r = run([
      P('plain', { shootable: true }),                       // damageable, not an objective
      P('gone',  { shootable: true, objective: true, _shattered: true }),
      P('wall',  { objective: true }),                       // marked, but not damageable at all
    ]);
    eq(r.length, 0,
      'a prop that is not marked, one already destroyed, and one that is not damageable at all are all skipped');
  }
}

// ---------------------------------------------------------------- the shape of the fix
{
  const fn = extractFunction('_setupDestroyTargets');
  assert(/for\(const o of damageableProps\(\)\)/.test(fn),
    'it asks the ONE function that answers "which props can be hurt" (build 1392)');
  assert(!/dynamicProps/.test(fn),
    '...and the dynamic list appears nowhere in it, which is the whole defect');
  assert(/o\.userData\.objective && o\.userData\.breakable!==false && !o\.userData\._shattered/.test(fn),
    'marked, destructible, and not already gone');
}
{ // the predicate itself is untouched and still the shared one
  assert(/function _isDamageable\(o\)\{ return !!\(o && o\.userData && \(o\.userData\.phys \|\| o\.userData\.shootable\)\); \}/.test(src),
    'the shared damageable predicate is unchanged');
  const dp = extractFunction('damageableProps');
  assert(/o\.userData\.shootable && !o\.userData\.phys/.test(dp),
    '...and the set is still dynamic props PLUS static targets, into the reused array (build 1168)');
}
{ // the flag round-trips for a static target, which is what made the gap invisible (build 1398)
  const pe = extractFunction('propEntry');
  assert(/if\(o\.userData\.objective\) e\.obj=1;/.test(pe), 'the flag saves');
  const ap = extractFunction('applyPropDynState');
  const tier = ap.slice(ap.indexOf('if(!p.dyn && !p.sht) return;'));
  assert(/if\(p\.obj\) obj\.userData\.objective=true;/.test(tier),
    '...and is restored in the DAMAGEABLE tier, so a static target carries it back (build 1398)');
}

done('build 1422: a Destroy mission counts static shootable targets, and refuses ones that cannot be destroyed');
