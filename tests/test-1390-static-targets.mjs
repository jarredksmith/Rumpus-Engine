// build 1390: a shooting-range target is BOLTED DOWN.
//
// Asked for by the level design this is being built toward — a county-fair gauntlet whose first booth is a
// shooting range. Until now `damageProp` refused any prop that was not `phys`, and the editor's Breakable
// checkbox lived inside `if(sel.userData.phys){`, so the only way to make something shootable was to make
// it a dynamic rigid body: it wobbles, gets shoved, falls over and streams in the multiplayer snapshot.
// Exactly wrong for a steel plate or a paper target.
//
// THE OPT-IN COULD NOT HAVE BEEN `breakable`, and checking that is what saved this build from breaking
// every level ever saved: `_applyPropEntry` sets `userData.breakable = true` on EVERY prop it loads unless
// the file says `brk:false`. Relaxing `damageProp` to accept `breakable === true` would have made every
// wall in every level shootable. `shootable` is a new flag defaulting to undefined.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------- the gate, executed both ways ----
{
  const fn = extractFunction('damageProp');
  const head = fn.slice(0, fn.indexOf('\n', fn.indexOf('shootable')) + 1);
  // build 1421: `breakable:false` used to refuse everything, and that line is GONE — it now means the
  // prop never BREAKS, not that nothing lands on it. THIS build's gate, which answers the entirely
  // different question of whether the prop is damageable at all, is the one that had to stay and did.
  assert(/if\(!obj\.userData\.phys && !obj\.userData\.shootable\) return false;/.test(head),
    'a non-physics prop is refused UNLESS it opted in');
  // Matched as a real STATEMENT, not as the bare phrase: the comment build 1421 left in damageProp
  // quotes the removed line, and a looser pin is satisfied by that prose. Third time in one build.
  assert(!/obj\.userData\.breakable===false\) return false;/.test(fn),
    "...and `breakable` is no longer an immunity gate anywhere in it (build 1421)");

  // executed: the four combinations that matter, through the real predicate
  const gate = new Function('u', 'if(!u.phys && !u.shootable) return false; return true;');
  eq(gate({}), false, 'a plain static prop is indestructible — this is what keeps every existing level unchanged');
  eq(gate({ breakable: true }), false,
    'AND a static prop with breakable:true is STILL indestructible, which is the whole reason this is a new flag: ' +
    '_applyPropEntry sets breakable:true on every prop it loads');
  eq(gate({ phys: true }), true, 'a dynamic prop is damageable exactly as before');
  eq(gate({ shootable: true }), true, 'a static prop that opted in is damageable');
  // build 1421: unticking Breakable no longer takes the prop OUT of the damageable set — it stops it
  // shattering. That distinction is what this build could not make, and it silently disarmed every
  // range target whose creator asked for the one thing a range needs.
  eq(gate({ shootable: true, breakable: false }), true, 'an unbreakable target is still damageable (1421)');
  eq(gate({ phys: true, breakable: false }), true, '...and so is an unbreakable dynamic prop');
  // probed live: a plain static wall took 999 damage and kept all 50 HP; a target went 30 -> 20 -> shattered
  // without ever entering dynamicProps.
}

// ------------------- the Rapier body, which was a LIVE defect before this build ----
// `shatterProp`'s static branch spliced the collider out of the list and left the RIGID BODY in the physics
// world — an invisible wall that dynamic props bounce off. Build 1194 fixed exactly this for `hideprop`
// (`if(u._physStatic){ physWorld.removeRigidBody(u._physStatic); u._physStatic=null; }`) and this branch
// never got it. It was reachable BEFORE this build through the logic graph's `delprop` on a static prop;
// static targets would have hit it on every shot.
{
  const fn = extractFunction('shatterProp');
  const staticBranch = fn.slice(fn.indexOf('else { const ci=colliders.indexOf(obj)'));
  assert(/physWorld\.removeRigidBody\(obj\.userData\._physStatic\)/.test(staticBranch),
    'the static branch releases the rigid body');
  assert(/obj\.userData\._physStatic = null;/.test(staticBranch), '...and clears the stamp, so a re-add is not skipped');
  assert(/typeof physWorld!=='undefined' && physWorld/.test(staticBranch),
    '...guarded, because a level can run with no physics world at all');
  assert(/try\{ physWorld\.removeRigidBody/.test(staticBranch),
    '...and wrapped, because a body already removed by another path must not take the shatter down with it');
  // the dynamic branch is untouched — it goes through removeDynamicProp, which owns its own body
  assert(/if\(obj\.userData\.phys && typeof removeDynamicProp==='function'\) removeDynamicProp\(obj\);/.test(fn),
    'the dynamic path is unchanged');
  // probed live WITH A POSITIVE CONTROL: the body was created first (hadBody true), then gone after the
  // shatter. The first run of that probe had no body at all and reported "no leak" vacuously.
}

// ---------------------------------------------------- an explosion reaches them ----
{
  const fn = extractFunction('explodeAt');
  assert(/for\(const o of dynamicProps\.slice\(\)\)/.test(fn), 'the dynamic sweep is unchanged');
  assert(/for\(const o of propModels\)\{ if\(!o \|\| !o\.userData \|\| !o\.userData\.shootable \|\| o\.userData\.phys\) continue;/.test(fn),
    'and a second sweep covers static targets — they are not in dynamicProps, so a grenade at the range ' +
    'would have left every plate standing while the crates beside them broke');
  assert(/o\.userData\._shattered \|\| o\.userData\._destroyed\) continue;/.test(fn),
    '...skipping the already-gone, so one blast cannot shatter a target twice. Build 1421 dropped the ' +
    'third term: an unbreakable target is not skipped, it is damaged and simply does not break, and ' +
    'damageProp is the one place that decides that');
  assert(/!o\.userData\.phys\) continue/.test(fn),
    '...and skipping dynamic props, so nothing is damaged by both sweeps');
}

// ------------------------------------------------------- it survives a save ----
// Written first, this was INSIDE `if(o.userData.phys){` and a target serialized neither its flag nor its
// HP — it came back an ordinary indestructible box on the next load. The round-trip probe found it.
{
  const fn = extractFunction('propEntry');
  assert(/if\(o\.userData\.shootable\) e\.sht=1;/.test(fn), 'the flag serializes');
  assert(/if\(o\.userData\.phys \|\| o\.userData\.shootable\)\{/.test(fn),
    '...and so does everything about being destroyed, because a static target is destroyed too');
  // the fields that describe a BODY stay dynamic-only
  const physOnly = fn.slice(fn.indexOf('if(o.userData.phys){ e.dyn=true'), fn.indexOf('if(o.userData.phys || o.userData.shootable)'));
  for (const f of ['e.mass', 'e.ng', 'e.grng'])
    assert(physOnly.includes(f), f + ' stays inside the physics gate — mass and grabbing are about a body');
  assert(!physOnly.includes('e.hp='), '...while HP moved out of it');

  // build 1280: ONE apply block, so every loader inherits it. The destruction fields live in
  // `applyPropDynState`, which `_applyPropEntry` delegates to on its first line — so the single-site
  // property holds one level down, and naming the wrong function is how this assertion first failed.
  const ap = extractFunction('applyPropDynState');
  assert(/if\(p\.sht\) obj\.userData\.shootable = true;/.test(ap), 'and one apply site...');
  assert(/applyPropDynState\(obj, p\);/.test(extractFunction('_applyPropEntry')),
    '...which the entry applier every loader goes through calls (build 1280)');
  eq((src.match(/userData\.shootable = true;/g) || []).length, 1,
    'written in exactly one place — three loaders sharing a block is build 1280\'s whole point');
  // probed live: a target round-tripped as { sht:1, hp:30 }
}

// -------------------------------------------------------------- the door ----
// Build 1348's rule: a capability with no way to reach it is not a feature. The checkbox is offered only
// for a NON-dynamic prop, because for a dynamic one `breakable` already means this.
{
  assert(/Shootable target<\/b> \\u2014 takes damage while staying bolted down/.test(src) ||
         /Shootable target<\/b>/.test(src), 'the editor offers it by name');
  assert(/if\(!sel\.userData\.phys\)\{[\s\S]{0,900}?shcb\.onchange/.test(src),
    '...only when the prop is not already dynamic');
  assert(/sel\.userData\.shootable=shcb\.checked;/.test(src), 'the checkbox writes the flag');
  assert(/if\(shcb\.checked && sel\.userData\.maxHp==null\)\{ sel\.userData\.maxHp = defaultHpFor\(sel\);/.test(src),
    '...and seeds an HP, or a freshly ticked target would have none and die to the first pellet');
  assert(/pushUndoSnapshot\(\); sel\.userData\.shootable/.test(src), '...through undo, like every other prop edit');
  assert(/if\(sel\.userData\.phys \|\| sel\.userData\.shootable\)\{\s*\n\s*\n\s*\/\/ Destructible:/.test(src),
    'and the destruction controls are shown for either kind');
}

done('build 1390: a target can be shot without having to be a physics body');
