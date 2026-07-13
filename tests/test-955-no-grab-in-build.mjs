// (build 955) NO GRABBING WHILE BUILDING. With the build radial open or a placement ghost in
// hand, the "[G] Grab" hint still showed and G/MMB/pad-Y could pick up a placed prop — the
// player ended up carrying a physics prop AND the ghost at once. Now: tryGrabProp refuses while
// buildMode/radialOpen, the hint's availability scan skips those states, and enterBuildMode
// drops anything already carried. Verified live (headless, _aimedProp stubbed to isolate the
// gate): grab works normally → refused in buildMode → hint display:none → carried prop released
// on enterBuildMode → refused with radialOpen. All ten checks green.
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

// the action gate — first thing after the classic availability gate
assert(/function tryGrabProp\(\)\{\n  if\(!gameOn \|\| editorOpen \|\| shopOpen \|\| paused \|\| duelDead\) return false;\n  if\(typeof buildMode!=='undefined' && \(buildMode \|\| radialOpen\)\) return false;/.test(src),
  'tryGrabProp refuses while buildMode or radialOpen');

// the hint gate — the availability scan skips build states
assert(/const aimed = \(gameOn && !editorOpen && !shopOpen && !paused && !duelDead && !\(typeof buildMode!=='undefined' && \(buildMode \|\| radialOpen\)\)\) \? _aimedProp\(\) : null;/.test(src),
  'tickGrabHint does not advertise grabbing while building');

// entering build mode drops a carried prop
assert(/exitBuildMode\(\);\n  if\(typeof releaseHeld==='function'\) releaseHeld\(\);/.test(src),
  'enterBuildMode releases a carried prop');

done('build 955: grabbing is gated off while the build radial / placement ghost is active');
