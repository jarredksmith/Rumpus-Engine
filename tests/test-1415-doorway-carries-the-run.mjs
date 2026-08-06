// build 1415: a doorway carries the RUN, not just the gear.
//
// The arrangement build 1394 exists to serve, in the user's own words: "break out large rooms or levels
// into separate json files ... a trigger that shows a loading message and then picks up the game with the
// newly loaded scene." A gauntlet split one-file-per-booth.
//
// 1394 made the player cross that door intact — weapons, ammo, HP, behind `keep`. But a gauntlet is not
// made of weapons. It is made of SCORE, of which booths are finished, of the key from room one. All of
// that lives in `logicVars`, `logicStart` clears it on every level load, and `_persistSeed` puts back
// whatever `campaignVars` holds. Nothing but the level-CLEAR path ever wrote `campaignVars`.
//
// Measured on a three-room campaign (tools/probe/doorway-state.mjs), with a level CLEAR as the control:
//
//     through a DOOR     score 12  ->  null       and the player arrived at room 1's checkpoint (-55,-55)
//     through a CLEAR    score 30  ->  30         arriving at the room's own spawn
//     the INVENTORY      redKey    ->  redKey     <- the positive control: the machinery works
//
// The inventory surviving is what made both failures attributable: build 1227 writes items through on
// pickup, so they ride the same blob and cross the door already. Only the two things that waited for a
// commit were lost.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the doorway commits
{
  const pulse = extractFunction('_lgPulse');
  const i = pulse.indexOf("case 'goto':");
  assert(i > 0, "the goto case is in the pulse switch");
  const blk = pulse.slice(i, pulse.indexOf("case 'lose':", i));
  assert(blk.length > 100 && blk.length < 4000, 'and the slice ends on the NEXT case, not on a character ' +
    'budget — build 1394 lost two still-true assertions off the end of a {0,1600} window');

  assert(/_persistCommit\(\)/.test(blk),
    'the doorway carries the run forward, exactly as the level-clear path does');

  // ORDER is the whole correctness: _campaignLoad ends in startGame, which is where logicVars is cleared
  const c = blk.indexOf('_persistCommit()'), l = blk.indexOf('_campaignLoad(');
  assert(c > 0 && l > c,
    '...BEFORE the load, or it would carry forward the values startGame had already wiped');

  // ...and after the guards, or a refused goto would clear a checkpoint for nothing
  const g1 = blk.indexOf('not part of a campaign'), g2 = blk.indexOf('but this campaign has');
  assert(g1 > 0 && g2 > g1 && c > g2,
    '...and after every refusal, so a goto that goes nowhere changes nothing');

  // NOT behind `keep`: persistVars is already the opt-in, and requiring a second one would lose a hub
  // world whose author ticked the box and used a plain goto
  const line = blk.slice(blk.lastIndexOf('\n', c) + 1, blk.indexOf('\n', c));
  assert(!/p\.keep/.test(line),
    'and it is UNCONDITIONAL — `persistVars` is the creator\'s opt-in, so a variable ticked "carry between ' +
    'levels" carries through every level change; `keep` answers a different question about the PLAYER');
  assert(/p\.keep \? _captureLoadout\(\) : null/.test(blk),
    '...while build 1394\'s loadout flag is untouched and still a flag');
}

// ---------------------------------------------------------------- what the commit does, executed
//
// Two behaviours, and a doorway needs both. Driven directly rather than pinned, because the whole defect
// was that one caller reached them and another did not.
{
  const mk = (vars, live, cp) => {
    const state = { campaignVars: {}, logicVars: live, persistVars: vars, _persistCpVal: cp, stored: 0 };
    const fn = new Function('persistVars', 'logicVars', 'campaignVars', '_persistStore', 'S',
      extractFunction('_persistCommit').replace(/_persistCpVal = null;/, 'S._persistCpVal = null;') +
      '; return _persistCommit;'
    )(vars, live, state.campaignVars, () => { state.stored++; }, state);
    fn();
    return state;
  };

  {
    const s = mk(['score', 'rangeDone'], { score: 12, rangeDone: 1, scratch: 99 }, { x: -55, z: -55 });
    eq(s.campaignVars.score, 12, 'the LIVE value is what carries forward, not the last committed one');
    eq(s.campaignVars.rangeDone, 1, '...for every ticked name');
    assert(!('scratch' in s.campaignVars), '...and an unticked variable is scratch, deliberately not carried');
    eq(s._persistCpVal, null, 'and the checkpoint goes, because it names a spot in the room being left');
    eq(s.stored, 1, '...with exactly one write');
  }
  {
    // a variable the creator ticked but the run never set must not carry `undefined` into a compare
    const s = mk(['score'], {}, null);
    eq(s.campaignVars.score, 0, 'a ticked name the run never set carries 0, never NaN or undefined — one ' +
                                'poisoned value corrupts every later compare (build 1169\'s rule)');
  }
  {
    // no ticked names at all: still writes, or the checkpoint clear would never land
    const s = mk([], { score: 5 }, { x: 1, z: 1 });
    eq(s.stored, 1, 'a level with no carried variables still writes, so the checkpoint clear lands (1227)');
    eq(s._persistCpVal, null, '...and the checkpoint still goes');
    assert(!('score' in s.campaignVars), '...and nothing untricked is invented');
  }
}

// ---------------------------------------------------------------- and the two ends of the wire
//
// build 1277's rule: pinning both ends proves nothing about the wire, which is why the probe drives the
// real switch. These pin that the ends still exist to be wired.
{
  const seed = extractFunction('_persistSeed');
  assert(/for\(const k of persistVars\)\{ if\(campaignVars\[k\]!=null\) logicVars\[k\]=campaignVars\[k\]; \}/.test(seed),
    'the destination seeds its variables from the carried set');
  const start = extractFunction('logicStart');
  const cl = start.indexOf('logicVars={}'), sd = start.indexOf('_persistSeed');
  assert(cl >= 0 && sd > cl,
    '...after logicStart has cleared them, which is the clearing the doorway now commits ahead of');
  // the store still refuses to write a session blob unless asked (build 1075's own opt-in)
  assert(/function _persistStore\(\)\{ if\(!persistSave\) return;/.test(src),
    'and "carry between sessions" remains a separate opt-in from "carry between levels" — the doorway ' +
    'carry works in memory whether or not a level asked to be written to disk');
}

// ---------------------------------------------------------------- the inventory needed nothing
// It is the probe's positive control and must stay write-through, or this build's reasoning about what
// was broken stops holding.
{
  const give = extractFunction('giveItem');
  assert(/_persistStore\(\)/.test(give),
    'items are written through on pickup, which is why the inventory already crossed the doorway and is ' +
    'the control that made the other two failures attributable');
}

done('build 1415: a doorway carries the score and drops the checkpoint that named the room you left');
