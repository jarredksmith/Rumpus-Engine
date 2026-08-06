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

## Measuring in the render equation's own space

Frame statistics cannot test a lighting hypothesis: an 8-bit post-ACES value compared against an
albedo-times-irradiance estimate mixes two spaces. Render the live scene into a `FloatType` target with
`toneMapping = NoToneMapping` and `outputEncoding = LinearEncoding` and you get the radiance the renderer
actually produced. `radiance / albedo` is then the irradiance the surface received — valid only for a
NON-emissive material, which is worth checking before you believe it.
