// (build 1355) FACTIONS — every moving creature was hostile to the player and to nothing else.
//
// Build 1226 added the pacifist NPC and left "enemies fighting each other" as needing a targeting rework.
// It needed one line of it: `enemyDesiredTarget` has ALWAYS been target-agnostic (px, pz, dist, py) and the
// melee strike calls `_tn.hurt(...)` on whatever object the picker chose — so the change is that the picker
// may choose an ADAPTER around another enemy, the way build 1189 reused the bot's cover finder through a
// `{pos}` shim.
//
// The rule is `a !== b` and the PLAYER is faction 0, which gives an ally, a default hostile and two third
// parties with no attitude matrix to author.
//
// Measured live (tools/probe/factions*.mjs), waves suppressed so every hp change is one of the fixtures:
//   two gunners, factions 0 and 1, 6 m apart  -> each picks the OTHER, 400 -> 348 / 400 -> 352, player 100
//   two brutes, factions 0 and 1, 2 m apart   -> 400 -> 4 / 400 -> 4 through the real wind-up/strike path
//   a hostile's bolt at an ally  -> 400 -> 396      a hostile's bolt at the player -> 100 -> 96
//   an ally's bolt at the player -> 100 (unchanged, and the bolt flew on)
//   a LONE ally                  -> noTgt, never aware, never chasing, player untouched, hostileAlive 0
//   a default-only level         -> _combatTargets() length 1 (just the player); the enemy scan never runs
//   2 allies + 1 hostile + 1 pacifist -> _hostileAlive() 1
//   marker fac 2 -> desc 2 -> rebuilt 2 · default marker 1 · fac 99 -> 1 · fac -4 -> 1
//   editor: one Faction select reading ["Your side","Hostile (default)","Third party","Fourth party"]
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- the rule, executed ----
{
  const NAMES = eval(extractConst('FACTION_NAMES'));
  const DEF = Number(extractConst('FACTION_DEFAULT'));
  eq(DEF, 1, 'the DEFAULT faction is 1, not 0 — every enemy authored before this build must keep fighting ' +
    'the player, and the player is faction 0, so 0 has to mean "your side"');
  eq(NAMES.length, 4, 'four sides');
  eq(NAMES[0], 'Your side', 'faction 0 is the player’s own');

  const facOf = new Function('FACTION_NAMES', 'FACTION_DEFAULT',
    'return ' + extractFunction('_facOf', src).replace(/^function _facOf/, 'function') + ';')(NAMES, DEF);
  const hostile = new Function('return ' + extractFunction('_facHostile', src).replace(/^function _facHostile/, 'function') + ';')();
  const enFac = new Function('FACTION_DEFAULT', 'return ' + extractFunction('_enFac', src).replace(/^function _enFac/, 'function') + ';')(DEF);

  for (const [inp, out] of [[0, 0], [1, 1], [2, 2], [3, 3], [4, 1], [99, 1], [-4, 1], ['2', 2], [NaN, 1]])
    eq(facOf(inp), out, 'a faction out of range falls back to the default rather than inventing a side: ' + inp);
  // FAIL HOSTILE, NEVER ALLY. `v|0` turns undefined into 0 — "your side" — which is the worst possible
  // direction for this to be wrong in, and it is the state EVERY pre-1355 descriptor is in. The first draft
  // substituted the default at each caller instead, and test-1226's accounting rig caught the one that
  // didn't: _hostilePending subtracted every queued hostile as an ally, so a wave read as already clear.
  eq(facOf(undefined), DEF, 'an absent faction is the DEFAULT, not faction 0');
  eq(facOf(null), DEF, '...and so is null');
  assert(/isFinite\(n\) && n>=0/.test(extractFunction('_facOf', src)),
    'and the rule lives in _facOf, so no caller can forget it');

  assert(hostile(0, 1) && hostile(1, 0) && hostile(1, 2) && hostile(2, 3), 'different sides fight');
  assert(!hostile(1, 1) && !hostile(0, 0), '...and the same side does not');
  eq(enFac({}), DEF, 'an enemy with no faction reads as the default — a client mirror, or anything built ' +
    'before this build');
  eq(enFac({ faction: 0 }), 0, 'and 0 survives, rather than being swallowed by a || default');
  eq(enFac(null), DEF, 'null is not a crash');
  eq(facOf(0), 0, 'and 0 still survives — the ally faction is a real value, not an absence');
}

// ---- the target list ----
{
  const f = extractFunction('_combatTargets', src);
  assert(/_ctFrame === _frameNo/.test(f),
    'memoised on the frame, so the picker and the bolt test can never disagree about who is shootable, ' +
    'and the build happens once however many consumers ask');
  assert(/_ctArr\.length = 0/.test(f) && /const _ctArr = \[\]/.test(src),
    'one module-level array, cleared and refilled — build 1168');
  assert(/let multi = false;[\s\S]{0,400}?if\(!multi\) return _ctArr;/.test(f),
    'THE FAST PATH IS THE COMPATIBILITY ARGUMENT: with no non-default faction in play the list is exactly ' +
    'the player list and the O(N^2) scan never runs. Verified live — a default-only level reports a ' +
    'target list of length 1');
  assert(/e\.friendly/.test(f),
    'a pacifist is neither a target nor a targeter (1226), which is a stated limit, not an oversight: ' +
    'widening it would have hostiles slaughter every existing level’s villagers on wave 1');
  assert(/let a = e\._tgt;\s*\n?\s*if\(!a\)\{ a = e\._tgt =/.test(f),
    'the adapter is cached ON THE ENEMY, so a 60-strong three-way fight allocates nothing per frame');
  assert(/enemyHurt\(e, d, sx, sz, true\)/.test(f),
    '...and its hurt() marks the damage as dealt BY another creature');
  assert(/a\.eyeY = e\.mesh\.position\.y \+ 0\.4/.test(f),
    'eyeY is refreshed every frame — fireEnemyShot aims eyeY-0.4, i.e. at the body centre');
}

// ---- the picker ----
{
  const loop = src.slice(src.indexOf('let near=players[0], nd=1e9;'), src.indexOf('en._near = near; en._dist = nd;') + 40);
  assert(/if\(en\.friendly\)\{ for\(const pl of players\)/.test(loop),
    'a pacifist keeps picking the nearest PLAYER exactly as it did — its _near feeds the footstep and the ' +
    'sapper fuse, and it attacks nothing regardless');
  assert(/t\.en===en \|\| \(t\.fac\|\|0\)===_myF/.test(loop),
    'everyone else skips itself and its own side; an entry with no fac is faction 0, which is why ' +
    'allPlayers()’ own objects go in untouched');
  assert(/en\._tgtNone \|\| \(en\._tgtNone =/.test(loop),
    'the no-target placeholder is PER ENEMY. _near outlives the statement that sets it, so a shared ' +
    'scratch would be exactly the clobber build 1168 warned about');
  assert(/en\._noTgt = true;/.test(loop) && /else en\._noTgt = false;/.test(loop),
    'and the flag is set BOTH ways every frame — a stale true would pacify an ally forever');
}

// ---- an ally with nothing to fight must not fall back to hunting you ----
{
  const f = extractFunction('enemyDesiredTarget', src);
  assert(/const passive = en\.friendly \|\| en\._noTgt;/.test(f),
    'no target this frame = behaves exactly like 1226’s pacifist');
  eq((f.match(/!passive/g) || []).length, 2,
    'both combat gates read it — the sightline raycast and the detection edge');
  assert(/const mode = passive \? \(en\.mode === 'hold' \? 'hold' : 'patrol'\)/.test(f),
    '...and a hunt-mode ally with nothing to hunt patrols its post rather than running at the player');
  // it is PER FRAME, so a spawning hostile puts it straight back to work
  assert(/_noTgt = false/.test(src), 'the flag is cleared the moment a target exists');
}

// ---- bolts carry a side ----
{
  assert(/enemyShots\.push\(\{ mesh, vel, dmg: en\.dmg, fac: _enFac\(en\)/.test(src), 'a fired bolt records its side');
  const f = extractFunction('updateEnemyShots', src);
  assert(/const ps = _combatTargets\(\);/.test(f),
    'the bolt tests the SAME list the picker chose from — two lists is how the two would drift');
  assert(/if\(s\.fac!=null && \(pl\.fac\|\|0\)===s\.fac\) continue;/.test(f),
    'and never hits its own side. `s.fac != null` rather than truthy, because faction 0 is a real side ' +
    'and `if(s.fac)` would let every ally bolt hit every ally');
}

// ---- rewards ----
{
  const f = extractFunction('killEnemy', src);
  assert(/const _fr = !!en\.friendly \|\| _enFac\(en\) === 0;/.test(f),
    'killing your own ally is a DEATH but never a reward — 1226’s rule, restated for the other kind ' +
    'of non-combatant');
  assert(/const _cred = !_fr && !byEnemy;/.test(f),
    'and an ALLY’s kill is not YOUR kill');
  for (const line of ['if(_cred) runKills++', 'if(_cred && run.lifesteal>0)', "if(_cred && en.type==='boss')"])
    assert(f.indexOf(line) >= 0, 'credit gates ' + line);
  assert(/const drops = _fr \? 0 :/.test(f),
    'but the LOOT still drops on an ally’s kill — that is physical, and you have to walk to it. ' +
    'Measured live: byEnemy kill -> runKills +0, coins +2');
  assert(/function enemyHurt\(en, dmg, sx, sz, byEnemy\)/.test(src) && /killEnemy\(en, sx, sz, byEnemy\)/.test(src),
    'and the flag is threaded from the one place damage is applied');
}

// ---- accounting: an ally may not hold a wave open ----
{
  const f = extractFunction('_hostileAlive', src);
  assert(/!e\.friendly && _enFac\(e\) !== 0/.test(f),
    'hostile TO THE PLAYER — a level whose allies outlive every wave must still advance');
  const p = extractFunction('_hostilePending', src);
  assert(/d\.friendly \|\| _facOf\(d\.fac\) === 0/.test(p), '...and the queue agrees with the list');
  assert(/\(_m\.friendly \|\| _facOf\(_m\.fac\) === 0\) && enemies\.some\(e => e\._mark === _m && e\.hp > 0\)/.test(src),
    'a living ally is not restacked by the next wave (1226’s guard, widened) — but a DEAD one comes ' +
    'back, which reads as reinforcements');
  assert(/if\(spawn && spawn\.mark\) e\._mark = spawn\.mark;/.test(src),
    'which needs _mark on every spawn, not just a pacifist’s');
}

// ---- it round-trips, and the default is ABSENT ----
{
  assert(/\.\.\.\(_facOf\(m\.fac\)!==FACTION_DEFAULT\?\{fac:_facOf\(m\.fac\)\}:\{\}\)/.test(src),
    'the default faction serializes as nothing, so a level with no allies is byte-identical to pre-1355');
  assert(/fac:_facOf\(m\.fac\), mark:m/.test(src), 'the spawn descriptor carries it to spawnEnemy');
  assert(/fr:m\.friendly\?1:0, fac:m\.fac \}\)/.test(src),
    'and duplicate carries it — build 1226 had to fix exactly this omission for type/wave/height');
  assert(/faction: _facOf\(spawn && spawn\.fac\)/.test(src), 'the enemy takes it at spawn');
}

// ---- it is visible before you play it ----
{
  assert(/FACTION_COL\[mark\.fac\] \|\| SPAWN_MODE_COLORS\[mode\]/.test(src),
    'a non-default faction marker reads as its own colour, and the DEFAULT keeps the mode colour it has ' +
    'always had — an editor whose every marker changed colour on upgrade would look like a bug');
  const COL = eval(extractConst('FACTION_COL'));
  eq(COL[1], 0, 'faction 1 names no colour, which is what makes that true');
  assert(/body\.userData\.facTint \|\| ty\.tint/.test(src), 'and the capsule tints to its side in play');
  assert(/if\(!g\.userData\.mark\.friendly\)\{[\s\S]{0,900}?FACTION_NAMES\[i\]/.test(src),
    'the control is hidden for a pacifist, which fights nobody — a faction picker there would be a lie');
}

done('build 1355: enemies can belong to a side, and sides fight each other');
