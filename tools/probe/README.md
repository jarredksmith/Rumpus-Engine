# Headless probes

The Node suite in `tests/` cannot see rendering or run a real session. These two files boot the *real*
game under headless Chromium and let a script read or drive anything inside it — which is how every
"measure it, don't argue about it" finding in `CLAUDE.md` was actually settled.

```
node tools/probe/mkprobe.mjs              # -> probe-out/ (gitignored: a 3.5 MB copy of the game)
node tools/probe/bloom-threshold.mjs      # any probe in this folder
```

```js
import { withGame } from './driver.mjs';
await withGame(async (P) => {
  console.log(await P('player.pos.toArray()'));
});
```

`probe-out/` is BUILD OUTPUT and is gitignored. It holds a rewritten copy of `breach.html` carrying an
`eval` trampoline, which has no business in a repo whose root is the published site — it was committed
once by accident and removed in build 1293's follow-up.

## The probes kept here

| file | what it measures |
|---|---|
| `scene-range.mjs` | scene-linear radiance histogram — how much dynamic range a frame really carries |
| `bloom-threshold.mjs` | what fraction of the frame blooms, swept across exposure (build 1292) |
| `editor-panel.mjs` | panel DOM nodes and render cost per editor mode (build 1293) |
| `editor-timing.mjs` | the play/edit round trip, and what it is made of |
| `camera-bank.mjs` | the fixed-camera bank cutting between mounts on its dwell (build 1410) |
| `sign-prop.mjs` | that a world sign actually DRAWS, and that a live one repaints (build 1411) |
| `sign-boot-tdz.mjs` | that a SAVED level with a live sign still boots — `withGame(..., {savedLevel})` (1411) |
| `objective-marker.mjs` | where an on-screen marker actually lands, including behind you (build 1412) |
| `chase-pivot.mjs` | the third-person camera's height through the whole boom, per character (1413) |
| `fair-hub.mjs` | builds 1410/1411/1412 driven TOGETHER — the composition, not the features |
| `point-shadow-cost.mjs` | what a point-light shadow costs, in DRAW CALLS — the measurement build 1348 could not get to close (1414) |
| `point-shadow-blocks.mjs` | that a wall actually blocks the lamp, on pixels, with shadow-off as the control (1414) |
| `doorway-state.mjs` | whether a level-to-level DOORWAY carries the run — score, inventory, checkpoint (1415) |
| `campaign-carry.mjs` | whether a carried value survives a room that never declared it (1416) |
| `shadow-slot-dark.mjs` | whether a lamp a signal switched off still spends a shadow slot (1417) |
| `level-roundtrip.mjs` | is serialize -> restore -> serialize idempotent? the whole-level save/load check (1418) |
| `local-model-draco.mjs` | a dragged-in .glb gets Draco/KTX2/meshopt, and a codec failure retries (1419) |
| `share-link-size.mjs` | how big a share link gets as a level grows — the codec is lossless, so size is the question |
| `saved-level-boot.mjs` | does a saved level containing EVERY primitive boot? build 1331's rule, checked |
| `gauntlet-scale.mjs` | what a 959-prop level costs in draw calls and triangles, batched and culled |
| `range-booth-level.mjs` | the gauntlet's range booth authored, SAVED, reloaded and then shot — the round trip no other probe covers |
| `physics-booth-level.mjs` | the physics booth through the same round trip — found build 1427's lost fuse |
| `stage-ktx2.mjs` | not a probe — stages a LOCAL KTX2 loader + Basis transcoder so KTX2 can be measured headless |
| `ktx2-barrel.mjs` | what material the engine actually builds from a reported KTX2 model |
| `ktx2-encoding.mjs` | the A/B that found build 1429: data maps arriving sRGB-decoded |
| `ai-booth-level.mjs` | the AI booth authored, SAVED, reloaded and then played — 12 marker fields, mods, manifest |
| `nocol-physics.mjs` | build 1428: does a decoration-only prop still get a Rapier body (it did) |
| `heavy-model.mjs` | what a half-million-triangle prop costs: collider derivation and Rapier trimesh build, at three counts |
| `geo-census.mjs` | build 1425: Level Check names the heaviest model, in the RENDERED panel |
| `perf-idle.mjs` | build 1426: work inside the frame callback vs waiting outside it |
| `unbreakable-target.mjs` | build 1421: an unbreakable prop registers hits and never breaks, with a breakable control |
| `destroy-objective.mjs` | build 1422: a Destroy mission counts static targets and refuses ones that cannot be destroyed |
| `objective-check.mjs` | build 1423: Level Check reports an objective that cannot be completed, in the RENDERED panel |

`P(code)` evaluates `code` inside the game closure. Return plain data — the result is structured-cloned,
so a `THREE.Object3D` either serialises to megabytes or throws.

## Things that have gone wrong here, more than once

**The staleness stamp was blind for the whole life of every build (1414).** `assertFreshStaging` compared
`BUILD_VERSION` — a value this project's workflow bumps LAST. So from a build's first edit until its final
commit the repo and the staging carried the same version string and different code, and the guard said
fresh. It is a CONTENT HASH now. If you are ever tempted to key a freshness check on something a human
updates by hand, don't: hash the bytes.

**`renderer.info.autoReset` is FALSE (build 1122b), and `loop()` owns the one reset per frame.** A probe
that calls `renderScene`/`renderer.render` directly and reads `renderer.info.render` is reading a RUNNING
TOTAL — the counts climb monotonically through a sweep and keep climbing on the return to the baseline.
`point-shadow-cost` found this only because its control failed. Call `renderer.info.reset()` per sample.

**Run the lint AFTER the last edit, not before the first.** A backtick inside a probe's page-code template
closes the literal and Node reports it at an innocent line. It has now cost nine cycles, and build 1415's
was in a comment added *after* a clean lint run.

**Instancing runs at DEPLOY.** Any prop-count measurement taken without calling `buildInstancing()` is the
EDITOR's cost, not the player's — 959 props read 1,327 draw calls un-deployed and 844 deployed. Measure the
state the question is about.

**A slice is only as good as BOTH of its ends.** Extracting the primitive table by running to a function
name thousands of lines below it swept up 43 identifiers from unrelated objects. If a probe derives its own
inputs from the source, give it a SHAPE GUARD that refuses to run on an implausible extraction and prints
what it got — it caught this twice in one probe.

**An empty saved level is not a control.** With no props the engine falls back to its own default level, so
the seeded path is never exercised and the run reports the stock scene. Seed one real prop.

**A container rollback defeats the staleness guard (1418).** It reverts `probe-out/` along with the repo,
so the two agree and the hash check passes — it detects "you forgot to re-stage", not "the filesystem went
back in time". If a probe reports that a feature several builds old does not exist, check `git log` FIRST.

**A fixture that is still simulating is not a fixture (1418).** A dynamic physics prop settles between two
serializes and reads exactly like format drift. The control caught it; without one it would have shipped as
a finding.

**Programs are cached for the life of the page.** A recompile measurement has to run BEFORE anything else
has exercised that shader variant, or it reads 0 and looks like a refutation.

- **`window.__probe` does not exist until the start button is clicked.** The hook is declared inside
  `startGame`. Waiting for the hook before clicking hangs for the full timeout.
- **Click `#startBtn` through `page.evaluate`, not `page.click`** — the real click hangs under SwiftShader.
- **Never poll per-frame state from Node.** Round trips are slower than the frames you are sampling. Define
  a recorder inside the closure that pushes to an array off `requestAnimationFrame` and return the whole
  array in one call. A 130-frame trial polled from Node times out; recorded in-page it takes seconds.
- **Take a control pair.** `postGrain` is stochastic per frame, the weapon sways, animations have phase and
  the camera settles — each of those exceeds most effects being looked for. Build 1152 lost six measurements
  to this and would have published two of them as findings.
- **Read WHO before attributing anything to a surface.** A region picked by eye off a screenshot is a guess
  about geometry; raycast and print the mesh, its material and its `src` first.
- **The first read after a state change can be stale.** Take several and look at whether they agree.
- **`lint.mjs` was passing vacuously until build 1413.** Its opener required the page code's `(` to sit
  immediately after the backtick, and every `DRIVE_RIG` probe puts it on the next line — so those files
  were reported clean without being examined. Fixed both ways (whitespace tolerated; a literal it cannot
  parse is now reported as NOT CHECKED rather than counted clean). If you change the shape a probe opens
  its page code with, check the lint still finds it.
- **`__drive` VIRTUALISES `performance.now()`.** drive.mjs installs a pure counter for the duration of a
  drive and restores the real clock on the way out, so anything the engine times off that clock — the
  camera bank's dwell, the chase camera's damping — only advances inside a drive. Sleeping in Node
  advances a clock the engine is not reading, and the drives have to be ONE eval: between `probe()` calls
  the real clock is back, ~1e5 ms behind the virtual one, so the next drive's first frame looks like a
  hundred-second gap to every pause guard in the file (build 1410 lost two readings to each half).
- **A sampling stride that DIVIDES the period under test measures the boundary, not the behaviour.**
  Sampling every 500 ms against a 2 s dwell put every cut on the exact boundary frame, and float drift in
  `__vnow += (1/60)*1000` decided whether the last one fired.

**A round-trip failure and a probe writing the wrong field look identical.** `range-booth-level.mjs`
reported "the HUD widget did not survive the save" — the widget had never been authored, because widgets
live in a top-level `hudWidgets` array and the probe set `hudCfg.widgets`, which nothing serializes. Read
the SERIALIZER for the field you are about to claim was dropped.

**"Reproduces the first save" is not "is stable", and only the second is worth asserting.** The same probe
reported the level format non-idempotent. It is, once: `aim.state.ry` differs from `aimWep[curWep].ry` by
one ULP at boot and the loader makes the global pose adopt the per-weapon one. Cycles 1 onward are
byte-identical. A value that moves a LITTLE EVERY TIME is a level that degrades on every autosave — that is
build 1420's subject and the thing to test for; a one-time normalisation is not it.

**"Failed to fetch dynamically imported module" names the module you asked for, not the one that is
missing.** `stage-ktx2.mjs` copied three files by a hand-written list and missed `libs/zstddec.module.js`, a
transitive import two levels down. Chromium reported the failure against `KTX2Loader.js` — the url I had
just rewritten — so it read exactly like the rewrite being wrong, and the loader silently stayed
unavailable for a whole measurement cycle. The staging FOLLOWS the import graph now. A hand-kept list of
anything in this repo is a defect waiting (builds 1320, 1326), including in the instruments.

**Zeroing a `worldCfg` field is not zeroing the effect.** `applyWorldCfg()` DERIVES the module vars the
render path reads (`_postMotion`, `_postGrain`), so a probe that sets `worldCfg.postGrain = 0` and renders
has changed nothing. The A/B for build 1429 first measured a control that moved 59% of the frame for this
reason, compounded by build 1238's motion blur, which reprojects against the camera's PREVIOUS rotation and
therefore makes two renders of one pose legitimately differ. Zero them, CALL `applyWorldCfg()`, and take a
warm-up shot; the control then returns exactly 0 and the measurement is worth reading.

## Measuring in the render equation's own space

Frame statistics cannot test a lighting hypothesis: an 8-bit post-ACES value compared against an
albedo-times-irradiance estimate mixes two spaces. Render the live scene into a `FloatType` target with
`toneMapping = NoToneMapping` and `outputEncoding = LinearEncoding` and you get the radiance the renderer
actually produced. `radiance / albedo` is then the irradiance the surface received — valid only for a
NON-emissive material, which is worth checking before you believe it.
