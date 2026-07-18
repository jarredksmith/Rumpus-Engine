// Enemy AI (build 30+): the actual separation pass from source spreads piled-up enemies apart;
// far-apart enemies are left alone; footprint feeds spacing. Plus structural checks that the AI
// now collides against dynamic props and uses a stop distance.
import { extractBetween, gameSource, done, assert } from './harness.mjs';

// Pull the real Phase-2 separation loop out of the tick and run it on synthetic enemies.
const sepBody = extractBetween("can't push anyone through a wall.", '// Phase 3 — obstacle');
const runSeparation = new Function('enemies', 'dt', '"use strict";\n' + sepBody);   // build 995: the pass slides at 3.5 m/s, so it needs the frame dt

const mkEnemy = (id, x, z, fp = 0.9) => ({ id, mesh: { position: { x, z }, userData: { footprint: fp } } });
function minPairDist(es) {
  let m = Infinity;
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    m = Math.min(m, Math.hypot(es[i].mesh.position.x - es[j].mesh.position.x, es[i].mesh.position.z - es[j].mesh.position.z));
  }
  return m;
}

// 1) five enemies stacked on the same point must spread apart
let es = [0,1,2,3,4].map(i => mkEnemy(i + 1, 0, 0));
for (let k = 0; k < 240; k++) runSeparation(es, 0.016);   // iterate the real pass to convergence (build 995: capped slide needs more, smaller steps)
const target = Math.min(4, 0.9 + 0.9);             // expected min spacing (sum of footprints, capped)
assert(minPairDist(es) >= target - 0.08, `stacked enemies separate to ~${target} (got ${minPairDist(es).toFixed(3)})`);
assert(es.every(e => Number.isFinite(e.mesh.position.x) && Number.isFinite(e.mesh.position.z)), 'positions stay finite');

// 2) already well-separated enemies are not disturbed
es = [mkEnemy(1, -10, 0), mkEnemy(2, 10, 0), mkEnemy(3, 0, 10)];
const before = JSON.stringify(es.map(e => e.mesh.position));
runSeparation(es, 0.016);
assert(JSON.stringify(es.map(e => e.mesh.position)) === before, 'far-apart enemies are untouched');

// 3) bigger footprints push to a wider spacing
es = [mkEnemy(1, 0, 0, 1.6), mkEnemy(2, 0.2, 0, 1.6)];
for (let k = 0; k < 240; k++) runSeparation(es, 0.016);
assert(minPairDist(es) >= Math.min(4, 3.2) - 0.1, 'large-footprint enemies space out to their combined size');

// --- structural: AI collides with dynamic props + uses a stop distance + real footprint ---
const aiSection = gameSource().slice(gameSource().indexOf('// enemy AI (host / solo'));
const block = aiSection.slice(0, aiSection.indexOf('// physics: host/solo'));
assert(/for\(const obj of dynamicProps\)/.test(block), 'enemy AI now resolves against dynamic props');
assert(/userData\.footprint/.test(block), 'enemy AI uses each enemy real footprint radius');
assert(/stopAt = td\.chase \? \(fp \+ 0\.9\)/.test(block) && /d > stopAt/.test(block), 'enemy AI stops just outside melee when chasing (footprint-aware, no bulldozing)');
assert(/Phase 2 — separation/.test(block), 'separation phase present');
done('enemy AI separation + obstacle/stop behavior');
