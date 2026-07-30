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
- **Author to the collider, not to the eye (build 1113, relaxed by 1148).** The engine used to turn an
  imported model into a ~1-unit COLUMN grid where a column went solid for its whole width as soon as a
  triangle touched it: a 0.45-thick wall collided 2.0 thick and a 1.6 m doorway had ZERO passable gap.
  Hence `GRID_PAD` / `BOT_R` / `BOT_LANE` (3.8) in levelgen: **anything a bot must walk through is at
  least BOT_LANE wide**, doorways included. Build 1148 made the collider tight to the triangles (that
  wall now collides 0.500, that doorway passes 1.49 m), so these are a MARGIN rather than a
  requirement — but they are unchanged, because narrowing them is a generator change that needs its
  own probe pass, not a side effect of an engine build.
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

## Post-processing: the AO prepass (build 1126)

SSAO needs depth, and r149 **cannot** attach a depth texture to a multisampled target — which is
where build 872's 4× MSAA lives, the only antialiasing the engine has. Trading MSAA for FXAA was
tried and **measured**: on a pillar edge against the sky, MSAA gives a 1.02-pixel coverage gradient
on 100 of 100 scanlines; FXAA in its place left a hard edge on 94 of 99. So AO gets its own half-res
G-buffer prepass (`_aoGeoRT`, view normal in rgb + view distance in a) written with
`scene.overrideMaterial`, and MSAA stays. FXAA survives only on the DoF path, which was never
multisampled anyway. `tests/test-1126` and `scratchpad/edgeq.mjs` are the durable versions of that
measurement.

Three traps in that prepass, all of which shipped broken once:
- **"nothing drawn here" must be geometric, not a magic depth value.** The clear leaves the target's
  alpha near zero but *not* zero, so `a <= 1e-4` let every sky pixel through and AO shaded the whole
  upper half of the frame dark grey. A packed normal's channels sum to ≥ 0.63 for any unit vector and
  to ~0 when cleared — test that.
- `overrideMaterial` replaces `depthWrite:false` too, so the **sky dome fills the buffer** unless it
  is hidden for the pass. Weather points do the same.
- The prepass must run **after** the main scene pass or it consumes the frame's shadow-map refresh.

`_msaaOn`/`_msaaFails` are now `_hiFxOn`/`_hiFxFails`: build 883's ladder rung is unchanged, but it
carries MSAA *and* SSAO. `wipeScene` → `_postOffWorld` zeroes `ssao` along with the other post
settings — which silently disabled AO in every capture until `arenaMood` started emitting `ssao`.

## The sky (build 1127) — three traps

- `_skyEnv()` had returned `_skyEnvRT.texture` since build 1119: the HDRI path's target, declared
  7,300 lines below, so at boot it was a **TDZ ReferenceError** swallowed by the surrounding catch.
  The procedural sky lit nothing for eight builds and nothing said so. If a `catch(e){ return null; }`
  guards something whose absence is invisible, that absence needs a test.
- **A raw `ShaderMaterial` gets neither ACES nor `outputEncoding`** — three injects both only into its
  own material programs. `_ACES_GLSL` (beside `_OETF_GLSL`) is three's verbatim fit, written out
  because `#include <tonemapping_fragment>` cannot work here: the program prefix defines
  `toneMapping()` as a wrapper calling `ACESFilmicToneMapping`, which the chunk declares *after* the
  prefix, so the call is a forward reference and the program fails to compile — silently, and the mesh
  vanishes. The water shader is the remaining surface with this problem.
- **`typeof x` does NOT guard a temporal dead zone.** It throws for an uninitialised `let`. Declaring
  `_skyDayDim` below the `_skyP()` that reads it turned the entire sky black on the first frame.

`_sunDir()` now measures the direction from the light to `_sunTarget` rather than re-deriving it from
`worldCfg` — the day cycle and build 1120's shadow fit both move the light without touching the
config, so a config-derived sun disagreed with the one casting the shadows.

## Two things I got wrong here, twice (build 1136)

Both were plausible hypotheses stated before measuring, and both cost a capture cycle:

1. **"The teal cast is the emissive bleeding through bloom."** The channel signature (G+48, B+50,
   R+14) matched the teal accent, so it looked settled. Cutting the emissive from 1.6 to 0.55 moved
   the measurement by **1 code value**. Comparing a *lit* pixel to its authored albedo hex is not a
   valid comparison in the first place — the pixel is albedo × light, tone-mapped.
2. **"The IBL dominates and is swamping the sun."** Correcting the probe (see below) and scaling it
   by `sky` changed **0.95%** of the frame. Raising the sun 50% and halving the hemisphere fill
   changed **38.6%**. The environment map was never the loud term.

The real answer was arithmetic, not a bug: a shadowed deck measured R/G 0.33, and the albedo's own
R/G (0.58) × the blue sky's (0.51) = 0.30. The renderer was reproducing exactly what it was given.
A monochrome frame with cool albedos under a cool sky is **content**, not code. Warm the architecture
and keep the props cool and the frame gets three notes.

**The environment probe must be RAW RADIANCE.** Build 1127 tone-mapped it "to match what the eye sees
of the same sky" — wrong. Materials multiply the environment against albedo *before* three tone-maps
the shaded result, so ACES was being applied twice. The dome (a final colour) tone-maps and encodes;
the probe (radiance) does neither. `worldCfg.sky` now scales the probe as well as the hemisphere light,
because r149 has no global environment intensity and walking every material on every change is worse.

## Headless capture

The engine renders under Chromium + SwiftShader, so visual changes can be measured, not argued about.
The whole game lives inside `window.GAME_START = function(){...}`, so page-level JS cannot reach its
internals: a harness has to drive the real UI. Capture at a FIXED generator seed or before/after
frames are different arenas and prove nothing.

**Know where the camera is before you judge the frame (build 1124).** Four rounds of visual
critique — "no sky", "contact shadows detached", "flat sunless lighting", "break the arena canopy
lid" — were all one bug: the player spawned at the origin, which is under the generated arena's
central mass, with 0.55 m of headroom. The rust "sky" was the underside of a rock. Nothing was
wrong with the sky, the shadows or the light. When a frame looks inexplicable, probe the scene
before theorising: a temporary `window.__probeUp` hook that raycasts up from `camera.position` and
stuffs the hit list into `document.title` costs one capture run and settles it, because
`page.title()` reaches out of the closure that `page.evaluate` cannot. Zeroing a suspect parameter
to its most extreme value is the other cheap discriminator — `normalBias = 0` producing NO acne
proved the geometry was never in the shadow map, which no amount of bias tuning would have shown.

**Probe the MATERIAL, not just the geometry (build 1139).** The same technique settles "why did my
material change do nothing". A `window.__surfProbe` that raycasts through a few screen points and
reports, per hit, the object's src, its material type and colour, and which of `map`/`normalMap`/
`roughnessMap` are set, found in one run what four rounds of reasoning had not. Two cautions learned
the hard way: filter the sky dome out of the hit list (it is a mesh one unit from the camera and wins
every ray), and remember `Raycaster` ignores a mesh's own `visible:false` but NOT its ancestors' — so
editor gizmo geometry shows up in play. An `InstancedMesh` hit reports the SHARED geometry (a unit box
at the origin) with a correct world hit point; that mismatch is the signature of a batch, not a bug.

## Procedural surface detail (build 1139) — three ways to ship nothing

`_procSurface()` bakes one 256×256 tiling value-noise field into a Sobel `normalMap` and a
`roughnessMap`; `applyProcSurface(mat, span)` / `retileProcSurface(root, span)` hand it to `floorMat`,
`wallMat` and every `primitiveMat()`. Each of the three faults below produced a frame that measured
IDENTICAL to the one before it, so none would have been caught by looking.

- **A map assigned at material construction is not a map.** `worldCfg.floorTex` is `''` by default, so
  the first `applyWorldCfg` ran `_loadSurfaceMap`'s no-url branch and wrote `null` over `floorMat.map`
  before the first frame. The detail set is therefore a REMEMBERED FALLBACK (`mat.userData.procSurf`,
  read by `_procFallback`) that every clear path restores. Anything that writes `mat[slot] = null`
  needs to go through it.
- **UV tiling is not a physical size.** The box primitive is a unit cube, so one repeat value gives an
  11 m blotch on a 22 m deck and a 50 cm one on a 1 m crate — the same material reading as two
  differently-zoomed photographs. Callers pass a world SPAN; `_procRepeatFor` quantises `span /
  PROC_TILE_M` onto `_PROC_STEPS` so the clone cache stays ~7 entries.
- **`buildInstancing()` rebuilt the batch material from scratch.** It grouped by `shape|colour` and
  constructed a fresh `MeshStandardMaterial` at the default roughness .65 / metalness .35 — so every
  instanced prop lost the detail set in play and got it back in the editor, and had been silently
  losing its authored *shine* and *opacity* the same way since long before this build. It now clones a
  real member's material and `_instKey` carries colour, shine, opacity and grain scale.

**An albedo `map` cannot be exposure-neutral.** It multiplies the material colour, so it only darkens:
a near-white 226..255 field averages 0.87 in LINEAR space and measured −19% across the frame (a deck
91,105,90 → 74,91,68). Neutrality would need values above 255. Since this retrofits detail onto colours
creators already chose, the set carries relief and roughness only — `PROC_SLOTS`. Relief is also baked
into the map rather than set as `material.normalScale`, because `floorMat`/`wallMat` are shared and a
creator's own normal map would inherit whatever scale was left behind. `STR` was 2.6, then 1.8, and both
read as crumpled foil with grazing-angle moiré; the Sobel sums eight taps of a unit-amplitude field, so
micro-relief is `STR ≈ 0.3` (steepest slope ~8°).

## The viewmodel is part of the frame (build 1140)

`renderViewmodel()` used to draw straight to the CANVAS from the frame loop, *after* `renderScene` had
finished — so the one object on screen at all times, across 11% of it, was the only object outside the
frame's look: no bloom on its muzzle flash or its metal, no vignette, no grain, its own colour response.
It was also absent from the SSAO G-buffer, so the AO term at its pixels came from the WORLD BEHIND IT and
was then multiplied into it — the weapon wore the shading of whatever it stood in front of and had no
occlusion of its own anywhere.

It is now three functions: `_vmWanted()` (the predicate, asked by both callers), `_drawViewmodel()`
(draws into **whatever target is bound** — the caller owns it), and `renderViewmodel()` (the frame loop's
straight-to-canvas call, a no-op when `_vmDone`). `_renderPostFX` binds `_postRT` and draws the weapon
after the scene and after DoF (a first-person weapon stays sharp) and before bloom, then renders `vmScene`
with `_matAOGeo` into `_aoGeoRT` inside the existing `_aoWant` gate, so the extra pass disappears with AO.
That last part only works because `vmCam` tracks the main camera's fov/aspect and the G-buffer stores a
raw view distance — if either changes, the weapon's AO silently goes wrong.

**The default level had NO post-processing at all.** `if(!(savedLevel && savedLevel.world))
_postOffWorld(worldCfg)` — build 796 — zeroed bloom, motion blur, vignette, grain, the grade and `ssao`
for a first-time scene. Probed on the stock frame: `bloom=0 vig=0 aoAmt=0`. That was right when the
first-time scene was 22 boxes at `Math.random()` positions; from build 1133 it is a designed level, so
every visual system builds 1126, 1128, 1135 and 1136 added was switched off in the first frame anybody
ever sees — and *unmeasurable there*, which is why those builds were all measured on generated arenas.
An EMPTY scene still starts clean: `_wipeSceneCore` keeps calling `_postOffWorld`, and that is where 796's
actual intent lives.

Measured, stock level, same camera: weapon body 2,473 → 5,837 unique colours; weapon grip mean
72,81,71 → 56,65,56; frame corner 70,74,62 → 57,59,50 (the vignette); crate foot 109,143,139 → 97,133,128
(world AO). A/B on the G-buffer pass alone, everything else in place: weapon grip 69,80,67 → 56,65,56
while the crate foot stays byte-identical — so the weapon's occlusion is its own, not the vignette's.

## The adaptive quality ladder (build 1141) — it never fired when it mattered

`_adaptResTick` opened with `if(_adaptN < 8){ _adaptAcc=0; _adaptN=0; return; }` — "need a real sample".
Eight frames inside a 500 ms window **is 16 fps**, so on anything slower the gate was never satisfied: it
threw its evidence away and returned every window, forever. The worse the device, the more certainly the
relief never arrived, which is the exact inverse of what the system is for. Measured by driving the real
function with steady synthetic frame times for 60 s of simulated play: 22–70 ms/frame reached the bottom
rung; **100, 150, 200 and 400 ms/frame never moved at all.**

"A real sample" is now a quantity of TIME (`ADAPT_MIN_SAMPLE_MS`, with a two-frame floor), and a deficient
window KEEPS its samples instead of discarding them, so even a machine slower than one frame per window
eventually has two.

Fixing that exposed a second flaw that had always been live at normal frame rates: a window's **mean** is
dominated by one pathological frame, so a single 3-second hitch — a level load, a GC pause, a shader
compile — cost the player a rung for a load that was never sustained. So a frame contributes at most
`ADAPT_FRAME_CAP` to the mean, and both downshift rungs now require `slowFrac >= 0.5` (a majority-slow
window) beside the mean. The CLIMB is deliberately *not* gated on `slowFrac` — recovering means the mean
came down, which is the right question there.

`tests/test-1141` executes all of it: every sustained load from 22 ms to 900 ms reaches the bottom rung,
8–20 ms is left alone, hitches of 300 ms to 12 s cost nothing, recovery climbs all the way back, and the
opt-out still holds. `scratchpad/ladder2.mjs` is the sweep that found it — worth rebuilding rather than
reasoning, because the failure is invisible from the code and needs no browser to reproduce.

## The loudest light in the engine was a decoration (build 1142)

The default level's floor rendered olive-green — (87,105,77) against an albedo `0x4f5d66` that is
(79,93,102), i.e. the blue channel HIGHEST in the albedo and LOWEST in the frame, which no positive light
times that albedo produces. Recorded in the 1139 open work as needing the zero-one-term method. What
actually settled it in ONE run was **enumerating the scene's real light list**: 29 lights, four of them
`PointLight(0x38f5b5, 8, 22)` from `buildPillar` — intensity 8 against a sun of 1.5, in a teal whose
linear channels are R 0.028, G 0.745, B 0.434, and four of them stand around the spawn. The frame's key
light was a decoration.

A/B with those four lights zeroed and nothing else changed: mid floor 56,101,101 → 55,71,83 (B>G>R
restored), near deck 81,101,70 → 78,66,51 (warm concrete finally warm), crate 116,149,146 → 115,125,132.
They also carried most of the frame's *variation* (4,027 → 1,074 unique colours), so the answer is accent
strength, not zero: **4.0 at 18 m** is the most light that leaves the frame's hue albedo-correct while
still laying a real pool at the pillar's own foot (G +20 over unlit, 722 → 1,370 unique colours there).

Two things worth carrying forward:

- **When the key light changes, every fill and accent tuned against the old one is now wrong.** This light
  was correct for the dark greybox it was written for; build 1135 raised the sun to 1.5 and gave the level
  a daylight sky and nobody revisited it. Build 1135 had in fact chased the same teal cast and cut the
  accent's *emissive* from 1.6 to 0.55, measuring only 1 code value of change — because the emissive was
  never the emitter. The light beside it was.
- **Probe the LIGHT LIST, not just the material.** Builds 1124 (`__probeUp`) and 1139 (`__surfProbe`)
  established probing geometry and materials; a `__floorProbe` that dumps every light's type, hex,
  intensity and range, grouped, plus the material's linear albedo, answered in one run what two builds of
  reasoning had not. `test-1142` turns it into a standing guard: no hardcoded light may be both
  far-reaching and more than 3× the sun.

The station beacon `PointLight(0x38c8f5, 6, 14)` was the obvious second suspect and is **deliberately
unchanged** — dropping it to 2.0/12 moved the dais by 4 code values and the floor by none. Its 14 m range
confines it to the landmark it marks. Measured, not assumed, and recorded so it is not "tidied up" later.

## Themes describe the ground too (build 1143)

`arenaMood` set sky, fog, post and `ssao` but never `floorColor` or `wallColor`, so the ENGINE's own
ground plane and boundary walls stayed at `DEFAULT_WORLD`'s cool grey-blue in every generated level. That
is directly visible, because the imported ground stops at ±W and the engine's plane runs on to ±ARENA:
measured on the desert arena, the plane read (103,114,87) — olive, G highest — butting against sand at
(185,173,139). It now reads (100,94,74), R>G>B, the same order as the ground beside it, and the imported
ground is unchanged.

`groundMood(gnd, rough, metal)` sits beside `skyMood` and takes the theme's **`light.groundAlb`** — the
albedo the lightmap bake already integrates for the sun bounce — so the plane the player walks past and
the bounce the bake assumed are the same surface. `wallColor` is that albedo at 55% in linear space: the
same world one value down rather than a different one. `floorColor` therefore equals `skyGround`, which
also removes the horizon seam between the dome's ground band and the real ground.

**Measured in build 1150, and "the same surface" is FALSE.** `groundAlb` is a hand-picked triple; the ground
material actually drawn is `base × texture mean`, and the two disagree in every theme — by 0.35× to 1.59×:

| theme | ground material | drawn albedo (linear) | `groundAlb` | Y ratio |
|---|---|---|---|---|
| industrial | `concrete` ×[.30,.31,.33] | 0.110/0.114/0.117 | 0.20/0.21/0.22 | 0.54× |
| castle | `cobble` | 0.154/0.136/0.113 | 0.22/0.19/0.15 | 0.71× |
| volcanic | `dirt` | 0.142/0.091/0.053 | 0.16/0.13/0.10 | 0.74× |
| garden | `grass` ×[.74,.80,.62] | 0.034/0.067/0.011 | 0.12/0.18/0.08 | **0.35×** |
| desert | `sand` | 0.511/0.372/0.185 | 0.42/0.34/0.22 | 1.11× |
| frost | `snow` | 0.779/0.829/0.899 | 0.60/0.64/0.70 | 1.29× |
| facility | `scifiFloor` | 0.165/0.189/0.222 | 0.10/0.12/0.14 | **1.59×** |

FOUR consumers derived from the abstraction while the renderer drew the texture. **Fixed in build 1151** —
see "The ground albedo is now the ground it draws", where every theme's `gnd` became the drawn value and a
test recomputes all seven from the real palette so the two cannot drift apart again.

Each theme now names `zen` / `hor` / `gnd` **once**. They were written out twice per theme before (in the
`light` block and again inside the `skyMood(...)` call) and this build would have made it three times —
which is exactly how a mood ends up baking against one ground and showing the player another.
`test-1143` counts the literals to keep it that way.

## `envMapIntensity` is the ambient, not a reflection knob (build 1144)

In r149 `getIBLIrradiance` returns `PI * envMapColor.rgb * envMapIntensity` — the **diffuse** ambient. This
engine wrote `envMapIntensity = metalness` in three places ("reflections track the metal slider"), which
is the r13x mental model where envMap was a reflection map you turned up for chrome. In a PBR pipeline the
environment IS the ambient light, so `= metalness` meant **a matte surface received no sky light at all**.
Build 1095 added a default environment so "metals don't render black"; that line then withheld it from
every dielectric.

Removing the gating entirely, measured on the stock level: floor plane 54,79,88 → 85,116,136, crate face
116,133,137 → 143,160,168, warm deck 74,71,54 → 99,100,89, **sky byte-identical**. So the *amount* was
accidentally in the right range and the fault was the coupling. Hence `SKY_ENV_FLOOR = 0.12` and
`_envInten(metal, bright)` — metals keep exactly what they were tuned with, nothing is ever unlit, and the
stock frame is preserved (a crate at metalness 0.35 is byte-identical; the floor moves one code value).
`primitiveMat` had never set the property at all, so a fresh box took three's default 1.0 while any prop
whose shine had been touched got 0.35 — the same object lit two ways depending on whether a slider had
been dragged. Both sites now share the one derivation.

**Be honest about the size of this one:** it is a contained correctness fix, not a visual overhaul. The
0.12 floor only bites at metalness ≈ 0, and at desert noon (sun elevation 72°, N·L ≈ 0.95) the sun swamps
it — the desert plane measures byte-identical before and after, with `env=SET` and `floorEnvI=0.12`
confirmed by probe, so that is the sun dominating, not a missing environment.

Three numbers worth keeping from the investigation, each isolated by capture:
- The engine's ambient is **~80% probe, ~20% hemisphere light**. Zeroing `skyLight` entirely took a
  shadowed floor from 0.105 to 0.0846 linear. `applySky` sets the hemisphere light's two colours from the
  hemispherical average of the *same* `skyRadiance` model the probe renders, so they are two integrations
  of one sky — a genuine double count, just a small one.
- Sun-to-shade on the stock level is **3.3:1 linear** as shipped, which is the low end of real daylight.
  Ungating the environment to 1.0 takes it to 1.58:1, which reads flat.
- For a strictly physical balance the sun is roughly **4× too weak** relative to the sky (real daylight is
  ~8:1 on a horizontal surface). Fixing that is a whole-engine rebalance with a legacy-content story like
  `colorV`'s, not a one-line change — do not start it without that plan.

## Object-space detail for UV-less models (build 1145)

Build 1139's detail set needs texture coordinates. **The shipped weapon has none** — read out of gun.glb,
every primitive carries only `NORMAL` and `POSITION`, and its four materials all sit at the identical
roughness 0.415087 / metalness 0.4 with no maps of any kind. That is the whole of the critic's "not one
specular pixel" on the object filling 11% of every frame, and no texture can fix it: with no UVs there is
nowhere to put one. The low-poly sources this engine points creators at ship UV-less meshes constantly.

So `applyObjDetail` patches three's own `MeshStandardMaterial` through `onBeforeCompile` — the technique
`floorMat` already uses for the paint splat, and deliberately **not** a raw `ShaderMaterial` (this file has
twice lost a subsystem to a raw shader failing to compile silently; a patched built-in keeps three's
lighting, shadows, fog and tone mapping intact). Four things in it are load-bearing:

- **Object space, not world space.** A viewmodel bobs and a prop can be carried; world-space noise makes
  the grain SWIM across the surface as the object moves. `vOdPos = position`.
- **Frequency is CYCLES ACROSS THE MESH, never per unit.** A GLB arrives in whatever units its author
  used — gun.glb, the museum and a Poly Pizza crate differ by orders of magnitude — so a per-unit figure is
  invisible on one asset and aliased to noise on the next. `_objDetailFreq` normalises by each mesh's own
  local bounding box.
- **The roughness patch runs BEFORE the normal patch**, because three emits `roughnessmap_fragment` before
  `normal_fragment_maps`, so the field is evaluated once into shader globals and the normal patch
  differences against it — four noise evaluations per pixel instead of five. `test-1145` verifies that
  ordering **against the real three build** (`ShaderLib.physical.fragmentShader`), because if an upgrade
  reorders them `_odBase` is read before it is written and the perturbation silently becomes garbage.
- **`customProgramCacheKey` is a constant.** Every patched material produces the same program; without it
  three compiles a variant per material.

An authored map of any kind (`map` / `normalMap` / `roughnessMap` / `metalnessMap`) or the presence of UVs
disqualifies a material — a creator's asset always wins, and two detail systems on one surface is double
grain. The gradient is projected onto the tangent plane so the perturbation cannot rotate a normal off its
own surface, and roughness is a bounded *multiplier* of the authored value.

Measured on the weapon's receiver panel: 4,782 → 5,378 unique colours, mean held at 92,102,108 → 92,102,109,
world away from the weapon unchanged at 132,141,147. Expect a few percent of run-to-run spread in any
unique-colour measurement — `postGrain` is stochastic per frame.

## The gizmo snaps (build 1146)

The transform gizmo moved, rotated and scaled in raw continuous mouse units. Nothing in the product could
put two crates on one lattice, sit a wall flush against another, or turn a prop exactly 90 degrees — except
the numeric fields, at five decimal places, one axis at a time. Build 929's `buildSnap` is a *different*
feature and is untouched: that snaps the PLACEMENT of a new block against the face you aim at; this snaps
the TRANSFORM of something already in the scene.

Four decisions, each of which could reasonably have gone the other way:
- **A single object snaps its resulting POSITION** to the world lattice, so two crates placed in separate
  drags land on the same grid. `_snapAlong` snaps only the component along the drag axis — snapping the
  whole vector would drag the two axes the creator is *not* touching onto the grid, so an object
  deliberately placed off-lattice would jump the moment any axis was nudged.
- **A group snaps the DISTANCE MOVED.** Snapping each member absolutely pulls a deliberate arrangement
  apart — two crates 1.2 apart become 1.0 or 1.5 apart. The delta keeps the cluster rigid.
- **Scale snaps the SIZE, not the factor.** A box primitive's scale *is* its size in metres, so what a
  creator wants is a wall exactly 3.0 wide; the factor is derived back out of the snapped size, which keeps
  proportional scaling proportional while landing the dragged axis on a round number. The all-axes handle
  and a group scale have no single size to land, so there the factor is what snaps.
- **Rotate snaps the ANGLE TURNED**, before the quaternion is built. Decomposing an orientation back out of
  a quaternion is ambiguous, and "a quarter turn from here" is what the handle is for. 15° divides 90 and 360.

`Ctrl`/`Cmd` **inverts** rather than enables: with snapping on (the default) the modifier is how you nudge
into a gap, and with it off the modifier is how you grab the lattice for one drag. Both are what a creator
reaches for and one key serves both — but an invisible inverting modifier is a trap, so the checkbox says
so. `Shift` is deliberately not the key: it is already multi-select here. A step of 0 turns snapping off for
that channel only, which the field's tooltip states.

## The scene-asset browser (build 1147)

The editor could search the WEB for models (`renderModelBrowser` — Poly Pizza / Sketchfab) but had no view
of its own content. Every other engine's second-most-used panel is exactly that (Unity's Project window,
Unreal's Content Browser), and without it there is no way to see what a level is built from, to place
another of something already used without searching for it again, or to act on every instance of one asset
at once — a level with 57 props was a numbered list you stepped through one prop at a time.

`sceneAssetList()` groups `propModels` by `userData.src`, excluding primitives (those are the *Add a shape*
row; mixing them in buries the imports among 57 boxes). Ordered most-used first — the thing a level is made
of is the thing you reach for again — then by name for a stable tie-break. `renderSceneAssets` draws a tile
per asset with a live thumbnail, an instance count badge, click-to-add-another, and a `◉` overlay that
selects every copy via build 564's multi-selection and then frames it with build 1137's `_edFrameSelected`
— a browser that selects something off screen is the same "nothing happened" the panel exists to fix.

Three details worth keeping:
- `_renderAssetThumb` shares build 813's offscreen renderer and its LRU cache, keyed by url alone, so
  re-rendering the panel is free after the first paint. It frames by the mesh's largest dimension so a
  Poly Pizza crate and the museum show at the same apparent size whatever units they arrived in, and a
  device where a second WebGL context fails keeps an empty tile rather than breaking the panel.
- The select-all control **stops the event**, or clicking it would also fire the tile's add-another.
- Poly Pizza serves bare UUIDs, so `assetShortName` labels a hex basename as `model · 78846e` rather than
  printing an id as if it were a name. The full name and url live in the tooltip: a three-column grid in a
  344px panel gives a tile ~100px, which is about twelve characters.

Nothing is downloaded and nothing is stored in the level — it is data the engine already held.

## The collider was a cell wider than the model (build 1148)

`buildModelGridBoxes` turns an imported model into a ~1-unit COLUMN grid, and a column went solid for its
whole width as soon as a triangle touched it. Measured on the build-1123 repro — a thin wall with an
ordinary 1.6 m doorway — the passable gap was **0.00 m**: one merged box spanned the opening. A 0.45-thick
wall collided **2.000** thick. That is the root cause behind the generator's `GRID_PAD` / `BOT_LANE`, and
it meant every OTHER creator's imported building was un-walkable unless they had happened to pad it.

Each (column, **slot**) now remembers the real XZ extent of the triangles that stamped it, one byte per
edge (~4 mm at a 1-unit cell). Build 1123 tried this per COLUMN and opened no doorway; the reason is the
load-bearing insight here and it recurs one level down:

- **Per column is not enough**, because a column holds several RUNS and a doorway column holds the floor
  slab (which fills the cell) beside the wall's jamb face (a sliver). Their union is the whole cell.
- **Per slot is not enough either** — a run's footprint is the union over its slots, and a wall's BASE slot
  holds the floor slab too, so the union inherits the slab's full cell. Measured before segmenting: the
  0.2 wall still collided 2.0 and the doorway was still shut. So a run **splits wherever its footprint
  changes**, compared at `FOOT_Q = 16` levels per edge so a few millimetres between slots cannot shatter a
  wall into K boxes.
- **Merging is only lossless while the footprint spans the whole cell on the merge axis.** Two adjacent
  columns each holding a sliver at the same relative position are two thin walls with a gap between them,
  and one merged box bridges it — solid where the model is open, the very fault this build removes. A
  wall's columns are full along its run and thin across it, so the case that matters still collapses.

**Widening a too-thin footprint is where this went wrong twice, and both wrong answers were plausible.**
Zero-thickness geometry (which low-poly levels are full of) would emit a box of no thickness, so a
footprint is widened to `MGRID_MIN_THICK` (0.25) — but toward WHICH side is not a guess:
1. *Centred on the measurement.* A 0.45 wall straddling a cell boundary became two 0.25 slabs at z=±0.25
   with a **walk-through gap at z=0** — a worse failure than the over-solid cell.
2. *Grow to the nearer cell edge.* A 1.4 wall's two faces sit near the outer edges of their cells, so both
   grew **outward, away from each other**, hollowing the wall out.
3. *Ask the occupancy grid.* If the neighbour cell is solid at the same slot the wall continues across that
   boundary, so this cell's footprint must reach it; the two halves then meet and the wall is solid. Solid
   on both sides means the cell is interior and fills. One bit lookup, and it is not a guess.

`PLANE_B` (2/255 of a cell, ~8 mm) is what distinguishes a single SURFACE from a thin measurement: a wall
wholly inside one cell records BOTH its faces, so it is not a plane at all and keeps its measured position,
widening about its own centre — otherwise a 0.2 wall in mid-cell would be dragged out to a cell edge.

**Fail SOLID, never open.** An unstamped slot starts at min 255 / max 0, and a slot that is solid with no
recorded fragment falls back to the whole cell. The budget (`MGRID_FOOT_BYTES`, 24 MB, halved on phones)
degrades per-slot → per-column → none, and *none* is exactly the pre-1148 behaviour rather than a broken
grid: 4 bytes × N × K is ~750 KB for an arena and 24 MB on the 331×148×366 skyscraper this serves.

Measured, doorway repro: **1.6 m opening 0.00 → 1.49 m passable**, 2.56 → 2.49, 3.8 → 3.49. Wall collider
thickness: 0.1 → 0.500, 0.2 → 0.500, **0.45 → 0.500 (was 2.000)**, 0.9 → 0.875, 1.4 → 1.375.

**It costs boxes, and every consumer walks the list per query.** A real 3-storey generated block (16,368
triangles, 45×74×37): **795 boxes / 110 ms → 2,291 / 137 ms**. A `FOOT_Q` sweep of 4/8/16/32 gave
2,240/2,277/2,291/2,321 — so the increase is structural (a tight collider genuinely has more pieces), not
quantisation noise, and tuning `FOOT_Q` will not buy it back. The enemy resolve already rejected a prop on
its overall box before walking its box list; `_surfCull`, `clearAt`, `insideSolid` and `ceilingAt` did not,
and now do. `segmentBlocked` is deliberately left — it walks a SEGMENT, not a point, so it needs a
segment-bbox test rather than the same four comparisons.

Still true, and not introduced here: a hollow shell thicker than two cells has empty interior cells.

## The shade had lost a channel (build 1149)

Measured on the stock level's floor inside a cast shadow, per channel: **R min 0, p50 2, max 6 — with 19%
of the patch at EXACTLY zero and 73% at or below 2** — against G 38 and B 50. That is why the first frame
anybody sees reads as teal murk, and why no grade could recover it: there was nothing left to recover.

The cause is structural, not a tuning slip. A `HemisphereLight` gives an up-facing surface 100% of the SKY
colour and none of the ground colour, and a cosine lobe over a cubemap probe excludes the lower hemisphere
entirely. Both are correct for a bare sky. Both are wrong for a scene with walls and crates standing around
it — a real floor in shade is lit mostly by light bounced off its surroundings, and this engine has no GI to
supply that. So the shade was lit by nothing but blue, times a floor albedo (`0x4f5d66` → linear R 0.078,
B 0.138) that is itself blue-dominant. Red had nowhere to come from.

`bounceLight` is the standard pre-GI stand-in: **one bounce of the SUN off the level's own surfaces.** Four
things about it are deliberate:
- **An `AmbientLight`.** A bounce arrives from every direction, which is the one thing that light models
  correctly. It is also free.
- **Coloured `sunColor × mix(floorColor, wallColor, 0.4)`**, in linear (`setHex` does the transfer on the
  way in). That is redder than the sky by 4× in R:B, which is the whole point — a term with the sky's own
  hue could not have fixed a missing red channel.
- **Scaled by `sun`, and by the day cycle's `dayF`.** A bounce is the key light coming back off a surface,
  so it dies with the key. A flat lift cannot do that, which is why this is a new term rather than a bigger
  default for `ambient` — that one stays the creator's arbitrary white lift, untouched.
- **`0.50` is derived, not chosen.** The albedo is already in the light's colour, so the bounced irradiance
  lands at 7–12% of the sun's on a horizontal surface — what a ~10%-albedo floor actually returns for one
  bounce. Raise a level's floor albedo and its bounce grows with it, correctly and for free.

Swept by capture at 0 / 0.15 / 0.30 / 0.50 — sunlit floor `79,115,117 → 83,120,122` (+4 at the top of the
range), shade `2,38,50 → 9,47,60`, red-at-exactly-zero `19% → 5% → 0% → 0%`, sun-to-shade `9.46:1 → 6.86:1`.
0.30 clears the clip; 0.50 clears it with margin (min 3) for four code values on the lit surface.

**Not gated on `colorV`, unlike build 1115.** That build moved every pixel through a different transfer
curve; this one only ADDS light, and only where there was none. Leaving a clipped channel in every level
that already exists is the worse outcome. The lit-surface delta above is the evidence for that call.

**Two corrections to what was recorded before this build.** Both were derived from scene-linear term
isolation rather than from the frame, and the frame disagrees:
- *"Sun-to-shade on the stock level is 3.3:1 linear as shipped, the low end of real daylight."* Measured
  off the frame on a lit and a shadowed patch of the SAME floor: **9.46:1**. The shadows were never shallow.
- *"For a strictly physical balance the sun is roughly 4× too weak relative to the sky."* Raising the sun
  would have deepened a shadow that was already crushing a channel to zero. The defect was the ambient's
  COLOUR and its lack of a bounce term, not the key light's strength. The whole-engine rebalance that note
  warns against should not be started; there is nothing there to fix.

An analytic model of the light terms said the stock level sat at 3.0:1 and the generated arenas at
1.2–3.3:1. It was wrong in both directions, and one capture settled it. **Model the lights to decide what to
try; measure the frame to decide what is true.**

**The generator states its own value, derived from the same albedo.** The bounce is coloured by the level's
floor, so its delivered fill scales with that floor's brightness — right as physics, wrong as art direction
across seven themes whose grounds span 5:1 in luminance (frost snow Y 0.64 against the facility apron's
0.12). At the engine default the desert's imported sand measured `244,208,160 → 250,218,170`, which is
nearly white. So `groundMood` divides the target fill back out — `0.0535 / lum(groundAlb)`, the engine
default times the stock floor's own luminance — and every theme delivers the same fill to within 12%:
industrial 0.26, castle 0.28, volcanic 0.40, garden 0.33, desert 0.15, frost 0.08, facility 0.46. Named in
ONE place beside the floor and wall colours that come from the same albedo, which is build 1143's lesson.

Measured three ways on the desert arena at seed 4242 — as shipped before, at the engine default, and at the
theme's derived 0.15:
```
imported sand    244,208,160  ->  250,218,170  ->  246,212,164     (nearly white, then back)
arena blocks p10      0.0234  ->       0.0366  ->       0.0270     (shadow ratio 24.5 -> 15.9 -> 21.3)
engine plane      109,101,78  ->   116,106,81  ->   111,103,79
```
So the theme gets a real lift in its deep shadows without pushing a ground that was already near clipping
any further. That middle column is why the generator states a value instead of inheriting one.

**A source pin must not be scoped by a character count.** Three harnesses failed this build for one
reason — `src.match(/function applyWorldCfg[\s\S]{0,4000}/)`, `{0,2600}` on `updateDayNight` — and in every
case the assertion was still TRUE; adding a comment had simply pushed the needle past the end of the slice.
`extractFunction(name)` brace-matches and cannot drift. Every UNANCHORED window has now been converted
(856, 858, 859, 863, 864, 865, 959, 1127). The remaining ones anchor on a closing brace or on a named
following declaration, so they fail loudly only when a function outgrows its budget — and converting
those would change what the assertion covers, so leave them.

## The bake was gated on a texture-filtering capability (build 1150)

Build 1095 put two unrelated things in one statement in the imported-material pass:

```js
if(MAX_ANISO > 1){ for(const m of ms){ ...anisotropy...
  if(m.userData.rumpusLightmap && m.aoMap && !m.lightMap){ ...adopt as lightMap... } } }
```

`MAX_ANISO` is `Math.min(8, getMaxAnisotropy())`, which is **1** on a driver that reports no anisotropic
filtering — low-end Android, some software rasterisers. On any such device the whole block was skipped, so
a generated level's radiance bake stayed in the `aoMap` slot. That is not cosmetic: `aoMap` MULTIPLIES the
ambient and can only darken, while `lightMap` ADDS coloured indirect light — and the bake carries the
interior lamps, which are the only thing lighting a generated building's inside. The device that could
least afford it lost its interior lighting and got a dirty AO wash instead. `test-1150` drives the block
directly at `MAX_ANISO` 1 and 8, because a source pin cannot tell you which branch a nested `if` guards.

## What the ground probe settled (build 1150)

Build 1149 recorded the desert arena's 2.3-stop ground seam with two candidate causes and the instruction
to probe before theorising. The probe (`scratchpad/probe-ground.mjs` — raycast down at eight forward
offsets, report per hit the src, the material colour in linear, every map slot, `envMapIntensity` and
`lightMapIntensity`) answered both in one run:

- **NOT the texture albedo.** `sand` measures 0.511/0.372/0.185 linear against the desert theme's stated
  `groundAlb` of 0.42/0.34/0.22 — close enough that the generator's grounds are honest about themselves.
  This was the leading hypothesis and it is wrong.
- **There is a real `envMapIntensity` gap, and it is NOT the seam** (established after this build was
  written — see Open work). The imported ground reads `env1.00`; the engine's own boundary wall, same
  roughness class, reads `env0.12`. Build 1144 made that property one expression — `_envInten(metalness)`
  — for `floorMat`, `wallMat`, `primitiveMat`, `applyPropShine` and the instancing batch, and it never
  reached an imported model, which keeps three's default of 1.0: 8× the image-based ambient for two
  surfaces meant to be the same world. Closing it moved the seam by 3–12 code values and cost the weapon
  27%, so it was measured and reverted. Worth knowing the gap exists; do not expect it to fix anything.
- **A related surprise worth keeping:** 29 standard materials are constructed in `breach.html` and exactly
  ONE sets `envMapIntensity`. Build 1144 established the derivation for the world surfaces — floor, walls,
  primitives — and every decorative prop the engine builds (coins, pickups, debris, remote bodies) sits at
  three's default 1.0 alongside every import. "The engine uses 0.12" was never true; it is a minority
  convention, and the ground plane is on the dark side of it.

**`SKY_ENV_FLOOR = 0.12` was derived from a ratio build 1149 disproved — and survives re-deriving.** Build
1144 justified 0.12 as "a sun-to-shade ratio of 3:1 needs total ambient at 0.0305", and 1149 measured the
frame at 9.46:1. So the stated derivation is void. Swept by capture on the stock level, with the bounce in
place, measuring lit and shadowed patches of the same floor:

```
SKY_ENV_FLOOR   0.12     0.30     0.55     1.00
lit floor       83,120,121  88,125,130  95,132,140  105,143,154
shade            9,47,59    18,58,74    30,71,92     49,93,118
sun-to-shade      6.90:1     5.07:1     3.75:1       2.57:1
```
Real daylight on a horizontal surface is ~8:1, so **0.12 is the closest of the four** and raising it walks
the frame toward overcast. 1144's other figure — "at a full 1.0 the ratio is 1.58:1" — is also wrong;
measured it is 2.57:1. Right value, void reasoning: re-derive it here rather than trusting either note.

**The unification was written, measured, and thrown away.** It does NOT close the seam — see Open work for
the numbers. It was parked here because `_envInten(m) = max(SKY_ENV_FLOOR, m)` still couples to metalness above
the floor, and the shipped weapon's materials are all metalness 0.4 — so it would drop from 1.0 to 0.4 and
the weapon block measured `91,104,111 → 66,78,85`, a 27% darkening of an asset that was never tuned
against that coupling (builds 1140 and 1145 measured it at 1.0). 1144's compatibility argument — "metals
keep exactly the reflection strength they were tuned with" — applies to engine materials and to nothing a
creator imported. That trade — 27% off the weapon for 3–12 code values on the
seam — is why it is not in the tree. If a future build wants the consistency for its own sake, the physically
coherent form is `envMapIntensity = 1` everywhere with `worldCfg.sky` scaled down to deliver the same
ambient, and that needs a legacy-`sky` story; the `max(floor, metal)` shape is a compatibility hack that
only ever had an argument for engine-built materials.

## The ground albedo is now the ground it draws (build 1151)

Build 1143 introduced `groundMood` so "the plane the player walks past and the bounce the bake assumed are
the same surface". Measured in build 1150, they were not: `light.groundAlb` was a hand-picked triple and the
material the generator actually DRAWS is `MATS[palette.ground].base × mean(texture)`, linearised per pixel.
Wrong in every theme, from 0.35× to 1.59×:

```
theme        drawn (linear)        was                ratio    bounce now
industrial   0.110/0.114/0.117     0.20/0.21/0.22     0.54x    0.47
castle       0.154/0.136/0.113     0.22/0.19/0.15     0.71x    0.39
volcanic     0.142/0.091/0.053     0.16/0.13/0.10     0.74x    0.54
garden       0.034/0.067/0.011     0.12/0.18/0.08     0.35x    0.96
desert       0.511/0.372/0.185     0.42/0.34/0.22     1.11x    0.14
frost        0.779/0.829/0.900     0.60/0.64/0.70     1.29x    0.06
facility     0.165/0.189/0.222     0.10/0.12/0.14     1.59x    0.29
```

FOUR things derive from that one value, and all four want the real one — which is why this was worth doing
rather than tolerating: the bake's sun-bounce colour, the sky dome's ground band, the engine plane's
`floorColor`/`wallColor` (1143), and the one-bounce fill factor (1149). Every one of them now describes the
same surface, verified per channel per theme.

**`Tex.rgb` is sRGB, not linear.** `toBytes` writes `px * 255` with no transfer and the glTF
`baseColorTexture` is sRGB-tagged, so the renderer decodes it. The effective albedo is therefore
`base × mean(srgb2lin(rgb))` — **linearise per pixel, then average**. Averaging first and linearising after
is a different and wrong number, and it is the easy mistake here.

**The fill clamp moved from 0.8 to 1.0.** Once `gnd` was real, garden's grass measured Y 0.056 and asked for
0.96 to deliver the standard fill; 0.8 held it 16% short and broke the equal-fill property the derivation
exists for. 0.8 was arbitrary; the equal fill is not. Every theme now delivers within 1.10×.

**The test enforces the link rather than restating the numbers.** `test-1151` recomputes all seven from the
REAL generator — `arenaPalette(theme).ground` → `MATS[idx]` → `TEXS[tex].rgb` → base — so retuning a texture
without updating the mood fails there instead of silently putting the engine's ground a stop away from the
arena's. That is what 1143 wanted and did not get: naming a value once is not the same as deriving it from
the thing it describes. It needs no browser and runs at `TEXSIZE=128`, where the mean is stable (checked at
64/128/256: grass and sand agree to four decimals, the patterned `scifiFloor` drifts 4%).

Two pins moved with it, both correctly: `test-1143`'s "facility is a dark cool apron" threshold (the drawn
apron really is 1.59× brighter than the guess, so the plane matches it at 113,120,130 — cool still holds),
and `test-1149`'s clamp bound.

**The capture could NOT verify this build, and that is worth stating.** Garden and frost were captured as the
two extremes (0.35× and 1.29×) to check nothing crushed or blew out — nothing did: garden's near ground
measures min 78/67/46 with no channel at or below 8, frame mean 120,124,118. But that near ground reads warm
brown (86/77/55, R>G>B) while garden's new `floorColor` is a dark green — so the surface in shot is the
IMPORTED ground, and the engine plane is not in the frame at all. Whether it is depends on where the
generator put the spawn: the desert `arena-walk` shot happens to stand outside the footprint, garden's does
not. So the capture is a sanity check here and the *verification* is `test-1151`'s exact per-channel
assertions.

That is the third time in one session that a frame did not contain the surface being reasoned about (see
"the arena-edge seam was never a seam"). The cheap guard is already built: the radiance probe's `WHO[...]`
label names the mesh, its geometry, whether the material is `floorMat`/`wallMat`, and whether it is
instanced. **Read WHO before attributing anything to a surface.**

**Frost's clipping, A/B'd against its own pre-1151 value**, because a 1.29× brighter ground is where a
blow-out would show. Same seed, same camera, only `gnd` changed:

```
                   pixels >= 254    frame mean       snow field mean
pre-1151 gnd            1.10%      128,136,138       159,167,169
1151 (drawn) gnd        1.59%      129,137,140       162,171,172
```
So the change costs **half a percentage point of clipped pixels and three code values** on the snow. Frost
already clipped 1.10% before it — a sunlit snowfield clips, and so do photographs of one. Worth stating
plainly rather than hiding: this build does make frost's brightest surfaces marginally more clipped, and it
is the right trade because the albedo is now a measured fact about the texture rather than a guess. If it
ever needs pulling back, the lever is frost's `exposure` (1.2), not `gnd`.

`moodCb.checked` defaults to true, so "Place in level" really does apply the generated world block —
`Object.assign(worldCfg, r.world); applyWorldCfg()`. Checked because "the mood never reached the engine"
would have been a tidy explanation for a dark plane, and it is not the explanation.

## A muzzle flash was writing itself into the AO buffer (build 1152) — DIAGNOSIS DISPROVED

**Read this first: the fix below is correct hygiene but it is NOT the cause of the reported artifact.**
Measured after committing it, with the instrument that finally worked: a STATIC sprite whose texture is
entirely `alpha = 0`, so it draws nothing and its only possible contribution is its footprint in the AO
G-buffer. Grain and motion blur off, the hide gated on a runtime flag, four frames in one session — two test
pairs and two controls. The sprite's quad region minus a reference patch of the same ground:

```
capture order   flag        quad - ref
fixed           hide ON       -13.517
unfixed         hide OFF      -13.813
fixed2          hide ON       -13.837
unfixed2        hide OFF      -13.865
```
Monotonic in CAPTURE ORDER, not in the flag. If the hide mattered the two ON frames would group and the two
OFF frames would group; they do not. The effect is under 0.3 code values and smaller than the drift between
consecutive frames. **The AO prepass is not producing the user's bright square.**

Why the code argument was not enough: `overrideMaterial` does replace `transparent` and `depthWrite:false`,
so a sprite IS drawn into the G-buffer — but a `Sprite`'s billboarding and scale live in `SpriteMaterial`'s
own vertex shader, which the override replaces too. What actually lands in the buffer is the raw unit quad
through a standard vertex shader, not the on-screen billboard. The mechanism is real; the footprint is not
the square the user sees.

**Next candidate, stated as a hypothesis and NOT acted on: atlas cell bleed.** `_procVfxSheet` packs frames
edge to edge with `minFilter/magFilter = LinearFilter`, `generateMipmaps = false`, and selects a frame with
`tex.repeat.set(1/cols, 1/rows)` + `tex.offset`. There is no padding between cells and no half-texel inset,
so at the quad's boundary the sampler interpolates into the NEIGHBOURING cell — which for an explosion sheet
holds a bright frame. That predicts a bright rim exactly at the PNG square's edge, which is what the report
describes ("a very defined edge around the png square"). It is testable: the artifact should scale with the
neighbouring cell's brightness and vanish with a half-texel inset. Do that measurement before changing
anything.

**Also ruled out, so nobody re-runs them:** the sheets' transparency is clean (every gradient ends at
`rgba(0,0,0,0)`, and three's `AdditiveBlending` is `src·srcAlpha + dst`, so a transparent pixel adds
nothing); and canvas premultiplied alpha would produce DARK fringes, not bright ones.

### What the build actually changed (kept, on its own merits)


Reported from play, with a screenshot: a hard, slightly **brighter** rectangle around muzzle flashes and
explosion/impact sprites — the PNG quad's own edge, the transparent area reading lighter than the scene.

The AO prepass renders with `scene.overrideMaterial = _matAOGeo`, and **`overrideMaterial` replaces
`transparent` and `depthWrite:false` along with everything else.** So a sprite wrote its whole QUAD into the
half-res G-buffer as though it were solid geometry a metre from the camera; SSAO then derived that square's
occlusion from a flat camera-facing surface — unoccluded — while the world around it kept its real
occlusion. Less darkening inside the square than outside it, with a quad edge.

**This is the same trap build 1126 recorded and build 1128 hit again, now for the third time.** 1126: "the
sky dome fills the buffer unless it is hidden for the pass. Weather points do the same." Both were fixed by
NAME, and the flipbook VFX arrived later. Naming a third would only buy a fourth, so the test is now a
property of the material: **nothing that does not write depth belongs in a depth-derived G-buffer.** The
prepass hides any object whose material has `depthWrite === false || transparent === true` and restores it
after — one traverse, which is nothing beside the extra half-res scene render the pass already costs.

Three details in the predicate, each of which would be a bug on its own:
- **Already-invisible objects are not collected**, or the restore would switch them ON — editor gizmos in
  play, which is a bug build 1139 already recorded from the other direction (`Raycaster` ignores a mesh's own
  `visible:false` but not its ancestors').
- **One offending slot in a multi-material array is enough**, because the object is drawn or it is not.
- **The viewmodel still goes in** (build 1140). It is opaque geometry and its own occlusion is that build's
  entire point; this must not sweep it out.

**Sprite sheets were the wrong suspect, and worth recording as such.** The procedural sheets are clean: every
gradient in `_drawExplosionFrame` / `_drawMuzzleFrame` / `_drawSmokeFrame` ends at `rgba(0,0,0,0)`, and
`AdditiveBlending` in three is `src·srcAlpha + dst`, so a transparent pixel adds exactly nothing. Reading the
report as "the PNG's transparency is wrong" would have sent the fix into the sheet baker, which is correct
code.

**Probably not caused by this session's builds, but plausibly made visible by one.** The prepass is 1126 and
nothing since touched it — but 1149 added a bounce term that lifts the ambient, and SSAO multiplies the
ambient, so the AO term's visible contrast went up. A pre-existing artifact getting easier to see is
consistent with a report of "now".

## Open work (as of build 1152)

Roadmap: footprints + texture budget (done, 1110) → interiors (done, 1111) → multi-storey
(done, 1113) → more themes/materials (done, 1114) → emit gameplay data with the GLB (started,
1124: `info.spawns`).

**Shadow parameters are TEXEL quantities (build 1125).** `normalBias` is a world-space offset whose
correct size is a few texels of `2 * extent / mapSize`. Build 1095 tuned it to 0.6 against the fixed
±80 volume (7.7 texels); build 1120 made the volume `shadowDist` and the constant silently became
~20 texels — longer than the whole ground shadow a crate casts at noon. `_sunNormalBias(extent, px)`
is now the single derivation, used at boot and on every re-fit. `moon.shadow.bias` is a DEPTH bias
against an unchanged near/far and deliberately does NOT scale with it. If you touch the shadow
volume again, check what else was tuned against its old size.

**Gameplay data with the GLB.** Build 1124 added the first piece — `buildArena` returns
`spawns: [[x,z],[x,z]]` (BASE 1, BASE 2), the worker carries it back beside `world`, and *Place in
level* moves `playerSpawn` there facing the centre. The engine's forward is `(-sin yaw, -cos yaw)`,
so facing the origin from `(x,z)` is `atan2(x, z)` — `atan2(-x,-z)` looks the wrong way (there is
an instance of the wrong form in the maze generator, untouched). Next candidates, same channel:
enemy spawn markers at the arena's cover positions, the ramp centrelines (`scans`) as bot routes,
and pickup spots.

No known geometry bugs: both of the build-1112 repros (multi-storey stairs pushing enemies, the
cover crate clipping a ramp mouth) are fixed and covered by tests.

Themes are DATA (build 1114): a palette entry names its materials plus the treatments it wants —
`dress`, `joinery`, `plaza`, `yard`, `foliage`, `lightCol`, `depot`, `names` — and `buildArena`
contains no `theme === ...` branch. Adding the eighth theme is one `arenaPalette` entry, one
`arenaMood` entry, whatever new treatment names it introduces, and the editor's theme list.

**`GRID_PAD` / `BOT_LANE` are now a MARGIN, not a requirement (build 1148).** The engine's collider is
tight to the triangles, so the generator no longer has to author a 3.8 m doorway to get a 1.6 m one.
Narrowing them is a *generator* change with its own probe pass — do not do it as part of an engine
build, and keep `tests/test-1113` as the gate.

**The arena-edge seam was never a seam. CLOSED — I was measuring a light.** Four builds of hypotheses about
why the desert arena's ground reads 2.3 stops brighter than the engine plane beside it, and the answer is
that the bright strip is the arena's **team-A base marker**: `mat('teamA', { base: [1, 0.55, 0.23],
glow: 0.32 })` — a deliberately EMISSIVE gameplay marking painted along the base edge. It is supposed to be
bright. I picked the sample region off a screenshot by eye at y 395–406 and never checked what mesh was
there until a probe reported `col=1.000/0.550/0.230` with `glow`.

The scene-linear radiance probe (`scratchpad/probe-radiance.mjs`) settles it in one run. Rendering the live
scene into a **FloatType** render target with `toneMapping = NoToneMapping` gives the radiance the renderer
actually produced, before ACES and before the encode, so `radiance / albedo` is the IRRADIANCE a surface
received — and two surfaces in the same sunlight must report the same number:

```
surface                       radiance              albedo               IRRADIANCE
arena edge strip (teamA)   1.871/1.110/0.436   1.000/0.550/0.230    1.87/2.02/1.89   <- EMISSIVE
engine boundary wall       0.140/0.120/0.082   0.068/0.058/0.045    2.04/2.07/1.81
                           0.145/0.120/0.083   0.068/0.058/0.045    2.11/2.08/1.84
                           0.140/0.116/0.079   0.068/0.058/0.045    2.04/2.01/1.74
```
**The irradiance is identical.** The renderer was delivering the same light all along; the 14.6× ratio in red
is albedo, and one of the two albedos belongs to an emitter. In hindsight every eliminated hypothesis was
eliminated *because* the surface was emissive — zeroing the bake and closing the 8× `envMapIntensity` gap
both left it byte-identical, which is exactly what an emitter does.

Three lessons, and the first is the one that cost the most:
- **Know what SURFACE you are measuring before you call it a defect.** Build 1124 established "know where
  the camera is before you judge the frame"; this is the same error one level down. A region picked by eye
  off a screenshot is a guess about geometry, and here it was wrong twice: the surface I had been calling
  "the engine's ground plane" reports `env0.12` and no `src`, which makes it **`wallMat`** — the engine's
  boundary WALL, not its floor. Both halves of a comparison I ran for four builds were misidentified.
- **`radiance / albedo` is irradiance only for a NON-EMISSIVE material.** The probe's own first run made
  this mistake, reading 1.87 off the marker as if it were ground irradiance. It now prints
  `EMISSIVE!x<intensity> (IRR above is NOT irradiance)` so the next reader cannot repeat it.
- **Frame statistics cannot test a lighting hypothesis.** Comparing a post-ACES 8-bit value against an
  albedo-times-irradiance estimate mixes two spaces and every approximation in the chain is worth a factor.
  Four rounds of that produced four wrong answers; one float-target read produced the right one. When the
  question is about the render equation, measure in the render equation's own space.

**The confirming run added the first sun-to-shade measured in SCENE-LINEAR space.** A vertical fan of nine
samples down one third of the frame: eight hit the same engine surface (`env0.12`, roughness 0.85,
metalness 0.08) and one of those eight is in shadow. Same material, same frame, so the ratio is the light
alone — and unlike every earlier figure it is read before ACES, so no tone curve is folded into it:

```
                  radiance              IRRADIANCE          per channel
lit    0.1385/0.1371/0.0911   2.022/2.371/2.016
shade  0.0245/0.0441/0.0391   0.358/0.763/0.866   R 5.6:1   G 3.1:1   B 2.3:1
```
**The ratio is strongly per-channel: red loses 5.6× going into shade, blue only 2.3×.** That is build 1149's
finding, independently and properly measured: a shadow lit only by a blue sky keeps its blue and loses its
red, which is why the fix had to be a WARM bounce term rather than more ambient of any colour. The
`EMISSIVE!` label also fired correctly on the marker (`x1.00`), so the instrument's own blind spot is closed.

**That loose end is now closed, with no defect.** The eight samples reporting `col = 0.068/0.058/0.045`
turned out to be `WHO[(unnamed)/BoxGeometry|INSTANCED]` — a **batched box primitive**, so its material is
`buildInstancing`'s clone and neither `floorMat` nor `wallMat`. (Build 1139 already recorded the signature: an
`InstancedMesh` hit reports the shared unit-box geometry with a correct world hit point.) I had flagged a
possible "3.4× albedo error in wallMat" as its own build; it does not exist. The generator's colour
round-trip is **exact in all seven themes** — `groundAlb → skyHex → setHex` returns the albedo it started
with, to three decimals:

```
theme        floorColor -> linear      wallColor -> linear     groundAlb        expected wall (x0.55)
desert       0xad9e81  0.418/0.342/0.220   0x847862  0.231/0.188/0.122   0.42/0.34/0.22   0.231/0.187/0.121
frost        0xcbd1da  0.597/0.638/0.701   0x9ba0a7  0.328/0.352/0.386   0.60/0.64/0.70   0.330/0.352/0.385
facility     0x596169  0.100/0.120/0.141   0x42494e  0.054/0.067/0.076   0.10/0.12/0.14   0.055/0.066/0.077
```
Worth keeping because it retires a whole class of suspicion: `skyHex`/`setHex` is not double-encoding
anything, so a future "the colours are wrong somewhere in the transfer" hypothesis can start already knowing
this link is clean. It also cost nothing to check — no browser, one Node call against the real `arenaMood`.

**What the bake A/B established, and it matters more than the seam ever did:****What the bake A/B established, and it matters more than the seam ever did:** the bake carries the arena's block field almost
entirely. With `lightMapIntensity = 0`, the blocks go `148,115,91 → 98,80,65` and their p50 luminance
`0.191 → 0.0496` — a quarter of the light. That is the first quantification of "the bake is the only thing
lighting generated geometry", and it is what build 1150's fix restores on every device whose driver reports
no anisotropic filtering. The `aoMap`/`lightMap` split is still the right eventual decomposition (occlusion
is multiplicative, lamps and bounce are additive) and still needs a texture budget — but it is not a seam
fix, and now there is a number for what removing the bake costs.

**Still visible on the stock frame after 1149, and worth a build each.** All three are content or
composition, not code, and all three are what a first-time player sees:
- The frame reads MONOCHROME TEAL. `floorColor 0x4f5d66` is blue-dominant in its own albedo (linear R
  0.078 vs B 0.138), so under a blue sky red has nowhere to come from and the bounce can only return
  what the albedo carries. Build 1136's recommendation — "warm the architecture and keep the props cool"
  — is still the fix, and it is a one-hex change plus a capture. Preserve luminance when doing it: the
  current floor is Y 0.107, so a warm grey at the same Y (about `0x615b53`) swaps hue without moving the
  exposure the whole grade is tuned against.
- ~~The WEAPON is the brightest object in the frame by a wide margin, near-white against a world in the
  110s.~~ **Wrong — measured and withdrawn.** That was written from looking at the frame. The weapon block
  means `91,104,111` against a frame mean of `127,142,152`: it is DARKER than the world behind it. What
  reads as "near-white" is a specular highlight on the top rail's thin edge (`p90 0.209` over a 17-pixel
  strip), which is what a rail edge is supposed to do. Judging a frame by eye is the failure mode the
  Headless capture section exists to prevent, and it caught me writing this list.
- A hard horizontal SEAM runs across the middle of the frame where the teal floor plane meets an olive
  band. Two large flat areas of different colour meeting on a straight line, with no transition.

Also outstanding (user actions): upload `tools/levelgen.mjs` + `fflate.min.js` to the cPanel host
for the in-editor generator (see `server/README.md`), and re-upload the museum GLB.
