// build 1396 — REPORTED FROM PLAY: "there needs to be an option for spawned pickups that it doesn't keep
// respawning after the item has been picked up. Right now it just infinitely keeps popping back up after a
// little bit. I want an option that allows it to be only picked up once and then it doesn't come back."
//
// Correct. Every pad but a key or an inventory item returned on POWERUP_COOLDOWN forever, with no per-spot
// control. A health pad in a corridor is right to come back; the shotgun hidden at the end of a puzzle room
// is not, and there was no way to say which.
//
// THE ONE-SHOT RULE ALREADY EXISTED — as `p.cd = 1e9`, a cooldown of thirty-one years, written out at BOTH
// grant sites. A sentinel standing in for a fact, duplicated, in exactly the shape this file records as
// drifting (1266, 1272, 1280). This build makes it a predicate, gives the two sites one consume, and lets a
// creator opt in. So the feature is mostly *deleting the duplication that was already there*.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------------------ the predicate, executed ----
{
  const fn = extractFunction('_puOnce');
  const KINDS = { health: {}, ammo: {}, shotgun: {}, item: {}, key_red: { key: 'red' }, key_gold: { key: 'gold' } };
  const once = new Function('POWERUP_KINDS', fn + '\nreturn _puOnce;')(KINDS);

  eq(once({ kind: 'health' }), false, 'an ordinary pad comes back — the behaviour every existing level has');
  eq(once({ kind: 'shotgun' }), false, '...whatever the kind');
  eq(once({ kind: 'health', once: true }), true, 'unless the creator said once');
  eq(once({ kind: 'key_red' }), true, 'a KEY is one-shot by its nature, as it has always been');
  eq(once({ kind: 'key_gold' }), true, '...every key');
  eq(once({ kind: 'item' }), true, 'and so is an inventory item');
  eq(once({ kind: 'key_red', once: true }), true, 'ticking it on something already one-shot is a no-op');
  eq(once(null), false, 'a missing pad is not one-shot rather than throwing');
  eq(once({ kind: 'nosuchkind' }), false, 'an unknown kind falls through to respawning — the safe default, ' +
    'since a pad that silently never returns is the harder failure to diagnose');
}

// ------------------------------------------------------ the consume, and its two callers ----
{
  const fn = extractFunction('_puConsume');
  const KINDS = { health: {}, key_red: { key: 'red' } };
  const run = new Function('POWERUP_KINDS', 'POWERUP_COOLDOWN',
    extractFunction('_puOnce') + '\n' + fn + '\nreturn _puConsume;')(KINDS, 15);

  const pad = (ud) => Object.assign({ kind: 'health', ready: true, cd: 0, mesh: { visible: true } }, ud);
  { const p = pad(); run(p);
    eq(p.ready, false, 'a taken pad is not ready...'); eq(p.gone, false, '...but it is coming back');
    eq(p.cd, 15, '...on the ordinary cooldown'); eq(p.mesh.visible, false, '...and it is hidden meanwhile'); }
  { const p = pad({ once: true }); run(p);
    eq(p.gone, true, 'an authored one-shot is GONE — a real flag, not a 1e9 countdown that still ticks ' +
      'every frame of every match for a pad that can never return'); }
  { const p = pad({ kind: 'key_red' }); run(p); eq(p.gone, true, 'and so is a key'); }
  run(null);   // must not throw

  eq((src.match(/_puConsume\(p\);/g) || []).length, 2,
    'exactly TWO callers: the proximity grant and the interact grant. Those two used to carry the same ' +
    '1e9 expression written out twice, which is how "does this come back" stops agreeing with itself');
  assert(!/\?1e9:POWERUP_COOLDOWN/.test(src), 'and the sentinel it replaced is gone from both');

  // the cooldown loop must not run at all for a gone pad
  const up = extractFunction('updatePowerups');
  assert(/if\(!p\.ready\)\{ if\(p\.gone\) continue;/.test(up),
    'a pad that is gone skips the countdown entirely rather than counting toward a return it will never make');
}

// -------------------------------------------------------------- it survives a save ----
{
  assert(/\.\.\.\(s\.once\?\{once:1\}:\{\}\)/.test(src),
    'the flag serializes ONLY when set, so an ordinary pad\'s entry does not grow a key');
  eq((src.match(/interact:!!s\.interact, once:!!s\.once/g) || []).length, 3,
    'and all THREE loaders read it — boot, the co-op level sync, and restoreLevel. Build 1325 found ' +
    'keyNames and pickupModels serializing with the level and missing from restoreLevel entirely, so the ' +
    'second level you opened kept the first one\'s; a pickup flag in two of three loaders is that bug');
  assert(/once:!!spot\.once, ready:true, gone:false/.test(src),
    'the spawn carries the authored flag onto the live pad and resets `gone` there');
}

// ----------------------------------------------------------- once per RUN, not forever ----
// `gone` lives on the live pad and the live pads are rebuilt by spawnPowerups, which every deploy calls.
// That is the same scope the key ring has had since keys existed, and it is the one a creator means.
{
  const sp = extractFunction('spawnPowerups');
  assert(/gone:false/.test(sp), 'a fresh deploy re-seeds every pad ready...');
  assert(/clearPowerups\(\);/.test(sp), '...from scratch');
  assert(/spawnPowerups\(\);   \/\/ lay out map powerups for this run/.test(src), '...and startGame calls it');
  assert(/once per RUN/.test(src), 'and the scope is stated at the site, because "once" alone reads as "never again, ever"');
}

// ------------------------------------------------------------------------- the door ----
{
  assert(/Pick up once \(does not respawn this run\)/.test(src), 'the editor offers it, and the label says WHEN');
  assert(/cb\.disabled = _always;/.test(src),
    'a key or an inventory item shows the box TICKED AND DISABLED rather than hidden — a control that ' +
    'vanishes for some kinds reads as a bug, and one that is unticked while the pad demonstrably never ' +
    'returns is a lie (builds 1338, 1348)');
  assert(/Pick up once \(always, for keys and items\)/.test(src), '...and says why it cannot be changed');
  assert(/if\(cb\.checked\) sp\.once=true; else delete sp\.once;/.test(src),
    'unticking DELETES the flag rather than storing false, so an untouched pad serializes exactly as before');
  assert(/pushUndoSnapshot==='function'\) pushUndoSnapshot\(\); if\(cb\.checked\) sp\.once/.test(src),
    '...through undo, like every other spot edit');
}

// Probed live (tools/probe/pickup-once.mjs) with a RESPAWNING pad beside the one-shot in every run, because
// a one-shot that stays gone while the control also stays gone would mean the clock and not the flag:
//
//   _puOnce over the three pads        [true, false, true]   (authored, ordinary, key)
//   just taken    gone [true, false, true],  all three hidden
//   20 s later    the ORDINARY pad is back and visible; the one-shot and the key are not
//   220 s later   unchanged — it is not a longer timer, it never returns
//   redeploy      all three ready and visible again — once per RUN
//   round trip    `once:1` written for the authored pad alone, and read back as one-shot
//   control       an ordinary pad taken and left alone for 20 s: visible false -> true
done('build 1396: a pickup can be taken once and stay taken');
