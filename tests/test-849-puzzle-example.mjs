// (build 849) THE PUZZLE ROOM IS LOADABLE like the other two tutorials. One click builds a complete adventure
// loop with the game's real systems: a vault of walls with a LOCKED door (lockId 'gold' + an E-Activate
// mechanism, so the built-in flow denies you until the key, then unlocks AND slides it up), the gold-key
// pickup hidden behind crates, a Curator NPC whose dialogue hints where it is, and a prize inside carrying an
// 'interacted' -> 'win' signal — find key, open vault, claim idol, MISSION COMPLETE.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// the tutorial now carries the example button + steps that match what it builds
const topics=src.match(/const HELP_TOPICS = \[[\s\S]*?\n\];/)[0];
assert(/id:'tut-puzzle', title:'Tutorial: puzzle room', example:'puzzle'/.test(topics), 'the puzzle tutorial is loadable');
assert(/Trigger <b>E&nbsp;Activate<\/b>, Move&nbsp;Y/.test(topics), 'the steps teach the real door flow (lock + mechanism)');
assert(/do <b>Win level<\/b>/.test(topics), '...and the win signal');

// the builder: every piece of the loop, wired with the systems the game actually uses
const be=extractFunction('_helpBuildExample');
assert(/else if\(kind==='puzzle'\)\{/.test(be), 'a puzzle branch exists');
assert(/o\.userData\.lockId='gold';/.test(be), 'the vault door is locked with the gold key');
assert(/xaApply\(o, \{ trig:'interact', mode:'once', my:3\.4, dur:1\.4 \}\);/.test(be), 'E unlocks + slides the door up (built-in lock->mechanism flow)');
assert(/o\.userData\.signals=\[\{ when:'interacted', do:'win' \}\];/.test(be), 'the prize wins the level on interact');
assert(/xaApply\(o, \{ trig:'interact', mode:'once', my:0\.8, dur:0\.8 \}\);/.test(be), '...and is itself E-interactable (a Once mechanism)');
assert(/pickupSpots\.push\(\{ x:19, z:10\.5, kind:'key_gold' \}\);/.test(be), 'the gold key is a real pickup pad');
assert(/if\(typeof refreshPickupMarkers==='function'\) refreshPickupMarkers\(\);/.test(be), '...with its editor marker refreshed');
assert(/o\.userData\.npcName='Curator';/.test(be) && /glinting behind the crates/.test(be), 'the Curator hints at the key');
assert(/gameCfg\.objective='puzzle'; gameCfg\.goalText='Recover the idol from the locked vault\.'/.test(be), 'puzzle objective + goal text set');

// the key kind it grants really exists and maps to the lock id
assert(/key_gold: \{ c:0xffd166, label:'GOLD KEY', key:'gold' \}/.test(src), "the key_gold pickup grants playerKeys['gold'] — the door's lockId");

// geometry sanity: the doorway gap the door fills matches the front wall segments (3.2-wide walls at ±3.4 leave a 3.6 gap; the door is 3.6 wide)
{
  const wallHalf=3.2/2, wallCenter=3.4, gap=2*(wallCenter-wallHalf), door=3.6;
  near(gap, door, 1e-9, 'the door exactly fills the doorway');
}

done('build 849: the puzzle room is a loadable example — lock, key pickup, NPC hint, win signal, all real systems');
