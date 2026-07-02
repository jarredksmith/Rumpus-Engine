// (build 829) TOP-VIEW ZOOM AT RACING SCALE — the editor's top view zoom-out was hard-capped at 110 world
// units (half-height), tuned for the old 400-max arena; on a 2000 half-size racing arena you could never see
// your own course. Three changes:
//  - the zoom-out cap now TRACKS the arena (max(110, ARENA*1.3)), so any arena fits on screen;
//  - zoom steps are MULTIPLICATIVE (a wheel notch scales ~12%), so zooming stays quick whether you're at
//    20 m or 2 km — the old linear +0.04/px was glacial when zoomed out;
//  - entering top view (T key or the toolbar button) starts FITTED to the whole arena instead of a fixed 75.
import { gameSource, assert, near, done } from './harness.mjs';
const src = gameSource();

// --- the wheel handler: arena-scaled cap + multiplicative step ---
assert(/topZoom = Math\.max\(6, Math\.min\(Math\.max\(110, ARENA\*1\.3\), topZoom \* \(1 \+ e\.deltaY\*0\.0012\)\)\)/.test(src), 'zoom-out cap tracks the arena and steps multiplicatively');

// --- entering top view fits the whole arena (both the T key and the toolbar button) ---
{
  const m = src.match(/topZoom=Math\.min\(Math\.max\(75, ARENA\*1\.12\), 2600\);/g);
  assert(m && m.length===2, 'both top-view toggles (T key + toolbar) enter fitted to the arena (found '+(m?m.length:0)+')');
}

// --- executable: the clamp math at both scales ---
{
  const step=(zoom, deltaY, ARENA)=>Math.max(6, Math.min(Math.max(110, ARENA*1.3), zoom*(1+deltaY*0.0012)));
  // small arena: behaves like before (cap 110)
  near(step(200, 100, 70), 110, 1e-9, 'small arena still caps at 110');
  // big arena: can zoom out to see the whole 2000 half-size course
  assert(step(2000, 100, 2000) > 2000, 'a 2 km arena allows zooming out past its own half-size');
  assert(step(3000, 100, 2000) <= 2600, 'but the cap still binds (ARENA*1.3)');
  // multiplicative: one notch at 2000 moves ~240 units (fast), not the old linear 4
  const before=2000, after=step(before, 100, 2000);
  assert(after-before > 100, 'zoom speed scales with zoom level (multiplicative step)');
  // fit-on-entry
  const fit=(A)=>Math.min(Math.max(75, A*1.12), 2600);
  near(fit(70), 78.4, 1e-9, 'a default arena enters at ~78 (like the old 75)');
  near(fit(2000), 2240, 1e-9, 'a 2 km arena enters showing the whole course');
}

done('build 829: top view sees the whole racing arena — arena-scaled zoom cap, multiplicative steps, fit on entry');
