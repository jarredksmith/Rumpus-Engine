# Headless probes

The Node suite in `tests/` cannot see rendering or run a real session. These two files boot the *real*
game under headless Chromium and let a script read or drive anything inside it — which is how every
"measure it, don't argue about it" finding in `CLAUDE.md` was actually settled.

```
node tools/probe/mkprobe.mjs          # -> probe-out/probe.html + three.min.js
node your-probe.mjs                   # imports tools/probe/driver.mjs
```

```js
import { withGame } from './tools/probe/driver.mjs';
await withGame(async (P) => {
  console.log(await P('player.pos.toArray()'));
});
```

`P(code)` evaluates `code` inside the game closure. Return plain data — the result is structured-cloned,
so a `THREE.Object3D` either serialises to megabytes or throws.

## Things that have gone wrong here, more than once

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

## Measuring in the render equation's own space

Frame statistics cannot test a lighting hypothesis: an 8-bit post-ACES value compared against an
albedo-times-irradiance estimate mixes two spaces. Render the live scene into a `FloatType` target with
`toneMapping = NoToneMapping` and `outputEncoding = LinearEncoding` and you get the radiance the renderer
actually produced. `radiance / albedo` is then the irradiance the surface received — valid only for a
NON-emissive material, which is worth checking before you believe it.
