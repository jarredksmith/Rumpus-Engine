// build 1416: the carried set belongs to the CAMPAIGN, not to whichever file you ticked.
//
// Build 1415 made a doorway commit the run. But `persistVars` — the list of what carries — is level DATA:
// ticked in the Rules tab, saved into that one file. A gauntlet is one file per booth, so the creator had
// to tick the same names in every room, and a room that forgot silently ended the run at its own door.
//
// It is not hypothetical. Build 1415's own probe hit it on the first run and reported a defect that did
// not exist. Measured on three rooms where only the FIRST ticks `score`, with a control where every room
// does (tools/probe/campaign-carry.mjs):
//
//     only room 1 ticks it     12  ->  null  ->  null
//     every room ticks it      12  ->   12   ->   12      <- the control, i.e. build 1415 working
//
// So the TICK means "this room passes its value on" and the seed takes whatever the campaign is carrying.
// `_persistCommit` already had the matching half — it writes only the ticked names and never deletes the
// rest — which is why this is one line rather than a redesign.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the seed, executed
{
  const mkSeed = () => {
    const state = { logicVars: {}, campaignVars: {}, persistVars: [] };
    const fn = new Function('campaignVars', 'logicVars', 'persistVars',
      extractFunction('_persistSeed') + '; return _persistSeed;');
    state.run = () => fn(state.campaignVars, state.logicVars, state.persistVars)();
    return state;
  };

  {
    // THE CASE: this room ticked nothing, the campaign is carrying two values
    const s = mkSeed();
    s.campaignVars.score = 12; s.campaignVars.rangeDone = 1;
    s.persistVars = [];
    s.run();
    eq(s.logicVars.score, 12, 'a value the campaign carries arrives in a room that never declared it');
    eq(s.logicVars.rangeDone, 1, '...all of them');
  }
  {
    // the control: rooms that agree behave exactly as before — this is the byte-identical case
    const s = mkSeed();
    s.campaignVars.score = 30; s.persistVars = ['score'];
    s.run();
    eq(s.logicVars.score, 30, 'a room that DOES declare it is unchanged, which is every existing campaign');
  }
  {
    // it is not "carry everything": campaignVars only ever holds names some room ticked
    const s = mkSeed();
    s.campaignVars.score = 4; s.persistVars = ['score', 'scratch'];
    s.run();
    assert(!('scratch' in s.logicVars),
      'a name no room ever COMMITTED is not invented, even when this room ticks it — the seed reads the ' +
      'carried set, and only a commit puts anything in it');
    eq(Object.keys(s.logicVars).length, 1, '...so exactly the carried names arrive');
  }
  {
    // nothing carried yet: the first room of a fresh run seeds nothing and must not throw
    const s = mkSeed();
    s.persistVars = ['score'];
    s.run();
    eq(Object.keys(s.logicVars).length, 0, 'a fresh run seeds nothing');
  }
  {
    // a null in the carried set is skipped rather than written — one poisoned value corrupts every later
    // compare (build 1169's rule), and the pre-1416 form guarded this too
    const s = mkSeed();
    s.campaignVars.score = 7; s.campaignVars.dead = null;
    s.run();
    eq(s.logicVars.score, 7, 'a live carried value arrives...');
    assert(!('dead' in s.logicVars), '...and a null one is skipped, never written as a poisoned compare');
  }
}

// ---------------------------------------------------------------- the matching half was already right
//
// The commit writes only the ticked names and never deletes the rest, which is what makes the carried set
// accumulate across rooms rather than being replaced by each one. If that ever became a full rewrite, this
// build's whole property dies silently, so it is asserted by execution rather than read.
{
  const state = { campaignVars: { score: 12, rangeDone: 1 }, _persistCpVal: null };
  const fn = new Function('persistVars', 'logicVars', 'campaignVars', '_persistStore', 'S',
    extractFunction('_persistCommit').replace(/_persistCpVal = null;/, 'S._persistCpVal = null;') +
    '; return _persistCommit;'
  )(['coins'], { coins: 5 }, state.campaignVars, () => {}, state);
  fn();
  eq(state.campaignVars.coins, 5, 'a room commits its own ticked name...');
  eq(state.campaignVars.score, 12, '...and leaves what other rooms carried untouched');
  eq(state.campaignVars.rangeDone, 1, '...all of it');
}

// ---------------------------------------------------------------- and the panel says what the tick means
{
  const fn = extractFunction('_renderPersistUI');
  assert(/passes its value on/.test(fn),
    'the hint describes the tick as what THIS room contributes, not as a gate on what arrives');
  assert(/Go to level/.test(fn),
    '...and names the doorway beside the clear, which build 1415 made a carrying transition and this text ' +
    'had gone stale about');
  assert(/cannot end a run/.test(fn),
    '...and says plainly that a room you forgot to tick is not fatal, because the whole point of the ' +
    'change is that the creator no longer has to be careful about it');
  assert(/for\(const nm in campaignVars\)/.test(fn),
    'and a name another room ticked is LISTED here, unticked — the honest state, since it arrives either way');
  // it must still list this level's own ticks, or a name whose node was deleted becomes un-unticka·ble
  assert(/for\(const nm of persistVars\)/.test(fn), '...beside build 1075\'s own list');
}

// ---------------------------------------------------------------- the seed still runs where it must
{
  const start = extractFunction('logicStart');
  const cl = start.indexOf('logicVars={}'), sd = start.indexOf('_persistSeed');
  assert(cl >= 0 && sd > cl, 'the seed runs after logicStart clears the variables, or it seeds into a wipe');
  // build 1415's doorway commit is what fills the set this now reads from
  const pulse = extractFunction('_lgPulse');
  const i = pulse.indexOf("case 'goto':");
  assert(i > 0 && /_persistCommit\(\)/.test(pulse.slice(i, pulse.indexOf("case 'lose':", i))),
    'and the doorway still commits into it (build 1415) — without that there is nothing to carry');
}

done('build 1416: a room that forgot to tick the box no longer ends the run at its own door');
