// (build 1072) TRIGGER VOLUMES — the primitive every level designer reaches for first, and the
// one thing the logic graph had no way to express. Before this, the ONLY ways to start anything
// were: match start, a timer, an enemy dying, a wave starting, or the player pressing E on a
// prop. There was no "when the player gets HERE". Every other zone in the engine is a hardcoded
// behaviour (death, audio, jump, ladder, fire, water); a trigger does nothing by itself and hands
// the moment to the graph, which is where the author's game actually lives.
import { gameSource, extractFunction, assert, eq, near, done , appliedOnceByBothLoaders } from './harness.mjs';
const src = gameSource();

// ---- the volume test ----
const inside = new Function(extractFunction('_trigContains', src) + '\nreturn _trigContains;')();
{
  const z = { x: 10, z: -4, r: 5, y: 2, h: 3 };
  assert(inside(z, 10, 2, -4), 'dead centre, on the floor of the band');
  assert(inside(z, 10, 5, -4), '...and at the very top of it');
  assert(!inside(z, 10, 5.5, -4), 'above the height is OUTSIDE — you can jump over a trigger');
  assert(!inside(z, 10, 1.5, -4), 'below the base is outside — a trigger on a balcony ignores the floor below');
  assert(inside(z, 14.9, 3, -4), 'just inside the radius');
  assert(!inside(z, 15.2, 3, -4), 'just outside it');
  assert(!inside(z, 10, 3, 2), 'radius is measured on the ground plane, not as a sphere');
}
{
  const z = { x: 0, z: 0 };   // defaults must be sane, never NaN-y
  assert(inside(z, 0, 0, 0), 'a zone with only a position still has a usable default volume');
}

// ---- the edge logic: enter / exit / stay, once-only, and the stay cadence ----
const step = new Function(extractFunction('_trigStep', src) + '\nreturn _trigStep;')();
{ // ENTER fires on the crossing, not every frame you stand there
  const z = { on: 'enter' }, st = { inside: false, fired: 0, next: 0 };
  eq(step(z, st, false, 0), 0, 'outside: nothing');
  eq(step(z, st, true, 16), 1, 'ENTER fires the frame you cross in');
  eq(step(z, st, true, 32), 0, '...and NOT again while you stand inside');
  eq(step(z, st, false, 48), 0, 'leaving does not fire an enter trigger');
  eq(step(z, st, true, 64), 1, '...but re-entering does');
}
{ // EXIT is the mirror
  const z = { on: 'exit' }, st = { inside: false, fired: 0, next: 0 };
  eq(step(z, st, true, 0), 0, 'entering does not fire an exit trigger');
  eq(step(z, st, false, 16), 1, 'EXIT fires the frame you leave');
  eq(step(z, st, false, 32), 0, '...once');
}
{ // STAY fires on a cadence, and the clock resets when you leave
  const z = { on: 'stay', every: 1 }, st = { inside: false, fired: 0, next: 0 };
  eq(step(z, st, true, 1000), 1, 'STAY fires immediately on arrival');
  eq(step(z, st, true, 1500), 0, '...then waits out the interval');
  eq(step(z, st, true, 2000), 1, '...and fires again one second later');
  eq(step(z, st, false, 2100), 0, 'leaving stops it');
  eq(step(z, st, true, 2150), 1, '...and coming back starts the cadence fresh, not mid-interval');
}
{ // ONCE survives all three modes
  const z = { on: 'enter', once: true }, st = { inside: false, fired: 0, next: 0 };
  eq(step(z, st, true, 0), 1, 'a once-only trigger fires the first time');
  step(z, st, false, 10);
  eq(step(z, st, true, 20), 0, '...and never again this match');
}
{
  const z = { on: 'stay', every: 0.5, once: true }, st = { inside: false, fired: 0, next: 0 };
  eq(step(z, st, true, 0), 1, 'once + stay fires once');
  eq(step(z, st, true, 1000), 0, '...and not on the next tick of the cadence');
}
{ // a zero/absent cadence cannot become a per-frame flood
  const z = { on: 'stay' }, st = { inside: false, fired: 0, next: 0 };
  eq(step(z, st, true, 0), 1, 'stay with no interval set fires once...');
  eq(step(z, st, true, 500), 0, '...and defaults to a 1s gap, not every frame');
}

// ---- the data model ----
const mig = new Function("const TRIG_WHO=['player','enemy','any'], TRIG_ON=['enter','exit','stay'];\n"
  + extractFunction('_migrateTrigger', src) + '\nreturn _migrateTrigger;')();
{
  const z = mig({ x: 1, z: 2, r: 9, y: 3, h: 5, on: 'stay', who: 'enemy', ev: '  goHostile  ', once: 1, every: 2.5 });
  eq(z.ev, 'goHostile', 'the event name trims');
  eq(z.on, 'stay', 'a valid mode passes');
  eq(z.who, 'enemy', 'a valid filter passes');
  eq(z.once, true, 'once is a real boolean');
  eq(z.every, 2.5, 'the cadence survives');
}
{
  const z = mig({ on: 'explode', who: 'wizard', r: 9999, h: -3, every: 0, ev: 'x'.repeat(200) });
  eq(z.on, 'enter', 'an unknown mode falls back to enter');
  eq(z.who, 'player', 'an unknown filter falls back to the player');
  eq(z.r, 400, 'the radius clamps');
  eq(z.h, 0.5, 'a negative height clamps to a usable minimum');
  eq(z.every, 1, 'a zero cadence falls back to the one-second default, never to "every frame"');
  eq(z.ev.length, 60, 'the event name is bounded');
}
eq(mig({ every: 0.001 }).every, 0.1, '...and a hand-edited sub-tick cadence still clamps to a floor');
eq(mig({ every: 999 }).every, 60, '...with a ceiling on the other end');
eq(mig(null).r, 6, 'junk in gives a sane default zone, never a crash');

// ---- the runtime: authority, gating, and who counts ----
{
  const fn = extractFunction('updateTriggerZones', src);
  assert(/if\(typeof NET!=='undefined' && NET\.mode==='client'\) return;/.test(fn),
    'triggers run host/solo only — the graph they feed is authoritative there');
  assert(/if\(!gameOn \|\| \(typeof editorOpen!=='undefined' && editorOpen\) \|\| \(typeof paused!=='undefined' && paused\)\) return;/.test(fn),
    'they never fire while editing or paused');
  assert(/const z=triggerZones\[i\]; if\(!z\.ev\) continue;/.test(fn), 'a trigger with no event name is skipped entirely');
  // build 1276: the audience tests are stated positively now — a fourth enum value ('prop') would have
  // matched both of the old EXCLUSION tests and fired for players and enemies as well.
  assert(/if\(_wPlayer\)\{/.test(fn) && /const _wPlayer = \(z\.who==='player' \|\| z\.who==='any'\);/.test(fn)
      && /for\(const id in NET\.players\)/.test(fn),
    'in co-op ANY teammate counts as "the player" (a door opens for whoever reaches it)');
  assert(/dead:\(rp\.hp!=null && rp\.hp<=0\)/.test(fn) && /const inz = !ac\.dead && _trigContains/.test(fn), '...but a downed teammate does not hold a trigger open');   // build 1231: per-actor — a dead player reads as OUTSIDE (and now fires their exit edge)
  assert(/if\(_wEnemy && typeof enemies!=='undefined'\)/.test(fn) && /const _wEnemy  = \(z\.who==='enemy'  \|\| z\.who==='any'\);/.test(fn),
    'enemy/any zones test the enemies too');   // build 1231: the enemy union runs beside the per-actor player edges instead of after them
  assert(/if\(_trigStep\(z, st, inside, now\) && typeof logicEvent==='function'\) logicEvent\(z\.ev\);/.test(fn),
    'and the whole thing ends in one logic pulse — the trigger itself does no gameplay');
}
assert(/updateTriggerZones\(dt\);   \/\/ build 1072/.test(src), 'the frame loop drives them');
assert(/if\(typeof _trigState!=='undefined'\) _trigState\.length=0;/.test(extractFunction('logicStart', src)),
  'a fresh match re-arms every zone, so a once-only trigger works again on a retry');

// ---- level data ----
assert(/let triggerZones = \(savedLevel && Array\.isArray\(savedLevel\.triggers\)\) \? savedLevel\.triggers\.map\(_migrateTrigger\) : \[\];/.test(src),
  'triggers boot from the saved level');
assert(/triggers: \(triggerZones\.length \? triggerZones\.map\(_migrateTrigger\) : undefined\),/.test(src), 'and serialize with it');
appliedOnceByBothLoaders(/triggerZones = Array\.isArray\(level\.triggers\) \? level\.triggers\.map\(_migrateTrigger\) : \[\];/g, 'both level-load paths restore them');
assert(/triggerZones\.length=0; selTrigger=-1; _trigState\.length=0;/.test(src), 'and a scene wipe clears them');

// ---- the editor ----
assert(/const ZONE_TYPES = \[\['triggers','\\u26a1','Trigger'\]/.test(src), 'Trigger leads the Zones picker — it is the one authors reach for most');
assert(/triggers:'edTriggers'/.test(src), 'it has a panel host');
assert(/triggers:   'Volumes that fire a Logic event when something enters, leaves or stays inside\.'/.test(src), 'and a plain-language subtitle');
{
  const fn = extractFunction('renderTriggersPanel', src);
  assert(/ev\.setAttribute\('list','lgEvtList'\)/.test(fn), 'the event field shares the graph’s event dropdown — pick it, do not retype it');
  assert(/seg\('when', \[\['enter','Enters'\],\['exit','Leaves'\],\['stay','Stays in'\]\], z\.on/.test(fn), 'enter / leave / stay are one click');
  assert(/seg\('who', \[\['player','Player'\],\['enemy','Enemy'\],\['any','Anything'\],\['prop','A prop'\]\], z\.who/.test(fn),
    'and so is the filter (build 1276 added the fourth audience)');
  assert(/No event name \\u2014 this trigger does nothing yet\./.test(fn), 'an unwired trigger says so instead of silently doing nothing');
  assert(/On event reachedVault \\u2192 Show message/.test(fn), 'the empty state shows the whole loop, end to end');
}
assert(/if\(typeof triggerZones!=='undefined'\) for\(const z of triggerZones\)\{ if\(z && z\.ev\) set\.add\(String\(z\.ev\)\.trim\(\)\); \}/.test(src),
  'a trigger’s event name appears in the graph’s dropdown, so On-event can pick it up');
assert(/if\(editorActive==='triggers'\)\{ return \(selTrigger>=0 && triggerMarkers\[selTrigger\]\)\?triggerMarkers\[selTrigger\]\.position:null; \}/.test(src),
  'the move gizmo grabs a selected trigger');

done('build 1072: "when something gets HERE" — the missing entry point, wired straight into the logic graph');
