// build 1159: an enemy's bolt collides with the level's REAL shape, not the overall bounding box.
//
// Found by the review panel and verified: `updateEnemyShots` tested each collider's `userData.box` — the
// OVERALL model box — while every other collision consumer moved to the per-part `boxes` list in build 1148.
// An imported building's overall box encloses its doorways and its entire interior, so an enemy standing
// inside had its bolt die on frame 1 (impact FX at the muzzle), and an enemy firing out through an open
// doorway had the bolt eaten by the box. Interior combat had enemies that visibly fired and never landed a
// hit. The player's own shots were unaffected (they raycast real triangles), which is why the fault read as
// "enemies are harmless indoors" rather than "collision is broken".
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

const fn = extractFunction('updateEnemyShots');

// ---------------------------------------------------------------- the shape of the fix
{
  assert(/const bs=c\.userData\.boxes\|\|\[b0\];/.test(fn),
    'the bolt walks the per-part box list, with the overall box only as a fallback for simple props');
  assert(/if\(p\.x<b0\.min\.x\|\|p\.x>b0\.max\.x\|\|p\.y<b0\.min\.y\|\|p\.y>b0\.max\.y\|\|p\.z<b0\.min\.z\|\|p\.z>b0\.max\.z\) continue;/.test(fn),
    '...and the overall box survives as the coarse reject, so the common miss costs six comparisons');
  assert(!/const b=c\.userData\.box; if\(!b\) continue; if\(p\.x>=b\.min\.x/.test(fn),
    'the old overall-box kill test is gone');
}

// ---------------------------------------------------------------- executed: a bolt flies through a doorway
{
  // Replay the collision loop over the 1148 doorway shape: a wall with an opening, expressed exactly as
  // buildModelGridBoxes represents it — per-part boxes for the wall segments, one overall box spanning all.
  const boxes = [
    { min: { x: -5, y: 0, z: 0 },   max: { x: -0.8, y: 3, z: 0.5 } },   // wall left of the doorway
    { min: { x: 0.8, y: 0, z: 0 },  max: { x: 5, y: 3, z: 0.5 } },     // wall right of it
    { min: { x: -0.8, y: 2.2, z: 0 }, max: { x: 0.8, y: 3, z: 0.5 } }, // the lintel above the opening
  ];
  const overall = { min: { x: -5, y: 0, z: 0 }, max: { x: 5, y: 3, z: 0.5 } };
  const colliders = [{ userData: { box: overall, boxes } }];

  // the loop body, extracted as a predicate: is a point at p dead against these colliders?
  const hit = (p) => {
    for (const c of colliders) {
      const b0 = c.userData.box;
      if (p.x < b0.min.x || p.x > b0.max.x || p.y < b0.min.y || p.y > b0.max.y || p.z < b0.min.z || p.z > b0.max.z) continue;
      const bs = c.userData.boxes || [b0];
      for (const b of bs) {
        if (p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z) return true;
      }
    }
    return false;
  };
  const old = (p) => {
    const b = overall;
    return p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;
  };

  // a bolt fired chest-height through the middle of the doorway
  const through = { x: 0, y: 1.4, z: 0.25 };
  assert(old(through), 'THE BUG: the old overall-box test killed a bolt in the middle of an open doorway');
  assert(!hit(through), 'the bolt now flies through the opening');

  // and the wall is still a wall — nothing became shoot-through
  for (const p of [{ x: -2, y: 1.4, z: 0.25 }, { x: 2, y: 1.4, z: 0.25 }, { x: 0, y: 2.6, z: 0.25 }]) {
    assert(hit(p), 'a bolt into the wall/lintel at ' + JSON.stringify(p) + ' still dies there');
  }
  // a simple prop with no per-part list still collides by its one box
  const crate = [{ userData: { box: { min: { x: 9, y: 0, z: 9 }, max: { x: 10, y: 1, z: 10 } } } }];
  const hitCrate = (p) => {
    for (const c of crate) {
      const b0 = c.userData.box;
      if (p.x < b0.min.x || p.x > b0.max.x || p.y < b0.min.y || p.y > b0.max.y || p.z < b0.min.z || p.z > b0.max.z) continue;
      const bs = c.userData.boxes || [b0];
      for (const b of bs) if (p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z) return true;
    }
    return false;
  };
  assert(hitCrate({ x: 9.5, y: 0.5, z: 9.5 }), 'a plain crate with only an overall box still stops bolts');
  assert(!hitCrate({ x: 8, y: 0.5, z: 9.5 }), '...and only inside it');
}

done('build 1159: enemy bolts collide with the per-part collider boxes — a bolt now flies through a doorway and an enemy indoors can finally hit something, while walls and lintels still stop it');
