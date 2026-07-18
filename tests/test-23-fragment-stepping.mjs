// (build 39) Destruction debris froze in mid-air: updatePhysics early-returned when no dynamic PROP
// remained, so physWorld.step() never ran — but shatter fragments are dynamic bodies too. Shattering
// the last prop removed it, the world stopped stepping, and the fresh fragments hung until they expired.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { extractFunction, done, assert } from './harness.mjs';

// --- structural: the step guard now counts fragments, not just dynamicProps ---
const up = extractFunction('updatePhysics');
assert(/if\(!physWorld\) return;/.test(up), 'guards a missing world');
assert(/if\(!dynamicProps\.length && !fragments\.length && !_corpses\.length && !\(playerPhysMode && playerBody\)\)\{ physAccum = 0; return; \}/.test(up), 'only bails when there are NO props, NO fragments, NO ragdoll corpses, and the physics player controller is inactive');
assert(/while\(physAccum >= PHYS_DT[\s\S]*physWorld\.step\(\)/.test(up), 'still steps the world when something dynamic exists');
// the old buggy guard must be gone
assert(!/if\(!physWorld \|\| !dynamicProps\.length\) return;/.test(up), 'the prop-only early-return is gone');

// --- behavioral (real Rapier): a fragment-style body keeps falling as the world steps with NO props ---
await RAPIER.init();
const g = { x:0, y:-30, z:0 };                       // matches the game's gravity scale
const world = new RAPIER.World(g);
const rb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,5,0).setLinearDamping(0.1).setCcdEnabled(true));
world.createCollider(RAPIER.ColliderDesc.cuboid(0.1,0.1,0.1).setMass(0.4), rb);
const y0 = rb.translation().y;
for(let i=0;i<30;i++) world.step();                  // ~0.5s, exactly what the fixed loop now does
const y1 = rb.translation().y;
assert(y1 < y0 - 0.5, `fragment body falls when the world steps (y ${y0.toFixed(2)} -> ${y1.toFixed(2)})`);

done('fragments keep simulating after the last prop shatters');
