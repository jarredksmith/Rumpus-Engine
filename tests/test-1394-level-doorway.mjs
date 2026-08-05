// build 1394: a DOORWAY between levels, not just a level select.
//
// Asked for from use: "is there a way to trigger the next level? I think it could be useful to break out
// large rooms or levels into separate json files. There could be a trigger that when the player walks into
// a certain zone, it shows a 'loading...' message and then picks up the game with the newly loaded scene.
// Half-Life and Portal do this regularly."
//
// The transition itself has existed since build 1352: a trigger zone fires an event, an event node pulses a
// `goto` node, `goto` loads a campaign level. What it could NOT do is the part that makes room-splitting
// work rather than merely function. Verified against the level-CLEAR path (`gameWon`), which already had
// two of the three:
//
//   | | clear path | goto (before this build) |
//   | weapons / ammo / HP | _captureLoadout -> _restoreLoadout | nothing |
//   | a transition card   | showCampaignInterstitial           | it CLEARS one |
//   | where you arrive    | n/a                                | always the level's own spawn |
//
// So walking through a door reset your guns and health to whatever the next room's loadout happened to be,
// and put you at its spawn point rather than at the matching door. Half-Life solves the third with landmark
// entities; here the landmark is a TAG, which every prop already has and every other place-taking verb
// already resolves.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// --------------------------------------------------------- the landmark, executed ----
{
  const fn = extractFunction('_arriveResolve');
  const prop = (tag, x, y, z, ry) => ({ userData: { tag }, position: { x, y, z }, rotation: { y: ry || 0 } });
  const run = (props) => new Function('propModels', fn + '\nreturn _arriveResolve;')(props);

  const r = run([prop('other', 1, 1, 1), prop('door', 12, 3, -8, -Math.PI / 2), prop('door', 99, 0, 0, 1)]);
  const hit = r('door');
  eq(hit.x, 12, 'the marker\'s position is the arrival point'); eq(hit.y, 3); eq(hit.z, -8);
  near(hit.yaw, -Math.PI / 2, 1e-9,
    'and its FACING is the arrival facing — a door you walk through should turn you into the room, and a ' +
    'creator who rotated the marker has already said which way that is');
  eq(r('door').x, 12,
    'with several props sharing the tag the FIRST wins — deliberately unlike _lgPlaceAt, which picks at ' +
    'random so a spawned squad scatters. An arrival is one place, and a random one would be a different ' +
    'door on every visit');

  eq(r('nope'), null, 'a tag nothing carries resolves to nothing rather than to the origin (build 1214)');
  eq(r(''), null, 'and so does a blank tag');
  eq(r(null), null, '...and null');
  eq(r('  door  ').x, 12, 'whitespace is trimmed, because a creator types this by hand');
  // level data is untrusted input (1325)
  const long = 'x'.repeat(500);
  eq(r(long), null, 'a hostile 500-character tag is capped and matches nothing rather than being compared whole');

  // a hole in propModels is normal in a live level
  eq(run([null, prop('door', 1, 2, 3)])('door').y, 2, 'a null entry in propModels does not throw');
}

// ------------------------------------------------------------- the landing, executed ----
{
  const fn = extractFunction('_arriveApply');
  const res = extractFunction('_arriveResolve');
  const mk = (props, pending, ground) => {
    const player = { pos: { x: 0, y: 0, z: 0, set(x, y, z){ this.x = x; this.y = y; this.z = z; } },
      vel: { set(){ this.zeroed = true; } }, yaw: 9, pitch: 9, onGround: true };
    const scope = new Function('propModels', 'player', 'EYE', 'terrainHeightAt', '_arrivePending',
      res + '\n' + fn + '\nreturn { go: _arriveApply, peek: ()=>_arrivePending, player };')
      (props, player, 1.7, () => ground || 0, pending);
    return scope;
  };
  const prop = (tag, x, y, z, ry) => ({ userData: { tag }, position: { x, y, z }, rotation: { y: ry || 0 } });

  { // the ordinary landing
    const s = mk([prop('door', 12, 3, -8, 1.25)], { tag: 'door' }, 0);
    eq(s.go(), true, 'it lands');
    eq(s.player.pos.x, 12); eq(s.player.pos.z, -8);
    eq(s.player.pos.y, 3 + 1.7,
      'the EYE goes a head above the marker: player.pos.y is the eye and a primitive marker\'s origin is ' +
      'its BASE, so anything else buries the camera in the floor or floats it');
    eq(s.player.yaw, 1.25, 'facing the way the marker faces');
    eq(s.player.pitch, 0, '...level, never inheriting the pitch you were looking at in the last room');
    eq(s.player.onGround, false, 'airborne, so the first frame settles onto the real floor');
    eq(s.player.vel.zeroed, true, '...with no velocity carried through the doorway');
    eq(s.peek(), null, 'and the arrival is CONSUMED, so the second call site cannot run it twice');
  }
  { // a marker authored under the floor cannot drop the player through the world
    const s = mk([prop('door', 5, -4, 5)], { tag: 'door' }, 2);
    eq(s.go(), true, 'it lands');
    eq(s.player.pos.y, 2 + 1.7, 'clamped to the terrain, exactly as build 1224\'s test pose is');
  }
  { // still loading: leave it pending for the later call site rather than landing at the origin
    const s = mk([], { tag: 'door' }, 0);
    eq(s.go(), false, 'an unresolvable tag does NOT land...');
    eq(s.peek().tag, 'door', '...and stays pending, because the marker may be an imported model still in flight');
    eq(s.player.pos.x, 0, '...leaving the player exactly where startGame put them');
  }
  { // nothing armed is the common case and must cost nothing
    const s = mk([prop('door', 1, 1, 1)], null, 0);
    eq(s.go(), false, 'no arrival requested: a no-op');
    eq(s.player.yaw, 9, '...touching nothing');
  }
}

// ------------------------------------------- two call sites, and why there are two ----
// A marker built from a PRIMITIVE is in the scene when startGame ends (spawnProp calls its builder
// synchronously); a marker that is an imported model is not. One call site would serve one of those.
{
  const sg = extractFunction('startGame');
  assert(/const _arriveWanted = !!_arrivePending;/.test(sg), 'startGame notes whether an arrival was asked for...');
  assert(/if\(_ts && _ts\.pos\) _arrivePending = null;/.test(sg),
    '...and a "play from here" test pose OUTRANKS it — the creator is iterating (build 1224)');
  assert(/else if\(_arrivePending\) try\{ _arriveApply\(\); \}catch\(e\)\{\}/.test(sg), '...then tries to land it');
  assert(/_persistResume\(!!\(\(_ts && _ts\.pos\) \|\| _arriveWanted\)\);/.test(sg),
    'and an arrival skips build 1227\'s checkpoint resume for the same reason a test pose does: a graph ' +
    'that named a door must not be overridden by a checkpoint saved on a previous visit');
  assert(sg.indexOf('_arriveWanted') > sg.indexOf('startWave();'),
    'it runs after BOTH spawn branches, or the pvp branch would silently discard it (build 1224\'s lesson)');

  const w = extractFunction('waitAssetsThenReveal');
  assert(/try\{ _arriveApply\(\); if\(_arrivePending\)\{/.test(w),
    'reveal() is the second attempt, after every asset has settled');
  assert(/_noteLogicFailure\('A "Go to level" node was set to arrive at "'\+_t\+'"/.test(w),
    '...and if it STILL cannot be found the creator is told, rather than being dropped at the level start ' +
    'and left to wonder why the door does not line up');
  assert(/_arrivePending=null;/.test(w), '...with the request cleared, so it cannot leak into the next level');
  assert(/_loaderTitle='';/.test(w), 'and the destination name is cleared with the cover that showed it');
}

// -------------------------------------------------- the loading beat, and its deadlock ----
{
  const sg = extractFunction('startGame');
  assert(/if\(_levelAssetsPending\(\) \|\| _loadCover\)\{ _loadCover=false; showLevelLoader\(\); waitAssetsThenReveal\(\); \}/.test(sg),
    'THE FORCED COVER RIDES THE SAME PAIR. showLevelLoader on its own would leave the screen up FOREVER — ' +
    'the reveal is the only thing that takes it down, and startGame\'s later intro-cover block skips when ' +
    'the loader is already active, so nothing else would ever arm it');
  eq((src.match(/_loadCover *= *true/g) || []).length, 1, 'exactly one place raises the cover (the goto verb)');
  eq((src.match(/_loadCover=false/g) || []).length, 3,
    '...and it is lowered in exactly three places: its own declaration, the consumption in startGame, and a ' +
    'fresh campaign run. It is never left armed for an unrelated later load. (The catch in the goto verb ' +
    'lowers it too, spelled with spaces — counted separately below.)');
  assert(/catch\(e\)\{ _loadCover = false;/.test(src), '...plus the goto verb\'s own catch');

  const w = extractFunction('waitAssetsThenReveal');
  assert(/lab\.textContent = _loaderTitle \?/.test(w), 'the loader SAYS where you are going when a transition named it');
  assert(/textContent/.test(w) && !/innerHTML *= *_loaderTitle/.test(w),
    '...as textContent, because a level name is level data (build 1325)');
}

// ------------------------------------------------------------------ the verb ----
{
  const fn = extractFunction('_lgPulse');
  const blk = fn.slice(fn.indexOf("case 'goto':"), fn.indexOf("case 'lose':"));
  assert(blk.length > 200, 'the goto branch is findable');

  assert(/const _carry = p\.keep \? _captureLoadout\(\) : null;/.test(blk),
    'keeping your gear is a FLAG, not a behaviour change: a hub world wants the destination\'s own loadout, ' +
    'a room split out of one level does not');
  assert(blk.indexOf('_restoreLoadout(_carry)') > blk.indexOf('_campaignLoad(campaignIdx)'),
    'the restore lands AFTER the load, exactly as gameWon does it — _campaignLoad ends in startGame(), ' +
    'which resets every weapon\'s magazine and reserve (build 1190\'s loop), so restoring first is erased');
  assert(/_arrivePending = \(typeof p\.at === 'string' && p\.at\.trim\(\)\) \? \{ tag: p\.at\.trim\(\)\.slice\(0, 60\) \} : null;/.test(blk),
    'the arrival is armed BEFORE the load, because startGame reads it at the end of its own run');
  assert(/_loaderTitle = 'Entering '/.test(blk), 'and the cover is named for the destination');
  assert(/catch\(e\)\{ _loadCover = false; _loaderTitle = ''; _arrivePending = null; \}/.test(blk),
    'a throw mid-load resets ALL THREE — a stranded _loadCover is a loading screen that never lifts, and a ' +
    'stranded _arrivePending would teleport the player on some unrelated level load later');

  // EVERY EXISTING LEVEL IS BYTE-IDENTICAL: both new params are absent on a node authored before this build
  const gate = new Function('p', 'return { carry: !!p.keep, arrive: (typeof p.at===\'string\' && !!p.at.trim()) };');
  eq(gate({ n: '2' }).carry, false, 'a pre-1394 goto node carries nothing...');
  eq(gate({ n: '2' }).arrive, false, '...and arrives nowhere in particular — the pre-1394 behaviour exactly');
  eq(gate({ n: '2', keep: 1, at: 'door' }).carry, true, 'while an authored one does both');
  eq(gate({ n: '2', at: '   ' }).arrive, false, 'a whitespace-only tag is not an arrival');

  // build 1352's four guards are untouched, and they run BEFORE anything is armed
  for (const g of [/NET\.mode==='client'/, /!campaignActive/, /_n1 >= 1 && _n1 <= _tot/])
    assert(g.test(blk), 'build 1352\'s guard survives: ' + g);
  assert(blk.indexOf('const _carry') > blk.indexOf('_n1 <= _tot'),
    'and every guard returns BEFORE the loadout is captured or the cover is raised — a refused transition ' +
    'must not leave a loading screen up over a level it never loaded');
}

// --------------------------------------------------------------------- the door ----
{
  assert(/\{k:'at',l:'arrive at tag',w:96\}/.test(src), 'the node offers the arrival tag...');
  assert(/\{k:'keep',l:'keep gear',chk:1\}/.test(src), '...and the gear checkbox');
  assert(!/\{k:'at',l:'arrive at tag',w:96,listId/.test(src),
    'the tag field has NO datalist, deliberately: the tags one could offer are the ones in the level being ' +
    'EDITED, and the marker is in the DESTINATION — autocompleting a creator into a tag that does not exist ' +
    'there is worse than offering none');
  assert(/build 1394[\s\S]{0,400}?offering the wrong level's tags/.test(src), '...and the reason is recorded at the site');
  assert(/function startCampaign\(\)\{ _arrivePending=null; _loaderTitle=''; _loadCover=false;/.test(src),
    'a fresh campaign run never inherits a transition armed by a previous one');
  // declared beside the loader they drive, ~34,000 lines above the read (builds 1127/1331/1350)
  assert(src.indexOf("let _loadCover=false, _loaderTitle='';") < src.indexOf('function showLevelLoader'),
    'the loader flags are declared above every consumer — `typeof` does not guard a temporal dead zone');
  assert(src.indexOf('let _arrivePending = null;') < src.indexOf('function startGame'),
    '...and so is the arrival');
}

// Probed live (tools/probe/level-doorway.mjs) on a real two-room campaign, driving the REAL _lgPulse switch
// from a node in the real graph — build 1352 shipped `goto` into the wrong dispatcher and only a probe that
// drove the switch caught it:
//
//   PLAIN goto      -> Reactor Hall, spawn (0, 2.9, 30), hp 100, owned [rifle], mag 30
//                      cover up reading "Entering Reactor Hall", then down    (pre-1394 behaviour + the beat)
//   SEAMLESS goto   -> position (120, 1.70, -80) = the marker at (120, 0, -80) + EYE, yaw -1.571 = the
//                      marker's own facing, hp 43 carried, mag 7 carried, owned [pistol, rifle] carried
//                      — and landed IMMEDIATELY, in startGame, before a frame was ever drawn
//   BAD TAG         -> the level's own spawn, and Level Check reads "...was set to arrive at 'noSuchDoor',
//                      but nothing in the level it loaded carries that tag"
//   GUARDS          -> out of range / zero / not-in-a-campaign all refuse, nothing armed, no cover left
//
// The probe's own first run reported every transition doing NOTHING: `_lgPulse(id, pin)` takes an ID and
// resolves it out of logicGraph.nodes, and I passed a node OBJECT, so it returned at its first line. A probe
// that drives the wrong signature is indistinguishable from a feature that does not work.
done('build 1394: a doorway — carry your gear, arrive at a marker, and see where you are going');
