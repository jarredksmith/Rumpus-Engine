// (build 122) PvP fix: dying with a loot crate open no longer soft-locks. The shop is closed on death,
// the loop never freezes while waiting to respawn, and crates can't be opened while dead.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

const dd = extractFunction('duelDie');
assert(/if\(shopOpen\) closeShop\(\);/.test(dd), 'death closes an open shop');
assert(/choosingUpgrade = false;/.test(dd), 'death clears upgrade picker');

  // build 1478 added a sixth term to the frame loop's freeze gate and broke five harnesses at once, every
  // one of their assertions still TRUE — they had each quoted the WHOLE condition to assert one thing about
  // it. That is build 1468's own recorded trap one line over: a pin that quotes a whole condition is a pin
  // against the condition's NEIGHBOURS. They assert MEMBERSHIP now.
{ const gate = src.match(/if\(\(shopOpen \|\| choosingUpgrade[^\n]*?\) \{ pollGamepad/);
  assert(gate, 'the frame loop has a freeze gate');
  assert(/&& !\(duelDead && pvpMode\(\)\)\)/.test(gate[0]),
    'loop never freezes while waiting to respawn \u2014 whatever else is in the gate'); }
assert(/if\(duelDead\) return;\s*\/\/ no shopping while waiting to respawn/.test(extractFunction('openShop')), 'cannot open a crate while dead');
done('respawn shop fix');
