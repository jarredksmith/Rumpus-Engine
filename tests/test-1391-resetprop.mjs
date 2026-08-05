// build 1391: `resetprop` — a range target that comes back.
//
// Build 1390 made a static prop shootable; a booth full of plates you can destroy exactly once is not a
// shooting range. Before this, the ONLY restore was `restoreDestroyedProps()`, called from exactly two
// places — the deploy path and entering the editor — so a shot target was gone for the rest of the session.
//
// THE WIRE IS WHAT THIS TESTS. Build 1277 found six prop verbs that had shipped and never worked because
// the dropdown offered them and `_applyWorldAction` implemented them and the routing list in between named
// none of them. Every source pin passed. So the checks below follow the verb through EVERY link of that
// chain, and the live probe drove it from a real `event` node rather than by calling the handler.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------- the whole chain, link by link ----
{
  const node = src.match(/do:\s*\{ t:'Do action'[\s\S]*?\n/);
  assert(node, 'the Do node is readable');
  assert(/\['resetprop','Reset props'\]/.test(node[0]), '1. the dropdown offers it');
  assert(/ifv:\['verb',\['toggle','open','close','anim','unlock','showprop','hideprop','moveprop','delprop','resetprop','pushprop'\]\]/.test(node[0]),
    '2. ...and the TAG field is shown for it, or the creator has no way to say which props');

  const sig = extractFunction('_applySignalAction');
  assert(/s\.do==='resetprop'/.test(sig),
    '3. the signal router lets it through — THIS is the link build 1277 found missing on six verbs at once');

  const wa = extractFunction('_applyWorldAction');
  assert(/if\(s\.do==='showprop'\|\|s\.do==='hideprop'\|\|s\.do==='delprop'\|\|s\.do==='moveprop'\|\|s\.do==='resetprop'\)\{/.test(wa),
    '4. the world handler dispatches it beside its siblings');
  assert(/const act=s\.do\.slice\(0, -4\);/.test(wa),
    "5. ...and the verb name yields the action by slicing 'prop' off, so 'resetprop' -> 'reset' with no new mapping");

  const one = extractFunction('_pvApplyOne');
  assert(/if\(act==='reset'\)\{/.test(one), '6. and the per-prop applier implements it');

  // 7. the failure report, so a typo'd tag says so instead of silently doing nothing (build 1214)
  assert(/const _LG_TAG_VERBS = new Set\(\[[^\]]*'resetprop'/.test(src),
    '7. it is a tag verb, so a tag nothing carries is REPORTED rather than silently ignored');
}

// -------------------------------- the filter that would have made it a no-op ----
// Every other verb skips a shattered prop. `reset` is the one that must SEE them: they are exactly what it
// exists to bring back. Getting this backwards makes the verb do nothing on the only props anyone would
// ever aim it at — and it would look like a working feature in every source pin.
{
  const fn = extractFunction('_lgPropVerb');
  assert(/if\(o\.userData\._shattered && act!=='reset'\) continue;/.test(fn),
    'a shattered prop is skipped for every verb EXCEPT reset');
  // executed: the selection, both ways
  const pick = (props, act) => props.filter(o => o.userData.tag === 't' &&
    !(o.userData._shattered && act !== 'reset'));
  const props = [{ userData: { tag: 't' } }, { userData: { tag: 't', _shattered: true } }, { userData: { tag: 'x' } }];
  eq(pick(props, 'hide').length, 1, 'hide sees only the standing prop');
  eq(pick(props, 'reset').length, 2, 'reset sees the shattered one too');
  eq(pick(props, 'reset').filter(o => o.userData.tag !== 't').length, 0, '...and never another tag');
}

// ------------------------------------------- ONE restore body, not two ----
// Two implementations of one behaviour with only one maintained is the defect this file records under
// builds 1162, 1252, 1266 and 1280. The deploy path and the verb share it.
{
  const one = extractFunction('_restoreDestroyedProp');
  assert(/if\(!o \|\| !o\.userData\._destroyed\) return false;/.test(one),
    'the restore refuses a prop that was never destroyed, and SAYS so by returning false — which is how ' +
    'the verb knows to fall through to topping up a merely damaged one');
  assert(/o\.userData\._destroyed=false; o\.userData\._shattered=false;/.test(one), 'it clears both flags');
  assert(/if\(home\)\{ o\.position\.copy\(home\.p\); o\.quaternion\.copy\(home\.q\); \}/.test(one), '...returns it home');
  assert(/if\(o\.userData\.maxHp\) o\.userData\.hp = o\.userData\.maxHp;/.test(one), '...at full health');
  assert(/adoptModelLights\(o\)/.test(one), '...re-adopting its lights (build 1157)');
  assert(/_navDirtyProp\(o\)/.test(one), '...and marking the nav grid, because it blocks a route again (build 1200)');

  // build 1390 released the static Rapier body on shatter, so the restore has to give one back
  assert(/addStaticColliderFor\(o\)/.test(one),
    'a restored STATIC prop gets its physics body back — build 1390 released it on shatter, so without ' +
    'this a reset target comes home visible and intangible and shots pass straight through it');

  const all = extractFunction('restoreDestroyedProps');
  assert(/for\(const o of propModels\) _restoreDestroyedProp\(o\);/.test(all),
    'and the deploy path is now just a loop over the same body');
  eq((src.match(/o\.userData\._destroyed=false; o\.userData\._shattered=false;/g) || []).length, 1,
    'the restore is written in exactly ONE place');
}

// ------------------------------------------- both cases, deliberately ----
{
  const one = extractFunction('_pvApplyOne');
  const blk = one.slice(one.indexOf("if(act==='reset')"), one.indexOf("if(act==='hide')"));
  assert(/_restoreDestroyedProp\(o\)\) return;/.test(blk), 'a destroyed prop is restored...');
  assert(/if\(u\.maxHp\) u\.hp = u\.maxHp;/.test(blk), '...and a merely DAMAGED one is topped up');
  assert(/if\(u\._pvHidden\) _pvApplyOne\(o, 'show', null\);/.test(blk),
    "...and a hidden one comes back, because 'reset the booth' means the booth's starting state");
  // one verb rather than two is a judgement, and it is stated: a creator should not have to know whether
  // each plate happened to be destroyed or merely dented.
  assert(/exactly the distinction they should not have to make/.test(src), 'and the reason is recorded at the site');
}

// ------------------------------------------------------- co-op ----
{
  const wa = extractFunction('_applyWorldAction');
  assert(/_wactSend\(\{ pv:\[act, tg, at\?\[at\.x, \+at\.y\|\|0, at\.z\]:0\] \}\);/.test(wa),
    'it rides the SAME wact message as the other prop verbs, so a client mirrors it with no new type...');
  assert(/if\(msg\.pv && typeof _lgPropVerb==='function'\)/.test(src),
    '...through the handler that already routes every prop verb (build 1170)');
}

// probed live, driven from a real `event` node through the real dispatch:
//   destroyed -> shattered, invisible, out of colliders, Rapier body released
//   reset     -> restored at home, visible, collider back, BODY BACK, hp 30/30, in the scene
//   re-shot   -> takes damage again (30 -> 20)
//   dented    -> 40 -> 25 -> reset -> 40
done('build 1391: a range target comes back, through every link of the chain');
