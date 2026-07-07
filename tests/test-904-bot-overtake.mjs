// (build 904) BOTS OVERTAKE STOPPED CARS — "AI cars don't just line up behind a stopped player car."
// _raceBotObstacle now records WHICH object is limiting (signed side + speed + gap); in the tick, a
// (near-)stopped blocker triggers a lane swing to the clear side — opposite the blocker, clamped inside
// the kerbs — held while alongside, then eased back to the bot's own lane. Moving traffic still gets
// the follow-at-their-pace behavior (no dive-bombing).
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
const obs = extractFunction('_raceBotObstacle', src);
assert(/st\.blk=null;/.test(obs) && /if\(l<lim\)\{ lim=l; st\.blk=\{ side:latS, speed, fwd \}; \}/.test(obs),
  'the limiter records the blocker (signed side, speed, gap)');
assert(/if\(_blk && _blk\.speed<2\.5 && _blk\.fwd<14\)\{/.test(src), 'only (near-)stopped blockers trigger the reroute');
assert(/st\.dodgeTgt=Math\.max\(-room-st\.lat, Math\.min\(room-st\.lat, \(_blk\.side>=0\?-1:1\)\*4\.6\)\);/.test(src),
  'the swing goes OPPOSITE the blocker and stays inside the kerbs');
assert(/\} else if\(st\.dodgeHold>0\) st\.dodgeHold-=dt; else st\.dodgeTgt=0;/.test(src), 'past the blocker, the bot eases home');
assert(/_racePathAt\(st\.s, st\.lat \+ \(st\.latOff\|\|0\) \+ st\.dodge\);/.test(src), 'the dodge rides the live path sample (tick, dt in scope)');
done('build 904: stalled cars get overtaken, not queued behind');
