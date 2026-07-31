// build 1189: the bot brain's cover-break and flank, ported to ranged PvE enemies.
//
// PvP bots have hunted, flanked and broken for cover since builds 1003-1006; PvE gunners held a standoff
// ring and strafed — competent, but they never USED the level. Now a hit that drops a gunner under its
// bravery fraction sends it to real cover (the bots' own _botFindCover, reused VERBATIM because it only
// reads .pos) for a ~2.5s beat with a 9s cooldown, and with the player unseen it approaches the
// last-known spot from a side angle — the bots' exact 0.7-radian / 5-metre flank shape. Melee types are
// untouched: closing is their whole design. The boss deliberately does not cower.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the finder accepts the enemy shim
{
  // _botFindCover(b, tgt) reads b.pos.{x,y,z} and tgt.pos.{x,z} only — prove the shim works end to end,
  // with stubs that make "cover" mean "west of the wall at x=0".
  const find = new Function('ARENA', 'clearAt', '_botLOS',
    extractFunction('_botFindCover') + '\nreturn _botFindCover;'
  )(70, () => true, (x, z, tx, tz) => x < 0);   // LOS returns true (seen) only west of x=0 -> east is cover
  const spot = find({ pos: { x: 2, y: 1.4, z: 0 } }, { pos: { x: -12, z: 0 } });
  assert(spot && spot.x >= 0, 'the enemy-shaped shim {pos:{x,y,z}} finds a hidden spot (x=' + (spot && spot.x.toFixed(1)) + ') on the far side from the shooter');
  { // no cover anywhere -> null, and the caller keeps fighting instead of freezing
    const none = new Function('ARENA', 'clearAt', '_botLOS',
      extractFunction('_botFindCover') + '\nreturn _botFindCover;'
    )(70, () => true, () => true);   // everything visible
    eq(none({ pos: { x: 2, y: 1.4, z: 0 } }, { pos: { x: -12, z: 0 } }), null, 'an open field yields null — the trigger then simply does not fire');
  }
}

// ---------------------------------------------------------------- the trigger, replayed
{
  // the edge logic: a HIT (hp dropped) + under the bravery fraction + off cooldown
  const step = (en, nowMs) => {
    let fired = false;
    if (en._lastHp == null) en._lastHp = en.hp;
    if (en.hp < en._lastHp && en.hp / (en.maxHp || 1) < en.bravery && nowMs > (en._aiCoverCd || 0)) { fired = true; en._aiCoverCd = nowMs + 9000; }
    en._lastHp = en.hp;
    return fired;
  };
  const en = { hp: 24, maxHp: 24, bravery: 0.35 };
  eq(step(en, 1000), false, 'full health: no break');
  en.hp = 10; eq(step(en, 2000), false, 'hurt but above the bravery fraction (10/24 = 0.42): still fighting');
  en.hp = 7; eq(step(en, 3000), true, 'a hit dropping it under bravery (7/24 = 0.29) breaks for cover');
  en.hp = 5; eq(step(en, 4000), false, '...and the 9s cooldown stops it turtling on every subsequent hit');
  en.hp = 3; eq(step(en, 13000), true, 'past the cooldown, another chunking breaks again');
  en.hp = 3; eq(step(en, 23000), false, 'EDGE-triggered: sitting at low hp without a new hit never re-fires');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/burstGap:0\.09, strafe:true, cover:true \},/.test(src), 'the gunner opts in');
  assert(!/boss:[^\n]*cover:true/.test(src), 'the BOSS does not — a boss doesn\'t cower');
  assert(/cover: !!ty\.cover, bravery: ty\.cover \? \(0\.30 \+ Math\.random\(\)\*0\.15\) : 0, flankSide: Math\.random\(\)<0\.5\?1:-1,/.test(src),
    'the factory carries the brain fields; bravery is per-individual so a squad does not break in unison');
  assert(/const cv = _botFindCover\(\{ pos:\{ x:en\.mesh\.position\.x, y:en\.mesh\.position\.y-1\.4, z:en\.mesh\.position\.z \} \}, \{ pos:near\.pos \}\);/.test(src),
    'the enemy calls the bots\' own finder through the pos shim — one cover brain, not two');
  assert(/en\.hp < en\._lastHp && en\.hp\/\(en\.maxHp\|\|1\) < en\.bravery && nowMs > \(en\._aiCoverCd\|\|0\)/.test(src),
    'the trigger is hit-edge + bravery fraction + cooldown, exactly as replayed above');
  assert(/en\._aiCoverT = 2\.2 \+ Math\.random\(\)\*1\.2; en\._aiCoverCd = nowMs \+ 9000;/.test(src),
    'a ~2.5s beat and a 9s cooldown — cover is a beat, not a state, because PvE enemies do not heal and a health-gated state would turtle forever');
  { const flankEnemy = src.match(/const _ba = Math\.atan2\(td\.tz - en\.mesh\.position\.z, td\.tx - en\.mesh\.position\.x\) \+ en\.flankSide\*0\.7;/);
    const flankBot = src.match(/b\.flankSide\*0\.7/);
    assert(flankEnemy && flankBot, 'both flanks share the same 0.7-radian offset — one tuning, two AIs'); }
  assert(/if\(en\.cover && !editorOpen && typeof _botFindCover==='function'\)/.test(src),
    'the brain is gated per-type and never runs in the editor');
  assert(/else \{\n        \/\/ hold a standoff range/.test(src),
    'the original standoff body survives verbatim as the seen-and-healthy branch — builds 633\'s strafe and the standoff ring are unchanged');
}

done('build 1189: ranged PvE enemies use the level — a chunked gunner breaks for real cover (the bots\' finder, reused through a pos shim, proven against enemy-shaped input), holds a ~2.5s beat with a 9s no-turtle cooldown (edge-triggered, replayed), and flanks last-known positions at the bots\' exact angle — while melee types and the boss keep their designs');
