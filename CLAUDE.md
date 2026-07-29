# RUMPUS ENGINE (formerly BREACH) — project guide for Claude Code

RUMPUS ENGINE is a **single-file browser game studio** — build worlds, play them (FPS,
racing, top-down, side-scroll), share them. Everything ships in one file, `breach.html`
(~30,000 lines). It uses three.js **r149** (UMD global: `const THREE = window.THREE`),
the Rapier physics engine, and PeerJS/WebRTC for multiplayer. There is **no build step** —
you open `breach.html` directly in a browser.

The author is Jarred Smith. The goal is a public release.

## Branding (build 952 rebrand)

The **visible name** is RUMPUS ENGINE; the **compatibility identifiers** deliberately keep
the old name — do NOT "clean these up":
- `breach.html` / `breach-help.html` filenames = live GitHub Pages URLs.
- `breach_*` localStorage keys = players' existing saves and settings.
- Share codes: new exports emit `RUMPUSLVL:` and download as `.rumpus`, but `BREACHLVL:`
  codes and `.breach` files must import forever, and the publish Action accepts both prefixes.
- Repo/community URLs still say `jarredksmith/breach` unless the repo itself is renamed
  (a user decision — it changes the Pages URL and would need a follow-up build).

## Repository layout

```
breach.html          # the entire game — the one source of truth
CLAUDE.md            # this file
server/              # self-hosted PHP backend pieces (deployed manually to the cPanel host)
  api/lobbies.php    # live lobby directory (build 956) — flat-file, no DB; see server/README.md
tests/               # Node test suite (unzipped from breach-tests.zip)
  run-all.mjs        # runs every test-*.mjs and prints "N/N harnesses passed"
  harness.mjs        # exports gameSource(), html, extractFunction, extractConst, assert, eq, near, done
  boot-harness.mjs   # support for the boot test
  test-*.mjs         # ~470 numbered tests
  package.json
```

The harness reads the game via `path.resolve(__dirname, '..', 'breach.html')`, so
**`breach.html` must sit one directory above `tests/`** (i.e. at the repo root). Keep it there.

## The build workflow (follow this exactly)

Work in **one feature per build**. Each build is a tight loop:

1. **Re-grep / re-read the exact text before every edit.** Line numbers shift after each
   edit, so never trust a line number from a previous step — search for the literal code again.
2. Make the change.
3. **Syntax check**, then run the **boot test** (it actually executes the game source and
   catches runtime/TDZ errors), then the **full suite**:
   ```
   cd tests
   node test-202-boot.mjs          # executes the source — run after risky edits
   node run-all.mjs                # expect "N/N harnesses passed"
   ```
4. **Update any stale test pins.** Most builds that change a pinned code shape will break
   1–6 source-pin tests — this is expected. Update the regex to match the new code while
   preserving the assertion's intent.
5. **Add a numbered test** for the new feature. Prefer an *executable* test (extract the
   function with `extractFunction(...)`, run it via `new Function(...)` with stubs) over a
   source-pin where practical. Source-pins are fine for UI/wiring.
6. **Bump the build version** near the top of `breach.html`:
   `const BUILD_VERSION = 'build N · <date>';`
7. Commit (see Git below).

### Test conventions
- `.mjs` test files use JS regex literals with **single** backslashes.
- `harness.mjs` exports: `gameSource()` (the largest `<script>` — the game code, not the
  HTML markup), `html` (the full HTML incl. CSS — use for CSS/markup pins), `extractFunction`,
  `extractConst`, `assert`, `eq`, `near`, `done`.
- `extractFunction`'s brace-matcher breaks on functions that contain `{`/`}` **inside string
  literals** — pin those against the raw source instead.
- Some older test files don't import `eq`/`near`/`extractFunction`; add them to the import
  line if you use them.

### Recurring traps
- A `str_replace`/edit whose anchor is a function header must **re-include the header** in
  the replacement.
- After any edit, earlier views are stale — re-read before the next edit.
- When editing test-pin regexes that contain `|` or `\`, prefer a literal string `.replace()`
  in a small script over `sed` (sed escaping is error-prone here).

## Key engine APIs (orientation, not exhaustive)
- **Render pipeline:** `renderScene(scn, cam)` chooses post-FX (`_renderPostFX`) then DoF
  (`_runDofTo`); DoF composes *into* the post pipeline so focus blur survives effects.
- **Cinematics:** `cineCfg`, shots carry `path, lensFrom/To, focusOn, focusFrom/To, dur, look,
  interp, dofRange, dofStrength(+To), roll/rollTo, ease, holdStart/holdEnd`. Threaded through
  `_resShot / _normCineShot / _newCineShot / _newCutscene / _applyCine / serialize`.
  `updateCinematic` drives playback; `_cineEase(t, mode)` is the per-shot motion curve.
  Editor camera-preview window: `_renderCinePvWindow / _cinePvFrameAt / _renderPvDof`.
- **Pickups:** `pickupSpots {x,z,kind,item,y,rx,ry,rz,scale,interact}`, `buildPowerupMesh`,
  `updatePowerups`, `grantPowerup`, `_spawnFloorAt` (ceiling-aware spawn floor).
- **Inventory:** `invCatalog` (per-item def incl. its own `model` + `useType/useKey/useAmount/
  useConsume`), `inventory`, `defineItem/giveItem/takeItem/useItem`, `renderInventory/openInspect`,
  authoring in `renderInvItems`.
- **Multiplayer:** `NET {mode,myId,conns,phase,...}`, host/client message handlers, lobby
  keepalive (`startLobbyKeepalive`), co-op kill credit (`_coopKillFor`, `{t:'frag'}`).
- **Sharing:** `serializeLevel`, `.json` export/import (level + campaign), URL share links
  (`encodeLevel / buildShareLink`, decoded from `#lvl=` on load), challenge links.

## What only a human can verify
The Node harness can't see rendering or run a real session. A browser pass is still required
for: textures, AI scene builder, post-FX + motion blur, the DoF-with-effects path, cinematic
roll/ease/hold/DoF and the live camera-preview window, inventory panel + 3D inspector, pickup
transforms, interact-to-pickup, and real two-machine multiplayer. Asset licensing + a credits
screen are release blockers.

## Git
Initialize a repo and commit each build so you get a clean history (the build number is a
natural commit message, e.g. "build 619 — UGC cloud gallery"). Tag releases as they happen.

## The level generator (`tools/levelgen.mjs`) — orientation

One file, TWO homes: the Node CLI, and the browser (editor → Tools → **Generate arena…**), which
fetches this exact source and evaluates it in a worker behind `RUMPUS_LEVELGEN_HOST` (a Buffer
work-alike + fflate for deflate). Keep it dual-environment — never add a bare `node:` import.

- `node tools/levelgen.mjs <keep|spine|museum|castle|caldera> <out.glb>`
- `node tools/levelgen.mjs arena <out.glb> [seed] [theme|auto] [small|medium|large] [square|cross|octagon|diagonal|auto]`
  themes: industrial | castle | volcanic | garden | desert | frost | facility
- `node tools/levelgen.mjs tex <libid> <out.png>` — fast single-texture iteration
- Env knobs: `TEXSIZE` (texture res), `TEXAUX` (aux-map divisor), `NOTEX/NOMR/NONRM/NOLM` (bisection)

Conventions that are easy to break:
- **Nothing flush.** Decoration stands off structure by `PROUD` (5 cm) and rings are mitred. Two
  coplanar front-facing surfaces z-fight and flash as the camera moves. `test-1108` sweeps all seven
  themes for this and will catch it.
- **`nocollide*`** named nodes are decoration (grass): engine build 1093 skips them in every
  collider and neutralises their raycast; 1096 also stops them receiving shadows.
- **Interiors need `addLight`.** The bake integrates sky visibility + one sun bounce, so anything
  under a roof bakes black without a registered light. Light range is capped at the tracer's search
  distance (9.5) or the shadow test can't see occluders and light leaks through walls.
- **Author to the collider, not to the eye (build 1113).** The engine turns an imported model into a
  ~1-unit COLUMN grid and a column goes solid for its whole width as soon as a triangle touches it,
  so every surface stands up to a cell proud of where it was modelled — and a face lying exactly ON
  a cell boundary (round-numbered architecture does this constantly) costs the entire next cell.
  Measured: a 0.45-thick wall collides 2.0 thick. Hence `GRID_PAD` / `BOT_R` / `BOT_LANE` (3.8) in
  levelgen: **anything a bot must walk through is at least BOT_LANE wide**, doorways included.
- **Decoration waits its turn.** Wall-foot pieces are proposed via `later(...)` during the perimeter
  dressing and dropped after everything has reserved its ground; placing them immediately drops a
  boulder onto a gallery ramp. Mirrored cover tests BOTH copies against the reserved rects.
- **Probe before shipping geometry.** Ramps and stairs must read no pushes in the engine probe, not
  just look right. `tests/test-1113-stairs-bot-clearance.mjs` is the durable version of that probe:
  it builds geometry, runs breach.html's own `buildModelGridBoxes` over the triangles, replays the
  enemy obstacle resolution, and flood-fills to prove a bot reaches the roof. For ad-hoc work on a
  whole `.glb`, rebuild a scratchpad `probe-gen.mjs` the same way (parse the GLB, same two steps).

## Rendering: the colour pipeline (build 1115)

The frame is sRGB-encoded exactly once, at the end. Two things make that non-obvious:

- `renderer.outputEncoding = THREE.sRGBEncoding` only covers three's BUILT-IN materials. The post
  chain is raw `ShaderMaterial`s writing `gl_FragColor`, which `<encodings_fragment>` never touches,
  so the pass that writes the CANVAS applies the OETF itself via the shared `_OETF_GLSL` snippet and
  a `uEncode` uniform. Three passes can be last (DoF present, composite, afterimage copy) and each
  sets `uEncode` per frame. **Encode an intermediate target and the next pass blurs and grades
  gamma-encoded values** — that is the bug this design exists to prevent.
- `ColorManagement.legacyMode = false` linearises every hex colour on the way in, INCLUDING light
  colours. A saturated dark light colour loses most of its luminance (`0x4a6c7a` keeps ~34%), so
  intensities tuned before this change now read dim. Albedo moves the same way, and that is the
  stock level's real limiter: `floorColor 0x141c22` linearises to 0.0089.

Do NOT scale `lightMapIntensity` by PI. r149 already does it on upload
(`lightMapIntensity.value = material.lightMapIntensity * (physicallyCorrectLights !== true ? PI : 1)`).
An audit claimed otherwise from r13x-era reasoning; the double multiply blew the bake out 3.14x and
was caught only by capturing the frame and measuring it.

Levels carry `world.colorV`. Absent = authored before this build = rendered through `LEGACY_EXPOSURE`,
because correct rendering makes old content brighter than its author ever saw. `_worldFrom()` is the
only place that decides it — a legacy level must not inherit the default's `colorV:2` through an
`Object.assign`.

## Headless capture

The engine renders under Chromium + SwiftShader, so visual changes can be measured, not argued about.
The whole game lives inside `window.GAME_START = function(){...}`, so page-level JS cannot reach its
internals: a harness has to drive the real UI. Capture at a FIXED generator seed or before/after
frames are different arenas and prove nothing.

## Open work (as of build 1115)

Roadmap: footprints + texture budget (done, 1110) → interiors (done, 1111) → multi-storey
(done, 1113) → more themes/materials (done, 1114) → emit gameplay data with the GLB (not started).

No known geometry bugs: both of the build-1112 repros (multi-storey stairs pushing enemies, the
cover crate clipping a ramp mouth) are fixed and covered by tests.

Themes are DATA (build 1114): a palette entry names its materials plus the treatments it wants —
`dress`, `joinery`, `plaza`, `yard`, `foliage`, `lightCol`, `depot`, `names` — and `buildArena`
contains no `theme === ...` branch. Adding the eighth theme is one `arenaPalette` entry, one
`arenaMood` entry, whatever new treatment names it introduces, and the editor's theme list.

Worth considering next, in the ENGINE rather than the generator: `buildModelGridBoxes` could emit
each column's box tight to the triangles that actually stamped it instead of spanning the whole
cell. That is the root cause behind `GRID_PAD`, and it would make every imported level's doorways
and corridors passable rather than only the ones this generator authors. It needs care — a
paper-thin wall must not collapse to a zero-thickness box a player can tunnel through — and it
changes collision for every existing level, so it deserves its own build and a browser pass.

Also outstanding (user actions): upload `tools/levelgen.mjs` + `fflate.min.js` to the cPanel host
for the in-editor generator (see `server/README.md`), and re-upload the museum GLB.
