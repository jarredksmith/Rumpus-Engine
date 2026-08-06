// (build 1348) THREE CAPABILITIES THAT EXISTED AND COULD NOT BE FOUND.
// None of this adds an ability. Each one adds a DOOR to something already shipped, which the content-
// pipeline audit's own framing calls the difference between having a feature and having a product.
//
//  1. LOCAL .glb IMPORT (build 1177) was reachable from exactly one place: a viewport DROP handler. So the
//     only string in the product that mentioned it was the FAILURE toast after dropping the wrong file —
//     you had to already know, and get it wrong, to be told. And a tablet has no drag-and-drop at all, so
//     for touch creators the feature did not exist: both `input[type=file]` in the file accept
//     `.rumpus,.breach,.json` — LEVELS, not models.
//  2. A POINT LIGHT cannot cast a shadow (build 1132, for a real reason — a cube map is six depth passes)
//     and the checkbox was simply ABSENT with no explanation. Measured on the shipped stock level:
//     29 point lights, ZERO casting. A creator lighting a room gets light through the walls and the
//     product says nothing.
//  3. THE INSTANT /game/ PUBLISH (build 972) is the fastest way to share and its only button lives inside
//     the "Title screen" section — and, verified here, inside `#hpFields`, which is `display:none` until
//     the Custom title screen checkbox is ticked. So it was filed under the wrong noun AND hidden behind
//     a different feature's toggle.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- 1. the file picker ----
{
  const f = extractFunction('_pickLocalModel', src);
  assert(/accept = '\.glb,\.gltf/.test(f), 'it asks for models');
  assert(!/rumpus|\.json'/.test(f.replace(/gltf\+json/g, '')),
    '...and not for level files, which is what both pre-existing file inputs accept');
  assert(/_importLocalModel\(f\)/.test(f),
    'it calls the SAME function the drop handler calls — a door, not a second code path, so it cannot ' +
    'drift from the drag-and-drop route');
  assert(/inp\.remove\(\)/.test(f), 'and it cleans up its input');
  assert(/#edPickLocal/.test(src) || /edPickLocal/.test(src), 'a button exists for it');
  assert(/Stays on this device/.test(src),
    "build 1177's honesty is restated where the choice is made, not only in Level Check");
}

// ---- 2. the point light explains itself ----
{
  const i = src.indexOf("if(g0.userData.ltype==='point'){");
  assert(i > 0, 'the point-light branch exists in the light panel');
  const blk = src.slice(i, i + 900);
  // build 1414 IMPLEMENTED the thing this branch used to only explain, so the notice's subject changed
  // from a limitation to a price. The intent 1348 pinned — the creator is told the consequence in their
  // own terms at the point of decision, and pointed at the cheaper alternative — is unchanged.
  assert(/cube/.test(blk) && /six/.test(blk), 'it states the cost in the creator’s terms');
  assert(/Spot/.test(blk), '...and names the cheaper alternative');
  assert(/90 draw calls/.test(blk),
    '...with the measured figure, not an adjective (tools/probe/point-shadow-cost.mjs)');
  assert(/six depth passes/.test(src.slice(Math.max(0, i - 1800), i)),
    'the reason build 1132 refused is recorded at the site, so the cost is never mistaken for free');
  // and the two measured facts that decided explain-vs-implement
  assert(/54 -> 65 programs/.test(src),
    'the recompile measurement is recorded — flipping castShadow rebuilt 11 programs in one frame, so a ' +
    'point shadow can never be a runtime toggle (builds 636/977/1153/1155)');
  assert(/FAILED its own control/.test(src),
    'and the frame-cost sweep is recorded as FAILED rather than quoted: its 0-caster baseline read 396 ms ' +
    'and the return to 0 read 554 ms, so there is no honest cost figure to ship a cube shadow against');
}

// ---- 3. the instant publish, on the card where publishing happens ----
{
  assert(/id="edGoInstant"/.test(src), 'the link exists');
  // the card is built as a string concatenation with a comment block in the middle, so match from the
  // card's opening to the Optimize row that follows it rather than to the first closing div
  const ci = src.indexOf('<div class="edPublishCard">');
  const cj = src.indexOf('edOptimizeAll', ci);
  assert(ci > 0 && cj > ci && src.slice(ci, cj).indexOf('edGoInstant') > 0,
    '...inside the publish card, not somewhere else');
  const h = src.match(/const inst = p\.querySelector\('#edGoInstant'\);[\s\S]{0,1200}?\n  \};/);
  assert(h, 'it is wired');
  assert(/_edRevealHost\('edHomePanel'\)/.test(h[0]),
    'it REVEALS the real control rather than duplicating the publish logic — one publish path');
  assert(/on && !on\.checked\) \? on : pub/.test(h[0]),
    'and it scrolls to the PREREQUISITE when that is unmet: a game page IS the title screen, so hpPublish ' +
    'refuses without it and the row is display:none until then. Revealing a control that will refuse is ' +
    'the same dead click build 1147 removed');
  assert(!/hpOn\.checked = true|on\.checked = true/.test(h[0]),
    'it never ticks the checkbox on the creator’s behalf');
}

// ---- the latent bug found while verifying 3 ----
// Build 1293 stopped building any section whose offsetParent is null and made the fold-toggle HANDLER
// responsible for re-rendering on expand. `_edRevealHost` uncollapses the section DIRECTLY, so it bypassed
// that handler and could reveal an empty fold — including build 1320's own `Model...` menu entry.
{
  const f = extractFunction('_edRevealHost', src);
  assert(/renderEditorFields\(\)/.test(f),
    'revealing a fold re-renders it, or build 1293 leaves it empty');
  const a = f.indexOf("sec.classList.remove('collapsed')");
  const b = f.indexOf('renderEditorFields()');
  const c = f.indexOf('scrollIntoView');
  assert(a >= 0 && b > a && c > b,
    'and in that order: uncollapse, build, then scroll — scrolling to an unbuilt fold lands nowhere');
}

done('build 1348: local models are importable on a tablet, point lights say why they leak, and the fastest publish is on the publish card');
