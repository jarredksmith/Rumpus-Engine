// build 1175: a toppled corpse lies ON the floor, whatever its pivot.
//
// Reported from play: capsule enemies and a feet-origin GLB character (chub) both sank partway through the
// floor when they fell over. The build-994 fallback death lowered every corpse by a HARDCODED 1.0 as it
// tipped. A capsule (radius 0.7, centre origin) needs 0.7 — it was buried 0.3. A feet-origin model needs to
// RISE by half its width; dropping it 1.0 put the origin a metre underground. The drop is now MEASURED:
// apply the final topple quaternion once at death, take the real lying bounding box, and solve the y that
// rests its bottom exactly where the standing bottom was. The sink phase uses the lying thickness too.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the shape
{
  const fd = extractFunction('_fallbackDeath');
  assert(/dy = box0\.min\.y - box1\.min\.y;/.test(fd),
    'the drop is the DIFFERENCE of measured bottoms — + raises a feet-origin body, − lowers a centre-origin one');
  assert(/mesh\.quaternion\.copy\(q0\)\.premultiply\(_fcQ\); mesh\.updateMatrixWorld\(true\);/.test(fd),
    '...measured with the FINAL topple quaternion actually applied');
  assert(/mesh\.quaternion\.copy\(q0\); mesh\.updateMatrixWorld\(true\);/.test(fd),
    '...and restored, so the visible topple still animates from standing');
  assert(/sink = Math\.max\(0\.5, \(box1\.max\.y - box1\.min\.y\) \+ 0\.3\);/.test(fd),
    'the sink depth is the lying THICKNESS plus margin, not a constant');
  assert(/let dy=-1\.0, sink=1\.4;/.test(fd), 'an unmeasurable mesh falls back to the old constants rather than throwing');
  const uf = extractFunction('updateFadeCorpses');
  assert(/c\.y0 \+ e\*\(c\.dy!=null\?c\.dy:-1\.0\)/.test(uf), 'the topple animates to the measured resting height');
  assert(/- k\*\(c\.sink!=null\?c\.sink:1\.4\)/.test(uf), '...and the sink descends by the measured thickness');
  assert(!/c\.y0 - e\*1\.0/.test(uf), 'the hardcoded 1.0 drop is gone');
}

// ---------------------------------------------------------------- executed: the measurement, both pivots
{
  // drive the measuring logic with stub meshes whose bboxes we control
  const run = (standingMin, lyingMin, lyingMax) => {
    // replica of the measurement block
    const box0 = { min: { y: standingMin }, isEmpty: () => false };
    const box1 = { min: { y: lyingMin }, max: { y: lyingMax }, isEmpty: () => false };
    let dy = -1.0, sink = 1.4;
    if (isFinite(box0.min.y) && isFinite(box1.min.y)) {
      dy = box0.min.y - box1.min.y;
      sink = Math.max(0.5, (box1.max.y - box1.min.y) + 0.3);
    }
    return { dy, sink };
  };
  { // the default capsule: centre origin at y0=1.4, standing bottom 0, lying spans ±0.7 about the centre
    const r = run(0, 1.4 - 0.7, 1.4 + 0.7);
    near(r.dy, -0.7, 1e-9, 'a capsule drops exactly its radius (0.7) — the old 1.0 buried it 0.3');
    near(r.sink, 1.7, 1e-9, '...and sinks by its lying thickness (1.4) + margin');
  }
  { // the chub case: FEET origin at y0=0, standing bottom 0; lying spans about the feet: [-0.36, +0.36]
    const r = run(0, -0.36, 0.36);
    near(r.dy, +0.36, 1e-9, 'a feet-origin GLB RISES by half its width — the old code dropped it a metre underground');
  }
  { // a centre-origin GLB taller than wide behaves like the capsule, scaled
    const r = run(-0.95, -0.30, 0.30);
    near(r.dy, -0.65, 1e-9, 'an arbitrary pivot resolves to bottom-rests-on-ground, no special cases');
  }
}

done('build 1175: the fallback death measures the lying pose\'s real bounding box and rests it on the ground — a capsule drops its radius, a feet-origin GLB rises by half its width, and the sink phase descends by the measured thickness. Corpses lie on the floor instead of in it.');
