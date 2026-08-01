import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1276: a trigger zone can watch for a PROP. Build 1170 gave props a runtime lifecycle
// (show/hide/move/delete) and 1258 let the graph shove them, but nothing could DETECT one — "the ball is
// in the goal", "the crate is on the pressure plate", "the key landed in the slot" were all unaskable,
// which is most of what a sports or physics-puzzle level is made of.

const WHO = new Function('return ' + extractConst('TRIG_WHO') + ';')();
eq(WHO.join(','), 'player,enemy,any,prop', 'the fourth audience exists');

// --- the audience predicates, executed ---------------------------------------------------------------
// THE TRAP: both existing branches tested `who` with `!==`, which is right for a three-value enum and
// silently wrong the moment a fourth arrives — a 'prop' zone would have fired for players AND enemies too.
{
  const utz = extractFunction('updateTriggerZones');
  assert(/const _wPlayer = \(z\.who==='player' \|\| z\.who==='any'\);/.test(utz), 'the player audience is stated positively');
  assert(/const _wEnemy  = \(z\.who==='enemy'  \|\| z\.who==='any'\);/.test(utz), '...and so is the enemy one');
  assert(/const _wProp   = \(z\.who==='prop'\);/.test(utz), '...and the new one');
  assert(!/z\.who!=='enemy'/.test(utz) && !/z\.who!=='player'/.test(utz),
    'and NO branch tests the enum by exclusion any more — that is what would have leaked');

  const aud = (who) => new Function('z', [
    "const _wPlayer = (z.who==='player' || z.who==='any');",
    "const _wEnemy  = (z.who==='enemy'  || z.who==='any');",
    "const _wProp   = (z.who==='prop');",
    'return [_wPlayer, _wEnemy, _wProp];',
  ].join('\n'))({ who });
  eq(aud('player').join(), 'true,false,false', 'a player zone watches only players');
  eq(aud('enemy').join(), 'false,true,false', 'an enemy zone only enemies');
  eq(aud('any').join(), 'true,true,false', '"Anything" is still bodies — it does NOT silently gain props');
  eq(aud('prop').join(), 'false,false,true', 'and a prop zone watches ONLY props — the leak that would have shipped');
}

// --- the prop sweep, executed ------------------------------------------------------------------------
// pull the prop branch out of the real function by brace-matching, so the slice cannot drift
function propBranch() {
  const utz = extractFunction('updateTriggerZones');
  const start = utz.indexOf('if(_wProp && typeof propModels!==');
  assert(start > 0, 'the prop branch is where expected');
  let i = utz.indexOf('{', start), depth = 0, end = -1;
  for (; i < utz.length; i++) {
    if (utz[i] === '{') depth++;
    else if (utz[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  assert(end > start, 'and it brace-matches');
  return utz.slice(start, end);
}
function sweep() {
  return new Function('z', 'propModels', '_trigContains', '_trigStep', 'logicEvent', 'st', 'now', [
    "const _wProp = (z.who==='prop');",
    propBranch(),
    'return null;',
  ].join('\n'));
}
const inZone = (z, x, y, zz) => Math.abs(x) <= z.r && Math.abs(zz) <= z.r;   // a simple box, so the test is about SELECTION
function run(zone, props) {
  let fired = null;
  const f = sweep();
  let sawInside = false;
  const step = (z, st, inside) => { sawInside = inside; return inside; };   // fire whenever something is inside
  f(zone, props, inZone, step, (ev) => { fired = ev; }, {}, 0);
  return { fired, inside: sawInside };
}
const prop = (x, z, ud = {}) => ({ visible: true, position: { x, y: 0, z }, userData: ud });

{ // the motivating case: a tagged ball in a goal
  const zone = { who: 'prop', r: 5, ptag: 'ball', ev: 'goal' };
  eq(run(zone, [prop(0, 0, { tag: 'ball' })]).fired, 'goal', 'a tagged prop inside fires the event');
  eq(run(zone, [prop(100, 100, { tag: 'ball' })]).inside, false, '...and outside it does not');
}
{ // the tag actually selects
  const zone = { who: 'prop', r: 5, ptag: 'ball', ev: 'goal' };
  eq(run(zone, [prop(0, 0, { tag: 'crate' })]).inside, false, 'a DIFFERENT prop in the zone does not fire it');
  eq(run(zone, [prop(0, 0, {})]).inside, false, '...nor does an untagged one');
  eq(run(zone, [prop(0, 0, { tag: 'crate' }), prop(1, 1, { tag: 'ball' })]).inside, true,
    '...but the right prop among the wrong ones does');
}
{ // a blank tag is the "did anything land in here" question
  const zone = { who: 'prop', r: 5, ptag: '', ev: 'any' };
  eq(run(zone, [prop(0, 0, {})]).inside, true, 'a blank tag matches ANY prop');
  eq(run(zone, [prop(0, 0, { tag: 'whatever' })]).inside, true, '...tagged or not');
  eq(run(zone, [prop(50, 50, {})]).inside, false, '...still only inside the zone');
}
{ // things that are not really in the level do not count
  const zone = { who: 'prop', r: 5, ptag: '', ev: 'x' };
  eq(run(zone, [Object.assign(prop(0, 0, {}), { visible: false })]).inside, false,
    'an invisible prop does not trip it — hidden by the graph (1170) or culled means not in play');
  eq(run(zone, [prop(0, 0, { _shattered: true })]).inside, false, 'nor does a destroyed one');
  eq(run(zone, [prop(0, 0, { _pvHidden: true })]).inside, false, 'nor one the graph hid');
  eq(run(zone, [null, undefined, prop(0, 0, {})]).inside, true, 'and null slots in propModels do not throw');
}
{ // ONE edge for the whole zone, like enemies — a pile of debris must not become a pulse each
  const zone = { who: 'prop', r: 5, ptag: 'bit', ev: 'x' };
  let calls = 0;
  const f = sweep();
  const many = []; for (let i = 0; i < 20; i++) many.push(prop(0, 0, { tag: 'bit' }));
  f(zone, many, inZone, (z, st, inside) => { calls++; return false; }, () => {}, {}, 0);
  eq(calls, 1, '20 matching props inside produce ONE union edge, not 20 (the enemy precedent)');
}

// --- persistence and authoring -----------------------------------------------------------------------
{
  const mig = extractFunction('_migrateTrigger');
  assert(/ptag:String\(z\.ptag==null\?'':z\.ptag\)\.trim\(\)\.slice\(0,40\)/.test(mig),
    'the tag is sanitized and bounded — a level file is untrusted input');
  assert(/triggers: \(triggerZones\.length \? triggerZones\.map\(_migrateTrigger\)/.test(src),
    'and the serializer routes through the same function, so it saves and loads by construction');
  assert(/who:\(TRIG_WHO\.indexOf\(z\.who\)>=0\?z\.who:'player'\)/.test(mig),
    'an unknown audience still falls back to player');
}
{
  assert(/\['prop','A prop'\]/.test(src), 'the editor offers it');
  assert(/if\(z\.who==='prop'\)\{/.test(src), '...and reveals the tag field only for a prop zone');
  assert(/ti\.setAttribute\('list','lgTagList'\)/.test(src), '...autocompleting from the tags already in the level');
  assert(/Blank = ANY prop/.test(src), '...and explaining what an empty tag means');
  assert(/One edge for the whole zone, however many arrive/.test(src),
    '...and stating the union-edge rule, which is the one surprising thing about it');
}

done('build 1276: a trigger zone can watch for a PROP — tag-selected or any, executed over the real sweep for the ball-in-the-goal case, wrong-prop rejection, invisible/destroyed/graph-hidden props not counting, and one union edge for twenty props; plus the enum trap that would have shipped, where two branches testing `who` by EXCLUSION would have fired a prop zone for players and enemies as well');
