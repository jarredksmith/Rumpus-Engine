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

## A sprite was casting a drop shadow out of the AO buffer (build 1152)

Reported from play with a screenshot: a hard square around muzzle flashes and impact sprites. **The user
diagnosed it, after I had measured six times and published the opposite conclusion.** Their read: AO is
giving the transparent quad a DROP SHADOW. The one-line test settles it — set **World → Camera & view →
Ambient occlusion to 0** and the square is gone.

The cause: the prepass renders with `scene.overrideMaterial = _matAOGeo`, which replaces `transparent` and
`depthWrite:false` along with everything else, so a sprite writes its quad into the half-res G-buffer as
solid geometry. SSAO then treats that quad as an OCCLUDER and darkens the world around and behind it — an
invisible box casting a shadow. Builds 1126 and 1128 fixed this same trap twice by NAME (the sky dome, then
the weather points); the flipbook VFX are the third instance, so 1152 replaces the naming with a rule:
nothing that fails to write depth belongs in a depth-derived buffer.

**Why no further capture is needed:** AO=0 removes the artifact, so it is AO-derived; a SQUARE AO artifact at
a sprite can only come from that sprite's own footprint in the AO G-buffer; hiding the sprite from that pass
removes the footprint.

### Six failed measurements, and why each one lied

Worth the space, because every one produced a plausible-looking result and four would have been reported as
findings:

| # | attempt | why it failed |
|---|---|---|
| 1 | fire at the horizon | sprite against SKY — no occlusion there to differ. Clean null. |
| 2 | "pitch down" then fire | the mouse moves netted zero movementY. Same null again. |
| 3 | 3 page loads, pinned rotation | 53% of the frame differed — in the CONTROL too. `postGrain` is stochastic per frame. |
| 4 | animated smoke, block means | 26 "bright blocks"… the control showed 28. Animation phase across respawns. |
| 5 | static fully-transparent quad | effect ordered by CAPTURE TIME, not by the flag. Settling drift. |
| 6 | read the AO buffers directly | all zeros INCLUDING the reference patch — `_aoGeoRT` is HalfFloat, read into a `Uint8Array`. |

Only #5 and #6 carried controls, and that is the only reason I knew they had failed. **Without the reference
patch in #6 I would have reported "the sprite is definitively not in the G-buffer" as a measured fact.** A
control pair is not optional in this engine: grain, weapon sway, animation phase and settling drift each
exceed the effects being looked for.

Why #5 was insensitive, which is the technical lesson: `overrideMaterial` replaces `SpriteMaterial`, and a
`Sprite`'s billboarding lives in that material's own vertex shader. What reaches the G-buffer is the raw unit
quad through a standard vertex shader — an axis-aligned quad in the world XY plane, not a camera-facing
billboard. Depending on camera yaw that quad can be nearly EDGE-ON, with almost no footprint. The ghost
sprite was very likely edge-on: the configuration in which the bug cannot show. **The mechanism was right and
the probe was pointed the wrong way.**

And the meta-lesson, which cost the most: I stated a mechanism-level diagnosis, failed to confirm it, then
published a retraction calling it disproved. **Failing to measure something is not evidence of its absence**
— least of all with an instrument that had already failed five times. The retraction was worse than the
original claim, because the original was correct. When a code-level mechanism is solid and the measurement
is null, suspect the measurement.

### What the build actually changed



Reported from play, with a screenshot: a hard, slightly **brighter** rectangle around muzzle flashes and
explosion/impact sprites — the PNG quad's own edge, the transparent area reading lighter than the scene.

The AO prepass renders with `scene.overrideMaterial = _matAOGeo`, and **`overrideMaterial` replaces
`transparent` and `depthWrite:false` along with everything else.** So a sprite wrote its whole QUAD into the
half-res G-buffer as though it were solid geometry a metre from the camera; SSAO then derived that square's
occlusion from a flat camera-facing surface — unoccluded — while the world around it kept its real
occlusion. Less darkening inside the square than outside it, with a quad edge.

**FIXED AGAIN IN BUILD 1158 — this section's fix covered the world scene only.** The muzzle flash lives in
the VIEWMODEL scene, which build 1140 renders into the same G-buffer, and that render had no sweep. See
"Two fixes that were applied to the wrong half".

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

## The number of lights must not change during play (build 1153)

Reported from play: **loot boxes spawning mid-match froze the game for 2-3 seconds.** The user's guess was
right — `buildChestMesh` did `new THREE.PointLight(...)` and `mesh.add(beam)` for every crate. Adding a light
changes the SCENE'S LIGHT COUNT, and in three that invalidates every lit material's program, so the first
crate to appear recompiled every shader in the level. Removing the crate took the light out with it and did
the same on the way out. Editor markers are built by the same function and toggled with `.visible`, and an
invisible light is not counted, so opening the editor recompiled too.

**This is the THIRD time this exact fault has shipped**, which is why it is now written down as a rule rather
than fixed once more in place:

| build | what it hit | what it did |
|---|---|---|
| 636 | the first explosion | `_blastLightPool`, pre-seated at load, so a blast only ever RE-AIMS an existing light |
| 977 | the first flashlight toggle | left it *"ALWAYS visible at intensity 0 — toggling `.visible` changes the light count and recompiles every shader (the first-L freeze)"* |
| 1153 | the first loot box | a pooled beam, claimed and released |

**The rule: the number of lights in the scene must not change during play.** Position, colour, distance and
intensity are plain uniforms and are free to change every frame. Existence is not — and neither is
`.visible`, which is the trap that catches people who know the first half of the rule.

Four decisions in the loot-box pool worth keeping:
- **The beam is not parented to the crate.** That is what made removal a second recompile. Pooled lights sit
  in the scene permanently and are positioned in world space; the crate's idle bob is ±0.08, which a 16 m
  point light cannot show anyway.
- **Seated where a recompile is already happening** — at load beside `_ensureBlastLights`, and again at
  DEPLOY in `spawnPlacedLoot`. Growing the pool is itself a count change, so it must never happen mid-match.
- **Sized from the level's own loot spots** (a marker and a crate can be live for the same spot at once) plus
  the random-spawn cap. Past that a crate spawns with NO beam: a missing glow is a far better failure than a
  frozen game.
- **A reconcile, not four edits.** Crates are removed from four places — the co-op snapshot reconciler, a
  client's `buyChest`, the local buy, and `wipeScene`. `updateChests` reclaims any beam whose owner has gone,
  so no removal path can leak one, and a leaked beam is not cosmetic: it is a crate that never glows again
  for the rest of the match.

**The same fault arrives by a second route on a custom crate model, and that is fixed here too.** GLTFLoader
turns `KHR_lights_punctual` into a real three light, and nothing in this engine's model path touches
`o.isLight` — so a `lootbox.glb` containing a light adds one to the scene on EVERY spawn, which is the
identical recompile by a different door. A crate already has its pooled beam, so a model's own light is
redundant as well as expensive: `buildChestMesh` now strips them, removing them from their parent rather
than hiding them (hiding a light changes the count too — build 977).

And `buildChestMesh` calls `loadGLTFCached` LAZILY, so with a custom model the first crate of a match also
paid for the fetch, the parse and the first-render program compile of its materials. `warmChestModel()` does
that at deploy the way build 622 warms the flipbook programs — instantiate once off-screen, compile, remove —
and strips lights from the warm instance too, or warming would itself move the count. It runs once per url,
and a failed load resets so the next deploy retries.

Worth knowing for the general case: imported models' own lights were unhandled everywhere else — **CLOSED in
build 1157**, which routes every imported prop's lights through `registerEmitterLight` after rescaling them out
of glTF candela and giving them a finite reach. The "decision about creators who legitimately ship a lamp"
turned out not to be the hard part: reading GLTFLoader showed the intensity and the range were broken
independently of the freeze.

## Auto-exposure (build 1180) — PHASE 3 OPENS

toneMappingExposure was a static authored value — desert noon into a dark interior, nothing adapted; every
competitor ships eye adaptation by default. The meter blits `_postRT` through `_matCopy` into a 16x16 target
(the blit also RESOLVES a multisampled _postRT, so both adaptive rungs read safely), log-averages luminance
every 5th frame (~12Hz — the readback is not a per-frame stall), and eases a MULTIPLIER around the authored
exposure with tau 0.9s. Post-ACES metering is deliberate: exposure moves → the metered value follows → the
feedback loop CONVERGES. Authorship survives three ways: ±1.5-stop clamp around `_expBase` (the authored
exposure × the colorV legacy factor — captured where 16444 used to set the renderer directly; renderer now
always gets base × multiplier), a 0.15-EV dead-zone so a balanced frame never breathes, and
`worldCfg.autoExp` (0..1, default 0.7, slider beside Exposure) where 0 snaps cleanly back to exactly the old
static behaviour. A failed readback falls to neutral instead of throwing mid-frame. One pin moved (1115 —
same derivation, captured as the base). NOT capture-verified headless yet — the stock frame is outdoor and
balanced (inside the dead-zone by design); the visible proof needs an interior, which is exactly the case it
exists for. Verify in browser: walk under the arena structures and watch the lift.

## Authored wave manifests (build 1179) — PHASE 2 COMPLETE

Random-mode composition was a hardcoded formula (n = 3 + wave*2, thresholds for the mix); "wave 3 = 2
brutes + a shielded from the north gate" was unauthorable. Manifests are a MINI-LANGUAGE (the dialogue
system's precedent — a textarea beats a widget forest), one line per wave: `3x grunt, 2x runner @gate`,
`-` for an intentional breather, blank = pure formula. `@tag` clusters the squad on the tagged prop with
the logic-spawn ring; no tag scatters at the arena edge like the formula. Caps: 20/term, 40/wave, 2
bosses, 50 waves; unknown types demote to grunt; a missing tag falls back to the edge (never (0,0)).
Waves PAST the manifest fall back to the formula so endless still escalates, and a manifest wave never
gets the automatic milestone boss — the author owns its composition (this falls out of structure: the
milestone boss lives in randomWaveDescriptors). The SOURCE text serialises (`game.wavesText`, 2000 chars)
and both loaders re-parse it, so the editor round-trips exactly what was typed. Two serializer pins moved
(33, 62). Phase 2 of the critic roadmap is complete.

## Chat gets a filter and a mute (build 1178)

The platform critic: chat capped length and escaped HTML but never filtered CONTENT. The filter runs
CLIENT-SIDE AT RENDER — a hostile peer can send anything; what matters is what is shown. Stranger links
collapse to [link] (the top P2P harm vector), a baseline profanity list masks in place after
leet-normalisation (0→o 1→i 3→e 4→a 5→s 7→t @→a $→s), and your OWN text shows as typed. `/mute Name` /
`/unmute Name` are local commands intercepted in sendChat BEFORE display-or-send; mute is per-session by
display name because the relay carries names, not ids (a renamed troll costs one more /mute — accepted for
v1). Substring matching catches embedded words (Scunthorpe) — the accepted trade for catching leetspeak.
Deferred: a report affordance needs the lobby backend. AND: hit the mid-line-`//`-comment trap AGAIN
(documented in 1168) — the addChatLine insert swallowed its own one-line tail; the syntax check caught it.
Use /* */ when patching one-liners, no exceptions.

## Your own .glb without their server (build 1177)

The editor critic's "asset import requires their server", verified: no local model path existed at all —
offline or host-down, a creator could not use their own asset. A dropped .glb/.gltf (viewport drag-and-drop,
editor only — play never hijacks a drag) is content-hashed (SHA-256, time-key fallback on http origins),
stored as a blob in its own IndexedDB db (`rumpus_local_models`), and resolved by a `local:` src scheme
through a branch BESIDE `sketchfab:` in `loadGLTFCached` — same cache, same waiter/pump, same
GLTFLoader/manager so codecs still apply. `isModelSrc` learned the scheme (cache accounting, part editor,
model release all follow). The filename rides the key so the asset browser shows a name, size capped 64MB,
and the sharing story is honest three ways: the import toast says "this device only", the Level Check warns
before publishing, and on another device the load fails into 1167's missing-model report instead of hanging.
The server upload remains the "make it shareable" step. Note: the codebase deliberately writes `\u2014`-style
escapes inside JS strings (307 of them) — a python-edit anchor containing a real em-dash will miss those
lines; match the escape or anchor elsewhere.

## The editor gets a clipboard (build 1176)

There was NO clipboard — carrying a configured object between levels meant formalising it into a prefab.
Ctrl+C serialises the selection through the same `_pfEntryOf` pair duplicate (1162) and prefabs use — full
config, identity stripped, pivot-relative so arrangements survive — into `_propClipboard` AND the system
clipboard as tagged JSON (`format:'rumpusprops'`), which makes paste work across levels and TABS. Ctrl+V
prefers the system clipboard (may be newer; only its own tagged format is accepted from that untrusted
text), falls back to memory when `readText` is refused, spawns at the editor drop point through the
loader-mirroring `_pfSpawnEntry`, groups a multi-prop paste under ONE fresh gid, selects the result, takes
one undo snapshot (Ctrl+Z removes the whole paste), and caps hostile pastes at 100 entries. Copy YIELDS to
a real text selection and only preventDefaults when something was actually copied; with no multi-selection
it falls back to the primary prop, which is the desired UX (the test initially got that wrong, not the
engine). Paste sanitisation note: pasted entries go through the exact apply block level files already go
through — nothing looser.

## Corpses lie on the floor, not in it (build 1175)

Reported from play: capsules AND the feet-origin chub GLB sank partway through the floor on death. Build
994's fallback death lowered every toppling corpse by a HARDCODED 1.0. A capsule (radius 0.7, centre
origin) needs 0.7 — buried 0.3; a feet-origin GLB needs to RISE by half its width — dropped a metre
underground. `_fallbackDeath` now applies the FINAL topple quaternion once at death, measures the real
lying bbox, and solves the y that rests its bottom exactly where the standing bottom was (`dy = box0.min.y
- box1.min.y` — sign handles both pivots with no special cases); the sink phase descends by the measured
lying thickness. Unmeasurable meshes fall back to the old constants. test-994's pin moved from the
hardcoded offset to the PROPERTY (lying bbox bottom ≈ ground), which is what that build always meant.

## Curved props stopped swallowing enemies; enemies learned to hop (build 1174)

Two play reports, each verified to a mechanism. (1) CLIP-THROUGH: 1158's edge exemption reads a curved
prop's flank as LOW near the silhouette (sphere/cylinder/dome), exempting the enemy INTO the footprint —
and once its centre crossed the box, the resolver's `d > 1e-4` gate meant no push ever again. 1158's probe
tested wedges/boxes, never a curved prop. Now centre-inside-box is HANDLED: expelled along the shortest
horizontal exit, capped 0.3/frame, unless the enemy is standing ON this collider's surface at its own
column (mid-ramp/stairs protected — the surface is at its feet). Outside the footprint the ordinary push
owns the rim, so through-traffic is dead. (2) STUCK BEHIND PROPS: the nav grid marks slab-tops walkable
within JUMP reach (NAV_UP derives from the jump apex) — semantics the BOTS execute (`wp.jump`, build 620)
but PvE enemies silently ignored, so the path said "hop the slab" and the enemy ground against the very
obstacle its route crossed. Enemies now honour the hint via the trap launch-arc machinery (`en.vy=JUMP`,
`launchY` integrator), with the bots' 0.9s cooldown so a tall wall isn't jackhammered.

## The gizmo learns local space (build 1173)

The editor critic, verified: every drag axis in `tryGizmoGrab` was a WORLD unit vector — a wall rotated 30°
could not be slid along its own length. A World/Local toggle (persisted, `breach_gizspace`) now rotates the
translate axes, per-axis scale handles and rotate normals by the PRIMARY object's quaternion via
`_gizmoRefQuat()`, and `updateGizmo` turns the visual to match — the handle you see is the axis you get.
Three things that made this small: scale MATH needed no change (it always scaled the object's own
components; only its handles pointed wrong in world mode); the rotated axis is stored IN the drag, so
`applyGizmoDrag` and the group path inherit it with zero changes; and lights/zones/markers return null from
the resolver (they are unrotated — world IS their local), as does a missing primary, so world mode is
byte-identical to before. Snap composes unchanged: `_snapAlong` snaps the component along whatever axis the
drag carries. FOURTH container rollback recovered during this build — same signature (906 harnesses), same
one-command recovery; the scripted-edit habit made the re-apply free again. (Also twice now: a heredoc
python step run from tests/ silently missed CLAUDE.md — run docs edits from the repo root.)

## Reload cancel + per-weapon draw (build 1172)

The panel's "reload jail", verified then opened: `reload()` was a setTimeout that always completed and
`switchWeapon` hard-returned `if(reloading)` — a 1.6s sniper reload locked out every response while a
charger lunged. Now switching CANCELS the reload via a token: the pending timeout completes only if its
token is still current, so a cancelled reload leaves the mag exactly as it was (test-1172 proves the stale
timeout is a no-op and reserve debits once), and the cost of cancelling is honest — two draw times. Draw is
per-weapon (`drawMs`: pistol 220, shotgun 340, sniper 420, launcher 450, fists 200, rifle/smg default 300)
with the viewmodel dip dividing by the same `_drawDur`, so a slow draw dips long instead of popping. Three
pins moved (227, 229, 965). Deferred from this item: shotgun shell-by-shell reload — its own build.

## Movement has mass (build 1171)

The gameplay critic's #1 feel finding: `player.vel = wish*sp` TELEPORTED velocity to the input every frame —
zero start-up weight, dead-stop on key release even mid-air (release W at the apex and the arc collapsed),
instantaneous 180s. Velocity now chases the target exponentially; the safe-change constraint is that the
TARGET is `wish*sp`, so every tuned speed is byte-identical at steady state. Four rates (the four situations
differ): ACCEL 14 (95% of top speed in ~210ms), BRAKE 20 (a run stops in ~0.6m — crisp, genre-typical),
AIR 3.5 (course corrections work, cannot carve like ground), AIR_BRAKE 0.4 (a released jump keeps ~67% of
its speed after 1s — the arc finally carries). The blend clamps at 1 so a dt spike degrades exactly to the
old behaviour; the slide still writes velocity directly (authored decay) and the model bleeds its exit speed
smoothly. `test-1171` simulates all of it frame-by-frame. Note: a test comparing an early-time ratio must
measure DURING the build-up — by 0.5s the ground turn has saturated and the ratio measures only the shared
target (the first draft made exactly that mistake).

**THIRD CONTAINER ROLLBACK, and the first that bit mid-build.** After 1170's push the tree reverted to
mid-1164 state; the 1171 edits were unknowingly applied to that stale base (the anchors existed in both
states), and the tell was the suite reporting 906 harnesses with 1164-era failures — FEWER harnesses than
the previous run is the rollback signature; check `git log` FIRST. Recovery unchanged: copy new files
aside, `git fetch` + `reset --hard FETCH_HEAD`, re-apply from the scripted edit (which made it free).

## Props gain a runtime lifecycle (build 1170)

The feature audit's single biggest expressiveness gap: no verb could touch a PROP at runtime — the ball in a
sports level could not be reset, a bridge could not drop. Four verbs by tag (`showprop/hideprop/moveprop/
delprop`), host-authoritative, mirrored to clients over the existing `wact` channel, offered by the Do node
(tag field + place field extended). Four decisions worth keeping:
- **hide is intangible too** — collider out of the list, a dynamic prop's body removed and remembered
  (`_pvWasDyn`); an invisible wall is worse than no verb. show reverses every part, idempotently.
- **move preserves height ABOVE GROUND** (crate on a ledge → valley floor lands ON the floor), and a dynamic
  prop's body is removed before and re-added after so physHome recaptures at the new home.
- **del rides `shatterProp`, deliberately not `removeProp`** — debris, the prop's own 'destroyed' signals,
  deploy-restore and net reconcile all inherited; removeProp would splice the prop out of propModels and the
  next SAVE would lose the creator's prop. A runtime verb must never edit the level.
- **deploy un-hides everything** (in resetDynamicProps): hide is MATCH state, not a level edit.
Three pins moved (1033, 1073, 1077 — the verb/tag/place field lists grew). Spawn-prop-by-prefab is the
deferred other half: it needs the prefab def + net id story, its own build.

## The logic graph learns arithmetic and its first question (build 1169) — PHASE 2 OPENS

The feature audit's two cheapest CRITICAL walls, closed with two nodes in the STATE palette:
- **Math** — `var = A op B` with + − × ÷ min max mod. A and B resolve as literals OR variable names via the
  same `_lgNum` rule Branch uses, so `coins = coins × 2` finally works. ÷0 and mod 0 yield 0, never NaN —
  one NaN would silently poison every later compare in the level. Modulo is the positive (counting) kind.
- **Read game stat** — the graph's first world-state QUERY: player HP/maxHP, ammo mag/reserve, score,
  credits, wave, enemies-alive (hp>0, hole-safe), seconds-elapsed (zeroed at `_lgRunT` each run) → a
  variable. Pulse-driven like every state node: wire off an interval to poll, or read at the decision.
  Host state, and the graph already runs host-authoritative, so nothing new crosses the wire.

The sanitizer needed no change (unknown types pass through inert), autocomplete learned both nodes'
variable names, and test-1028's palette↔runtime parity list gained the two types — the parity it exists to
hold. `test-1169` drives the REAL `_lgPulse` switch for every operator, both poison guards, self-reference,
and all nine stats.

## Frame-loop allocation hygiene (build 1168)

The perf critic's measured residue, all hoisted to module scratch (the codebase's own _lp/_pcV pattern):
movement basis + wish (3 vectors/frame) and the stick-input clones; the editor-fly basis; the ledge grab's
full-subtree `Box3().setFromObject(avatar)` (ran every airborne-forward frame — now a 1x/s cached height
with the same 1.1–3 sanity band); `allPlayers()` (fresh array + 2 closures per entry per frame — now cached
per frame keyed on `_frameNo`, which loop() bumps, so joins are stale for at most one frame);
`_aoHideNoDepth` (array + closure per OBJECT across 2 scenes per frame — now an allocation-free walk with
the identical predicate); and `surfaceTopUnder`'s `dynamicProps.filter()` per query while holding a prop
(now one reused module array). Behaviour pinned identical; three pins moved (1084, 1158, 966), each keeping
its assertion's intent. NOT done (bigger than hygiene): pooling spark velocity V3s (they outlive frames),
and replacing _aoHideNoDepth's traverse with a transparent-material registry.

One self-inflicted lesson repeated: an inline `//` comment appended to a REPLACEMENT that lands mid-line
comments out the rest of the original line (the surfaceTopUnder edit swallowed its own raycast). The
syntax check caught it; use /* */ or place comments on their own line when patching mid-line.

## Asset failures are visible (build 1167)

The commonest creator failure — a model url that 404s or CORS-fails — was a console.warn plus a silent null
hole in propModels; without devtools the conclusion was "the engine ate my prop". `_noteAssetFailure` records
failures (deduped by url with a repeat count, capped at 40), `levelIssues()` LEADS with them (url tail shown —
Poly Pizza urls only differ there), a later successful load for the same url heals the entry, and the report
clears on restoreLevel/wipe because stale failures about a previous level are their own kind of lie. A
failure landing while the editor is open refreshes the panel live.

## The credits screen exists (build 1166)

"Asset licensing + a credits screen are release blockers" has been in this file for hundreds of builds.
Attribution lived in two systems that never met: per-prop `userData.attribution` (placed CC-BY models) and
the `assetCredits` set (enemy/pickup/chest/coin/attachment models, sounds). A CC-BY licence is only satisfied
if the credit is REACHABLE at play time, so: `levelCreditsList()` merges both plus `ENGINE_CREDITS`
(three.js/Rapier/PeerJS/fflate), deduped and sorted; the pause menu carries **Asset credits** in every
session with no creator opt-in; entries render via `textContent` because attributions are untrusted level
data; and `levelIssues()` flags a `sketchfab:` prop with no recorded attribution as the licensing exposure
it is (models placed through the in-editor search always carry one — this catches hand-pasted urls).

## The level format version is finally read (build 1165)

`serializeLevel` has written `v:1` since the field existed and nothing ever inspected it — across ~1160
builds. The single-file GitHub-Pages model guarantees stale cached clients exist, so "new level opened in an
old engine" is a normal event, and it silently dropped whatever the old client didn't recognise. Now
`LEVEL_FORMAT_V` is a named constant, `serializeLevel` writes it, and `_levelFormatCheck` gates
`restoreLevel` BEFORE the teardown (a refusal must cost nothing): a newer `v` still loads — tolerance is the
right default — but warns loudly naming both versions and the fix (refresh the page); a newer `minV` is the
author's declaration that a partial read is load-bearing wrong and refuses cleanly. Bump `v` when the schema
changes shape; set `minV` only when an old client's partial read would corrupt rather than degrade.

## The host bounds the claim — movement and damage rate (build 1164)

The panel's two netcode CRITICALs, both verified at the exact lines. Build 1130 established "bound the
claim" for damage MAGNITUDE and identity; this extends it to the two surfaces it never covered:
- **Movement.** `setRemoteState` wrote a client's reported position verbatim — teleport/noclip/speedhack
  were one console line, propagated to every peer as truth. Now `_plausibleMove` (host only; clients keep
  trusting the host's relays) caps per-tick displacement at 40 u/s (90 in a car), with ONE oversized jump
  allowed per 3s window — that is the legitimate-teleport allowance (respawn, the teleport verb, a jump
  pad's first frame). A speedhack is continuous, so it spends the allowance instantly and rubber-bands
  along its own claimed direction; a real respawn is rare and passes untouched.
- **Damage rate.** `_netDmg` caps one packet, so 50 capped pvpHits per frame was an instakill through
  walls. `_netDmgBudget` is a leaky bucket per SOURCE per KIND (pvp 500/s, pve 1500/s — generous multiples
  of the best legitimate output: SMG headshot spray ≈290/s single-target, splash across a crowd multiplies
  the PvE figure). Per-kind so melting a wave never crowds out PvP claims; per-source so one cheater's
  bucket cannot tax an innocent player. test-1164 proves 50 sniper-cap packets land exactly the 1s budget
  and a full second of the fastest legitimate spray passes 100% intact.

Four pins moved (1122, 1130, 389, 459) — each asserts the same intent through the new wrapped call; 1122's
harness injects the budget as pass-through because that test is about ROUTING, not the clamp.

## Undo keeps the selection; hide/lock become undoable (build 1163)

Two panel findings, both verified. restoreLevel ends with `selProps.length = 0` — right for a level load,
wrong for undo/redo which run through the same path: every Ctrl+Z threw the selection away. performUndo/
performRedo now record the selected NIDs (stable serialized identity) before the restore and reselect after,
with a 350ms second pass because models respawn async — primitives reselect instantly, imports as they land,
and a prop the undone edit deleted is simply not found. And the outliner's hide/lock buttons mutate
SERIALIZED state (e.eh/e.elk) with no snapshot — now one `pushUndoSnapshot()` per GESTURE (row buttons and
folder-wide toggles alike; the setters stay snapshot-free so callers own granularity).

## Duplicate keeps the configuration (build 1162)

The editor panel's worst trust-breaker, verified then fixed: both duplicate paths (toolbar + Alt-drag)
spawned only src/transform/dynamic/material — signals, tag, name, interact, locks, dialogue, NPC name, xa
animation, joints and vehicle tuning silently dropped. The correct pair has existed since build 1030:
`_pfEntryOf` (full propEntry config, identity stripped) + `_pfSpawnEntry` (the apply block the level loader
mirrors). `_dupSpawnFrom` now routes both paths through it — so when entry fields grow, duplicate inherits
them instead of drifting again. Group duplication still remaps to ONE fresh gid. `test-332`'s two pins moved
with it (same intent: zero-offset clone, material kept — now proven via the entry path).

## Weapon feel: dt, movement cost, and a round cone (build 1161)

Three panel findings, each verified then fixed in one scoped build:
- `recoil *= 0.85` was PER FRAME — 144Hz recovered ~2.4x faster than 60fps, phones wallowed. Now
  `Math.pow(0.85, dt*60)` (and the muzzle flash the same), so one second of decay is identical at any
  framerate and exactly equals the 60fps value the guns were tuned at.
- Movement cost the player NOTHING — bots have paid a run-and-gun penalty since 933; the player never did.
  The load-bearing part is the additive airborne floor (0.030, ADS-mitigated x0.4): rifle and sniper have
  spread 0.0 and a multiplier of zero is zero, so a scale-only penalty would have left sprint-jump-sniping
  pixel-accurate. Standing-still values are byte-identical to the old tuning — nothing authored moved.
- Pellets sampled (rand-.5, rand-.5) — a SQUARE, corner pellets √2 wider than edge. Now angle+sqrt-radius
  over a disc, max deviation preserved (0.5*spread) so tuned reach is unchanged; ~21% of old pellets fell
  outside the intended circle.

## Jump learns what slide already knew (build 1160)

The gate was `_jPressed && player.onGround` on the EXACT frame. Build 926 documented this precise failure for
slide — "onGround flickers mid-stride... ate ~half of all slides" — and buffered it; jump never got the same
fix, so a press one frame after walking off a ledge (or one frame before landing) was eaten. Now: a 0.10s
coyote window refreshed while grounded, a 0.15s press buffer, jump fires when they overlap, and BOTH windows
are consumed on fire (plus `JUMP_CD`) so coyote can never grant a second jump mid-air. `test-1160` replays
the window logic frame-by-frame: coyote catch, buffered landing, no double jump, both expiries, cooldown.
Five pins moved (160, 360, 392, 493, 89), each keeping its lock (loader, warmup, ledge, slide-cancel).

## The review panel, and its first confirmed kill (build 1159)

Six independent harsh-critic reviews (rendering, editor UX, gameplay feel, performance, feature surface,
multiplayer/platform) were run against build 1158 and merged into `scratchpad/critics/ROADMAP.md`. Rule for
consuming them: **every claim is a hypothesis until verified** — one CRITICAL died on verification already
(the "zero raycast acceleration" performance claim; the hand-rolled BVH from build 1097 was invisible to a
grep for the popular library's name).

Build 1159 is the panel's first verified kill: `updateEnemyShots` tested each collider's OVERALL box while
every other consumer moved to build 1148's per-part `boxes`. An imported building's overall box encloses its
doorways and interior, so an enemy inside had its bolt die on frame 1 — enemies in buildings visibly fired
and never landed a hit. The player's shots raycast real triangles, which is why it read as "enemies are
harmless indoors" rather than "collision is broken". Fixed with the same coarse-reject-then-parts shape the
enemy resolve uses; `test-1159` replays the doorway.

## Two fixes that were applied to the wrong half (build 1158)

Both of these were reported as "still broken" after a build that had claimed them. Neither earlier fix was
wrong; each was **complete for the half of the problem it was tested against**, and that is the pattern worth
carrying: a rule stated in one place and applied in one place is not the same as a rule.

**1. The sprite's drop shadow, third time.** Build 1152 established the rule — nothing that fails to write
depth belongs in a depth-derived G-buffer — and swept `scn`. But the muzzle flash a player sees on almost
every trigger pull is `playFlipbook('muzzle', ..., vmMuzzle)`: a Sprite inside the **viewmodel scene**, which
build 1140 renders into that same `_aoGeoRT` through its own `renderer.render(vmScene, vmCam)`. So the world
explosions were fixed and the commonest sprite in the game was not, which is exactly what "still there" meant.
The sweep is now `_aoHideNoDepth(root, out)` and **both** callers use it. 1126 named the sky dome, 1128 named
the weather points, 1152 replaced naming with a rule and left it inline in one caller; the only way back to
this bug now is to add a third render into the G-buffer without calling the function.

**2. Enemies on ramps.** Build 1154 fixed the movement RADIUS — real, and measured — but the thing actually
stopping them was vertical. Builds 1092/1094 gated the ramp exemption on `b.max.y - feetY < STEP + 0.5`:
**a statement about the bounding box, not about the surface.** A ramp primitive is one mesh, so
`refreshPropCollider` gives it ONE box spanning floor to summit. Standing at the foot of a 2.4 m ramp that
difference is 2.4, the gate fails, the raycast never runs, and the enemy is pushed away from the ramp it is
trying to climb. It could only ever get on near the top, where the box top finally came within 1.1 m of its
feet.

`clearAt` has asked the right question since long before: `propSurfaceAt(c, cx, cz)` — **this collider's own
surface at the contact point** — walkable if within a step, or a genuinely sloped surface within `RAMP_RISE`.
A flat-topped wall fails both (its top is out of reach, or has no slope), so nothing becomes walk-through.
Build 1154 made an enemy fit wherever the player fits horizontally; this is the same rule vertically.

Measured by replaying the real obstacle pass over a real wedge with a real raycaster — 4 seconds of walking
straight at each obstacle at chase speed, reporting the highest ground reached:

```
                              OLD gate              NEW (clearAt's question)
ramp, 4x8, rises to 2.40   climbed 0.00 (z -0.70)   climbed 2.39 (z 25.5)
wall, 3.0 tall             climbed 0.00 (z -0.95)   climbed 0.00 (z -0.95)
ledge, 1.2 flat-topped     climbed 0.00 (z -2.70)   climbed 0.00 (z -2.70)
kerb, 0.4 tall             climbed 0.40 (walked over)  unchanged
```

**0.00 metres, forever** — that is the whole bug, and the wall and the flat ledge stop an enemy at a
byte-identical position, which is the evidence that relaxing the test cost nothing. `tests/test-1158` is the
durable version of that probe (it builds the geometry and drives both predicates), and `scratchpad/rampstuck.mjs`
is the ad-hoc one.

**Four pins moved with it — 1092, 1094, 1152, 1154 — and every one kept its assertion's intent.** 1094 is worth
reading: what that build established (never sample on the box boundary, and never at a merged box's centre,
because either mistakes a ramp mouth for a wall) is *still true and still pinned*; only the gate around it
changed.

## A GLB's own lights arrived raw (build 1157)

Build 1153 recorded this as open work — *"imported models' own lights are unhandled everywhere else. Only the
loot box is fixed, because that is the one that spawns mid-match"* — and framed it as needing a decision about
creators who legitimately ship a lamp model with a light in it. Reading GLTFLoader settles the framing: the
freeze was never the worst of it. Three things arrive raw, and each is a defect on its own.

```js
const range = lightDef.range !== undefined ? lightDef.range : 0;   // 0 is INFINITE in three
lightNode.distance = range;
if ( lightDef.intensity !== undefined ) lightNode.intensity = lightDef.intensity;   // glTF states CANDELA
```

- **Intensity is in candela.** Blender writes the hundreds or thousands. This engine's own decorative point
  lights sit at 2–8 and its SUN is 1.5, so one imported lamp is two to three orders of magnitude past the key
  light — build 1142's fault, arriving through the front door.
- **`range` is optional and defaults to 0**, which three reads as infinite. A lamp in a corner lights the whole
  level, through walls.
- **Nothing bounded the count.** Forty emitters in a chandelier GLB is forty entries in `NUM_POINT_LIGHTS`,
  looped per pixel by every material in the level.

So they are **adopted, not stripped** — a creator who ships a light means it. `adoptModelLights` scales the
whole model's set by ONE factor so the brightest lands at `MODEL_LIGHT_TARGET` (5.0) and the author's relative
intent between two lights in one model survives; gives a light with no stated range a reach derived from the
model's own bounding box (a GLB arrives in whatever units its author used, so a fixed metre figure is wrong on
one asset and absurd on the next); keeps the `MODEL_LIGHT_MAX` (4) brightest and removes the rest from the
graph rather than hiding them (build 977); forces `castShadow=false`; and registers each with build 811's
existing `emitterLights` budget so distance culls them like every other emitter. `finalizeProp` is the single
chokepoint every imported prop passes through.

**The normalisation must run exactly once, and a prop can leave and re-enter the scene.** `shatterProp` hands
the lights back to the budget and `restoreDestroyedProps` re-adopts them, so `adoptModelLights` is idempotent
via the remembered `userData.modelLights` — re-scaling on the way back would darken a lamp every time it was
destroyed. The loot box is deliberately NOT routed through this: it has a pooled beam and 1153 strips its
model's lights, and two glows on one crate is one too many.

## The horizon had two different grounds (build 1156)

The stock level — the first frame anybody who opens the game ever sees — read as monochrome teal. Measured at
the real spawn pose: **63.7% of the lower frame had blue as its largest channel**, against 22.1% red.

It was not the grade, the sky or the lights. `DEFAULT_WORLD.skyGround` (the dome's own ground band) is
`0x6b6660`, **warm**, linear B/R 0.80 — while the ground plane it abuts at the horizon was `0x4f5d66`, blue at
B/R 1.70, and it is the largest surface in the frame. Two different grounds either side of one horizon.

That is precisely what build 1143 fixed for GENERATED levels and 1151 made derivable: `groundMood` names the
ground albedo once and hands the same value to the bake, the dome's band and the engine plane. **`DEFAULT_WORLD`
was never run through it.** So `floorColor` is now skyGround's HUE at the floor's OWN luminance —
`0x5f5a55`, linear Y 0.1045, unchanged to four decimals. Holding the luminance is the whole reason this is a
one-line change rather than a re-tune: the grade, the exposure and build 1149's bounce term are all tuned
against it. `test-1156` pins the LINK, not the hex, so retuning the dome without the plane fails there.

Measured headless at the spawn pose, **control pair first** — two runs of the unchanged build agreed to 0.1 of
a percentage point on every figure, so everything below is far outside run-to-run spread:

```
                 frame mean     distant architecture     lower frame: B is the largest channel
before          111,128,138       103,121,128 (B>G>R)         63.7%   (reddest 22.1%)
floor warmed    114,128,135       114,119,117 (neutral)       46.6%   (reddest 33.5%)
+ wall too      115,128,134       115,119,116                 41.5%   (reddest 39.4%)
```

**The wall change was measured and NOT shipped.** `groundMood` also derives the boundary walls (the same albedo
at 55%), but applying that here would halve this level's wall luminance — a different change from the one being
made — and warming the wall at its own luminance instead buys 5 percentage points while spending the
cool-distance note that a warm ground reads against. Recorded so it is not re-derived.

**Two things in the open-work list were wrong and are now settled by the same capture:**
- *"A hard horizontal SEAM runs across the middle of the frame where the teal floor plane meets an olive
  band."* The largest row-to-row jump in the frame is at y=337 with a magnitude of 333 — that is the **horizon**
  (sky 191,199,208 above, ground 75,90,98 below), which is supposed to be there. The largest jump BELOW it is
  105 at y=498 and it is a **luminance** edge — a raised platform's shadowed face — whose magnitude this build
  does not change (105.5 → 103.9) and should not. What DID change is its character: the surface above it went
  `75,106,111` (B highest) to `90,104,96` (neutral), so it is now a light/dark step rather than a teal-to-olive
  hue break. There is no hue seam to fix.
- *Build 1136's recipe, "warm the architecture and keep the props cool", is backwards for this level.* The
  probe says the architecture ALREADY reads warm (albedo 0.042/0.036/0.028, R>G>B) and it is the engine's
  ground plane that was cool — and brighter than everything standing on it. The ground was the term to move.

**And the pose is the finding, not a detail.** The first capture of this build was taken at a camera I picked
(0, 1.7, 14) and nine of its ten probe points hit `src=wedge` — a ramp 4.85 m in front of the player. At that
pose the frame measured 52.4% RED-dominant and the conclusion would have been "there is no teal problem". The
spawn is `(0, 2.9, 30)`. `stock.mjs` therefore defaults to **no pose at all**: it captures where the game
actually puts you, and `POSE=` env overrides only when a specific vantage is the question. Build 1124 said know
where the camera is; the corollary is that for "what does a new player see", the only valid camera is the
game's own.

## The fourth light, and the guard that names the fifth (build 1155)

Build 1153 fixed the loot box and wrote down the rule. **The same fault was live one screen away**, on the
commonest action in the game: `buildPropFireGroup` did `new THREE.PointLight(...)` + `grp.add(light)` +
`scene.add(grp)` the moment a prop caught fire, and the way a prop catches fire is
`damageProp → igniteProp` on a fused explosive — *shooting a barrel*, mid-match, in combat. Shattering it took
the light back out and recompiled again. Fixed the same way: `_fireLightPool`, seated at deploy, claimed and
released, unparented and aimed in world space by `_animateFire`, with `_reconcileFireLights` so no removal path
can strand a beam.

Two things are different from the chest pool and both are deliberate:
- **No floor on the pool size.** `min(FIRE_LIGHT_MAX, burnablePropCount())`, and burnable means
  `onFire || (explosive && fireFuse > 0)` — the two conditions `igniteProp` is reachable from. Every seated
  point light sits in `NUM_POINT_LIGHTS` and is looped over per pixel by every material whether or not anything
  has claimed it, so a level with no fire must pay nothing. The chest pool's floor of 4 is right for *it*
  (crates spawn randomly, so a level with no loot spots can still get one); nothing spawns a fire.
- **The editor seats the pool itself.** Authoring is not play: a creator who has just placed a barrel needs its
  glow now, and growing the pool there costs an editor hitch instead of a mid-match freeze.

Fire ZONES are untouched, and that is a judgement not an oversight: `refreshFireZones` disposes N lights and
builds N synchronously, so the count at the next render is unchanged — no recompile. Only the per-prop fire was
a genuine mid-match add.

**Four builds have now shipped this fault** — 636 (the first explosion), 977 (the first flashlight toggle),
1153 (the first loot box), 1155 (the first barrel). Every one arrived as a player reporting a multi-second
freeze, and every one was then found by *guessing* which subsystem had made a light. So this build also adds the
standing guard, `_hitchLightWatch`:

- **It costs nothing in a normal frame.** A recompile of every material in a level is a 1–3 second frame, so it
  only looks past `HITCH_MS` (220) — and only during play, because authoring legitimately moves the count.
- **The baseline is taken at DEPLOY**, after every pool is seated, so even the very first offending frame has
  something to compare against. Sampling only on hitches would have had nothing to compare on the first one.
- **`traverseVisible`, not `traverse`.** Three's `projectObject` skips an invisible subtree entirely, so an
  invisible light is not counted — which is exactly build 977's trap, and a plain traverse would be blind to it.
- It warns with the delta, the per-type breakdown and the names of the three pools, then stops after three.

**`test-01-syntax` had never parsed the one `type="module"` block.** `vm.SourceTextModule` needs
`--experimental-vm-modules`, which `run-all` does not pass, so the harness reported a failure whose message was
about the instrument (`is not a constructor`) rather than the source — and the Rapier loader went unchecked. It
now rewrites top-level `import`/`export`/`import.meta` out of the body and parses it as an async function body,
with a check that a deliberately broken body still fails, so the rewrite cannot swallow a real error.

## An enemy must fit wherever the player fits (build 1154)

Reported from play with a screenshot: enemies could not get up the default level's ramps or around its
boxes, and were clipping into one another — **"this was happening with the default capsule enemies as
well"**, using an imported model scaled to 0.38409. That last clause is what solved it: it ruled out the
model and pointed at a shared constant. Two numbers, neither about the GLB.

**1. The movement radius was bigger than the body — and bigger than the player.** The obstacle pass holds an
enemy `footprint` away from every collider box. The capsule's real radius is 0.7 (`CapsuleGeometry(0.7, 1.4,
...)`) but its footprint was `0.9*ty.scale`; an imported model's was `Math.max(0.9, realHalfWidth)`, so the
reported model — true half-width 0.365 — was held off obstacles by **2.5× its own width**. Both exceed the
PLAYER's `radius: 0.8`, which is the part that reads as "stuck": an enemy could not follow you through a gap
you had just walked through.

Replayed through the engine's own obstacle pass (`scratchpad/botstuck.mjs`) over a crate beside a ramp, a
1.2 m gap:

```
eR 0.9  PUSHED 0.50      eR 0.8  PUSHED 0.40      eR 0.5  PUSHED 0.10      eR 0.3  fits
```
Now `ENEMY_CAP_R = 0.7` for the capsule and the model's real half-width otherwise, floored at
`ENEMY_MIN_R = 0.3`. A genuinely wide model is still wider than the player — this is per-size, not a blanket
shrink.

**2. Separation lost a race it could not win.** Build 995 capped the anti-overlap push at `3.5*dt` because a
packed huddle applying full corrections every frame visibly vibrated. But 3.5 is **0.058 per frame** at
60fps, while a grunt CHASES at 6-9 u/s — 0.10 to 0.15 per frame each, so two enemies converging on the
player close at up to **0.2 per frame**. Steering out-ran separation by 3.4×, so enemies chasing the same
target sank into each other and stayed there. The cap now tracks the pair's own speed
(`max(3.5, speedA + speedB)`), giving 0.20-0.30 per frame.

Raising it cannot bring back build 995's vibration, and that is worth understanding rather than trusting:
`Math.min((minD-d)*0.5, cap*dt)` — the FIRST term is what prevents overshoot. The cap only limits speed. 995
fixed the vibration by adding the cap at a moment when the first term was doing the real work anyway; the
ceiling was never the stabiliser.

**Not the cause, and worth stating because it is the natural suspect:** the editor's *Collider radius* and
*Collider height* size the DAMAGE hit-cylinder only — the hint under them says so — so the reported 0.3 / 0
settings were correct and irrelevant. Height 0 means auto-fit.

Three pins moved with it, all preserving their intent rather than their literal: build 995's (the shove is
still a capped SLIDE, and 3.5 is still the floor for a standing huddle), and builds' 16 and 67 "footprint is
auto, decoupled from the collider radius" — still true, from a different constant.

## The fog learns altitude and where the sun is (build 1181)

Fog was one global `FogExp2` — a single colour at every height, blind to the sun. Overriding three's OWN
fog chunks (`fog_pars_vertex/fog_vertex/fog_pars_fragment/fog_fragment`) patches every built-in material in
one place: an exp height falloff (`fogHeight`, towers rise out of the fog, valleys pool — applied to the
OPTICAL DEPTH under exp2, so both fog models keep it) and a warm inscatter lobe looking down-sun (`fogSun`,
pow-8, colour `fogColor*[1.30,1.08,0.75]+[0.22,0.11,0.02]`). Raw ShaderMaterials (sky, water) untouched by
design. `renderScene` feeds `_sunDir()` NEGATED (it points sun→scene; inscatter wants toward the sun).

**The uniform plumbing was a silent no-op as first written, and the real three build said so before any
capture could.** The plan — "extend `UniformsLib.fog` with PLAIN-OBJECT values; `UniformsUtils.clone`
copies plain objects by reference, so every material's per-material clone shares them, one CPU write per
frame" — is true about clone (verified: Vector3 deep-clones, plain object rides by reference), but
**ShaderLib merged `UniformsLib.fog` at module load**, so a late add to the lib reaches NOTHING:
`initMaterial` clones `ShaderLib[id].uniforms` and `seqWithValue` silently DROPS any program uniform with
no value — both uniforms would sit at GL zero forever, which is exactly "falloff 0 + inscatter 0", a
perfectly plausible-looking frame. So the engine also walks `ShaderLib` and adds both uniforms to every
entry whose uniforms carry `fogColor`. The same pre-test run caught a second silent kill: **the sprite
vertex shader has no `transformed`** (no `begin_vertex`), so the shared `fog_vertex` would fail to compile
there and every fogged Sprite — the muzzle flash — would VANISH, build 1127's raw-shader trap. Sprites get
their fog include string-replaced to fog at their world ORIGIN. Instanced meshes apply `instanceMatrix`
inside the chunk (`project_vertex` folds it into `mvPosition`, never into `transformed`) or every batched
prop would fog at the batch origin. `test-1181` drives ALL of this against the real three build — the clone
semantics, the late-add-reaches-nothing fact, the sprite/begin_vertex facts — plus the executed maths
(optical-depth ratio equals the height term exactly; the mix saturates, so assert on depth, not the mix).

## The weapon came back to the editor (build 1264)

Reported from play: *"I can't see any weapons in the editor. When adjusting position for FPS, aim,
third-person weapon adjustment, it's impossible because no weapon is visible."* Build 1137 answered a
critic — the rifle covered a measured 11% of the AUTHORING viewport — with a blanket
`if(editorOpen) return false` in `_vmWanted`. Right about building, wrong about the three panels whose
entire job is posing the weapon: view framing, the ADS pose and the throw pose are all authored BY
EYE, against a weapon the author could no longer see. **A blanket rule was cheaper to write than the
distinction, and the distinction is what a creator needs.** The viewmodel now returns for exactly
`gun` / `aim` / `grenade` and stays hidden for every other kind of authoring, which preserves 1137's
real intent rather than reverting it. A non-first-person authoring camera still gets no viewmodel —
except on `aim`, which is precisely the pose a creator tunes when the level ships in another view.

**Two lists had to agree, and only one of them was wrong.** The editor camera has set
`gun.visible = (editorActive==='gun' || editorActive==='aim')` since build 151 — the engine already
knew which targets wanted the weapon. 1137 then stopped the PASS from running, so the mesh was
visible inside a pass that never drew: a visible object and an empty screen. Both lists now name the
same three targets, and `test-1264` asserts they agree, because either one alone is a silent no-op.

**Live-probed per target** (`vmWanted` / `gun.visible`): gun ✓✓, aim ✓✓, grenade ✓✓, props ✗✗,
lights ✗✗. Two pins moved (1137, 151).

**And I fell into my own build-1260 trap again in the probe** — nested template interpolation set
`editorActive` to the literal string `${tt}`, so the first run reported every target false and would
have sent me hunting a second bug that did not exist. Build the probe's source in Node and pass it as
one argument; it is now written down twice.

## The characters were never on the mover list (build 1263)

Reported from play within minutes of 1261 shipping: *"the character is running nicely, and the shadow
is super janky"* in third person. A regression I caused, and the mechanism is worth more than the fix.

`renderer.shadowMap.autoUpdate=false` means the map only re-renders when something calls
`_dirtyShadows`. Builds 807/808 built that mover list carefully — driven cars, coasting cars,
animated props mid-travel in the FAST tier; corpses and settling physics props every third frame —
and **never listed the player or the enemies.** Their shadows were current anyway, because
`_fitSunShadow` returned true on almost every moving frame and the loop calls `_dirtyShadows(1)` when
it does. The camera-fit was doing the caster refresh as a SIDE EFFECT, and nothing said so.

Build 1261 cut the refit to 19–31% of moving frames — correctly, for the volume — and the character's
shadow fell to that rate while the character itself moved at 60fps. In first person you barely see
your own shadow; in third person it is the thing you are looking at.

The movers are now named honestly: a moving player (velocity sum over 0.05), any living enemy, and
any remote player in a session. All three are skinned meshes whose pose changes every frame, so they
belong in the FAST tier beside a driven car. A still player in a quiet scene still costs nothing,
which is the case the static optimization was actually written for.

**The rule, which is the real output of this pair of builds: a perf change is allowed to remove work;
it is not allowed to remove work something else was silently relying on.** 1261 measured the thing it
changed (refit rate) and never asked what else consumed it. The measurement was right and the
conclusion was too broad — and the honest accounting is that 1261's win now applies to quiet scenes
rather than to active gameplay, where the map must refresh every frame regardless, because that is
what a dynamic shadow costs. The deadband stays: it was always right about the VOLUME.

## "Static" shadows were redrawing every moving frame (build 1261)

The audit's #3 performance finding, reproduced exactly: `renderer.shadowMap.autoUpdate=false` (7024)
bought nothing while the player was moving. `_fitSunShadow` snaps the focus to the shadow map's texel
grid, so ANY change is at least a full texel — which made the old `> texel*0.5` test true whenever
the snap moved at all. Measured by driving the real function over a 600-frame walk: **both cascades
redrew the entire caster set on 100% of moving frames.** The tiered mover-dirtying (33316) only ever
paid off standing still, which in an FPS is rare.

The fix is a DEADBAND, not a frame throttle, and the distinction is the whole design. A shadow map is
rendered from the LIGHT, so a stale fit does not lag the shadows of STATIC geometry at all — it only
leaves the covered REGION slightly behind where it would ideally sit. **That sentence was published
one clause too broad and build 1263 pays for it: the refit was also, silently, the thing refreshing
the map for MOVING CASTERS. See "The characters were never on the mover list".** And because the test is a DISTANCE, it is
self-limiting: a car crosses it sooner than a walker and refits proportionally more often, so
staleness never grows with speed. A frame-count throttle would have had exactly the opposite property.

`SHADOW_REFIT_TEXELS = 8`, chosen from a measured sweep rather than picked (the sweep is in the
source comment and `test-1261` reproduces it):

```
texels   walk 0.10   run 0.16   car 0.60   slack@E60
  0.5       100%       100%       100%        3cm     <- the old rule
    4        34%        50%       100%       23cm
    8        19%        31%       100%       47cm     <- shipped: 3-5x fewer redraws on foot
   12        13%        20%        50%       70cm
```

Slack scales with the texel, which scales with `shadowDist`, so it is always ~0.4% of the volume at
any setting — and the volume's trailing edge already sits 0.45*E (27 m at the default) behind the eye.
Lower quality rungs double the deadband: the machines that most need the draw calls back are the ones
least able to see the difference. Build 1120's texel snap is untouched — it is precisely what makes a
deadband safe, since without it the map would slide sub-texel every frame anyway.

**My first guess was wrong and the measurement said so.** I picked 4 texels expecting a 2.5x cut;
it measured 2.0x at a run, and the staleness bound I asserted (20 cm) was also wrong (23 cm). The
sweep then showed 8 was the honest choice. Two pins moved (1120, 1185) — both rigs execute
`_fitSunShadow` in isolation and it gained a constant, now supplied via `extractConst` so they test
the shipped value rather than a copy.

## HUD art (build 1260)

Widgets could show numbers (1058) and take a click (1255) but never show a PICTURE, so every
authored interface was engine-coloured text on the engine's own plate — no card faces, no portraits,
no panel frames, no title art. This is the audit's "HUD/UI authoring is variables-only" gap and the
second half of the card-game unlock. `img` is **one field with two roles, decided by the kind**: on
the new `image` kind it IS the widget, on every other kind it is the BACKGROUND — so a button becomes
a card face and a bar sits inside a frame. Plus `iw`/`ih` (an AUTHORED box, so nothing reflows when
the picture lands) and `alpha`.

**The url goes into CSS and level data is untrusted, so it is VALIDATED, not escaped.** `_hwSafeUrl`
requires an `http(s)` or `data:image` scheme and rejects any quote, paren, backslash, angle bracket or
whitespace — nothing can break out of `url("...")` or smuggle a scheme, and validation happens once at
SANITIZE time so the render path interpolates a string that is already known good. `test-1260` drives
it with eight injection shapes beside the legitimate ones. Worth knowing: a CSS image needs no CORS
header, unlike the texture fields next door — the editor hint says so, because the analogy would
otherwise mislead.

Two harness notes, both cost a cycle:
- **A literal quote inside a regex derails `extractFunction`.** `_hwSafeUrl`'s character class is
  written with `\u0022`/`\u0027` on purpose: with real quotes, extraction ran away by 125,000
  characters and two unrelated harnesses died with `savedLevel is not defined`. The file already
  favours `\uXXXX` escapes (307 of them) — this is why.
- **A probe that builds its own source with nested template interpolation will mangle it.** The first
  live run reported the art missing; the engine was fine and the probe had turned the url into the
  literal `${u}`. Building the probe string in Node and passing it as one argument fixed it. Verified
  after: a 220x140 image widget renders, and a card-face button fires the graph on a real mouse click
  ("PLAYED 1" counting up).

Three pins moved (1058, 1255 twice) — all rig plumbing for the sanitizer's new dependency, intent
unchanged.

## The graph reads the inventory (build 1259)

Dialogue could branch on what the player carries (`[if item:redKey >= 1]`) since build 1076; the
LOGIC GRAPH never could — `read` knew hp/ammo/score/credits/wave/enemies/time and nothing about the
inventory. So "the player is holding two fire cards" was expressible to an NPC and invisible to the
rules, while `give`/`take` had been verbs for builds — the graph could CHANGE the inventory it could
not READ. That asymmetry is the wall under every card, rune, ingredient and collection puzzle,
because such a puzzle IS a condition on what you hold.

Two stats, because they answer different questions and neither can express the other:
- **How many of an item** — `invCount(id)`, deliberately the same accessor dialogue conditions use,
  so the two surfaces can never disagree about what "holding" means. The item field carries
  `lgItemList`, so it offers the level's real ids.
- **Different items held** — non-empty stacks. "One of each of the four runes" cannot be written as
  a count of any single id.

An id that names no defined item reads 0 forever, which looks EXACTLY like "the player has none of
it" — the hardest class of bug to see. So a read with a blank or undefined id reports through
`_noteLogicFailure` (deduped, so a polled read reports once, not every pulse) and surfaces in Level
Check, the same courtesy tag verbs have had since 1214. The validation lives in the `read` case
rather than beside the tag checker, which has no node in scope.

**Design note, since this build exists to unlock card/puzzle mechanics.** Verified while scoping it:
an inventory item can already carry a **model, a tag and its own signals**, and `useType:'place'`
spawns it into the player's hands to drop — so a PHYSICAL card puzzle (cards as objects, plinths as
prop signals with `On object placed` + tag filter + contain + consume, `needs N` for combinations)
was fully authorable before this build. What was missing was the graph's ability to reason about a
HAND. With 1255's HUD button as the play surface and 1258's push as a world effect, the native design
for this engine is **cards as world verbs** — play a card, the room changes — rather than a 2D card
game the engine has no UI for. Remaining gaps for a true deck game: no image on a HUD widget (a hand
can only be text buttons) and no ordered collection type (draw works via Set-variable's random
min/max; shuffle/discard past ~6 cards is awkward).

## The graph gets force (build 1258)

The audit's gameplay gap #5: the graph could query the world and command enemies but had no way to
apply an IMPULSE — so a ball could be teleported to a goal and never kicked toward one, and a physics
puzzle could reset a crate but never nudge it. `moveprop` is a teleport; **`pushprop`** is a shove.
Four decisions:

- **Direction comes from the place field every other verb already uses.** Props are pushed AWAY from
  it: "away from `me`" clears a path, "away from `#here`" is a blast at the event's own spot, a tag
  is a fixed launcher. No place = straight up, which is the useful default. The direction is
  NORMALISED, so distance never changes the shove — 3 m and 300 m from the origin get the same push.
- **Strength is a VELOCITY CHANGE, not a raw impulse.** The impulse is multiplied by each prop's own
  mass, so "20" moves a crate and a barrel identically. Raw impulse would make every push a guessing
  game about the weight slider, which is the opposite of authorable.
- **An upward component rides along (0.4×)** so pushed props tumble and read as struck rather than
  sliding like ice.
- **No network message, deliberately.** The graph is host-authoritative and dynamic props already
  stream their motion to clients in the D snapshot, so the result arrives by the channel that carries
  every other physics event. The prop STATE verbs need `_wactSend` precisely because show/hide/move/
  destroy are *not* physics and the snapshot does not carry them — `test-1258` pins the absence so a
  future edit does not "helpfully" add one.

Guards that matter: the body is WOKEN first (a settled Rapier body swallows an impulse), a prop
sitting exactly on the origin gets a random horizontal direction instead of NaN, static and shattered
props are skipped, a blank tag pushes nothing rather than everything, and the amount clamps 0–100.
Four pins moved (1033, 1073, 1077, 1170) — all verb-list literals, intent unchanged.

## The light census, and a deploy cap (build 1257)

The audit's #1 PERFORMANCE ceiling, and it is structural rather than a bug — which is why it needed
naming rather than fixing. `updateLightBudget` (811) fades an emitter's INTENSITY past the nearest
16 (8 on phones), but by this engine's own hard rule (636/977/1153/1155) the light must STAY IN THE
SCENE, because removing it changes the light count and recompiles every material mid-match. r149's
forward renderer has no clustering: it compiles `NUM_POINT_LIGHTS = every light present` and every
fragment of every material loops over all of them, dimmed or not. So a creator who ticks "Light
emitter" on thirty props pays a 30-light loop per pixel forever, on the devices least able to afford
it — and nothing in the product ever said so. `_hitchLightWatch` (1155) only notices a CHANGE in the
count, never its absolute size.

Two answers, both cheap, because the expensive one (clustered/deferred lighting) is a renderer
rewrite:
- **Visible.** `_lightCensus()` counts by type over the visible graph; `_lightLoad()` is
  point + spot — deliberately NOT the directional/hemisphere pair, which is fixed at a handful and is
  not what content grows. Level Check warns past `LIGHT_SOFT_CAP` (40) and, unusually for that panel,
  says *why* it costs and what to do; shadow-casting lights get their own line (each is an extra
  render of the level whenever it moves). The perf HUD shows `lights N` beside draws and triangles.
- **Bounded.** `enforceEmitterCap()` runs at DEPLOY inside `preloadVfx`, beside the pools that are
  seated there and **before `warmFlipbookShaders` compiles against the count** — so the surplus is
  refused at the one moment a count change is already expected and free. 48 lights, 24 on phones.
  A refused light is REMOVED FROM THE GRAPH, not hidden (hiding still counts — 977's trap), the prop
  keeps its emissive glow (that is free), and the count is reported in Level Check rather than
  silently swallowed.

`test-1257` executes both: the census over a stub scene (types, totals, shadow casters, throw-safe
degradation) and the cap on both budgets — including that it is a complete no-op below the cap, so
ordinary levels are byte-identical.

## Draco models load (build 1256)

The inlined GLTFLoader has supported `KHR_draco_mesh_compression` since it was vendored — it throws
`'THREE.GLTFLoader: No DRACOLoader instance provided.'` — but nothing ever gave it one, so a
Draco-compressed .glb became a capsule plus a line in the asset-failure report. Sketchfab and most
"optimize my glTF" pipelines emit Draco by default, so this was a silent wall between a creator and
a large slice of the free-model web. Wired as the **third instance of builds 917/918's pattern**:
the failed load names the missing decoder, `_ensureDraco()` pulls it in on demand (memoised — one
download per session, shared by every later model, never disposed), and the load is re-queued. Nobody
pays the decoder's download until a model needs it. DRACOLoader imports `three`, so it comes from
esm.sh (the KTX2 constraint); the wasm/js decoder is a plain jsdelivr fetch, `preload()`-warmed so
the first Draco model does not pay the round trip mid-load. When the decoder genuinely cannot be
fetched, `_noteAssetFailure` rewrites the error into something a creator can act on ("re-export it
without Draco compression") instead of leaving an unexplained capsule.

**The audit was wrong about this one, and checking cost nothing.** The rendering critic reported the
decoder "already exists in the optimizer/repack path (15803–15818) — it just never reaches the game's
loader," which would have made this a two-line wiring job. Reading those lines: they are the meshopt
SIMPLIFIER (`S.simplify`), and `new DRACOLoader` appears nowhere in the file outside the vendored
library. The fix was the same size either way, but the note is the point — the panel's own rule
("every claim is a hypothesis until verified") applies to the panel.

**The load-bearing test is against the LIBRARY TEXT, not an assumption.** The retry fires on a regex
over GLTFLoader's error message; if an upgrade rewords it, the retry silently never fires and Draco
models quietly become capsules again with nothing failing. So `test-1256` extracts all three decoder
messages from the vendored source and drives the real error router with them — which immediately
caught that the three differ in SHAPE: KTX2 and meshopt name their **setter**
(`setKTX2Loader must be called…`), Draco names the **loader** (`No DRACOLoader instance provided.`).
The first draft of the test invented a symmetric KTX2 message and failed; the engine was right and
the test was wrong.

## The HUD becomes an interface (build 1255)

The audit's #1 gameplay gap: `_sanitizeHudWidgets` permitted `text | timer | bar`, display-only —
so no creator could author a shop, a quest log, an upgrade menu or a tycoon panel, and the only
purchase UI in the engine was the hardcoded loot-chest cache. A **`button`** widget fires a NAMED
LOGIC EVENT, and that is the whole feature: the graph already owns credits, inventory, spawning and
win conditions, so "buy the turret" is one button plus nodes a creator can already write. Three
things make it work rather than merely exist:

- **It reuses build 1071's `actEv` message for clients** — the host already clamps and routes it, so
  multiplayer buttons cost no new message type, no new handler, and inherit the existing validation.
- **A real `<button>` element** (focus and Enter/Space come free) that opts into `pointerEvents:auto`
  against the widget host's `pointer-events:none`, with the click stopped so it never reaches the
  world behind it.
- **A visible button releases the pointer**, exactly as `openInventory` does, and re-locks when the
  last one hides — a menu you cannot click is not a menu. `show when` gates the whole menu open and
  closed. Plus a 150 ms per-widget cooldown so a held mouse cannot flood the pulse budget.

A button's event name also joins `_lgEventOptions`, so the graph's **On event** dropdown offers what
you just authored.

**The live probe earned its keep, and the finding is the lesson.** `test-1255` passed with every
stub — and the button was INERT in the real game. `document.elementFromPoint` at the button's own
centre reported a **pause-menu label**, and the gates read `paused:true`. Releasing the pointer trips
the unlock handler's `openPause()`, so **making the button clickable was itself what made the game
reject the click** (it failed `_hwFire`'s own `paused` gate *and* was covered by the menu). The fix
is the mechanism the inventory already used: `_hwCursorFree` joins the handler's "a UI is
legitimately open" whitelist beside `chatOpen`/`mapOpen`/`invOpen`, and the flag is raised BEFORE the
release so the async `pointerlockchange` sees it. Three pins moved (192, 376, 60). Re-probed live:
two real mouse clicks → 100 credits, with the `{gold}` readout following. **Build 1244's rule, third
sighting: a unit test with stubbed dependencies proves the maths, never the mechanism — probe the
live path.**

## The remix trap is closed (build 1254)

The audit's #1 editor data-loss finding, replayed and killed. The gallery invites "open in editor to
remix", share links load straight over the working level, and there is ONE save slot — so opening
someone else's level and touching anything meant the 20-second autosave overwrote your only save
with THEIR level, silently, with an undo stack that dies with the tab. Now a level that arrives from
outside is **FOREIGN** (`markForeignLevel`): five entry points marked — `#lvl=` share links, `?game=`
URLs, the community gallery (Play AND Open in editor), file import (even your own backup — one Save
adopts it), and help-modal example projects. While foreign, EVERY automatic save path stands down:
the 20s timer, visibilitychange, before-play and on-close flushes all funnel through `autoSaveNow`'s
new gate, and the `beforeunload` direct-save gained its own `!_foreignLevel` term (two pins moved —
330 and 1083 — both keeping their flush-on-close intent). The autosave status line says what is
happening and why. An explicit **Save adopts** the level (`_ok && (_foreignLevel=false)` on the
button; Ctrl+S clicks the same button), and autosave resumes exactly.

The second half: a foreign load over UNSAVED work — the one state the save slot does not hold —
stashes the current level to a one-deep **rescue slot** (`breach_level_rescue_v1`, timestamped)
before it is replaced, with a toast naming where it went. The Save tab grows a **Restore backup**
row (hidden when the slot is empty, refreshed live via `_edRescueRefresh`): restoring pushes an undo
snapshot, loads the stash, marks it yours-and-unsaved so one Save commits it, and clears the slot.

`test-1254` executes the real `markForeignLevel` + `autoSaveNow` through the trap replay (dirty +
gallery + three autosave ticks → zero saves, stash intact), the clean-load case (no stash needed),
adoption, and native behaviour (byte-identical when nothing foreign happened) — and pins all five
entry points. Test-harness lesson recorded: returning `{ ...r }` from a rig SNAPSHOTS getters and
drops setters — assign extra keys onto the object instead.

## The audit, the reference, and the docs tell the truth (build 1253)

A nine-agent audit ran against build 1252 — six harsh critics (rendering, editor UX, gameplay
systems, multiplayer/platform, performance, content pipeline), each benchmarking against
Unreal/Unity/Godot/Roblox with the 1159 rule (every claim verified in source, citations required),
plus three inventory agents that catalogued every real control from the UI-builder code. Deliverables
now IN THE REPO (scratchpad gets wiped by rollbacks): **docs/AUDIT.md** (merged verdict + six full
reports + a consolidated quick-win list) and **docs/REFERENCE.md** (every setting/widget with ranges,
defaults and behavior — World & Scene, Objects/Tools/Editor incl. the full shortcut table, Game
Systems/Logic/Sharing incl. the complete node/verb tables and the wave-manifest grammar).

The merged verdict, one line per dimension: fair competitor on friction/rendering/systems-density;
the six ceilings are LOD/occlusion (rendering scale), no scripting escape hatch + one save slot
(editor), engine-owned PvP + no clickable UI + no world-state persistence (gameplay), no
identity/reporting + free third-party network infra (platform), unbounded light counts + a
too-high quality floor (performance), and docs frozen ~160 builds back (content).

Build 1253 fixes the audit's Gap 3 — the docs' three live factual errors: the in-game help claimed
"GitHub account needed" to publish (false since build 958) and never mentioned the instant /game/
publish (the least findable best feature — now surfaced in the same topic); the export button said
"Export .json" while writing `.rumpus` files the manual called `.breach` (three names, one file —
now "Export .rumpus" / "Import level"); breach-help.html still rendered the BREACH wordmark 300
builds after the rename (now RUMPUS ENGINE) and its `.breach` claims are corrected with the compat
promise kept explicit. A **What's-new section (builds 1090–1253)** was appended to the manual
covering every undocumented creator feature by task (editing faster / your own assets / looking
better / deeper rules / feel & combat / multiplayer & sharing). One pin moved (816 — the icon
assertion carried the old label). `test-1253` guards all of it, including that the false account
claim can never return.

## Per-emitter effect controls (build 1252)

Asked for from play the day 1250 shipped: Amount, Speed, Size, Spread, Height, Opacity, Saturation
and Color, per emitter, in an **Effect** section under the Tag row whenever the selected prop is an
fx_*. Overrides are MULTIPLIERS over the preset (never replacements — a preset retune still reaches
every emitter that hasn't overridden that knob), stored in `userData.fx.cfg`, serialized as `fxc`
through `propEntry` — the ONE serializer that saves, prefabs, duplicate, clipboard and net pAdd all
route through (1162's lesson, applied for once in advance) — and applied at all FOUR loader sites.
The editor writes cfg and calls `_fxReset` (tear down the Points + geometry; next tick rebuilds),
which is also how Amount changes the particle COUNT with no special path. Semantics worth keeping:
`_fxEff` returns the PRESET OBJECT ITSELF when no cfg exists (zero cost for untouched emitters);
Height means rise-rate for grounded plumes, region height for drifting volumes, and 1/gravity for
the fountain (same launch, higher arc), while Speed scales a jet's v AND g together so v²/g holds
and the arc keeps its exact shape at a faster tempo; the Color tint REPLACES the preset ramp (pick
red, get red — multiplying orange by blue gives black); Saturation lerps about luminance. Sliders
push undo on grab; Reset deletes cfg so the entry serializes nothing. `test-1252` executes the
sanitizer and derivation knob by knob; live-probed: an ember emitter with `{col:0x3388ff, amt:2}`
renders 128 particles reading 7,684 cool / 0 warm pixels against 1250's 1,022-warm baseline, and
`propEntry` round-trips the cfg.

## The third-person flashlight beams from the player (build 1251)

Reported from play: in third person the flashlight lit the scene FROM BEHIND the player. The light
has been parented to the CAMERA since build 672 — exactly right in first person, where the camera is
the eye, and wrong in every chase view, where the camera hangs metres behind the avatar.
`updateFlashlight()` re-homes it per frame: camera-parented at the original 977 offsets in first
person; scene-parented at the player's CHEST (pos.y − 0.35; pos.y is the eye), 0.4 m along their
facing, throwing 24 m, in any third-person view — so the beam starts in their hands, the avatar
stands behind the source, and a top-down twin-stick's beam sweeps with the cursor because yaw
already faces it. Re-parenting moves the SAME always-visible light within the graph — the light
count never changes (977's rule; the function is pinned to never create a light or touch
`.visible`) — and the parent guards make the steady state zero-work. Live-probed per 1244's rule
(unit stubs are not the mechanic): light 0.40 m from the player vs 4.58 m from the chase camera,
beam −23.5 m forward, and the FPS restore lands the exact `(0.18, −0.12, 0.1)` attachment.

## Ambient particle emitters (build 1250)

The engine had fire, weather, impact FX and flipbooks — all BAKED systems — and no way for a creator
to place dust motes, embers, steam, fireflies, a smoke column or a fountain. Every competitor ships
particles as a core authoring primitive. Six presets ship as **PROPS** (`fx_ember/dust/smoke/steam/
firefly/fountain` in `PRIMITIVE_BUILDERS`), which buys the entire editor by composition: gizmo
move/rotate/scale (scale IS the effect's size — point sizes multiply by it by hand, since
`gl_PointSize` ignores the transform), duplication, clipboard, prefabs, tags, serialization and net
sync with ZERO serializer changes — and the logic graph's `showprop`/`hideprop` verbs switch an
effect at runtime for free. An "Effects" row sits under Add a shape.

Load-bearing decisions:
- **The fire system's SHARED materials are reused** (`_getFireMat` additive / `_getFireMatSmoke`
  normal, per-particle size/colour/alpha attributes) — no new shader to silently fail (the twice-
  burned class), and the AO/velocity G-buffer sweeps already treat them correctly. Removal disposes
  the per-emitter GEOMETRY only, never the shared material.
- **No lights** (the 636/977/1153/1155 rule) and **no collision, via three surgical exemptions**:
  `refreshPropCollider` keeps the overall box for selection but empties `boxes`; emitters never join
  the `colliders` list (so no shot raycasts, no enemy avoidance — the 1236 ghost-wall class,
  prevented rather than filtered); `addStaticColliderFor` returns early (no Rapier body).
- **Particles simulate in LOCAL space** from closed-form parametrics (base + vel·t + ½g·t², sway
  sines) — a tilted fountain tilts, a carried emitter's plume rides along, and no per-particle
  position state exists to drift. Staggered ages, a single-hump sin^0.8 envelope (nothing pops in or
  out), dt clamped at 0.1 so a hitch cannot launch the field. The jet mode respawns on falling back
  to its pool.
- The wireframe selection marker is editor-only (`updateEmitters` owns its visibility per frame).

Verified two ways: `test-1250` executes the real seed/envelope/step (bounds over 200 seeds per
preset, respawn invariant, the jet splash floor, scale doubling point sizes) and pins the three
exemptions; captured headless with a control pair — embers 246 → 1,022 warm pixels (4.2x), the
fountain's spray visible arcing, and the in-page probe reporting `boxes:[0,0]`,
`inColliders:[false,false]`. One capture-harness lesson: the dead-CDN environment can raise the
level loader LATE (pending model loads), so a probe screenshot must wait on `!_levelLoaderActive`
or it photographs the cover.

## Shell-by-shell reload (build 1249)

The item 1172 deferred as its own build. The shotgun now loads shells ONE at a time (intro 260 ms —
the pump opens — then 420 ms per shell) on a chain of timeouts riding 1172's cancel token, so
switching still cancels cleanly, and **firing mid-reload cancels the rest of the chain and shoots
with what's in the tube** — the interrupt sits in `shoot()` BEFORE the `reloading` gate (it could
never fire after it) and requires `mag > 0`, so an empty tube still waits for its first shell. The
mag and reserve move one shell at a time, so a cancel never has a half-applied state to unwind:
every landed shell is kept, none vanish. The trade is stated honestly: a full 6-shell reload is
~2.9 s against the old flat 1.3 s, but a 2-shell top-off is under 1.2 s and you are never locked out
of the fight. The HUD counts the mag UP per shell — the flat path's `--` placeholder would hide
exactly the feedback shell loading exists to give (that line is now gated on `!w.shellReload`).
Each shell clicks (SFX.reload) and re-dips the gun (the reload anim retriggers). Flat-reload
weapons are byte-identical to 1172. `test-1249` runs the REAL `reload()`/`_shellNext()` under fake
timers: the full chain (one pending timer at a time, no orphans), the fire-cancel (scheduled timer
fires but the token makes it a no-op), reserve exhaustion, a partial top-off, both start guards,
and the flat fallback.

## Auto focus (build 1248)

The other half of the DoF play report ("can't ever quite get the settings to look right") was never
the blur — 1241 and 1247 fixed that — it was that **Focus distance is a number in metres aimed by
hand at a moving game**. `worldCfg.dofAuto` (opt-in, DEFAULT_WORLD false so no saved level changes
look): every 3rd frame a ray from the camera finds what the crosshair rests on — through
`_firstSolidHit`, because 1236's rule applies to focus too: an invisible surface must not pull the
lens — and `dofFocus` EASES toward it (`k = dt·6`, tau ~0.17 s: a rack, never a snap). A sky miss
racks out to 200 m. Living enemies join the target list (an aimed-at enemy holds focus); corpses do
not. Four gates, each deliberate: auto off, DoF off, **cutscene active** (updateCinematic's focusOn
rack writes dofFocus directly and `_cineReturn` restores it — the film language belongs to the shot),
and **editor open** (the sliders must mean what they say while dragging). Sanitize seeds the ease at
the authored focus so toggling never racks from a stale target, and the authored `worldCfg.dofFocus`
is never written — auto off returns exactly the saved look. `test-1248` executes the REAL tick in a
stubbed scope: convergence, the exact ease constant, the 3-frame throttle, the miss, both clamps,
the ghost filter, all four gates, and the corpse rule. No capture needed — this build is pure JS,
the class the Node harness fully covers.

## Real bokeh (build 1247)

Build 1241's notes named their own limit — "one gaussian family for near and far fields (no true
bokeh shape)" — and the play report behind it ("can't ever quite get the settings to look right")
was only half-fixed: the banding went, but a defocused highlight still faded into MIST. The blur's
first pass is now a 32-tap golden-angle (Vogel) DISC gather — `r = sqrt(i/N)`, `θ = i·2.39996` —
which is the uniform aperture integral a real lens performs, with a HIGHLIGHT weight per tap
(`1 + 5·max(0, lum−0.7)`, computed in linear before any encode) so a bright point dominates every
disc it falls inside: highlights bloom into bright circles. The second pass is no longer a V
gaussian (a disc needs no separable pair) but a 3×3 tent whose spread scales with the local CoC —
it fills the Vogel pattern's residual grain in defocused areas and cannot touch sharp pixels.

1241's guarantees survive, restated where they now live: every tap in BOTH passes still weighs by
its OWN CoC (the halo fix), the anti-banding guarantee moved from tap spacing to a hard 14-texel
radius cap (worst Vogel gap ≈ r·√(π/32) — covered by bilinear + the fill; test-1241's computed
section moved with it), and the 1115 encode invariant lives in the fill pass, the only one that
presents. The disc pass passes LINEAR through untouched — including its early-out, where the old
`_out()` was already an identity (uEncode is 0 on a non-presenting pass).

Measured on a defocused emissive (focus 2 m, strength 3.5, the pink pickup blob): profile FLATNESS —
area ≥70% of peak over area ≥25% of peak, the plateau-vs-peak discriminator — went 0.087 → 0.110
(+27%), base control pair agreeing to 1%. And a correction worth keeping: the first metric (bright-
pixel count) moved OPPOSITE the prediction (−11%) and was the metric's fault, not the shader's — a
flat disc spreads moderately-bright horizon light evenly where a gaussian centre-weights it, so
"more bright pixels" was never what a disc promises. What a disc promises is the plateau, and the
plateau is what measured. The cine preview window's own mini-DoF (`_renderPvDof`, build 614) still
uses its old kernel — a preview approximation, listed as open work.

## Per-object motion blur (build 1246)

Build 1238's notes named their own gap: rotation reprojection answers only "how did the CAMERA
turn" — a camera-locked viewmodel smeared with the world on every flick, a moving enemy never
streaked at all, and camera TRANSLATION (strafing past a wall) blurred nothing. The named fix was a
velocity buffer; this is it. Every mesh's world matrix is STASHED per frame; a half-res pass renders
the scene with `_matVel`, whose per-draw `uPrevM` is that mesh's last-frame matrix — set in
`onBeforeRender` + `uniformsNeedUpdate`, the mechanism three ships for exactly this — against the
camera's last-frame view-projection. The blur pass streaks along the buffer's true per-pixel
velocity and keeps 1238's rotation path VERBATIM as the fallback for unwritten pixels (the sky) and
for every rung below the top one, where the pass is shed. No new world field: `postMotion` simply
means more on the top rung.

Decisions that are each a bug if lost:
- **The hook is material-guarded and stale-guarded.** `onBeforeRender` fires on EVERY pass that
  draws the mesh (main, shadows, AO, velocity) — the first line returns unless the material is
  `_matVel`. And a stash older than exactly last frame (`_pvmF === _frameNo-1`) is IGNORED in favour
  of the current matrix: re-enabling the pass after a shed must not streak off week-old history.
  The camera VP has the same stamp (`_velVPF`). Meshes with their OWN hook (sky dome, flipbooks) are
  left untouched — they are swept from the pass anyway.
- **Encoded velocity, byte-target safe.** `rg = v*4+0.5` (±0.125 UV, ~1px quantisation on the
  UnsignedByte fallback, exact on half-float); the clear is `setClearColor(0x808080, 0)` so an
  unwritten pixel decodes to ZERO motion and fails the `a > 0.5` written-test — 1126's
  near-zero-alpha trap, dodged by construction. Clear colour saved and restored around the pass.
- **Skinning uses the CURRENT pose for both ends** (limbs inherit the body's velocity — the rigid
  approximation every shipping velocity buffer makes); **instancing applies `instanceMatrix`
  manually** (1181: `modelViewMatrix` never carries it), exact because batches are static.
- **The viewmodel renders its own velocities against static vmCam** — only the weapon's bob remains,
  so the weapon holds while the world streaks. Same hygiene envelope as the AO prepass (shadow
  refresh frozen, sky/weather/background out, `_aoHideNoDepth` on BOTH scenes — test-1158's call
  count moved 2 → 4, the rule satisfied twice more).

Measured headless with per-mode static references (single spinning frames are content-confounded —
the 1238 lesson): during a hard per-frame spin the weapon's sight-block retains **60.7%** of its
static p99 edge sharpness on the velocity path vs **30.1%** on the forced rotation fallback — 2× —
while the world's blur is mode-identical (ratio 1.005). The residual softening is the half-res
buffer's bilinear boundary mixing weapon and world velocity at the silhouette — the standard
gather-blur edge artifact, accepted.

**The capture's own trap, worth keeping: a wall-clock-driven spin measures NOTHING on a slow
renderer.** SwiftShader frames are long, so `setInterval` yaw accumulated past 1238's 0.35 rad/frame
CUT threshold and the cut guard zeroed blur in BOTH runs — a perfect null with every uniform
confirming "on". Drive test motion per-FRAME (`requestAnimationFrame`), and tap `uAmt` to prove the
cut guard is not what you are measuring.

## Screen-space reflections (build 1245)

Glossy floors, marched from the buffer the engine already had: the AO G-buffer carries view normal
(rgb) and linear view depth `-mvPosition.z` (a), which is everything a cheap SSR needs — so `_matSSR`
costs no new prepass. Half-res, 24 exponential steps (~55 units reach), scene colour from
`_postRT.texture` (LINEAR — the composite adds `sr.rgb * sr.a * uSSR` before its one encode, 1115's
rule; sampling the MSAA target resolves it, same as bloom). Four decisions worth keeping:

- **Floors only, by design.** The G-buffer has no per-pixel roughness, so a wall would mirror at full
  strength with no material to say otherwise. `smoothstep(0.55, 0.85, dot(n, uUpView))` — uUpView is
  world up in view space, read straight from column 1 of `matrixWorldInverse` (current, because the
  scene render just updated it; no per-frame quaternion allocations).
- **A sky pixel mid-march is stepped OVER (`continue`), not treated as a hit or a wall** — the
  geometric `_empty` test from 1126. Break on sky and a reflection dies at every silhouette edge.
- **The gates:** `_geoWant` gained `|| _postSSR > 0.001` so SSR keeps the PREPASS alive when AO is
  authored off — and `_aoWant` therefore gained its own `_ssaoAmt` term, or SSR would have switched
  the AO sample on. `_ssrWant` sheds on the first downshift like the AO sample. Both 1218 pins moved.
- **Authored:** `worldCfg.ssr` (0..1, DEFAULT_WORLD 0.35, slider beside the AO pair, `_postOffWorld`
  zeroes it). Composite binds `_bloomMips[1]` when the pass didn't run — 1242's bound-fallback rule.

Captured headless (adaptive off via `breach_adaptres`, grain/motion/autoExp zeroed for determinism):
control pair agrees to 0.26%; ssr 0→0.9 lifts the aimed-down floor +5.2% luminance and its unique
colours 3,764 → 7,737 — reflections carry CONTENT, not a flat lift; the frame shows the crates'
glossy copies under them. At the shipped 0.35: +2.9%, 6,051 — a subtle wet-floor sheen.

**The capture harness note that cost an hour: the dead Rapier CDNs HANG in the sandbox** (no
connection reset), so `__PHYSICS_READY` never settles and `GAME_START` never runs — the menu binds
nothing and #startBtn clicks do nothing, with no error anywhere. The probe copy now stubs
`window.__PHYSICS_READY = Promise.resolve(null)` outright. And the cheapest closure hook yet:
inject `window.__probe = function(__f){ return eval(__f); }` at `function startGame(){` — eval runs
in the game closure's scope at CALL time, so one hook reads and writes any internal from page JS.

## The mantle probe finally reaches the wall (build 1244)

"Ledge still acts EXACTLY the same with build 1243" — and *exactly the same* after a verified fix
means the fixed code never ran. Probed IN THE LIVE GAME headless (probe5: real KCC mover, boxes
spawned relative to the player's feet, synthesized W+Space input, a frame tap on the grab gate): the
gate entered, the player was airborne at grab heights, and **mantleLedge returned NULL on every frame
of every jump**. The single probe 0.55 ahead of the player's CENTRE never cleared the KCC capsule's
0.8 standoff — it sampled the open ground at the player's own feet, so no ledge ever grabbed through
this path, and 1239's pose fix plus 1243's window/ceiling fixes were all real fixes to code the
probe distance kept unreachable. (What the user HAD been seeing — including the knee-high hang —
came through this same gate only in the rare poses where momentum pressed the capsule deep enough;
the fixes never changed those poses' inputs, hence "exactly the same".)

The grab now SCANS outward to arm's reach — 0.45/0.7/0.95/1.2 — first grabbable top wins, and the
hang/pull anchor derives from the distance that actually found the ledge. Re-probed live on this
build: `hang → pull` chains recorded, the runner climbing 7.7 m of stock architecture with
consecutive pull-ups. `test-1244` replays the standoff geometry (old probe 0.25 short → null; scan
grabs at 0.95; far-from-wall still null) and pins the scan + anchor. One pin moved (493).

**The lesson for the whole session: three builds tuned a mechanic whose PROBE never touched the
target.** 1233's rule was "probe the scene before theorizing"; the sharper form is *probe the
MECHANIC's own inputs in the live game* — a unit test with stubbed dependencies (clearAt=()=>true,
geometry laid at the probe point) can pass forever while the live path dies one dependency earlier.
The headless input-driven repro (probe5) found in one run what three tuning builds could not.

## The mantle grabs the right ledges (build 1243)

The 1239 sink fixed the hang POSE; this fixes WHICH ledges hang, after a screenshot report showed
both remaining faults at once: a knee-high box triggering a full hang (the character kneeling ON the
box, hands gripping air) while a perfect chest-plus box beside a taller one refused to grab at all.
Two mechanisms:
- **`MANTLE_MIN` was `STEP + 0.05` = 0.65** — anything taller than an auto-step hung. A hang is for
  ledges ABOVE HEAD HEIGHT; below that you simply jump onto the box (the jump apex clears ~2.8 m).
  Now 1.55. With the ground clamp added to the hang height (`max(sunk formula, ground + EYE − 0.12)`),
  a ledge near the bottom of the window stands the body at the wall base with arms up instead of
  burying the feet — the sunk formula alone put feet ~0.5 under the floor on a 1.6 m ledge.
- **1233's bug class was alive in `mantleLedge`**: the UNCEILINGED `surfaceTopAt` read an ADJACENT
  TALLER box's top, so rise came back over `MANTLE_MAX` for the whole jump and the grabbable ledge
  was invisible. Both probes (the grab test and 966's wall-face scan) now ceiling at the reach
  window. `test-1243` drives the REAL mantleLedge over real boxes: a 2.4 m ledge grabs mid-jump
  despite a 5 m box directly behind it, with the unceilinged read proven to see the masker.

When 1233 fixed groundHeightAt it noted the fix pattern; this build is the audit it implied — grep
for remaining unceilinged `surfaceTopAt` callers whenever a "reads the wrong surface" report arrives.
Three pins moved (493, 966, 1239's own — window value, formula shape; intents kept).

## God rays (build 1242)

The rendering list's next item: screen-space light shafts — a 24-tap radial march of the bloom
pyramid's own quarter-res bright field (`_bloomMips[1]`, no extra bright pass) toward the sun's
projected screen position, added LINEAR in the composite before the one encode, tinted by the
authored sun colour. CPU side: the sun's screen position from `_sunDir()`, a facing ramp (a sun
behind the camera casts nothing), an edge fade so shafts dim as the sun leaves the frame instead of
popping, and the bottom adaptive rung sheds the pass. Authored as `worldCfg.postRays` (0..1,
DEFAULT_WORLD 0.45, slider in the post section, `_postOffWorld` zeroes it).

**Three capture rounds shaped it, and two would have shipped wrong without measuring:**
- Round 1 was a clean NULL — the debug tap showed the adaptive ladder sitting on SwiftShader's bottom
  rung: the shed-gate had turned the pass off. The gate working looked exactly like the shader
  failing; the probe distinguished them in one run.
- Round 2 measured a **+45% GLOBAL VEIL on far corners**: an open daytime sky clears the bloom
  threshold almost everywhere, so marching an unrestricted bright field gives every pixel light from
  every direction. Fix in the shader: each tap weighted by a sun-centred, aspect-corrected disc
  (`sw²`, normalised by the UNWEIGHTED sum so off-sun pixels darken to zero instead of renormalising
  the veil back in), decay tightened 0.94 → 0.90.
- Round 3 confirmed: **sun-side band +9.6%, opposite band +0.8%** — directional shafts, not a wash.
  (A first directionality metric compared bands on the wrong side of the frame — the aim-offset sign
  put the sun right, not left; recompute geometry before concluding.)

Two pins moved (1126, 880). Process note: this build's commit initially went out ON A BROKEN COMMAND
CHAIN — a failed `cd` skipped the test run, the full suite AND this entry, while the unchained
commit+push lines still fired. The suite was green when run immediately after (982/982) and this
entry landed in a follow-up commit, but the lesson stands: never let commit/push sit UNCHAINED after
verification steps in one shell command — one `&&` chain end to end, or separate tool calls.

## The DoF stops being blocky (build 1241)

Reported from play: *"super blocky and I can't ever quite get the settings to look right."* Two
structural shader faults, not a tuning problem: **the tap spacing scaled with the blur** — `step =
coc·6` texels with uStrength folded into coc (up to 4), so a strong blur spread 13 taps across as
much as ~140 texels: visibly repeated images, which is exactly "blocky" — and **every tap was weighed
by the centre pixel's blur alone**, so sharp in-focus edges smeared halos into the blurred field
behind them (why no setting ever felt right). Now: spacing hard-capped at 1.5 texels between taps —
the radius SATURATES (~12 texels/pass, the H and V passes compound) instead of ever banding, so no
Strength setting can break the image; 17 taps; each tap weighed by its OWN CoC (`0.25 + 0.75·cocAt`)
so in-focus neighbours mostly keep their colour to themselves; smoothstep CoC for a soft
focus-to-blur transition. The 1115 encode-once invariant is untouched on both the early-out and blur
paths. Honest limits: one gaussian family for near and far fields (no true bokeh shape), and maximum
blur is traded for guaranteed smoothness.

**Capture-verified** (raw ShaderMaterial — the mandatory-probe class): focus 4 m / range 3 /
strength 3 on the stock frame drops far-field gradient energy **36.0%** vs DoF off while luminance
holds within 1.8% — a silently-failed shader would have crashed the luminance control. Probe:
`probe3.html` / `runprobe3.mjs` per the 1237 recipe with a `window.__dof` hook.

## Weapons can be renamed (build 1240)

Asked from play: "add a sword/handheld weapon (axe, staff)… we have melee, so maybe the answer is
just the ability to rename weapons." It is — every display surface already reads `WEAPONS[k].name`
live (HUD, weapon wheel, kill feed, pickup labels, loadout picker, attachments header), so an
authored name renames the weapon EVERYWHERE, including the logic pickup-spawner's label. 1190's exact
pattern: `GUN_BASE_NAME` factory baseline captured at boot, `_wepApplyName` the one sanitizer (trim,
24-char cap, blank restores factory, key fallback), `nm` serialized only-when-changed so untouched
levels are byte-identical, BOTH loaders apply it with the no-entry branch restoring factory so a
renamed Fists in level A never leaks into level B. UI: a Name field atop the Kit panel's per-weapon
section (placeholder = the factory name, Default restores). Melee "sword" recipe: rename Fists,
give it a model, tune dmg/reach in the stat sheet. Three pins moved (476, 530, 229 — the serializer
gate + record shape grew nm; intents kept).

## The ledge hang sinks below the lip (build 1239)

Reported from play: the hang "positions the chest/belly at the edge, torso/arms/head way over the
top, clinging to thin air." Build 966's hang height puts the avatar's HEAD TOP exactly at the lip BY
CONSTRUCTION (`hy = lip + EYE − vh·1.02` — the vh term cancels), whatever the model's height. Right
for a body standing at a wall; wrong for a HANG, whose pose raises the arms ~0.4 above the head — so
the hands gripped air above the edge and half the body cleared the lip. `LEDGE_HANG_SINK = 0.42`
drops the whole hang: head top ~0.45 under the lip (raised hands land ON the edge), eyes ~0.45 under
it (first person looks at the wall face with the edge just above view centre — the standard framing).
The avatar-height sizing survives (a short model still hangs by its hands), the pull-up still ends
standing on top. Browser-verify the third-person look once; the geometry is test-computed.

## Real camera motion blur (build 1238) — the rendering deferred-list opens

Asked directly from play: "Did you implement actual motion blur yet or are we still faking it?" We
were faking it: `_matAfter` was `max(new, old*damp)` — a decaying AFTERIMAGE that ghost-trailed
everything equally and answered "did the camera move" with "did any pixel change". It is now a
**rotational reprojection blur**: each pixel's view ray is rotated into LAST frame's camera
orientation (`uMbRot = prevR^T * curR`) and reprojected, giving the true per-pixel screen velocity of
the camera's rotation — the dominant motion term in an FPS, and the one that is depth-independent
(the translation term needs per-pixel depth, which the MSAA target cannot carry — the AO-prepass
constraint — and is deliberately absent). Eight taps along the streak, 5%-of-screen cap, guarded
divide. The accumulation ping-pong and buffer swap are GONE (one pass instead of two + swap);
`postMotion` keeps its slider but now means blur strength, and 0 still skips everything.

Three correctness pieces in `_mbFrame` (a pure, tested core):
- **The cut guard**: >0.35 rad in one frame is a teleport/respawn/cinematic cut, not motion — that
  frame renders SHARP instead of smearing the whole screen once.
- **The shutter**: per-frame delta × `(1/60)/dt` clamped [0.5, 2.5] — at 144Hz the streak scales up
  to a 60Hz-equivalent exposure so the authored look holds at any refresh rate (1161's rule), and a
  hitch frame floors instead of exploding.
- **Known honest gap**: the viewmodel is camera-locked (true velocity ~0) yet lives in the frame, so
  a hard flick smears it with the world. The afterimage ghosted it identically — no regression — and
  the proper fix is a per-object velocity buffer, its own build.

**Capture-verified before shipping** (this is a raw ShaderMaterial — the twice-shipped silent-compile
class — so the harness run was mandatory): metric = horizontal/vertical gradient anisotropy of the
frame, 6 shots per condition, because raw gradient comparisons across a spinning camera are content
noise (the first metric produced a nonsense −18.7% and was thrown away — no control pair, the
documented trap). Spinning with blur on: anisotropy **−13.4%** vs the identical spin with blur off —
the directional smear is real. Still frames: **0.3%** delta on/off — the shader compiled and is inert
at zero delta. Probe: `mkprobe.py`/`runprobe2.mjs` pattern per build 1237's recipe. Three pins moved
(437×2 — the afterimage/swap pins became reprojection/no-ping-pong pins; intents kept).

## Decals ride the surface they hit (build 1237)

The floating-decals report survived 1236 ("still placing in mid-air — now when I shoot at the default
capsules"), so this time it was PROBED instead of theorised: an instrumented copy of breach.html
(spawnBulletDecal wrapped to log every world-decal recipient's full parent chain; an auto-runner that
aims at the nearest enemy and fires 60 shots), driven headless under the preinstalled Chromium. The
probe answered in one run: the decal recipients were REAL, VISIBLE meshes — and the first carried
`userData._cgMobile`. **Decals were stamped in world space (`scene.add`), and moving props were
catching them**: a hole stamped on an animated door, elevator or the stock level's own moving platform
hung in mid-air the moment the surface moved on — reading as "bullets hitting an invisible wall" when
the mover had already gone. 1236's ghost filter was right about its own class (undrawn surfaces) and
irrelevant to this one.

The fix: after the stamp, walk to the hit object's TOP-LEVEL root and `Object3D.attach` the decal —
attach keeps the world pose, so a wall decal is byte-identical (static roots don't move), a mover's
decal travels with it, and a deleted prop takes its holes along instead of leaving them floating. The
root, not the hit mesh: a multi-mesh prop moves as one object, and an InstancedMesh hit reports the
shared unit geometry (1139) whose root is the static batch — attach still lands world-true. Every
removal site (expiry, the DECAL_MAX cap, the level-load wipe) detaches from WHATEVER parent the decal
rides, so the pool can never leak a mesh into a prop. `test-1237` replays the sliding door on a real
THREE graph; two 1021 pins moved (the stub scene now tracks parentage; intents kept).

**The headless probe harness is rebuildable in minutes and worth rebuilding** (rollbacks wipe
scratchpad): copy breach.html, inject a recorder + auto-runner inside the game script (full closure
access — page-level JS can't reach GAME_START internals), serve it locally with `three.min.js`
FETCHED VIA CURL and served from the same origin (headless Chromium bypasses the agent proxy, so CDN
loads ERR_CONNECTION_RESET — Rapier may fail, the engine boots without physics), launch
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` via Playwright with swiftshader, click
`#startBtn`, poll `document.title` for the JSON payload. `waitUntil:'domcontentloaded'` — 'load'
never fires with dead CDNs.

## Nothing invisible stops a bullet (build 1236)

Reported from play with screenshots: *"some bullets hit an invisible wall and leave decals just
floating"* — body-height decal clusters hanging in a doorway. Two ways an undrawn surface is
raycastable, and combat rays were blind to both: a mesh whose MATERIAL is invisible
(`material.visible=false` / opacity ~0 — how asset packs ship collision volumes inside a GLB, and
exactly the trick the enemy hit proxies use on purpose), and a mesh under an invisible ANCESTOR
(the Raycaster honours a mesh's own `visible:false` but never its ancestors' — 1139's documented
trap; editor-helper children live under hidden groups). A pellet that hits one leaves a floating
decal on air; a rocket detonates mid-doorway.

`_shotGhost(o, hit)` + `_firstSolidHit(hits)`: combat rays skip any hit the renderer would not draw —
walking the ancestor chain, reading the HIT FACE's material slot on multi-material meshes (slot 0
alone would misjudge mixed meshes), treating opacity ≤ 0.02 as undrawn while real glass (0.3) still
stops a bullet — EXCEPT `isHitProxy`, which is invisible-and-shootable by design and checked FIRST so
an invisible material can never eat an enemy hit. Routed through the cursor-resolve ray (a ghost must
not become the aim point), every pellet, and the rocket sweep. Only-ghosts-on-the-ray is a clean miss
(tracer to the sky), never a floating decal. The 1152 rule, ballistics edition: nothing that does not
write depth belongs in a depth-derived buffer; nothing that is not drawn stops a shot. Four pins moved
(1109, 885, 328, and 1236's own during writing — each keeps its intent through the filtered forms).
Deliberately NOT applied to enemy-bolt box tests, the camera collider, or movement — those are
collision, not ballistics, and a creator's invisible wall may be a legitimate barrier there.

## A death animation finally plays (build 1235)

Reported from play with a screenshot of a corpse standing on its head: *"Enemies go stiff and bob up
and get stuck in the floor on death. They aren't playing their death animation."* All three symptoms
were one path: killEnemy's no-ragdoll branch spliced the mixer, had `_poseDeath` BAKE the die clip's
final frame in zero seconds, then stacked 994's generic 86° topple ON TOP — a clip that already lies
the body down ended ~180° over (the head-stand), and 1175's bbox solve measured the BIND pose
(`Box3.setFromObject` cannot see skinned deformation), placing a resting height for a pose the body
wasn't in: the bob, the burial. The machinery to do it right existed all along — the die-clip
taxonomy (`/die|death|dead|killed|defeat/i`), LoopOnce + clampWhenFinished, directional variants the
BOTS have played since 21719.

`_clipDeath(mesh, sx, sz)`: a model that ships a die-family clip now PLAYS it — mixer kept alive, no
quaternion, no height solve (the clip owns the pose), directional variant from the shot direction
(shot from the front falls backward — the bots' rule) — then lingers clamped on its last frame, sinks
and fades. Models WITHOUT a die clip keep 994/1175's topple byte-identically. Two traps in it, both
pinned: **the gate reads `acts.die/dieFront/dieBack` DIRECTLY** — `_stateActionKey` walks the fallback
chain and die's fallback is IDLE, so asking it "is there a die clip?" answers yes for any model that
can stand; and **`_removeFadeCorpse` releases the mixer on EVERY exit** (natural end and the
FADE_CORPSE_MAX cap-shift alike), or each death leaks a mixer update forever. `_fcCloneMats` is the
factored material-clone both roads share (the fade must never dim a live enemy sharing materials).
The ragdoll path still bakes the final frame deliberately — physics owns that motion. Three pins moved
(779, 994×2 — the old road is now the else of the clip-first try; intents kept).

## The sky becomes authorable (build 1234)

Reported from play: *"How can you change the sky color? No matter what it's always bright."* Two
verified findings behind one report: the procedural dome has been fully parameterised since 1119
(zenith/horizon/ground colours, haze, sun size/glow, its own exposure — all serialized with every
level) but **no editor UI ever wrote those fields** — only the arena generator's themes did; and a
dark dome alone cannot darken the SCENE, because the sun keeps lighting it and auto-exposure (1180)
lifts a dark frame right back up.

So the Sky fold gains the seven controls (three colour rows, Sky brightness, Haze, Sun size/glow) AND
five mood presets — ☀ Day / 🌅 Sunset / 🌙 Night / ☁ Overcast / 🌑 Blood moon — where a preset sets
the COHERENT PACKAGE: dome colours + sun strength/colour/elevation + fog colour + auto-exposure
strength. Night dims the sun to 0.28 (the dim cool "sun" IS the moonlight) and holds autoExp at 0.15,
or the eye undoes the dark; "night" without those is a black ceiling over a sunny afternoon. A preset
also CLEARS any HDRI URL — an active HDRI silently covers the dome (the 1223 class of confusion), and
choosing a procedural mood is choosing the procedural sky. Day is DEFAULT_WORLD's sky restated
field-for-field (test-enforced), so stock is always one click back. Every field stays individually
editable; the day/night cycle animates on top of whatever is authored.

`test-1234` executes the REAL dome model with the presets — Night's zenith reads >10x darker than
Day's and a Blood-moon horizon is red-dominant, proving the model was never the limit — and executes
`applySkyMood` (sun dimmed, autoExp held, HDRI cleared, unrelated fields untouched, one
applyWorldCfg). One pin moved (1115 — its slice anchored on the bare prefix `function applySky`,
which `applySkyMood` now matches first; anchor gained parens). NOT capture-verified: eyeball the five
presets in a browser once.

## The ground query was reading the roof (build 1233)

Reported from play: *"I added enemies onto a multistorey building and they would randomly clip through
the floor and just disappear."* Probed and MEASURED before fixing (the house rule): an actor with feet
on a storey-2 slab at y=3.2 asked the engine for its ground and got **0 — the terrain**.

The mechanism: `groundHeightAt` asked `surfaceTopAt(x,z)` for the column's HIGHEST surface, which
inside any roofed building is the ROOF or the slab overhead — never the floor underfoot. The
step/ramp gates then rejected that too-high surface and the function answered terrain. The enemy
frame loop HARD-SNAPS `y = groundY + 1.4`, so one wrong answer teleported an enemy through every slab
to under the building — invisible, "disappeared". The player integrates gravity off the same function,
so the player fell through roofed upper floors too, and even ground-floor actors stood SUNK to the
terrain instead of on the slab. Roofs and open decks read correctly (the surface underfoot IS the
topmost there) — which is why the generated arenas' open-air decks never showed it and the bug waited
for the first creator to put enemies INSIDE a building. "Randomly" = wander under a slab and you fall;
step onto the open deck and you don't.

The fix is one function: surfaces above `feetY + RAMP_RISE` cannot be stepped or ramped onto BY
DEFINITION of the gates below, so the query is **ceilinged** there (`surfaceTopAt`'s existing `ceilY`
param — build 739's, never passed here) — and the ramp SLOPE PROBE's two neighbour samples carry the
same ceiling, or an indoor ramp under a roof reads as a cliff. The bot path's shared `_candSurf` hint
(fed to both `clearAt` and its ground resolve) takes the ceiling at its source. Player, bots, remote
avatars and PvE enemies all ground through this one function, so all inherit the repair.

Two honest notes: an overhang LOWER than `RAMP_RISE` (a sub-1.7 m mezzanine) still poisons its column
(the highest in-window surface is the overhang, the gates reject it) — strictly better than before,
when ANY overhead geometry poisoned it, and rare geometry; and mid-air far above a slab the window can
still catch the roof and read terrain — harmless, because an integrating faller is not grounded there
and by arrival the answer is the slab (both cases pinned in `test-1233` with their reasons). This
likely also carried a chunk of the other two reports in the same play session: an enemy teleported
under the building never dies and never stops pathing — accumulating invisible enemies are a frame-rate
drain and read as "stuck/buggy" from above. Three pins moved (364×2, and 1233's own falling-window
expectation corrected during writing); `test-1233` replays the report on real slab geometry.

## Verbs reach the event's player (build 1232)

1231's recorded other half, closed the cheap way: no new message type. The world verbs' "The player"
is TEAM-WIDE by design (host applies locally + wact broadcast to every client) — so "teleport the
player who stepped on the pad", "give the key to the one who earned it", "heal only the capturer"
were inexpressible. The who dropdown gains **"The event's player"** ('actor'), give/take gain the who
field, and `_wactToActor(o)` does the delivery: a REMOTE actor gets the IDENTICAL `{t:'wact', ...}`
payload over `sendToPlayer` (the client applies what it always has), a local/solo actor falls through
to the local branch — with the team-wide broadcast suppressed in both cases, because actor means ONE
player. Solo's pid is 0 = the host, so an actor-graph authored solo just works. `test-1232` drives
the REAL `_applyWorldAction` for heal/teleport/give/kill/damage in remote-actor and local-actor forms
with team-wide controls proving the old verbs byte-identical. One pin moved (1073 — who's verb list
gained give/take; intent kept). With 1231+1232, a KOTH/CTF-shaped mode is now authorable: per-actor
trigger edges → `score@`/Math per player → actor-targeted rewards.

## The graph learns WHO (build 1231) — per-player logic, first slice

The multiplayer critic's root ceiling ("8 hardcoded modes a creator can't extend — needs per-player/team
scoping"), opened where it was cheapest and most load-bearing. Three pieces, all riding 1221's context:

- **Triggers fire per ACTOR.** `updateTriggerZones` tracked ONE anonymous union boolean over every
  player, so the second player's entry was invisible and one player leaving while another stayed
  produced NO exit at all — "who stepped on the pad" was structurally unaskable. Every zone now tracks
  edges per player (`_trigStepActor`, per-actor state under the zone's `st.a`) and fires the event
  through `_lgPlayerEvent` with `{pid, team, x, z}`. The once-flag stays ZONE-global (once means once,
  not once per player); a DEAD player reads as outside, so dying on the hill fires the same exit edge
  as walking off it (what a KOTH graph needs to be true); solo, one actor = the exact old semantics.
  The ENEMY path deliberately keeps the identityless union — an enemy has no pid, and per-enemy edges
  would turn a 40-strong wave crossing a zone into 40 pulses no graph asked for.
- **Variables scope per player with a trailing `@`.** `_lgVarKey` maps `coins@` to `coins@<ctx pid>`;
  every read (`_lgNum`) and every write (setvar/addvar/math/read, and `{coins@}` toast interpolation —
  whose regex gained `@`) routes through the one function. No player in context resolves to `@0` (the
  host), so a per-player graph authored solo behaves identically alone, and plain names are
  byte-identical — no existing graph changes.
- **onkill knows the KILLER.** The context gains `pid`/`team` from `_coopKillFor` (the existing co-op
  credit: set during a client's `{t:'hit'}`), else the host — so "award the killer's `score@`" is one
  Math node now. `#pid`/`#team` join the always-offered autocomplete tokens.

`test-1231` executes the var scoping (per-player isolation, solo collapse, plain-name identity, `#i`
fallthrough intact) and the per-actor edges (second entry visible, exit-while-another-stays, zone-global
once, independent stay clocks). Eleven pins/harness scopes moved (1060×4 token count, 1072×2 the
per-actor shape, 47's char window — the documented trap again — and `_lgVarKey` stubs into the
1027/1058/1169/1221 scopes; every intent kept). **The recorded other half:** verbs that act ON the
event's player (heal/give/teleport the actor) need a host→client effect message — its own build.

## The library learns what people play (build 1230)

The feature panel's "no play-count/rating flywheel": the community library was a flat newest-first list
forever — no signal for what people actually play, which is the one thing a browsing player wants.
`server/api/plays.php` is a lobbies.php sibling (flat-file, no DB, no accounts): GET returns
`{id:{p,up}}`, POST `?id&a=play` counts a play at most once per IP per level per HOUR, POST `?a=up` a
thumbs-up once per IP ever. lobbies.php's hardening carried over whole: server clock only, salted IP
hashes (shared `rumpus-salt.txt` — one salt per host) never returned, id charset validation, 500-level
record cap, 5000-voter list cap, flock-atomic writes, the limiter table pruned every request. The
existing `.htaccess` already denies direct reads of every `.json`, so the new store is covered with no
change. **Deploy is a user action**: upload `api/plays.php` beside `lobbies.php` (see server/README.md).

Client wiring, all in the community modal: counts fetch IN PARALLEL with the index (rows render
immediately, counts pop in when they land — the library must never block on a second endpoint), the row
meta gains "· N plays", each row gets a 👍 button (one per browser via localStorage, the server dedups
by IP regardless; already-voted renders spent), and the sort menu gains **Most played** (plays → thumbs
→ newest) — offered ONLY once count data actually exists, so an unreachable endpoint leaves the menu
exactly as it was. A play reports when a library level loads FOR PLAY — an editor open is deliberately
not a play. Every write is fire-and-forget; `breach_plays_db` overrides the endpoint ('off' disables).

Two instrument notes: `_playsDb` ends a regex with `//`, which `extractFunction`'s brace-matcher reads
as a line comment (the documented string-literal trap, comment edition) — the test slices it between
function markers instead. And the first edit-script run aborted on the sort-menu anchor because the
"A – Z" label uses THIN SPACES (\u2009) around its en-dash — the atomic write-at-end meant nothing
half-applied, which is exactly why the scripts are written that way. One pin moved (970 — the sort list
gained a conditional head entry; intent kept).

## The editor teaches itself (build 1229)

The panel critic's onboarding finding, closed with machinery the engine already proved: build 938's
do-to-advance coach pill, editor edition. First time the editor opens (once per browser), a four-step
pill walks the whole loop — fly the camera (completes on ~6 units of ACCUMULATED camera strokes, so
mode switches and small moves all count), add a shape (prop count rises; the + auto-selects it, which
is why there is no separate "select" step — it would self-complete), move it (the primary selection
drifting 0.5 from a per-selection baseline; switching selection RE-BASELINES so clicking a distant prop
cannot false-complete the step), and play it (completes only in `startGame` — deploying is the tour's
whole point and ends it COMPLETE from any step).

Two decisions differ from 938 deliberately:
- **No auto-advance timeout.** Play's 15s exists so a coach never blocks combat; in the editor nothing
  blocks, a creator reads at their own pace, and the X is the exit. `test-1229` pins the timeout's
  ABSENCE.
- **The pill element is shared with the play coach, owner-stamped.** A brand-new user triggers both
  tours in one session; each render stamps `dataset.owner` ('play'/'ed'), the editor coach runs second
  in the loop so it wins the pill inside the editor, hides it only when it owns it, and the X dismisses
  whichever coach owns it right now. Without the stamp, whichever update ran last would clobber the
  other's pill every frame.

`test-1229` executes the real state machine through the full tour, the re-baselining, the
dismissed-forever key, and the no-clobber property. No pins moved.

## Attached lights ride duplication (build 1228)

The editor panel's "a lamp+light composite can't be moved/prefabbed as a unit", verified to its real
residue: build 997's nid-parenting already makes an attached light RIDE its prop (gizmo moves included),
but the `_pfEntryOf`/`_pfSpawnEntry` pair — which duplicate, Alt-drag, the clipboard (1176), array
(1225) and prefabs (1030) ALL route through — carried only the prop. Copy a finished lamppost and you
got a dark pole; 1225's array made that sting ten poles at a time. One fix in the pair covers all five
paths (1162's design paying off): the entry embeds each attached light via the same `_lightOpts` the
level file uses — the LIVE local transform when parented (a light nudged after attach copies where it
sits NOW), world position and host nid stripped — and the spawner rebuilds them bound to the copy's
FRESH nid, one frame before 997's reconciler snaps the exact parenting.

**Editor-time only, and that gate is the load-bearing line:** `buildLight` changes the scene's light
count, which must never change during play (636/977/1153/1155). The logic graph's `spawnprop` verb runs
`_pfSpawnEntry` MID-MATCH — so a runtime-spawned prefab arrives lightless (documented cost) rather than
recompiling every material in the level on spawn. Hostile entries cap at 8 lights per prop on both the
capture and spawn sides. `test-1228` executes the capture on a real THREE graph (live transform wins,
strays excluded, identity stripped), the spawn (fresh-nid rebind, editor gate, caps), and pins that all
five duplication paths route through the pair. No pins moved.

## Persistent inventory + checkpoint (build 1227)

1215's recorded other half, closing the feature panel's save-system item. Variables persisted; the
INVENTORY (keys, quest items, consumables — what an adventure game is made of) and the LAST CHECKPOINT
(where a returning player resumes) did not, so "close the tab, come back tomorrow" handed back the
numbers but not the run. Two creator opt-ins (checkboxes indented under "Also keep them between
sessions", disabled without it), riding the SAME namespaced blob under reserved keys `__inv`/`__cp` —
the variable loader accepts only NUMERIC values, so an old engine reading a new blob skips them
silently and a new engine reading an old blob finds nothing: two-way compatible by construction, no
format version needed.

The placement decisions are the build:
- **`_persistResume` is called by `startGame` AFTER its wipes.** `logicStart` (where `_persistSeed`
  runs) executes BEFORE `inventory.length=0`, so seeding items there would be erased — the resume call
  sits after the pvp/else branch, beside 1224's pose override, and takes `skipPos` so a play-from-here
  test pose outranks the saved checkpoint while the items still return.
- **Write-through, not commit-only.** Checkpoints happen mid-run and players quit mid-run, so
  `setCheckpoint` saves immediately (solo only), and `giveItem`/`takeItem` both write — a spent potion
  must stay spent on reload (executed: an emptied inventory persists as EMPTY).
- **`_persistCommit` (game cleared) clears the checkpoint but keeps the items** — the next run starts
  at the start, holding what was earned. It now also stores even with no vars authored, or the
  checkpoint clear would never land on a var-less level.
- **Solo only.** A co-op client restoring a private inventory or teleporting to a private checkpoint
  would desync the shared run; `_persistResume` returns for any NET mode but 'off'.
- **Hostile blobs clamp**: 999 per stack, 40 stacks, ids truncated at 40 chars.

`test-1227` executes the real store/load/resume/commit against a fake localStorage through the full
round trip and every guard above. Three pins moved (1215's store shape, 1075's loader line ×2 and its
harness scope — each keeps its intent). Restores are silent (no 12 pickup dings for 12 items) with one
"Resumed at your checkpoint" toast.

## Wandering NPCs, and the marker that demoted your boss to a grunt (build 1226)

The feature panel's civic gap: every moving creature was hostile, so a town, a quest hub, a story level
had nothing alive in it that wasn't trying to kill you. A spawn marker gains a **Friendly** checkbox
(green marker post, green capsule) — the NPC rides the SAME nav/patrol/route/separation stack with zero
new movement code, and the design is subtraction, done at every layer so no gate anywhere can misfire:
- **The brain**: `enemyDesiredTarget` demotes a friendly's hunt to patrol, skips the LOS raycast
  entirely (shared budget, and a friendly has no use for a sightline), and never sets `aware`.
  `alertEnemy` — the single door gunfire, blasts and the logic 'alert' verb all route through — slides
  off a friendly.
- **The spawn** disarms `ranged/exploder/charger/cover` at the source.
- **The accounting** forked into `_hostileAlive()` / `_hostilePending()` (queued friendlies subtracted):
  the HUD, the net snapshot's `en`, and the WAVE-CLEAR gate all count hostiles — a level whose villagers
  outlive every wave must still advance, and one populated only by villagers reads zero hostiles.
- **Waves never stack duplicates**: a friendly marker defaults to wave 0 (= every wave) but its NPC is
  never killed by play, so `startWave` skips a marker whose spawn is still alive (`e._mark === m`).
- **Killing one is a death, not a score event**: visuals, sound, ragdoll and the On-kill logic event all
  fire (a creator can wire "villager died → lose"), but kills/coins/score/lifesteal/boss-payday all gate
  off. Explosions and car impacts still hurt them — physics is physics.

**Two latent marker bugs fixed on the way, both real:** `buildSpawnMarker` validated `opts.type` against
a pre-628 THREE-entry list while the editor has offered all 8 since — so every saved
gunner/sapper/shielded/charger/boss marker silently DEMOTED TO GRUNT on reload (the list stays a literal
because ENEMY_TYPES is declared below the boot loader that runs this — TDZ, and `typeof` doesn't guard a
TDZ). And duplicate-marker had been dropping `type`/`wave`/`y` since those fields were added. `test-1226`
executes the brain (friendly vs identical hostile control), alertEnemy, the accounting, and pins the
rest. Seven pins moved (1197, 33, 47, 58, 80, 283, 415 — `en:` became the hostile count, killEnemy's
rewards gained the friendly gate, the LOS/detect lines gained `!en.friendly`; every intent kept).
Deferred, recorded: dialogue on a moving NPC (interact targets props, not enemies — its own build), and
friendlies fleeing gunfire rather than ignoring it.

## Align, distribute, array (build 1225)

The editor-UX panel's arrangement gap: the engine had grouping, snapping, duplication and a clipboard,
but no way to LINE THINGS UP — a row of fence posts was N drags and N squints. Three verbs in an
"Arrange" row under Group/Ungroup in the props picker (axis select + Min/Center/Max/Spread, and
⧉ Array with count + dx/dy/dz). Two semantics carry the correctness, both executed in `test-1225`:
- **Group members move as ONE UNIT.** A click selects the whole group, so a naive per-prop align would
  smash a group's internal arrangement flat onto the target line. `_arrUnits` partitions the selection
  by gid; a unit's span is the union of its members' world boxes; the whole unit shifts by one delta.
- **Alignment lines up world-space BOUNDING EDGES, not origins.** Two crates of different sizes
  "aligned min" share a face plane, which is what a builder means. The target edge is the SELECTION'S
  OWN min/centre/max, so nothing moves further than it must and align-to-the-leader falls out free.

Distribute is even CENTRE spacing with the two outermost units anchored (the standard convention);
needs 3+ units and refuses below that WITHOUT burning an undo snapshot — all three verbs are one
snapshot per gesture (1163's rule), and every refusal happens before the snapshot. Array duplicates
through the 1162 `_pfEntryOf`/`_pfSpawnEntry` pair, so copies carry full config (signals, tags,
materials, physics) and inherit new entry fields automatically; each copy is its OWN group (never
chained to the source), steps land at `pivot + step*i` (dy supported — stairs, shelves), a zero step
refuses rather than z-fighting copies inside each other, and the gesture budget is 24 copies hard,
~100 spawned props total (the paste cap's number). The dx field prefills with the selection's own
width so the default array lands copies side by side. Moved props get `refreshPropCollider` +
`_homeSync` (the gizmo drag's own bookkeeping); the axis choice persists across panel re-renders.

## Play from here, start at wave (build 1224)

The editor-UX panel's iteration-speed gap: a creator tuning wave 12 replayed waves 1-11 on every test
run, and testing a rooftop meant walking there from the player start every time. The play row gains
**"▶ From camera"** and a **wave** field (1..50); both write `_testStart`, which `startGame` consumes
**exactly once** — nulled even when its solo guard fails, so a pose captured for a solo test can never
leak into a later multiplayer deploy — and which never serialises: a test convenience, not level data.

Ordering is the correctness, and both halves were forced by code already there:
- **The wave override lands BEFORE `startWave()`** queues the first wave (clamped to the manifest cap,
  pvp skipped — no waves there). The wave-12 HP ramp applies at spawn, which is the point: test what the
  player will actually face.
- **The pose override lands AFTER the pvp/else branch**, because the pvp branch also writes `player.pos`
  and an earlier override would be silently discarded. The pose clamps above the terrain (a top-view
  pose can never spawn underground) and arrives airborne with zero velocity — a fly pose high over the
  level simply falls in, which is the honest reading of "from the camera".

`_edTestPose()` captures per camera mode: fly = the fly camera with altitude and look (fly look reuses
`player.yaw/pitch`); walk = the avatar; top view = the pan point standing ON the ground, pitch 0 — not
hundreds of metres up at the top camera. A test run also skips the authored intro flythrough (`!_ts` in
the `_introWillPlay` gate): the creator is iterating, not watching; the cine preview exists for framing.
`test-1224` executes the pose capture across all three modes and pins the consume-once, the two
orderings, the clamps, and that `serializeLevel` never mentions the override. Three pins moved (27, 330,
422 — the play handler grew a wave read between autosave and deploy; each keeps its intent).

## A loaded HDRI now shows immediately (build 1223)

Reported from play: *"when loading an HDRI, nothing visually shows until I make an adjustment on the HDRI
settings like sky rotation or reflection strength — then the sky shows up just fine."* The mechanism:
`applySky()` is the ONLY place that hides the procedural dome when an HDRI is active (`on = skyMode==='sky'
&& !hdri; _skyMesh.visible = on`), and the HDRI load-completion path (`_applyOrientedSky`) set
`scene.background` + PMREM **without ever calling it** — so the dome, a mesh a metre from the camera, kept
covering the freshly-set background until ANY settings change happened to run `applyWorldCfg → applySky`.
That poke is exactly what "adjusting sky rotation" did.

Both completion paths (success and the rotation-failed fallback) now call `applySky()` — the function whose
stated job is "everything the sky drives, applied together so they can never disagree" — and so does the
inverse branch: clearing the HDRI URL re-shows the dome NOW instead of on the next unrelated settings
change (a latent bug found by symmetry, not by report). `test-1223` executes `_applyOrientedSky` against a
dome-and-gate stub proving the dome is hidden by the time the success status fires, on the fallback too,
and pins the clear-URL branch and applySky's single ownership. The general lesson joins 1143's: when one
function is the declared owner of an agreement, every path that changes the underlying state must route
through it — setting the state directly and skipping the owner is how the two halves drift.

## The sprint-FOV was the reported zoom-bounce stutter (build 1222)

Reported from play the day after 1210 shipped: *"when walking or running, the scene/camera tries to zoom
and bounces back very fast — a stutter or glitch every few seconds."* And it was exactly that. Build 1210's
sprint push was gated on `player.onGround`, which **flickers FALSE for single frames mid-stride** — the
SAME flicker builds 926 (slide) and 1160 (jump) had to buffer — so at full sprint the FOV snapped 6°
out and back in one frame, unsmoothed, every time the ground test blinked. Two fixes, both structural:
- **The gate is GONE.** Speed-FOV tracks SPEED; airborne horizontal speed is still speed (Apex/CoD keep
  the push through a jump), and the landing dip remains the landing cue. The flickering condition no
  longer exists in the expression at all, which is stronger than buffering it.
- **The value is EASED** through persistent `_sprintFovCur` (`+= (target−cur)·min(1, dt·8)`, snapped at
  the last 0.01 so a settled lens stops paying `updateProjectionMatrix`), so no single-frame condition of
  ANY kind can ever step the lens again.

The lesson, third time now: **any per-frame boolean that gates a continuous visual quantity is a glitch
waiting for that boolean to flicker.** 926/1160 buffered the boolean; 1222's stronger form is to remove
the boolean from the continuous path and ease the quantity. `test-1222` replays the exact glitch (an
adversarial single-frame zero moves the eased lens < 0.9° where the old code snapped 6°) and pins the
gate's absence. Two pins moved (1210, 964). The 1210 quadratic curve and ADS fold-out are unchanged.

## Logic events carry a payload now (build 1221)

The editor/feature panel's ceiling on what the graph can author: `onkill`/`onhurt`/`onspot` fired BARE — no
identity, no position, no HP — so "drop loot where the enemy died", "the boss at half health switches
phase", "the turret nearest the intruder powers on" were all inexpressible. This is the same root the
open-work list records for per-player variables ("the runtime's pulses carry no actor identity"), attacked
for enemy events. A context object `_lgCtx` now rides the immediate pulse cascade, exposed as reserved
`#`-tokens that `_lgNum` resolves — `#x`/`#z` (world position), `#hp`, `#hpf` (HP fraction 0..1) — readable
by Branch, Math, Set variable, and the place field via `#here`. The token handler FALLS THROUGH to a normal
variable when the context has no such key, so the repeat loop's existing `#i` still works (the one trap this
build had to avoid, pinned). `_lgEnemyEvent(kind, ctx)` sets the context and unwinds it in a `finally` — a
Delay node schedules a later timer that runs with no context, so the payload is a snapshot of the moment,
not a live handle (recorded, not a bug). All three enemy events pass `{x, z, hp, hpf}`; `onkill` (which
fires through `_lgFireEvents` in `killEnemy`) sets `_lgCtx` around its call. `#x/#z/#hp/#hpf` are always
offered in the variable autocomplete and `#here` in the place autocomplete. `test-1221` executes `_lgNum`
(tokens resolve, `#i` falls through), `_lgEnemyEvent` (sets AND unwinds), and `_lgPlaceAt` (`#here` → event
position, null outside an event). Five pins moved (1027, 1060, 1077×2, 47 — the last a char-window widen,
the exact "unanchored window scoped by a character count" trap CLAUDE.md warns about). Player/team event
identity is the remaining piece of the same ceiling.

## Co-op kills stop landing flat (build 1220)

The gameplay-feel panel's last MEDIUM, closing the panel entirely. `killEnemy` gates the 0.07 s hitstop on
`NET.mode==='off'` and `registerLocalKill` gates the triple-kill slow-mo the same way, so a co-op kill
produced marker + sound only — the crunch that sells a kill was missing in exactly the social mode.
Slowing the sim online would desync every peer (legitimately unsafe), but a LOCAL cosmetic jolt is not:
`registerLocalKill` now punches the camera (`shake = max(shake, n>=3 ? 0.15 : 0.06)`) in netplay only,
bigger on a multi-kill. Solo is byte-unchanged — it keeps its real hitstop (fired in `killEnemy`) and
slow-mo, so there is no double-crunch. Both host and client kills get it (the client via the `{t:'frag'}`
credit path that calls `registerLocalKill`). `test-1220` executes all three modes proving solo has no shake
and its hitstop/slow-mo intact, while co-op host and client jolt without ever touching the networked
time-scale. **The gameplay-feel critic panel is now fully cleared** (1208–1213, 1219, 1220).

## The crosshair shows what the gun is doing (build 1219)

The gameplay-feel panel's MEDIUM: build 1161 made movement and airtime cost accuracy, but `#crosshair` was
a static reticle whose only dynamic property was ADS opacity — so the player had no readout of "I am
currently inaccurate", and 1161's airborne spread floor felt like random misses instead of a rule to
stop-and-shoot around. The spread math is hoisted into `_curSpread(w)` — shared by `shoot()` and the
crosshair, so the reticle can never disagree with the shot — and the four arms offset outward from a single
CSS var `--xh-bloom`, eased each frame toward `min(18, _curSpread()*90)` px (breathes, never snaps, clamps
so it never flies apart). A scoped optic already sets the reticle opacity to 0, so the bloom is invisible
and free there. Standing-still values are byte-identical to 1161 (proven executable). `test-1219` drives
`_curSpread` across the states and the easing/clamp, and pins that all four arms move away from centre and
that `shoot()` reads the same function. One 1161 pin pair moved to the hoisted function, intent kept.
**Needs a browser pass to feel** — jump and watch the reticle open, land and watch it close.

## The G-buffer prepass outlives the AO sample (build 1218)

The rendering panel's HIGH: `_aoWant = _ssaoAmt>0.001 && _prStepI===0 && ...` gated BOTH the half-res
G-buffer prepass and the expensive AO kernel+blur, and build 1183's soft-particle / 1184's soft-shoreline
fade read the same flag — so the FIRST adaptive downshift (85% res, a common mid-range steady state) shed
SSAO, soft particles AND soft shorelines together, and the image most players actually see lost its
grounding while still paying for bloom, fog and the grade. The gate is split: `_geoWant` runs the prepass
(which writes the view distance the soft-particle/shoreline fade reads from `_aoGeoRT.a`) across the top
three rungs (`_AO_GEO_MAXSTEP = 2` → 100/85/72%); `_aoWant = _geoWant && _prStepI===0` keeps the AO SAMPLE
on rung 0 only. So a downshift now sheds only the AO kernel; soft particles keep their fade. The prepass
render moved into an `if(_geoWant)` block, the AO kernel into a later `if(_aoWant)`, and `_SOFT_P.value.x`
keys on `_geoWant`. Build 1135's "AO rides the resolution step, below MSAA" intent is preserved in `_aoWant`.
The critic's other half — a reduced-kernel AO on rung 1 instead of shedding it outright — is deferred because
it needs a measured tuning pass this can't do headlessly. `test-1218` evaluates both gates across the rungs
and pins the structural split; three pins moved (1126 passed untouched, 1140 + 1183 to the new gate names).
**Needs a browser pass to confirm** — force a downshift and watch soft particles stay soft.

## Water reflects the live sky (build 1217)

The rendering panel's finding, verified in code: `_waterSurfaceMat` set `uSky` to `0x9fc8d8` at CONSTRUCTION
and `updateWaterZones` wrote uTime/uLight/uSunDir/uSunCol but never uSky — so at sunset, at night, under an
authored HDRI or a volcanic sky, a lake held a flat noon-blue sheen at grazing angles while everything
around it changed colour. `SCENE_FOG.color` IS the sky at the horizon (`applySky` sets it from a ring of
`skyRadiance` horizon samples of the same sky model, recomputed on the day-cycle cadence), so
`updateWaterZones` now copies it into `uSky` every frame — one `Color` copy per zone, no new pass. A lake
goes warm at dusk and dark at night. The constructor value is now just a seed. `test-1217` executes the
copy semantics and pins that the write lives in the per-zone uniform block and that `SCENE_FOG.color` is the
averaged horizon radiance. The richer per-direction env-cube reflection the critic also mentioned is the
larger follow-up; this closes the "flat wrong colour" half. **Needs a browser pass to see** (the Node
harness can't render water) — capture a lake at dusk.

**NINTH container rollback, recovered mid-build**, same signature (tree + HEAD reverted to 1182, bump assert
aborted atomically). Recovery `git fetch` + `reset --hard FETCH_HEAD`. Worth noting for the re-apply: the
water uniform block had been split across two lines by build 1184, so the 1182-era anchor missed on the
recovered 1216 tree — a reminder that a rollback restores an OLD file and the re-apply anchors must match
the RECOVERED build, not the one the aborted edit was written against.

## The logic graph can create a prop now (build 1216)

The feature-surface panel's HIGH, and build 1170's explicitly-deferred other half: show/hide/move/destroy
existed but nothing could CREATE — so a tycoon's "buy → building appears", a wave-defense buildable turret,
a farming drop, a sandbox spawner toy were all inexpressible; every quantity was fixed at author time. The
new `spawnprop <prefab> @place` verb spawns a prefab at a resolved place through the ready `_pfSpawnEntry`
(the same spawner prefabs, duplicate and the clipboard already route through). Three things make it small:
- **No new net code.** 1170 recorded the net-id story as the hard part; it isn't. The spawned props carry
  nids (`finalizeProp` assigns them), so the existing prop reconciler (`reconcileProps`) pAdds them to every
  client on its next tick — hence the handler sends NO `wact` message. Host-only, because `updateLogic`
  returns for clients.
- **A LIVE cap** (`LG_SPAWN_CAP` 200, counting props still in the scene so destroyed ones free budget) stops
  a spawnprop-on-an-interval from filling the world; a refused spawn is reported through 1214's
  `_noteLogicFailure`, as is a missing prefab or a place nothing answers.
- **Spawned props are marked `_lgSpawned`** so they never touch the saved LEVEL — a runtime verb must not
  edit the level (1170's rule).

`test-1216` executes `_lgSpawnPrefab` (spawns all a prefab's props at the place under one group, marks them,
reports a missing prefab, enforces the live cap AND frees it as props are destroyed, refuses on a client)
and pins the verb/field/datalist/handler. Three place-field pins moved (1073, 1077, 1170) for the added
`spawnprop`, intent kept.

## Persistent saves stop clobbering each other (build 1215)

The feature-surface panel's finding, verified in code: `_persistStore` wrote `campaignVars` into ONE global
key (`breach_persist_v1`), so two published games that both persist a `coins` variable read and clobber
each other's progress — a returning player finding someone else's `questStage` in their save is a
trust-destroying bug waiting in the wild. The store is now namespaced: `_persistKey(ns)` appends the
published `/game/` slug (build 972), or the slugified homepage title, to the base key; a level with neither
keeps the BARE key, so every existing single-game save loads unchanged — that is the migration, no data
lost. `_persistLoad(ns)` takes the namespace EXPLICITLY because `restoreLevel` calls it before `homepageCfg`
is set, so both loaders pass `_persistNSFrom(level.homepage)`; `_persistStore`/`clearPersistent` read the
live `homepageCfg`, which is correct by commit/clear time. `slugify` is length-capped so a hostile title
can't mint a giant key. `test-1215` executes the precedence (slug > title > bare), proves two games land on
different keys while the same game is stable, and pins the wiring; the 1075 harness gained the helpers and
its loader-count pin moved. Inventory + last-checkpoint persistence (the critic's other half) is the larger
follow-up; the namespacing was the correctness fix.

**EIGHTH container rollback, recovered mid-build.** The bump assert fired (atomic abort — the persist edits
were computed but never written) and the tree had reverted to build 1182 with HEAD there too. Origin's
branch still held 1199–1214, so recovery was `git fetch` + `reset --hard FETCH_HEAD`, then re-apply the
aborted edit from the scripted step (free). Same signature, same one-command recovery — the bump assert
caught it before a single wrong byte landed.

## The logic graph stops swallowing its failures (build 1214)

The editor-UX panel's CRITICAL #1: the graph's only actuator wrapped `_applySignalAction` in
`try{}catch(e){}`, so a misspelled tag, a bad clip, a wrong place field all did NOTHING — no console line,
no toast, no Level Check entry. The highest-investment editor activity had the worst feedback loop: the
only way to debug "why didn't my door open" was redeploy-replay-stare-guess. Now, mirroring the 1167 asset
report: `_noteLogicFailure(msg)` records failures (deduped by message, capped at 20), the `do` node checks
a tag-based verb's target with `_lgTagExists` and records "targets the tag X, but no placed prop has that
tag" when nothing answers, the catch records a thrown verb, and `levelIssues()` surfaces them as "Logic
(last run): …". The graph runs only during play and `levelIssues` renders in the editor, so this is a
play-time log read at author-time — exactly the critic's "what happened last run", and it needs no
live-while-playing inspector.

The tag check covers only the target-bearing verbs (`_LG_TAG_VERBS`: toggle/open/close/anim/unlock +
the four prop-lifecycle verbs) — NOT the placeless world verbs (spawn/teleport/win act on a place or the
run, so a "missing tag" there would be a false alarm). The log clears on wipe and restore (stale failures
about a previous level are their own lie) and refreshes the panel live if a failure lands while the editor
is open. `test-1214` executes the recorder (dedup/count/cap), `_lgTagExists`, and the REAL do-node branch
driven to prove it notes a missing tag (naming verb + tag) but not a resolved one nor a placeless verb. One
1027 harness gained stubs for the new refs. The live pin-value / execution-trace inspector the critic also
wanted is the larger follow-up; surfacing the silent failures was the load-bearing half.

## The difficulty curve keeps evolving (build 1213)

The gameplay-feel panel's HIGH #6: `pickEnemyType` froze the mix from wave 5 on, and its outcome set never
included **shielded** or **charger** — the two most mechanically interesting enemies (flank / dodge
counterplay), which existed only in authored spawns. Escalation was COUNT-ONLY (`n = 3 + wave*2`), so wave
20 was 43 grunts — a spam/ammo problem, not a pressure problem. Two changes:
- **Two new tiers.** Wave ≥ 8 folds in the Shieldbearer (~8%), wave ≥ 12 the Charger (~8%), with the base
  roster rebalanced under them. Waves 1–5 are byte-unchanged (the 21 pins on wave 1 and wave 5 still pass).
  A deep wave now carries a real fraction of both advanced types while grunts drop below a majority — the
  mix keeps forcing weapon/positioning changes instead of asking the same question louder.
- **A gentle HP ramp.** `_eff.hp × (1 + 0.04·min(wave,25))`, capped at +100% by wave 25, applied to both
  `hp` and `maxHp` so damage numbers and kill credit stay consistent. **Random mode only** and off in the
  editor: a prebuilt/manifest level owns its own difficulty, so the ramp is exactly 1× there.

The milestone boss stays in `randomWaveDescriptors`, deliberately separate from `pickEnemyType`, so a
manifest wave still never gets an automatic boss (the author owns composition — 1179's rule). `test-1213`
executes `pickEnemyType` across the curve (wave 5 unchanged, 8 adds shielded, 12 adds charger, deep-wave
distribution measured) and pins the random-mode gating and the cap. Two pins moved (1191, 21) for the
`_hp` rename, intent kept.

## The hitmarker stopped lying about headshots (build 1212)

The gameplay-feel panel's HIGH #4: `showHitmarker` had two states — white ✕ (hit) and red ✖ (kill) — and
the duel + co-op-client paths passed `isHead`, so a NON-LETHAL headshot rendered the red KILL marker: a
false kill-confirm in exactly the mode where you cannot see the target's HP, and a false kill makes players
disengage from a live target. Solo headshots meanwhile had no distinct feedback at all (the "layering" was
`SFX.hit()` twice — +3 dB, not a distinct crack).

Now three states — hit / **head** (yellow ✛, its own glyph AND colour, so it can never be confused with a
kill) / kill — with legacy boolean callers still mapping (truthy → kill, falsy → hit). `SFX.headshot()` is
a real high dink (1400→1950 Hz sine), replacing the double-hit hack everywhere. Six call sites updated: the
three client-side headshot bugs (pvp client, enemy client, turret client) now render the head state; the
host/solo/turret-host paths rank kill > head > hit and dink a non-lethal headshot. `test-1212` renders all
three states against a fake DOM (proving the head marker is distinct in both glyph and colour and can never
be the kill marker), checks legacy-boolean compatibility, and pins every call site plus the retired
double-hit hack. Three pins moved (31, 81, and 31's second), intent kept.

## Gunshots got weight, and reload audio tells the truth (build 1211)

The gameplay-feel panel's CRITICAL #3, completing the audio pair with 1208. Every shot was one tone + one
noise — no sub-bass transient, no tail, no compressor — so weapons were distinguishable but all sounded
like the same toy at different pitches, and mag-dumping was N identical clipping-adjacent blips. Now:
- **`_SHOT_LAYERS`** gives each weapon three layers: a sub-bass sine thump (45–70 Hz, fast attack — the
  weight), the EXACT tuned body/crack pair the guns always had (byte-for-byte, pinned — the safe-change
  rule), and a delayed lowpassed noise re-trigger as a pseudo-tail (the space answering). The sniper thumps
  deepest and rings longest; the SMG stays snappy; the suppressed 'phut' is deliberately tail-less —
  that is what a suppressor is for.
- **A gentle `DynamicsCompressor` on `sfxBus`** (threshold −18, ratio 4, fast attack) so layered and
  overlapping shots stack musically instead of clipping; every SFX already routes through the bus, so no
  call site changed, and construction falls back to the plain connect if unavailable.
- **Reload clicks track the real `reloadMs`** — start, mag-out at ~45%, mag-in at `reloadMs−120` — where
  the old pair was hardcoded 550 ms apart, so the pistol's audio finished late and the sniper's a second
  early. The 1172 reload-cancel token makes a cancelled reload's later clicks... still fire (the timeouts
  are not tokenised) — a cosmetic stale click on cancel, noted as the known cost; tokenising the SFX
  timeouts rides the next audio build if it bothers anyone in play.

`test-1211` extracts and executes the layer table (authored values preserved, per-weapon shaping compared)
and the real `reload()` under fake timers (sniper 1600 ms and pistol 700 ms schedules both land), and pins
the compressor + fallback. Three pins moved (227, 44, 91), each keeping its intent through the table.

## The first-person camera has a body (build 1210)

The gameplay-feel panel's HIGH: on foot the camera never reacted to the player's own body — build 730's
speed-FOV lived only in the driving branch, jumping off a tower and landing produced nothing, and there was
no strafe lean, so movement (despite 1171's acceleration) read as a camera on rails. Three additions, all in
the existing loop:
- **Landing impact.** The air→ground frame (where `_playerWasAir` is still true and `player.vel.y` still
  holds the fall speed, before it is zeroed) kicks a spring-damped eye-dip (`_landDip`, stiff and
  well-damped — a quick dip and settle, no wobble), a touch of shake, and `SFX.land` — a lowpassed thud
  that grows with impact. Gated `!drivingCar` (the car owns its own landings).
- **Sprint FOV.** `_sprintFov = f²·6·(1−adsBlend)` where f is ground speed over top speed, ADDED to the
  ADS-blended `wantFov` so it survives aiming being zero and folds out completely while aiming.
- **Strafe lean.** Lateral velocity (`vel · camera-right`) rolls `camera.rotation.z` via an eased,
  clamped `_camLean`, killed while aiming so the sight stays true; folded into both the shake and no-shake
  camera-roll writes.

`test-1210` integrates the real dip spring (proves a visible dip, a clean settle to exactly 0, and no
bounce), the quadratic sprint curve (full 6° at top speed, 0 while aiming), and the clamped lean (rolls
away from lateral velocity, killed by ADS), plus the wiring. One 964 pin moved (wantFov gained the sprint
term), intent kept. Numbers (dip stiffness 90/14, sprint 6°, lean 0.006 clamped 0.05) are the tuning levers.

## Enemies acknowledge bullets (build 1209)

The gameplay-feel panel's CRITICAL #2: a non-lethal hit was a 0.12 s emissive flash and NOTHING else — a
Brute ate 30 rounds at unchanged speed, and a melee wind-up or charger lunge telegraph could not be broken
short of a kill, so shooting read as "my gun is weak" regardless of DPS. `enemyHurt` now applies three
physical reactions, all host-side and all reusing machinery that already replicates:
- a **flinch** shove along the shot direction via the `evx`/`evz` integrator (melee's own knockback, decayed
  per frame and netcode-safe), scaled by the fraction of max-HP the hit took and capped at 2.5 so a minigun
  does not launch anyone;
- a brief **speed slow** (`_slowT`, 0.15 s) that the movement block multiplies in at 0.55× — the beeline/
  patrol `spd` and every ranged cover/flank/standoff approach site — so a hit costs a step of ground;
- a **heavy-hit interrupt**: a hit taking ≥ ¼ of max HP cancels a melee wind-up (`_windupT`) and a
  charger's lunge telegraph (`_lungeWind`/`_lungePending`), so a shotgun blast to a winding-up brute
  actually stops the swing, while a light hit leaves the commitment intact.

This pairs directly with 1208: you now hear the hit land at the enemy's position AND see it react. The slow
decays beside the knockback integrator in the per-enemy update. `test-1209` executes `enemyHurt` proving the
directional shove, the HP-fraction scaling and clamp, the slow, and the heavy-vs-light interrupt threshold;
a lethal hit still just kills. The dedicated hit-slow number (0.55) and the flinch cap are the levers if
play tuning wants them softer.

## The engine finally has ears (build 1208)

The gameplay-feel panel's #1: there was NO positional audio anywhere — every sound routed flat into
`sfxBus`, so enemy gunfire, an explosion to your left, a charger winding up behind you all arrived
dead-centre, and the directional hit indicator carried threat-detection the ear should have done a second
earlier. `_spatialOut(at)` returns a `StereoPanner` (equal-power, so no centre volume dip) feeding
`sfxBus`, panned by the source's position along the CAMERA'S OWN right axis — read from `matrixWorld`, so
it tracks pitch, vehicles and the top-down/side play-cameras, not just yaw — and attenuated by distance,
returning `null` past ~55 m so the caller skips an inaudible node entirely. With no `at`, no `camera` yet,
or a browser without `createStereoPanner`, it is `sfxBus` unchanged, so UI/self sounds and old browsers are
byte-identical.

`tone`/`noise`/`playSample` gained an `at` option that routes through it; the world-positioned SFX
(`enemyShot`, `explode`, `shatter`, `kill`, `hit`, and the pre-existing distance-only `shootAt`, whose
hand-rolled gain the shared panner replaces) forward a position, and the call sites pass one — the bolt
origin at both enemy-fire sites, the blast centre, the enemy mesh, where a prop broke. UI/HUD sounds
(coin, buy, wave, pickup, jump, deny) deliberately stay unpositioned — they are player-centric, not world
events. `test-1208` executes `_spatialOut` against a fake WebAudio graph (hard-right/left/centre pans,
distance attenuation, out-of-range null-skip, camera-basis tracking proven under a yawed camera, and all
three graceful-fallback paths) and pins the threading. Five pins across four audio tests moved to the
`at`-bearing signatures, intent kept, and the 53 runnable harness gained `_spatialOut` in its isolated
scope. The three-layer weapon-body/tail/compressor work the same critic flagged is a separate build.

## The room got a ceiling and a rate limit (build 1207)

The fresh panel's multiplayer CRITICAL #2. `on('connection')` accepted every peer unconditionally, and
pAdd/pMov/pDel/chat had no inbound rate cap — so anyone with the room code (the lobby directory publishes
them) could open unlimited connections to exhaust the host's 20 Hz fan-out and CPU, or flood `pAdd` to
inject thousands of props and force every peer to fetch a hostile GLB. Two guards, both mirroring the
1164 damage-bucket pattern:

- **A mode-shaped player ceiling.** `_maxPlayersFor()` is 2 for a duel (strictly 1v1), 8 otherwise.
  `_hostOnConnection` refuses a fresh peer once `clients + 1 (host) >= cap` with a clean `{t:'full'}` send
  then close — the client surfaces "room is full" instead of hanging on "connecting". A rejoiner reclaiming
  a FREE id (`_rejoinFree`, factored out of the 1201 id-keep test) is admitted even at the ceiling, so
  migration and reconnection are never blocked by the cap.
- **A structural leaky bucket.** `_structAllow(id)` refills at `STRUCT_RATE` (20/s) per source with a
  `STRUCT_BURST` (40) ceiling; pAdd/pMov/pDel/chat each spend one token and are DROPPED over budget before
  they apply or relay. Per-source, so one flooder cannot starve an innocent client; generous against any
  real editor or chat cadence. `dropClient` frees both the struct and damage buckets with the leaver.

`test-1207` executes the real accept decision (8th player fills the room, 9th refused, duel caps at 2,
free-slot rejoiner admitted past the ceiling) and the real bucket (a 200-message flood passes only the
burst, sources independent, refills over a second). One 1201 pin moved for the `_rejoinFree` rename, intent
kept. The deeper netcode items the panel raised — lag-compensated / geometry-validated hits, a real TURN,
persistent identity — are larger and recorded, not built here.

## The bake stopped restarting itself (build 1206)

The fresh panel's performance CRITICAL. `_bakeTick` gated on `_bakeDoneN === colliders.length`, so ANY
collider-count change re-queued the FULL vertex-AO bake — and `_bakeCollect` already EXCLUDES movers,
dynamic props and no-src walls, so hiding a wall, toggling a crate, shattering a physics breakable, or
animating an `xa` door (none of which the bake even looks at) each restarted a whole-level re-shade at
6 ms/frame. A logic graph blinking an `xa` door on an interval made that perpetual, and sustained 6 ms is
exactly what `_adaptResTick` reads as load — so the invisible job could buy a visible resolution downshift.

The gate is now a SIGNATURE: `_bakeSig()` counts the colliders the bake would actually gather (src-bearing,
non-mover). The O(1) fast path survives — an unchanged `colliders.length` still returns immediately — and
only when the length changed does it walk the one cheap loop; if the signature is unchanged (a wall, a
mover, a dynamic prop moved) it updates the cached length and returns without re-baking. Completion records
both length and signature. A static bake prop genuinely leaving (a shattered non-physics breakable, a
`hideprop`'d static) still re-bakes, correctly — that occlusion really changed. Separately, the job's
per-frame budget drops from `BAKE_MS` (6) to 2 ms once `_prStepI > 0` (the resolution scaler has engaged),
so even a legitimate re-bake yields to the scaler instead of fighting it. `test-1206` executes `_bakeSig`
over a mixed set (wall/dynamic/vehicle/animating-door changes do NOT move it; a static-prop shatter does)
and pins the gate; two 1195 pins moved with it, intent kept. The per-vertex dirty-rect re-bake the critic
also suggested (re-shade only vertices within BAKE_RANGE of the changed box) is the larger follow-up — this
build removes the perpetual-restart, which was the whole of the CRITICAL.

## The relayed claim was unbounded (build 1205)

A fresh six-critic panel (run against build 1204, the roadmap-complete tree) surfaced this as a verified
CRITICAL, and it is a real security hole in the marquee competitive mode. Builds 1130/1164 clamp damage
aimed AT THE HOST, but `handleClientMsg`'s build-1122 forward path relayed a packet addressed to a THIRD
client VERBATIM — so in any 3+ player FFA a cheat sent `{t:'pvpHit', to:victim, d:1e9}` and one-shot
anyone, through walls, unrated. The docs advertised protection the relay path never had.

The host mediates now. A relayed `pvpHit` runs through the SAME magnitude cap (`_netDmg`) and per-SOURCE
rate bucket (`_netDmgBudget`, keyed to the VERIFIED sender `conn._pid`, never the claim) a host-addressed
hit gets, and an over-budget or non-positive claim is DROPPED rather than forwarded. The rule is the
inverse of a whitelist: only KNOWN damage types are mediated (`pvpHit` today), everything else
(fire/char/chat/nade/rocket visuals, race, hold) forwards verbatim — a whitelist would rot as new
cosmetics arrive and silently block them. `test-1205` executes the real forward branch with the real clamp
helpers: a 1e9 one-shot clamps to the cap, a 50-packet burst relays at most one window's PvP budget and
drops the rest, cosmetic relays pass verbatim, host-addressed hits still handle locally.

**The fresh panel's other findings are recorded for the roadmap, not yet built** (this build took the one
security-CRITICAL first). Ranked highlights, all VERIFIED-IN-CODE unless noted:
- *Rendering:* no SSR / parallax-corrected reflections (the 1186 probe is one spawn-point cubemap); the
  default "motion blur" is a brightness-keep afterimage, not velocity blur; no specular/temporal AA for the
  1139/1145 procedural normal maps; one adaptive downshift sheds SSAO + soft particles + soft shorelines
  together; unshadowed sun-in-fog term; water reflects a hardcoded blue; CSM split is a hard cut at ~120 m.
- *Gameplay feel:* NO positional audio anywhere (every sound is mono — the single largest feel gap); enemies
  have no stagger/flinch/hit-slow; gunshots are single synth blips (no layers/tail/sub-bass, no compressor);
  the hitmarker shows a false KILL marker on a non-lethal PvP headshot; no landing impact / sprint-FOV / lean
  on the first-person camera; random difficulty plateaus at wave 5 and shielded/charger never spawn from it.
- *Editor UX:* the logic graph is a black box (no live inspector, `do`-verb failures swallowed silently —
  route them to `levelIssues()`); events carry no identity/position/payload (the per-actor ceiling, same root
  as deferred per-player vars); no play-from-here / start-at-wave; props and lights are disjoint selections so
  a lamp+light composite can't be moved/prefabbed as a unit; first-hour editor onboarding is a manual not the
  do-to-advance pill 938 already proved; no align/distribute/array; terrain is a fixed 48×48 grid stretched
  over any arena size.
- *Performance:* the 1195 vertex-AO bake re-runs IN FULL on any `colliders.length` change — a logic-blinked
  door restarts it forever at 6 ms/frame (CRITICAL); two unbounded texture caches (`_texInst`, `texCache`)
  never evict or dispose across level swaps; enemy bolt trails allocate a Mesh+material clone per bolt per
  frame (1168's class, uncleared); the reflection probe re-renders the scene ×6 + PMREM every 3 s under the
  day cycle; `checkProximity` walks the full prop list ×5/frame; several always-on O(N) `loop()` scans.
- *Feature surface:* multiplayer is 8 hardcoded modes a creator can't extend (needs per-player/team logic
  scoping); no play-count/rating/comment flywheel (a `plays.php` sibling to `lobbies.php`); logic can't
  CREATE a prop at runtime (spawn-prop-by-prefab, 1170's deferred half — `_pfSpawnEntry` is ready); saves
  are one un-namespaced global bucket; every moving creature is hostile (no wandering NPC); day/night and
  weather are invisible to the logic graph.
- *Multiplayer/platform (beyond this build):* no connection cap or inbound rate limiting (one-line DoS +
  `pAdd` scene injection); fully client-authoritative hits with no lag comp / geometry validation; free
  shared-cred TURN is the only relay; no persistent identity / social graph; join-in-progress has no
  ack/retry if the forced keyframe drops.

## The arena arrives knowing its own gameplay (build 1204)

The generator roadmap's "emit gameplay data with the GLB" item, second piece (1124's `spawns` was the
first). `buildArena` now returns `game` beside `spawns`: **posts** — one patrol guard per ramp, standing at
the FOOT with the ramp centreline (SCANS, foot-first/top-second) as a ping-pong route, emitted directly in
`buildSpawnMarker`'s own opts shape so the engine consumes them with zero translation — and **pickups** —
candidate spots the layout says are open (the two mid-lanes, the two flanks, then each ramp's TOP last, so
the consumer's index-ordered kinds put the good guns on high ground). Never (0,0): every footprint puts a
structure at the centre (1124's undercroft lesson). The in-editor worker carries `game` back beside
`world`, and Place-in-level seeds both behind a default-on checkbox ("Seed gameplay: ramp guards + pickup
spots"), inside the model-load callback, with NO `clearAt` validation on purpose — the generator authored
these against its own geometry, and the big-GLB collider may still be deriving off-thread (1203) at that
moment, when the interim collider is fail-solid and would reject every honest spot. `test-1204` executes
the real generator (posts' routes must BE members of SCANS) and pins the wiring. The CLI prints a `GAME`
manifest beside `SCANS`/`SPAWNS`.

**SEVENTH container rollback, recovered mid-build — and this one carried news.** The bump assert fired
(atomic abort, nothing written), but the tree was not merely stale: **PR #30 had been merged** (at build
1198) and the container sat on the merged main, while origin's branch still held 1199-1203. Recovery per
the merged-PR protocol: fetch the branch, rebase its unmerged commits onto origin/main (clean — the merge
point is their ancestor), force-with-lease push, re-apply the aborted edits. The levelgen half of this
build survived in the working tree across the rollback; only the breach.html half needed re-applying.

## The collider grid derives off-thread (build 1203)

The perf critic's #5 other half. `buildModelGridBoxes` measured 110-137 ms on the main thread for a
level-sized GLB (1148's own numbers) — a guaranteed hitch on every big import, including MID-SESSION ones
(co-op level sync, the `local:` drop path). The derivation is now three pieces, and the split is the whole
design: `_mgridGatherTris` walks the scene (the only part that needs it; 1089's 2M-triangle cap intact),
**`_mgridCore` is a PURE function of a flat triangle array** — no THREE, no `MGRID_*`, no `IS_COARSE`, no
scratch vectors — and the worker runs `_mgridCore`'s own `toString()` from a Blob (the levelgen worker's
precedent). One implementation serves both threads, so the algorithm tests (1092/1113/1148/1159), which
EXECUTE the code on real geometry, keep guarding the exact source the worker runs; `test-1203` proves the
purity directly by executing the core in an empty scope on 1148's doorway repro (door open, wall solid,
lintel solid, deterministic, flat `Float32Array` output).

The async path lives in `refreshPropCollider`: models over `MGRID_SYNC_TRIS` (30k triangles) post their
gathered triangles to the worker by TRANSFER and get the boxes back by transfer; smaller models stay
synchronous because their derivation is cheaper than the round trip. While the answer is in flight the prop
keeps per-mesh AABBs — the pre-grid, fail-SOLID behaviour: a building is briefly over-solid, never
walk-through. Delivery is token-guarded (`_mgridTok` bumps on every re-derivation, so an in-flight answer
for the OLD transform can never land) and a landed grid re-teaches the spatial grid (`_cgDirty`, 1188) and
the nav grid (`_navDirtyProp`, 1200). Physics needs nothing: the Rapier statics are trimeshes of the real
triangles, not `userData.boxes`. Failure degrades, never opens: a dead worker fails every pending job to
null (per-mesh boxes stand) and future derivations go synchronous; a failed `postMessage` RE-GATHERS before
the sync fallback because the transfer may already have consumed the buffer.

The old single function's history comments (1089 budgets, 1092 clipping, 1148 footprints, the widening
that shipped wrong twice) ride with the piece they describe — the core's text is the pre-1203 code with the
vertex reads renamed, moved by string surgery rather than retyped. Six test files moved with the split
(06 passed untouched; 1089, 1092, 1093, 1113, 1148, 142, 1159 — harnesses now concatenate the split
functions; every assertion kept its intent, and the executable ones kept their exact numbers).

## The pursuit remembers which storey (build 1202)

Build 1200's recorded other half, closed: PvE enemies pathed to layer A because `enemyDesiredTarget`
returned `{tx,tz}` with no height and `en.lkp` stored none — an enemy chasing a player on a roof pathed to
the floor underneath them. The descriptor now carries `ty` through exactly the five chase/contact/search
returns (counted by the test), `en.lkp` stores the height the target was SEEN at (the memory includes which
storey), the caller feeds `near.pos.y`, and the follow-path call hands `td.ty` to 1200's goal-layer pick.
Patrol/wander/hold returns stay height-less BY DESIGN — a post and a wander point are ground concepts and
layer A is the right default there. Three pins moved (17, 283, 406), each keeping its intent.

## The match survives the host (build 1201)

The multiplayer critic's remaining CRITICAL: the host vanishing mid-match reloaded every client's page 1.6
seconds later. Now `netHostLost` migrates instead — only a lobby-phase loss (nothing worth saving) or a
migration that itself times out (40 s) takes the old reload road, which lives on as `_migFail`.

Four decisions carry the design:
- **The election has no round to lose.** Every peer already holds the same roster from the snapshots, so
  `_migRank(myId, playerIds)` computes the SAME deterministic order everywhere (sorted ids, the dead host's
  id 0 excluded, iteration-order independent — tested). Rank 0 promotes immediately; rank r attempts to
  JOIN the migrated room every 2.5 s and only CLAIMS it after r×4 s — so a dead rank (a bot's id in the
  roster, a double-drop) delays the cascade, never deadlocks it. Losing the claim race returns
  `unavailable-id`, which demotes the loser cleanly to client of whoever won. A lone survivor is rank 0:
  a co-op partner closing their laptop promotes you instantly and the match simply continues.
- **The migrated room lives at a DERIVED peer id** — `_migPid(code, gen)` = `breachfps-<code>-m<gen>` —
  because the dead host's own id can stay reserved at the PeerJS broker long past our window; claiming a
  fresh deterministic id beats racing a timeout we don't control. Every peer bumps `NET.migGen` once per
  observed loss, so a second migration derives the same `-m2` everywhere. Cost, recorded: the room vanishes
  from the lobby directory (no keepalive re-registration) and NEW joiners can't find the migrated session —
  migration serves the players already in it.
- **State comes from the last snapshot.** `_migAdoptMirrors` promotes the client mirrors to the
  authoritative arrays: enemies respawn through the real `spawnEnemy` at their mirrored positions with the
  type+hp that KEYFRAMES now carry (`o.ty`/`o.hp`, keyframes only — the delta key is unchanged, so 1197's
  bandwidth win survives; the mirror remembers them, plus `_puKind` on powerup meshes), hp clamped to the
  type's max, a pre-1201 mirror demoting to grunt rather than failing. Coins and powerups keep their
  network ids (clients already hold meshes under them) and the id fountains advance past them. ALL
  remote-player entries drop at promotion — rejoiners re-appear on their first state message; the dead host
  and bots never do. Chests are already real objects on a client and simply stay.
- **Rejoiners keep their identity.** The old id rides the connection METADATA (available before 'open', so
  the welcome and every score/team lookup are right from the first byte); `_hostOnConnection` honours it
  when free and the fountain never falls behind. The rejoin welcome is inert on arrival (`NET.joined`
  guards a re-startGame) except an id rebind when the old id was taken, and skips the level serialization —
  the rejoiner is already standing in the level. Scores (`NET.duelScore`), teams and KOTH state are client
  mirrors already, so the promoted host inherits them by doing nothing.

Two literals died on the way: the host is **not id 0** anymore — the snapshot's self-entry is
`id:NET.myId`, the third-party relay check compares `msg.to !== NET.myId`, and the welcome keys the host's
character by a new `hid` field. All three are 0 for an original host, so nothing moved for existing play.
`_hostOnConnection` is one factored function attached by BOTH `hostStart` and `_migPromote` (counted in the
test) — the 1158 lesson, applied before the drift instead of after.

**Honest limits, recorded not hidden:** logic-graph variable state and PvP bots are host-local and do not
migrate; the objective timers migrate at snapshot resolution (0.1 s). `test-1201` executes the election and
the whole adoption path and pins every wiring point. NOT verifiable headless: a real two-machine
drop-the-host session — that is a browser pass with two devices.

## The nav grid learns a second storey (build 1200)

The critic roadmap's multi-storey AI item. The grid stored ONE walkable Y per column, so a cell under a roof
was the floor or the roof, never both — bots and enemies could not path onto any upper surface, ever. Now a
column carries up to two floors: layer A is EXACTLY the floor the grid always chose (the safe-change rule —
no existing behaviour moved), and layer B is the column's highest surface, kept only when it clears layer A
by `NAV_LAYER_SEP` (2.2 m of headroom) and passes the SAME `clearAt` authority. Node id = `cellIdx +
N*layer`, so every layer-A id is byte-identical to the old cell ids and `navCellCenter` decodes both. The
link mask went `Uint8Array(N)` → `Uint16Array(2N)`: bit d = a link in direction d, bit d+8 = that link lands
on the target cell's LAYER B, with the target layer chosen per direction as the one vertically closest
inside the `[-NAV_DOWN, +NAV_UP]` window. **Stairs fall out with no special case** — a rising layer-A floor
links into a neighbour's layer B the moment it is within jump reach, and the tie-break prefers layer A on an
exact tie (a landing must be CLOSER to the storey than to the ground to route up, which is what a real
landing is). A*, flood, components and the overlay all run over 2N nodes; the overlay draws layer B in amber.

`navNearestWalkable(x,z,y)` grew the optional height: with a y, the layer whose floor is nearest wins, so an
actor standing upstairs paths on its own storey. Starts pass the actor's y everywhere (`_botRepath` — bots
AND the PvE enemies' `en._nav` adapter share it); goals carry a height only where one is in scope today,
which is the bot AI (`destY = tgt.pos.y` — a bot will climb to a player camping a roof). **PvE enemies still
path to layer A goals**: `enemyDesiredTarget` returns `{tx,tz}` with no height and `en.lkp` stores none, so
threading the target's y through those descriptor sites is the recorded other half, not an oversight.

DIRTY PATCHES close the second old hole: the grid was built at match start and never noticed the world
changing, so a moved bridge or destroyed wall left paths routing through phantom geometry. Prop verbs
(show/hide/move — move marks OLD and NEW footprints) and `shatterProp` (which the del verb rides, and which
also fires for a shot barrel) mark their bbox via `navDirtyRect`; both AI frame loops run `navDirtyStep(3)`
once the grid is built — a budgeted re-sample of just those cells through the same `navWalkable`, then ONE
`navBuildLinks()` when the queue drains (a few ms at the 160×160 cap; incremental link surgery would be
cheaper and subtly wrong). A queue past 64 rects collapses to one full re-sample. Paths self-heal on their
own repath cadence (~0.5–1 s), so no consumer needs notifying.

`test-1200` drives the REAL extracted functions over a mock two-storey world: two layers where earned (and
NOT where not), a ground→roof path that climbs via the landing with every step inside the jump window, the
return trip, a floor goal that never detours over the roof, storey selection by height, and the dirty-patch
chain — shatter the stair, re-sample, and the roof goes unreachable in O(1) (comp reject) while the ground
keeps pathing. Seven pins moved (282, 347, 352, 355, 356, 359, 473), each keeping its assertion's intent;
473 is the build-619 roof test and still proves the roof does not hijack the floor — layer B is additive.

## The sky that was flashing was never in the frame — it was in the G-buffer (build 1199)

Reported from play, refining 1198's report: auto-exposure behaves until **ambient occlusion is turned up**,
then the HDRI sky flickers badly. 1198's soft knee was real and stays — but the driver was AO. The 1152 rule
("nothing that does not write depth belongs in a depth-derived buffer") arrived by a FIFTH door, and this one
the sweep structurally cannot cover: **`scene.background` is not a scene object.** `overrideMaterial` never
replaces it and `_aoHideNoDepth` traverses children, so an HDRI sky — a background TEXTURE (`scene.background
= tex`; the procedural dome nulls the background instead, which is why only HDRI mode shows this) — rendered
its tone-mapped colours straight into the half-res G-buffer. Those colours pass the geometric sky test
(channel sum ≥ 0.63 reads as a packed normal) and carry an alpha SSAO reads as a surface about a unit from
the camera, so the whole sky was shaded as a wall. And because the background pass tone-maps with
`toneMappingExposure` (pinned against the real build in test-1198 and again in 1199), **every easing step of
auto-exposure rewrote the garbage** — AE modulated it, AO made it visible, which is exactly "AE works until
AO goes up". Fix: the prepass saves `scn.background`, nulls it for BOTH G-buffer renders (the viewmodel pass
draws into the same buffer), and restores it before the AO resolve — beside the dome hide, so the two halves
of "no sky of either kind in the G-buffer" live in one place. `test-1199` pins the ordering, the
no-return-between-null-and-restore property, and both premises.

The count is now five arrivals of one rule: 1126 the sky dome, 1128 the weather points, 1152 the flipbook
sprites (rule stated), 1158 the viewmodel muzzle flash (rule applied to the second caller), 1199 the
background (content the rule's sweep cannot see). If a sixth appears, ask what ELSE the renderer draws that
is not a child of the scene.

## The meter was stalling the pipeline it was measuring (build 1182)

Reported from play the day 1180 shipped: **any auto-exposure strength above 0 produced visible stutter on
all visuals, with no fps drop.** That signature — time lost with the frame counter unmoved — is a pipeline
STALL, not a load: `readRenderTargetPixels` is synchronous, so every 5th frame the CPU drained the entire
queued GPU frame before copying 1 KB. A 12Hz judder the fps counter cannot see, because the time went to
waiting, not working. (Strength 0 was smooth, which is what implicated the readback: the blit is a 16×16
draw and the easing is arithmetic — the sync read was the only candidate left.)

The metering now lives in `_aeMeter()` and reads back asynchronously: `readPixels` into a
`PIXEL_PACK_BUFFER` (returns immediately), `fenceSync` behind it, and a harvest that polls
`clientWaitSync(fence, 0, **0**)` — timeout zero, so the poll can never become the very block it replaces.
The pixels arrive a few frames late, which a ~1s eased eye cannot show. Four details that are each a bug
if lost:
- **One read in flight at a time** (`!_aeFence && (++_aeFrame % 5)===0`) — issuing over a pending read
  would need a PBO ring for nothing; the cadence just skips a beat.
- **`PIXEL_PACK_BUFFER` is unbound immediately** — three's own `readRenderTargetPixels` (cine preview,
  thumbnails, captures) would otherwise write into our PBO instead of its client array.
- **WebGL1 has no PBO/fence: the meter is gated on `capabilities.isWebGL2` and auto-exposure goes quietly
  INERT there** — a missing feature beats reintroducing the stutter on the devices least able to hide it.
- **Strength 0 mid-flight deletes the pending fence**; `WAIT_FAILED` and a thrown call (context loss) drop
  the GL objects and fall back to neutral, and the next 5th frame re-issues.

`test-1182` drives the real extracted `_aeMeter` with a stub GL through all of it — including a renderer
stub whose `readRenderTargetPixels` THROWS, so the sync path cannot quietly come back — and pins that every
`clientWaitSync` in it passes timeout 0. Worth generalising: the engine's other readbacks (cine preview
window, level thumbnails) are user-initiated one-offs where a stall is invisible; anything that reads the
GPU back **every frame or on a cadence** must use this pattern.

## Soft particles, and smoke that knows what time it is (build 1183)

A flipbook quad slicing through world geometry drew a hard line across the intersection — the classic
billboard artifact, on the biggest sprites in the game (explosions grow to ~4m). The AO G-buffer (1126)
already holds the scene's view distance at half res, swept clean of everything that doesn't write depth
(1152/1158) — **including these very sprites** — so it is exactly the "world behind the particle" a soft
fade needs, for free. `_softSprite(mat, band)` patches `SpriteMaterial` via `onBeforeCompile` (a patched
built-in, per 1145 — never a raw ShaderMaterial), fading `diffuseColor.a` over a band that scales with the
sprite (30% of its size). Uniforms are shared BY REFERENCE (1181's trick — but assigned into
`shader.uniforms` directly in `onBeforeCompile`, which does not have 1181's ShaderLib-merge problem).

The details that are each a bug if lost:
- **A cleared G-buffer texel is SKY and must read as INFINITELY FAR** (`(r+g+b) < 0.3 ? 1e6 : a` — 1126's
  geometric test). Without it, every sprite fades out against the sky.
- **The fade reads LAST frame's buffer** (the prepass runs after the scene pass). One frame of lag on a
  fade band is invisible; sampling this frame's buffer is impossible anyway.
- **Gated on the same `_aoWant` that keeps the buffer fresh**, fed beside it; the plain render path (post
  off) writes the gate OFF, or sprites would sample a frozen buffer. AO off = hard edges, never stale data.
- **Muzzle is deliberately HARD, and viewmodel sprites are never softened** — a flash lives centimetres
  from a gun; the geometry behind it is at nearly its own depth, so a soft fade only dims every shot.
- **`customProgramCacheKey` is a constant and `warmFlipbookShaders` compiles the soft variant at load** —
  the first explosion must not compile a new program mid-combat (the 622/1153 freeze, by a new door).
- **Both `replace()` anchors are pinned against the REAL three build** in `test-1183` — a renamed chunk
  makes a string-replace a silent no-op, which is how 1181 nearly shipped nothing.

Scene-lit smoke: the smoke sheet is unlit white, so it GLOWED at night. `lit:true` scales the material
colour by `0.30 + 0.70*dayF` at spawn — luminance only, floored so it never goes black, exactly 1 when the
day cycle is off (so no existing level changes by a single code value unless it uses the cycle).

## The water joins the colour pipeline (build 1184)

The water surface, the waterfall sheets and the plunge foam were the last raw ShaderMaterials writing
straight `gl_FragColor` — no ACES, no exposure, no fog. So water ignored the filmic response, the creator's
exposure, 1180's auto-exposure and 1181's height fog: a lake at dusk sat at its own private brightness
inside a fogged, graded frame. Each now applies the SHARED `_ACES_GLSL` (the dome's `uTM`/`uExpo` pair —
`uTM 0` returns the input untouched, so filmic-off is byte-identical to the old shader) and ends in the
engine's own `fog_fragment` chunk, tone-map before fog, three's own order.

The mechanism worth keeping: **`material.fog = true` on a ShaderMaterial makes three refresh
`fogColor`/`fogDensity` per frame — but it writes into uniforms the material must already HAVE, and throws
on one that doesn't.** `_waterFogUniforms()` supplies the set once for all four materials: fog colour +
density with real initial values, plus `fogSunDirW`/`fogHeightP` riding 1181's shared plain objects by
reference (one CPU write reaches the water too), plus `uTM`/`uExpo`. The vertex shaders write
`vFogDepth`/`vFogWorldPos` directly under `#ifdef USE_FOG` — the shared `fog_vertex` chunk needs
`transformed`, which these shaders don't have (the sprite lesson from 1181, applied preemptively).

The surface also gains a soft SHORELINE: 1183's G-buffer read (sharing the same `_SOFT_GEO`/`_SOFT_P`
uniform wrappers outright), fading the disc's rim over ~0.7 m where the ground sits just behind the
surface along the view ray. `vVZ` is view-Z — the same quantity the buffer stores; a euclidean distance
would tilt the band with view angle. Same freshness gate: AO off = the old hard rim, never stale depth.

Exposure is read LIVE (`renderer.toneMappingExposure` = base × auto), so the water breathes with 1180's
eye adaptation instead of ignoring it. Two pins moved (868 — sheets/foam still dim with `uLight`, now
inside `_aces(...)`; 858 — a `{0,1600}` window widened to 2400, anchor unchanged). NOT capture-verified:
water needs a browser pass — the zone panel, a waterfall, dusk with the day cycle, and the shoreline with
AO on and off.

## Two-cascade sun shadows (build 1185)

The rendering critic's #1 CRITICAL, and the oldest visible defect in the engine: one shadow volume was a
trade with no right answer — tight (build 1120's fit) gives sharp contacts and a HARD CLIFF where shadows
end ("the world floats" past `shadowDist`); wide gives no cliff and mud everywhere. Now the near volume
stays exactly 1120's camera-following fit and **`moonFar`** — a second directional light, seated at BOOT
because the light count must never change during play (636/977/1153/1155), desktop only — covers **4×**
that extent behind it. Each fragment takes the sun from exactly ONE cascade.

The pick is by COVERAGE, not by a split distance: a chunk patch after `getDirectionalLightInfo` reads the
near map's own projected coord (`vDirectionalShadowCoord[0]`, 2% margin) — a derived split distance gets
the screen corners wrong (they leave the near volume laterally before they leave it in depth); the coord
cannot be wrong about what the map covers. Three guards, each load-bearing:
- **`#if NUM_DIR_LIGHT_SHADOWS >= 2`** keeps the gate out of every scene that isn't running the cascades —
  the thumbnail/inspector rigs are two-directional-light setups whose rim light this must not touch.
- **`USE_SHADOWMAP` absent** (an object with `receiveShadow=false` — the nocollide grass) cannot read the
  coord; it takes the NEAR sun unshadowed. Without that branch such objects receive BOTH suns = 2× light.
- **`csmSunP.y`** (shared plain object; the value walked into every merged lit `ShaderLib` entry — 1181's
  lesson, reproven in `test-1185`) is the runtime switch: 0 on phones, where a creator's own two
  shadow-casting directionals could otherwise trip the compiled gate.

The far fit lives inside `_fitSunShadow`: snapped to its OWN 4×-coarser texel grid (snapping to the near
grid would slide it a fraction of its own texel per step — `test-1185` proves whole-texel movement along
the fit's own axes); the light stands `D = 90 + F` back so the whole ±F volume fits its depth range (a
light left on the 90 orbit would spill ~110 units behind itself at F=240); `normalBias` is 1125's texel
rule at the far map's own scale with its own cap (the near 0.6 cap is a near-volume quantity — clamping
the far bias to it would acne every distant surface). Colour/intensity/visibility mirror `moon` every call
BEFORE the early return, because the day cycle writes them per frame. Sun→scene direction is measured
target-relative (`moon.position - _sunTarget.position`) — `normalize(moon.position)` is only the light
direction when the target sits at the origin, which 1120's own snap axes still assume (pre-existing,
harmless for a grid, left alone).

Costs and residue, stated plainly: every shadow refresh now renders two maps (desktop only); the cliff
still exists at 4× `shadowDist` (240 m default) — SSAO and distance carry past that; the cascade seam can
show a resolution step. NOT capture-verified — the browser pass should walk a big generated arena and look
for the seam, distant acne, and grass brightness (the 2×-light guard). One harness moved (1120 — its
scope gained the null `moonFar`, so it now drives the phone path; 1185 drives the far cascade).

## The scene reflection probe, and the capture that was measuring build 1156 (build 1186)

`scene.environment` was the SKY alone — a chrome sphere in a courtyard reflected bare sky through the
walls around it. The probe now renders the REAL scene from the spawn's eye into a 128 cube at deploy (two
shots: +1.2s and +9s, for slow assets), inverts the ACES that is baked into every material's program
(switching `renderer.toneMapping` off to render clean would RECOMPILE every shader — the 636/977/1153
freeze), PMREMs the result, and supersedes the sky-only probe in `applySky`. The inverse matrices are the
numeric inverses of `_ACESin`/`_ACESout`; `test-1186` re-derives them from the forward pair in the source
(1151's pattern) and round-trips the full fit to 1e-3. Values ACES clipped past ~1.0 are unrecoverable —
probe highlights saturate where the frame's did. Phones keep the sky-only probe; an authored HDRI outranks
everything; the day cycle rebuilds at most every 3s.

**First: every capture this stretch had been measuring build 1156.** `drive.mjs` serves
`scratchpad/head.html` — a SNAPSHOT — and the byte-identical frame means that "verified" builds 1181-1185
were the snapshot agreeing with itself. Build 1124 said know where the camera is; 1151 said know what
surface you are measuring; the completion is **know what BUILD you are measuring** — stamp it or diff it.
`head.html` must be refreshed from the repo before any capture run.

The real captures then found two shipped bugs in this very build:
- **The dome followed `cam.position` — a CubeCamera's face cameras are CHILDREN, local position (0,0,0).**
  So the dome teleported to the world origin for every probe face and the probe rendered a BLACK sky.
  Found by reading the probe's own cube back (sky face 11/255 where ~180 belongs) — the frame alone only
  showed the symptom: the env-lit viewmodel crushed to 0,0,0 (the weapon's fill IS the environment —
  `_drawViewmodel` mirrors `scene.environment` into `vmScene`). Fixed with `getWorldPosition` into a
  scratch vector; every camera the engine will ever render through now carries the dome correctly.
- **Scaling the whole probe by `worldCfg.sky` was wrong, measured twice over.** Geometry radiance already
  contains the sun and the sky-scaled ambient — scaling it again dimmed every reflection 3× (weapon region
  70,74,67 vs 95,101,94; whole frame −8). The scale now applies to the SKY ALONE, at the dome, during the
  cube pass (`_spSkyScale`, restored in a `finally`): sky pixels match the old probe exactly, geometry
  passes at 1.

Measured residue, stated plainly: whole frame 134,146,150 → 129,141,147 (−3.7%) because the probe's lower
hemisphere is the level's REAL ground radiance rather than the sky model's brighter painted band — a
physically honest shift; and the weapon reads blue-steel (region 95,101,94 → 75,82,80): its top rail
carries the sky, its sides the ground, which is what reflecting the world means for the one metal object
always on screen. Auto-exposure separately measured +22 code values on this frame (its dead-zone does not
hold at the stock frame's log-average — worth knowing when comparing captures across 1180).

Three pins moved (1119, 1127 — dome-follow and dome-exposure took the new forms; 1186's own uScale pin).

## LUT colour grade (build 1187) — and a Phase-3 item that died on verification

The roadmap item was "creator texture slots on primitives + LUT grade". The first half is DEAD ON
VERIFICATION: primitives have had full texture slots since the 871 era — `applyPropTexture` (albedo),
`texN`/`texR` PBR maps, per-prop tiling (`texRepeat`) and rotation (`texRot`), a web texture picker
(`applyPropTexturePBR`), all serialised through `p.mat`. Same lesson as the raycast-BVH claim (1159):
every critic claim is a hypothesis until the grep comes back.

The LUT grade is real and shipped. A standard N*N × N strip (256×16 or 1024×32 — the Unreal/GTA
convention, green DOWN each tile, blue across tiles) applies in the composite immediately after
contrast/saturation and before vignette/grain — the frame is DISPLAY-REFERRED there (1117 moved the grade
after the encode), which is exactly what LUT strips are authored against, so no transfer math exists to
get wrong. Decisions that are each a bug if lost:
- **Loaded RAW** — an sRGB tag would decode the texels and corrupt a display-to-display mapping. `flipY`
  off so the green axis is deterministic; no mips (a mip of a LUT is a different grade); clamp wrapping;
  bilinear does the in-tile r/g interpolation and two taps mix across the blue tiles.
- **Half-texel insets** keep red=1 on the LAST texel centre of its own tile — `test-1187` drives the exact
  formula against a JS identity strip (returns its input to 1/60) and pins the no-tile-bleed corners.
- **Absent = amount 0** (`_lutMap ? _postLutAmt : 0`): no LUT, a failed load, or a rejected image is
  EXACTLY the old grade, never a black lookup. Rejection is loud and validates `width === height²`.
- The loader counts `_texPending` (the level loading gate), survives url races (a stale load that lost is
  disposed, not applied), and clearing the url disposes. `worldCfg.lut`/`lutAmt` ride the whole-object
  world serialisation for free; the UI is a `texRow` + strength slider beside the grade sliders, with a
  hint describing the standard workflow (screenshot → grade with a neutral strip in any editor → crop →
  host → paste).

**FIFTH container rollback recovered during this build** — same signature (BUILD_VERSION regressed to 1182,
`git log` at the old HEAD), caught by a scripted edit's own anchor assert (the bump expected 1186 and found
1182 — and because the script writes only at the end, the mismatch aborted it atomically). All of 1183-1186
were already pushed; recovery was one fetch + reset, and the 1187 re-apply was free. The capture snapshot
(`scratchpad/head.html`) must be re-copied after any rollback recovery too.

## The collider grid (build 1188) — PHASE 4 OPENS

Build 1148's tight collider tripled the box count (795 → 2,291 on a 3-storey block) and every hot query
still walked the WHOLE collider list: the per-enemy obstacle resolve, per-bolt hit tests, `segmentBlocked`
(AI line-of-sight), `_surfCull` under every bot, `clearAt`/`ceilingAt`/`insideSolid`. An 8m XZ hash over
each collider's overall box (`_cgQuery`) turns those walks into a few cell lookups. Eight consumers
converted — with **byte-identical loop bodies**: the grid replaces only where candidates come from, never
what is done with them, and `test-1188` proves the superset property (300 random queries, zero misses vs
the linear walk) rather than trusting the hash.

The design decisions that carry the correctness:
- **Movers are never hashed.** A physics body, a running xa animation, a kinematic body, or a collider
  with no box yet lives in a side list appended to EVERY query — their boxes change per frame, and
  re-hashing movers per frame would cost more than the walk ever did.
- **Classification self-heals through the stale flag.** A static prop that starts moving dirties the grid
  on its first `refreshPropCollider` (its stamp still says static), one rebuild reclassifies it, and after
  that its per-frame refreshes are stamp-guarded and rebuild nothing. Adds/removes are caught by a length
  check, so no push/splice site needs to know the grid exists; the one same-length swap site (the power
  station) calls `refreshPropCollider` and is caught by the flag.
- **One scratch array per consumer.** `clearAt` calls `surfaceTopAt` (through `_surfCull`) before its own
  query; a shared scratch would be clobbered the day that order matters (1168's rule).
- **A query rect must cover the consumer's own coarse-reject margin** (`clearAt` ±R, the enemy resolve
  ±eR, `_surfCull` ±0.3, point tests ±CB_EPS) — that is what makes the superset exact. `segmentBlocked`
  queries the segment's bbox: a crossed box contains a sample point, and every sample lies on the segment.
- Outside ±4096 the key clamps into edge cells — conservative, never wrong.

Three harnesses moved (32, 303 — pass-through `_cgQuery` injected, the 1122 precedent: those tests are
about the blocking logic, not candidate sourcing; 32's cover pin now names the grid).

## Ranged enemies use the level (build 1189)

PvP bots have hunted, flanked and broken for cover since 1003-1006; PvE gunners held a standoff ring and
strafed — competent, but they never USED the level. The port takes the bot brain's two best moves:
- **Cover break.** A hit that drops a gunner under its bravery fraction (0.30-0.45, rolled per individual
  so a squad doesn't break in unison) sends it to real cover for a ~2.5s beat, then it re-engages; a 9s
  cooldown stops it turtling. **Cover is a BEAT, not a state** — PvE enemies don't heal, so a health-gated
  state (the bots' shape) would turtle forever; the trigger is EDGE-based (hp dropped this frame), which
  `test-1189` replays. `_botFindCover` is reused VERBATIM through a `{pos:{x,y,z}}` shim — it only reads
  `.pos`, proven by driving it with enemy-shaped input. Firing already requires `_see`, so cover going up
  silences the gun with no extra gate. No cover found (open field) = the trigger simply never fires.
- **Flank.** With the player unseen, the gunner approaches the last-known spot from a side angle — the
  bots' exact 0.7-radian / 5-metre shape, pinned as shared between both AIs. This also removes a quiet
  wallhack: the old block steered toward the player's LIVE position even when unseen.

The gunner opts in (`cover:true`); the BOSS deliberately does not (a boss doesn't cower); melee types are
untouched — closing is their whole design. The original standoff/strafe body survives byte-identical as
the seen-and-healthy branch. The roadmap item's "+ trace bot bullets" half is deferred to its own build.

## The weapon stat sheet (build 1190) — and two roadmap halves that died on verification

Verification kills first, recorded so they stay dead:
- **"Trace bot bullets"** — `remoteFire` has drawn the tracer, impact spark, decal, muzzle flash and
  positional audio for every bot shot since build 1020.
- **"Cell-hash the enemy separation"** — the pass is O(N²) but waves cap at ~40-60, so it is ~1,800 pairs
  of a half-dozen float ops per frame. Arithmetic, not a hotspot; the collider walks 1188 removed were the
  real cost.

The real gap: damage has been per-level since 623, but fire rate, magazine, start/max ammo, spread,
reload and pellets were engine constants — "every level plays the same seven guns". They now follow
damage's exact pattern: `GUN_BASE` (the factory baseline, captured from the live table at boot), only
CHANGED values serialized (an `st` object per weapon, diffed against base), all three loaders (boot, net,
restore) applying through **one clamped helper** (`_wepApplyStats`) so a hostile level file cannot set a
0ms fire rate or 10,000 pellets through any door — clamps proven executable in `test-1190`. Weapons a
level does not mention reset to factory (net + restore), so tuning never leaks between levels. The editor
exposes the sheet under the gun's damage row (guns only — fists have no magazine), writing through the
same helper, each field with a reset-to-factory button.

**Found and fixed on the way: `startGame`'s ammo reset was four hardcoded lines covering four of seven
guns** — the pistol and launcher carried spent ammo across runs since build 976. The reset is now a loop
over every gun's (possibly authored) sheet; `test-1190` executes it and proves the four old guns get
byte-identical values at factory settings while the pistol finally resets too. Four pins moved (227, 229,
476, 530 — the reducer gained `st`, the reset became the loop; each keeps its assertion's intent).

## Per-level enemy tuning (build 1191)

The wave manifest (1179) authors COMPOSITION; the stat sheet (1190) authors the guns; the enemies
themselves were engine constants. Each type's hp, damage and speed are now level-authorable through the
1190 pattern: `ENEMY_BASE` captured at boot, `gameCfg.enemyMods` carrying only-changed values, ONE clamped
sanitizer (`_sanitizeEnemyMods`) on every path in AND out — boot, both loaders, and the SERIALIZER, so
nothing out-of-range ever enters a share code (hp floor 1, dmg cap 999, speed 0.25-3×). Speed is a
MULTIPLIER of the type's min and max together, so gait variance survives tuning. Application is at SPAWN
TIME via `_enemyEff(typeKey)` in the one factory, so formula waves, manifests and placed spawns all
inherit it with zero extra plumbing. The editor grid lives in the waves fold beside the manifests; each
field's placeholder is its factory value, so blank visibly means factory. Three pins moved (21, 33, 62 —
the factory line and the game-serializer window; intents kept). "Factions" (enemies fighting each other)
is deliberately NOT this build — it needs a targeting rework, its own build.

## Imported models instance (build 1192)

Primitives have batched since before 1139; every imported GLB copy still walked its whole subtree per
frame — fifty trees were fifty draw hierarchies. Eligible model props now collapse into one
`InstancedMesh` per (geometry, material) part of the group's first member, matrices
`memberWorld × (templateWorld⁻¹ × partWorld)` so per-member position/rotation/scale all ride the root —
the multiply order is EXECUTED against the real three build in `test-1192` for a rotated+scaled member,
because a transposed order produces plausible frames that are wrong only for rotated copies.

Eligibility is decoration-grade ONLY, mirroring `instanceEligible`'s contract: physics, vehicles, running
animations, tags (the prop verbs), interact/dialogue/NPC, signals, locks, and adopted model lights all
disqualify (ten conditions, each executed in the test); a skinned or lit subtree disqualifies at batch
time, as does a >24-part model (one draw per part — a hundred-part model is not a batching win). Model
batches need ≥3 copies. They SHARE the template's live geometry/materials (the template returns to the
editor on teardown), so batch teardown is flagged not to dispose them. Same lists, same lifecycle, same
teardown as the primitive path.

Verified rather than assumed: **r149's `InstancedMesh` constructor ships `frustumCulled=false`** — a batch
spread across the map is never wrongly culled and no engine code was needed; the fact is pinned so an
upgrade that changes the default fails a test instead of blinking props out at screen edges. 1139's
raycast signature (an instanced hit reports the shared geometry with a correct world point) now applies
to model batches too.

## Effect zones (build 1193)

The zone toolbox had one effect per tool — death kills, fire burns, water swims, pads launch; a healing
fountain, a tar pit, a speed lane or a moon-gravity court was unauthorable. One new tool (`fxZones`,
✨ Effect in the zones tab) carries five effects with an audience (players / enemies / both):
- **Composition is strongest-wins for the multipliers** (haste `max`, slow/low-grav `min`) and **summing
  for the rates** (heal/hurt hp/sec) — overlapping zones compose sanely instead of multiplying into
  absurdity. Slow floors at 0.15× (bog, never freeze); every field clamps in `_migrateFxZone` so a
  hostile file cannot ship a 1e9-amount zone.
- **Speed rides the existing multiplier chains**: the player's target speed (through 1171's acceleration
  model, so it has mass), and the bots'/enemies' water-slow sites. **Low gravity is the water-swim
  pattern** (undo part of THIS frame's gravity). **Hurt is fire's exact tick/accumulator** with the same
  PvP/PvE damage split; heal is whole-hp granular. Enemy effects run host-side only.
- Serialized like every zone, migrated in both loaders, editor-only cylinder cues coloured per kind,
  full panel (add-at-me, kind/audience dropdowns, amount/radius/Y/height).

## Incremental Rapier statics (build 1194)

A GLB finishing its load after deploy triggered `buildPhysWorld()` — destroy the WHOLE world, rebuild the
terrain trimesh, every static trimesh (the documented multi-second stall), every dynamic body, every
joint and the character controller — once per load burst, for one new static prop. Statics are now
STAMPED with their body (`_physStatic`; the kinematic branches already had `_kbody`),
`addStaticColliderFor` is idempotent on the stamps (executed in `test-1194`: triple-add creates one
body), and the debounced late-load tick walks the collider list adding only what is missing into the
LIVE world. A dynamic prop missing its body still forces the full rebuild — its joints may reference
other bodies — and `destroyPhysWorld` clears the stamps so a stale one can never make the next full
build skip real work.

**The stamp exposed and fixed a real 1170-era bug:** `hideprop` removed a static prop's collider from
the query list but left its Rapier body — an invisible physics wall that dynamic props bounced off.
Hide now removes the body; show restores it through the same idempotent door. Two pins moved (125, 495 —
destroy-clears and the debounce tick; intents kept).

## Baked ambient occlusion for creator levels (build 1195)

The rendering critic's #2 CRITICAL, closed at its realistic scope. A hand-built interior was lit as if
outdoors — the hemisphere fill, the environment probe and the bounce all arrive at full strength inside a
windowless room, with only SSAO dissenting. Generated arenas have a real lightmap; creator levels
(arbitrary GLBs — no UV2 to bake into) get the PER-VERTEX version: every static-prop vertex casts a
14-ray golden-angle hemisphere, its colour becomes `0.35 + 0.65 × skyVisibility`, and
`vertexColors = true` multiplies it in. Occluders split by COST: every OTHER collider tests as its
overall box (a slab test over the 1188 grid's candidates — a primitive-built room's walls are separate
props, so boxes ARE its geometry), while the vertex's OWN model — the roof that makes an interior an
interior — tests real triangles through the 1097 BVH. A 0.15 ray near-clip keeps a vertex from being
shadowed by its own wall's box; self's collider boxes are skipped outright (triangles, never its own fat
box). All executed in `test-1195` against real three geometry.

The job is frame-budgeted (6 ms/frame), gated on `_glbPending`, re-requested when the collider count
changes (a late-loading GLB must not stay unbaked), and `worldCfg.baked` rides the whole-world
serialization so a shared level re-bakes deterministically wherever it opens — the bake itself is NEVER
serialized. Two invariants that are each a black-mesh bug if lost:
- **Copies of one GLB share geometry** — the bake writes into a private marker-guarded clone.
- **`vertexColors=true` on a shared material** demands a colour attribute on EVERY mesh using it (a
  missing attribute samples 0,0,0): after the bake, any unbaked sharer (a dynamic copy of a static
  model) gets an all-white attribute; and the primitive instancing batch STRIPS `vertexColors` from its
  material clone, because its shared unit geometry has no attribute at all.

Checkbox in the Lighting fold ("Baked ambient occlusion (per-vertex)"); off = clean unbake. Limitation
stated in the hint: a plain box only darkens at its corners — per-vertex is only as good as the
tessellation. NOT capture-verified; the browser pass is a windowless primitive room and a GLB interior,
baked and unbaked. One pin moved (1188's consumer count — the bake is the grid's ninth consumer).

## Cutscene shot events (build 1196) — the sequencer is the logic graph

The features critic wanted actor tracks. Instead of a parallel keyframe system, every cinematic shot
gains ONE field: `ev` — a named logic event fired the moment the shot starts (the first shot fires from
`startCinematic`, every later one on its hard cut). The graph's `event` nodes then do the acting with
verbs the engine already has: `moveprop` walks a tagged actor to its mark, xa clips play, dialogue opens,
the ambush spawns. Chained shots ARE the directed sequence; one field buys the whole sequencer.

Details that are each a bug if lost: **the editor's preview never fires** (framing a shot must not spawn
the ambush it frames) and **a client never fires** (the graph runs host-authoritative; results arrive in
the snapshot) — both executed in `test-1196`. The field is threaded through all six shot chokepoints
(`_resShot` with a 60-char hostile-file cap, `_normCineShot`, `_newCineShot`, `_newCutscene`, the
primary-cutscene loader/reset, and every serializer map), written as `undefined` when blank so old
levels stay byte-identical. Eleven pins across six cine tests moved with the field lists (178, 226, 248,
462, 463, 464) — each keeps its assertion's intent.

## Delta + keyframe snapshots (build 1197)

The world broadcast was the FULL state 20×/sec in raw-float JSON — every resting coin, sleeping crate and
idle chest re-serialized with 17-digit positions — and the appliers prune by ABSENCE, so nothing could
ever be omitted. Now every 10th snapshot is a FULL keyframe with the old semantics exactly, **and so is
the first snapshot after the connection count changes** — a joiner must never apply deltas against a
baseline it never saw. Between keyframes:
- **Enemies and dynamic props are per-entity deltas** (`_snapDelta`, executed in `test-1197` through
  keyframe/rest/tombstone/new-entity cases). A changed `hd`/`hs` is part of the delta key, so a HIT always
  ships. Deaths arrive as explicit tombstones (`Ex`) — absence is no longer meaningful on a delta, and a
  kill never lingers to the next keyframe. A SLEEPING physics crate serializes nothing.
- **Coins/chests/powerups are changed-only FULL sub-lists** (small lists; per-entry deltas buy nothing) —
  `[]` when changed TO empty so the prune still runs; omitted on a delta means unchanged, while on a
  keyframe omitted still means empty (the old prune, preserved).
- **Everything quantizes** to cm (positions) / mrad (angles) — the single biggest JSON cut, beyond visual
  resolution for interpolated avatars.
- The HUD enemy count rides as `en` — it must not read a partial `E`.

**Relevancy filtering was considered and REJECTED with a reason, not forgotten:** per-client serialization
multiplies host work N-fold at these entity counts (≤60), where one shared snapshot is cheaper — the bytes
were in repetition and precision, not distance. Three pins moved (389, 58, 80 — the E map became `Eall`,
the return gained the delta framing; intents kept).

**SIXTH container rollback recovered during this build** — caught by the bump assert exactly like the
fifth (the script found BUILD_VERSION at 1182, aborted atomically before writing, and the anchors it had
already matched were all pre-1183 net code, so nothing mixed). Same one-command recovery; everything
through 1196 was already pushed.

## The auto-exposure flash (build 1198) — the dead-zone was a discontinuity

Reported from play: **with an HDRI sky, auto-exposure "flashes like crazy."** Eliminated first: a fighting
writer (the meter is the only `toneMappingExposure` writer — grepped) and broken feedback (r149
backgrounds DO tone-map — pinned against the real build in `test-1198`). The oscillator was the METER'S
OWN DEAD-ZONE: inside it the target snapped to neutral; one step outside it re-applied the FULL measured
correction (up to ±1.5 stops). A bright HDRI parks the frame average exactly at that boundary — the ACES
shoulder makes a near-white sky insensitive to exposure, so the loop hunts across it — turning the snap
into a square wave through the 0.9s ease. Rhythmic flashing, from a one-line `if`.

Two stabilisers, each aimed at a mechanism:
- **The dead-zone is now a SOFT KNEE**: `|ev| -= AE_DEAD`, so the response is 0 AT the boundary and grows
  continuously past it — no discontinuity exists for the loop to oscillate across. `test-1198` proves the
  boundary response is ~0 where the old snap jumped a tenth, while a dark frame still reaches the full
  clamp (the knee saturates against it).
- **Median-of-3 harvests**: a single anomalous frame (a PMREM rebuild, a texture-upload blip) cannot move
  the target AT ALL — driven through the real `_aeMeter` with a harvest counter — while a sustained
  change still adapts from the second harvest. Disable clears the buffer.

The general lesson joins 1141's: **a control loop with any discontinuity in its response curve will find
it.** The adaptive ladder needed hysteresis and majority windows; the exposure meter needed continuity.
Two pins moved (1180's disable branch, 1182's harness gained the buffer).

## The level gets a say in the match (build 1265)

The audit's gameplay CRITICAL: the competitive loop is entirely engine-owned. The four PvP modes are a fixed
enum and the score target is typed into the LOBBY, so a creator could build an arena but never a GAME — "this
map is first-to-5 team deathmatch" was unsayable, and every host had to be told the rules out of band.

This does **not** open the enum (a new mode is a real build, not a field). It lets a level state which of the
shipped modes it is FOR and what it is played to. `gameCfg.pvp` / `gameCfg.pvpTarget` serialize with the rest
of the game block, and `_resolveMatch(lobbyMode, lobbyTarget)` is the one place a host asks what to start.

Three decisions worth keeping:
- **A DEFAULT, never a lock.** The lobby's choice always wins if the host touched it. A level can carry its
  intent without taking the room away from the people in it — and a co-op level dropped into a PvP lobby is
  the host's call, not an error the engine should refuse.
- **The target is scoped to the mode it was authored for.** "First to 5" means something different in a duel
  than in king-of-the-hill, so a TDM target is NOT applied to a free-for-all the host picked instead. A target
  with no stated mode applies to whatever PvP mode is played — but never to co-op, which has no score to win.
- **Silence is unchanged.** A level that says nothing hosts as co-op exactly as before, and both fields
  serialize as `undefined` when unset, so a co-op level's JSON does not grow two dead keys.

Clamped on the way in AND the way out (a level file is untrusted input): an unknown mode is discarded rather
than passed through to `NET.gameMode`, and the target is rounded and bounded to 0..999 — a NaN target is a
match that can never end. Two serializer pins moved (21, 33), both keeping their intent.

## The two views disagreed about what you were holding (build 1266)

Reported from play, twice: *"I can't see the weapon in the Held gun grip (third-person) section. It shows up
in the weapons tab, but not when trying to set the position in the player tab."* Build 1264 fixed a different
panel (the viewmodel's own visibility) and this was still broken, which is 1158's pattern again — a fix that
was complete for the half it was tested against.

**The two views resolved their weapon model by different rules.** The first-person viewmodel asks
`wepModelUrl(key)`, which falls back to the engine's own shipped gun. `attachAvatarGun` read
`WEAPONS[key].model` directly and fell back only to **another weapon's** custom model — and every shipped
weapon carries `model:''`, so on the stock loadout the resolved url was `''` and `if(!url){ return; }` left
the hand empty. Not only in the editor panel: in third-person play, and on every remote player and bot. The
grip sliders had nothing to position, which is exactly what "I can't see the weapon" meant.

Probed live with the editor open on the Player tab, any external `.glb` served from a stub, **and the
viewmodel as the control** — it loaded over the same route, so this was never the network:

```
                     WEAPONS.rifle.model   viewmodelUrl        vmLoaded    HAS_GUN   gunLoadUrl
before                        ""           ...58bb.glb         ["rifle"]    false      null
after                         ""           ...58bb.glb         ["rifle"]    true      ...58bb.glb
```
After: `visible true`, NDC `(0.04, 0.06)` — on screen. (The probe's screenshot shows the walk camera, not the
Player-tab orbit: setting `editorOpen` alone does not engage that branch. The geometry is the evidence.)

Three things worth keeping:
- **The borrow was wrong in BOTH directions.** Empty whenever no weapon had a custom model — the entire stock
  loadout — and once a creator set one on any weapon, FISTS borrowed it and the character punched while
  holding a rifle. Both disappear with the resolver.
- **`_wepShowsFists(key)` is now one named predicate asked by both views**, rather than the same condition
  written out in each. Naming a rule in one place and applying it in one place is not the same as a rule
  (1152/1158); this is the cheap version of that lesson applied before it bites.
- **The load path became the COMMON path, so it needed a guard it never had.** `attachAvatarGun` runs every
  frame per avatar, and before the callback lands each frame re-issued `loadGLTFCached` and would clone a
  whole skinned model on completion. `_gunLoading` holds one request in flight per avatar and clears on both
  success and failure — a bad url must not wedge that hand empty for the rest of the match. It clears
  *before* the weapon-changed guard, so switching to a weapon that resolves the same url still re-attaches
  from cache.

Four pins moved (285, 286, 520, 523), each keeping its intent: 286's "a weapon with no model still shows a
gun rather than vanishing" is now served by `wepModelUrl`'s fallback instead of the borrow, and 520/523's
fists gate became an EXECUTED check of the shared predicate rather than a literal.

## The preview was posed inside a camera branch (build 1268)

Reported from play, third round: *"I can't visually see where the held gun grip (third-person) is changing
until I play the live game. I need to make those adjustments live, in the editor."*

**Build 1266 fixed a real bug and was feeding a call site that never ran.** `attachAvatarGun(previewAvatar,
...)` lived inside the Player tab's ORBIT CAMERA branch — the third arm of a chain whose second arm is
`else if(editorOpen && editorFreeFly)` — and opening the editor sets `editorFreeFly = true` **every time**.
So on the camera the editor actually opens with, that branch never executed: no held gun, no joint tweaks
(942), no two-handed hold preview (937). The grip sliders wrote values with nothing on screen to show them.

Posing a preview is not a camera concern, so it no longer sits in a camera branch. `_edPlayerPreviewTick()`
runs from the frame loop **before** the camera chain and names no camera mode at all; the chain decides only
where you are looking from. And entering the Player area now drops into the orbit preview — that camera
exists for nothing else, and everything the tab authors is judged by eye against it — one-shot on the mode
change so `F` still flies, and never on a scene-click, which must not move the creator's viewpoint.

Probed through the REAL editor path (`toggleEditor`, then `setEditorMode('player')`), which is the part that
mattered:
```
editor : editorOpen true, mode "build", active "props", fly TRUE      <- the cause, in one field
tab    : active "player", fly false                                   <- lands on the orbit camera
report : HAS_GUN true, gunVisible true, gunOnScreen true, NDC (0.04, 0.06), cam (0, 1.7, 10.5)
grip   : x/y 0.28,1.15 -> 0.75,1.25 via refreshAvatarGunGrips         <- the sliders move it LIVE
fly    : gun cleared + editorFreeFly=true -> re-attached within 4 s   <- posing survives every mode
```

**The lesson is 1264's, one level deeper: a probe that never enters the real path proves the mechanism, not
the feature.** My 1266 probe set `editorOpen=true` directly instead of going through `setEditorMode`, so it
landed in a camera mode no creator ever sees, reported `HAS_GUN true`, and I shipped. The screenshot from
that run even said so — its HUD read `WALK` — and I dismissed it as a rig artifact rather than the signal it
was. **When a probe's own framing disagrees with the feature's, the framing is the finding.** One pin moved
(942), re-expressed as the WYSIWYG property rather than a line with three spaces in it.

## Screen-size prop culling (build 1267)

The audit's rendering-scale ceiling. The engine had ANIMATION lod and no geometric one: every prop drew at
full cost at any distance and nothing was ever culled by size, so a level's draw cost was flat in the camera
— the one thing that makes a big creator level unplayable while a small one is fine.

The measure is SCREEN SIZE (`radius / distance`), not distance, which is what every engine's bottom LOD rung
actually is. A distance threshold has to be authored per object or it hides a cathedral and keeps a pebble;
screen size needs no authoring, because it asks the only question that matters.

Measured live on a seeded 600-prop field spread to 300 m, rendering the real scene, **with a control pair**:

```
lodPx      calls    tris    culled   visible lights
    0        304   4,624         0        35
    2        106   2,248       494        35     <- the shipped default
    4         67   1,780       564        35
    8         52   1,600       590        35
    0        304   4,624         0        35     <- control returns exactly
```
So it buys DRAW CALLS first (−65% at the default) and triangles second — the right shape, since the props
small enough to cull are by definition the cheap ones per triangle.

**And on the stock level it correctly does nothing**: 59 props / 4,858 tris / 107 calls, with ZERO props
under 8 px. Worth stating plainly rather than implying a win everywhere — this is for the dense imported
level the audit was talking about, and it costs nothing when it finds nothing to do.

Three invariants make it safe, and each is a shipped bug without it:
- **A prop carrying a LIGHT is never hidden.** Hiding one changes the scene's light count and recompiles
  every lit material mid-frame — the freeze of builds 636 / 977 / 1153 / 1155. Measured: **seven of the
  stock level's 59 props carry a light**, so this is the common case here, not an edge one. The light count
  is byte-identical at every threshold above.
- **The editor never culls.** A prop that vanishes for being small is indistinguishable from one you failed
  to place. Opening the editor restores everything.
- **A culled prop still stops bullets.** Build 1236 made any invisible ancestor a ghost that stops no shot —
  correct for a collision volume inside a GLB, catastrophic for a prop the renderer merely skipped drawing.
  `_shotGhost` now exempts `_lodCull`, and 1236's real ghosts are untouched.

**A correction to build 1139, verified against the real build:** that entry recorded *"Raycaster ignores a
mesh's own `visible:false` but NOT its ancestors'."* r149 ignores **both** — the hit arrives regardless,
which is exactly why the `_shotGhost` exemption is able to work. 1236's code was right either way (it walks
the chain itself); only the note was wrong. `test-1267` pins the fact against three, because if a future
version honoured `visible` a culled prop would stop being hit at all and no exemption could save it.

The hysteresis (1.4×) stops a prop at the boundary flickering, and the budget (128 props/frame, rolling
cursor) makes a 2,000-prop level a fixed slice rather than a spike. `lodPx` is **not** zeroed by
`_postOffWorld` — culling is a cost control, not a look.

## The logic graph learns ordered collections (build 1269)

The last gap named in the card/puzzle design pass (1259 closed read-inventory, 1260 closed HUD art). Every
value the graph could hold was ONE NUMBER per name, so "deal a card", "did they press the switches in this
order" and "shuffle the deck" were unsayable — a 52-card deck was 52 nodes and a 4-step combination could
not be compared at all.

One node in STATE, matching the Math node's shape (1169): `List`, with `push / fill 1..N / draw / draw
random / shuffle / remove / clear / length / contains / value at / same order as`. Four decisions:

- **Its own store, not `logicVars`.** Every consumer of that store coerces with `+logicVars[k]||0` — the HUD
  widget mirror, the `hudv` net message, campaign persistence — so a value that is not a number would
  silently become 0 there and travel over the wire as one. `logicLists` keeps `logicVars` exactly what all
  of that already assumes.
- **A value LEAVES a list into a variable.** That is the whole boundary: the existing mirroring, HUD binding
  and persistence apply unchanged and nothing new crosses the wire. Lists are host-side state, like the rest
  of the graph.
- **`fill 1..N` exists because otherwise this is unusable.** A deck in one node is the difference between a
  feature and a demo.
- **`same order as` is the puzzle question.** Order-sensitive comparison is what separates a combination
  lock from a bag of tokens, and it is the one thing no combination of the other ops can express.

**The test rig caught a real inconsistency before it shipped:** every other state node routes its
destination through `_lgVarKey` (build 1231's per-player `name@` convention) and the first draft wrote
`logicVars[dst]` raw. List NAMES now route through it too — so `hand@` is THIS player's hand, which is the
difference between a card game and a card demo, and is exactly where per-player state matters most.

Bounded on both axes (64 lists, 256 entries) because a level file is untrusted input, `put()` never writes
NaN (one would poison every later compare — 1169's lesson), and an unnamed or over-cap list reports empty
rather than throwing mid-graph. Three pins moved (1028's palette↔runtime parity list, and 1033/1060's
datalist-refresh line).

**FIFTH container rollback, recovered mid-build** — the tree reverted to build 1182 (`b246158`) and the
`BUILD_VERSION` anchor simply failed, which is the cheapest possible way to find out. `git log` first,
then `git fetch` + `reset --hard FETCH_HEAD`, then re-run the scripted edit: free again, for the fifth time.
Writing every build as a re-runnable script is what makes this a 30-second interruption instead of a rebuild.

## The rung above culling, and the refresh 1267 owed (build 1270)

A prop stops CASTING a shadow well before it stops being DRAWN. The shadow map is a whole extra scene pass
per cascade, and a shadow cast by something a few pixels across is not a shape anybody can read — so
`LOD_SHADOW_MUL = 4` gives the ladder its cheap middle rung, and unlike a real geometry LOD it needs no
simplified meshes and no simplifier.

Measured on 400 props seeded INSIDE the shadow volume. That detail is the finding: **build 1267's field was
at 300 m, never in a cascade at all**, so the same measurement there would have shown nothing and I would
have concluded there was nothing to get.

```
lodPx     calls     tris   culled   not-casting   meshes casting
    0     1,334   20,428        0             0             460
    1       894   15,184        0           262             198   <- the rung ALONE
    2       558   11,152       81           368              92   <- shipped default
    4       314    8,224      262           398              62
    0     1,362   20,800        0             0             460   <- control
```
**The `lodPx 1` row is the honest isolation: NOTHING was hidden and draw calls still fell 33%.** At the
shipped default the ladder cuts 58%, and most of that is the shadow rung rather than the culling — 368 props
stopped casting while only 81 stopped drawing. The control returns to within 2% rather than exactly (1267's
returned byte-identical) because forcing the shadow map to rebuild each sample includes a cascade fit that
tracks the live camera and sun. Expected drift, not a leak.

**The authored `castShadow` is REMEMBERED, not assumed.** Plenty of meshes legitimately never cast —
levelgen's `nocollide` grass (1096) is the standing example — and a blanket restore to `true` would start a
whole field of grass casting the moment the player walked near it. `_lodSetCasting` captures each mesh's own
value once into `userData._lodCS` and restores THAT. Verified live: a mesh authored `castShadow:false` reads
false at every distance, near and far.

### The defect 1267 shipped, found by building the next rung on top of it

`renderer.shadowMap.autoUpdate` is **false** (build 1093's static shadow map): the map is only redrawn when
`_dirtyShadows()` asks. So build 1267 hiding a prop did **not** remove its shadow — the ground kept the
shadow of something that was no longer drawn until some unrelated event happened to request a refresh, and
an un-culled prop came back without one. In practice `_shDirty` fires whenever the player moves, so it would
usually self-correct; standing still while the rolling cursor crossed a prop's threshold is where it shows.

Both rungs now set `_lodDirty` and the tick requests a refresh once, at the end, only when something
actually changed — so a settled scene still pays nothing. Verified live: `autoUpdate false`, and one
state-changing tick leaves `_shadowDirtyFrames` at 2.

**This is build 1263's lesson arriving from the other side.** That one was *a perf change may not remove
work something else was silently relying on*; this one is *a perf change may not skip work something else
silently needs*. Both are the same question — what did the thing you changed used to do for someone else? —
and the shadow map has now answered it twice.

## Safe expressions — the escape hatch, in the only form this engine can ship (build 1271)

The audit's editor CRITICAL was "no scripting escape hatch": the graph is expressive but anything the nodes
cannot say is unsayable, and every competitor lets you drop to code. `(hp / maxhp) * 100` took three Math
nodes and two throwaway variables; `score + wave * 10 + bonus` took four.

**It cannot be `eval` or `new Function`, and that is the whole design.** Levels travel as share codes,
`.rumpus` files and URLs, and a player opens someone else's level by clicking a link — so compiling creator
text as JavaScript would be remote code execution in that player's browser, against their saves, their
settings and their session. There are **zero** uses of `eval`/`new Function` in this engine and that is not
an accident; `test-1271` asserts it engine-wide so this build cannot be what changes it.

So it is a hand-written tokenizer and Pratt parser producing a closure tree. Precedence, right-associative
`^`, unary minus, comparisons and `&&`/`||` returning 1/0 (so they feed Branch and the HUD unchanged), and a
fixed function table (`abs floor ceil round sqrt sign min max clamp lerp rand`). **The safety is
STRUCTURAL:** there is no property access, no indexing, no assignment and no way to name anything outside the
table — not because a filter rejects them, but because the grammar cannot express them. 35 hostile inputs
(`document.cookie`, `a.constructor("return 1")()`, `x = 1`, backtick literals, `?.`, `??`, `typeof`,
`delete`) are refused at COMPILE time.

Never NaN or Infinity (1169's rule — one poisoned value corrupts every compare downstream): `1/0`, `5%0`,
`0/0` and an overflowing power all resolve to 0. Bounded at 240 chars, depth 24, and a 200-entry compile
cache that also remembers REJECTIONS, so a hostile level cannot force a re-parse every pulse.

**One hardening the test rig forced.** `constructor` and `__proto__` are legal identifiers, so they compile —
to a *variable read*. `logicVars` is a plain object, so that read returned `Object.prototype.constructor`,
and it was safe only because `+Function` is NaN and `||0` swallowed it. Luck, not design. The getter now
tests `hasOwnProperty`, so an unset name reads 0 because it is unset — and a creator who legitimately names a
variable `constructor` gets their own value.

## A melee weapon can be the starting weapon (build 1272)

Reported from play: *"there's no option under gameplay to set the melee weapon as the starting weapon."*
Correct, and it was a gap BETWEEN two features rather than a bug in either. Build 976 added `startWeapon` as
"the PRIMARY you spawn with" and filtered `!melee` out of the list; fists got their own **Start unarmed**
checkbox, which also carries the stricter no-guns-at-all rule. The CROWBAR belonged to neither — melee, so
excluded from the dropdown; not fists, so the checkbox did not give it. The standard survival-horror opener
(start with a melee weapon, find a gun) was unauthorable.

The filter is now "not the FISTS slot" rather than "not melee", named once as `_canStartWith` and asked by
all six sites — the dropdown, its current-value guard, both loaders, the serializer and the deploy. **Six
copies of a condition is how the crowbar got lost in the first place**, which is 1266's lesson again.

**And the consequence is fixed in the same build rather than left as a surprise.** A melee weapon with no
model of its own fell through `wepModelUrl`'s fallback and put the ENGINE'S GUN in the player's hands while
they swung it. Invisible before this build (nobody could start with a crowbar) and immediately visible
after, so `_wepShowsFists` now covers every melee weapon, not just the fists slot — and because build 1266
shares that predicate with the third-person hand, the body agrees with the viewmodel. A creator's own model
still wins (674), which is the intended path for an actual crowbar mesh, and the panel hint says so.

Seven pins moved (520, 523, 62, and four in 976). Two of them — 520/523's "a melee weapon that is not FISTS
still shows a model" — are the rare case where a pin's ASSERTION was deliberately inverted rather than
re-expressed: that behaviour was the defect.

## Culling ships OFF, because I could not explain the report (build 1273)

Reported from play against 1267: *"I've placed some props and they don't appear now unless I'm right in
front of them... large models I've imported literally don't appear until the player gets right up on them.
Then they disappear as soon as the player has barely moved away."*

**I could not reproduce it.** Probed with a real imported GLB placed through the actual `spawnProp` path:
bbox 79 × 8.5 × 79, cached `_lodR` **56.02** matching a live re-measure to three decimals, and **not culled
at any distance out to 120 m** (px 137 at 120 m). So the screen-size maths is right for that asset and the
mechanism behind the report is still unidentified.

That is precisely why this build does not try to out-argue it. **A performance feature that removes a
creator's content by default, and that I cannot fully explain, does not get to stay on by default.**
`lodPx` now defaults to **0**. The feature is unchanged and still does everything 1267 and 1270 measured
when a creator turns it on; what changed is who decides.

Three things make it safe to turn on, two of which are real defects found while looking:

- **`LOD_NEAR_KEEP = 40`.** Nothing inside 40 m is ever culled or stops casting, whatever its screen size.
  This makes the reported symptom unreachable *by construction*, independently of whether the screen-size
  maths is right for a given asset — which is the point: a measurement that is wrong for ONE asset must not
  be able to delete it. The floor also beats the hysteresis band, so walking up to something restores it at
  once.
- **CSS pixels, not the drawing buffer — a real bug.** `domElement.height` is the backing store, which build
  1141's adaptive resolution ladder shrinks under load. Measured live mid-session: **buffer 518 against a
  720 CSS height, pixel ratio 0.72**, so every cull distance was 32% shorter than the number the creator
  typed — and *how much* shorter depended on which rung the ladder happened to be on. The worse a device
  performed, the more of the level it deleted. The creator's threshold is in the pixels they SEE.
- **Re-measure before removing — the asymmetry that matters.** The cached radius is now used only for the
  cheap direction (deciding something is big enough to KEEP). Before anything is actually hidden, the radius
  is measured again from the live scene graph. A wrong cache can then only ever cost one `Box3` — never a
  missing building — and the re-measure repairs the cache in passing. `test-1273` proves it by lying to the
  cache by four orders of magnitude and showing the prop still cannot be hidden.

**The general rule this is an instance of:** when a report and a measurement disagree, and the feature's
failure mode is *deleting the user's work*, the measurement does not get the benefit of the doubt. Ship the
safe default, make the symptom structurally impossible, and leave the door open. Four pins moved (1267's
default, 1270's hint text, and both LOD rigs, which needed the new constant and helper).

## Cull from the geometry, and make the culler answerable (build 1274)

Two follow-ups to 1273's unreproducible report, after three more hypotheses were tested and none reproduced
it. Worth recording what was ELIMINATED, since the next person will otherwise re-test them:

| hypothesis | result |
|---|---|
| a real imported GLB measures a wrong radius | **no** — bbox 79×8.5×79, cached `_lodR` 56.02 matching a live re-measure to 3 dp, never culled to 120 m |
| geometry offset far from the prop's origin makes it vanish | **not at size** — a 40-unit model with a 300 m offset still reads 50 px at its origin distance |
| a rigged model measures a collapsed bbox | **no** — `Box3.setFromObject` on a real `SkinnedMesh` returns the REST pose (20×20×20 for 20×20×20 geometry). It does not follow the animated pose, which is a mild inaccuracy, but it is the right order of magnitude |

**1. The distance is now measured to the geometry's CENTRE, not the prop's origin.** The offset hypothesis
did not reproduce the report, but it is a real inaccuracy and the probe constructed an ordinary case — a
building whose geometry is 20 m from the camera while its origin is 320 m away. Measuring to the origin asks
"how far am I from a point in empty space". The centre is cached as an OFFSET from the origin beside the
radius, so the per-frame path stays allocation-free, and it is re-measured wherever the radius is. The
`LOD_NEAR_KEEP` floor uses it too, or the floor would protect the wrong point in space.

**2. `lodReport()` — the culler accounts for itself**, in the Level Check panel a creator already opens when
something looks wrong: the threshold in force, how many props are hidden, how many stopped casting, how many
are even eligible, and **the smallest measured prop radius with its source name**. That last one is the tell:
a large model reading a tiny radius is precisely the class of bug that could not be ruled out, and it turns
the next report into one number. It says nothing at all when culling is off or idle — an opt-in feature must
not nag.

**The general lesson, and it is the one worth keeping from this whole sequence:** when a report cannot be
reproduced, the fix is not to guess harder. It is (a) ship the safe default, (b) make the reported symptom
structurally impossible, and (c) *make the subsystem able to answer the question next time*. Builds 1273 and
1274 are those three steps. A subsystem that can delete things from the screen has to be able to say what it
removed and why.

## Open work (as of build 1203) — THE CRITIC ROADMAP IS COMPLETE

Every item from the six-critic review panel (build 1159's `scratchpad/critics/ROADMAP.md`) has shipped or
died on verification. Phase 4's final stretch: 1188 collider grid, 1189 PvE cover/flank, 1190 weapon
sheet, 1191 enemy tuning, 1192 model instancing, 1193 effect zones, 1194 incremental Rapier statics, 1195
in-editor lighting bake, 1196 cutscene shot events (the logic graph is the sequencer — this is the "actor
tracks" answer), 1197 delta/keyframe snapshots (relevancy filtering REJECTED with a reason), 1198/1199
auto-exposure stability (soft knee; HDRI out of the AO G-buffer), 1200+1202 two-layer nav with dirty
patches, 1201 host migration, 1203 collider derivation in a worker.

Still open, each with its reason:
- **Per-player variables** — FIRST SLICE SHIPPED (build 1231): trigger + onkill events carry pid/team,
  `name@` variables scope per player. Remaining: actor-targeted verbs (heal/give/teleport the event's
  player) need a host→client effect message; more event sources (interact, objective edges) can adopt
  `_lgPlayerEvent` incrementally.
- Verification kills already recorded (do not revisit): texture slots on primitives (871-era), bot
  bullet tracers (1020), cell-hash enemy separation (arithmetic — not a hotspot), relevancy snapshot
  filtering (per-client serialization × N costs more than it saves at ≤60 entities).
- **Browser verifications the harness cannot do** are accumulating for the user — see the release-blocker
  list ("What only a human can verify") plus: AE on HDRI with AO up (1199), two-machine host-drop
  migration (1201), a big-GLB import hitch before/after (1203), bots pathing onto a roof (1200/1202).

Generator roadmap: footprints + texture budget (done, 1110) → interiors (done, 1111) → multi-storey
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

**Three things were listed as visible on the stock frame after 1149. All three are now closed, and only one
of them was real.** They are kept here because two were wrong in instructive ways:
- ~~The frame reads MONOCHROME TEAL.~~ **Real, and FIXED in build 1156** — 63.7% of the lower frame was
  blue-dominant and is now 46.6%. The cause was not what this entry said, though: it blamed the albedo being
  blue "under a blue sky", when the actual fault was that the dome's own ground band was already warm and the
  ground plane disagreed with it. The suggested hex (`0x615b53`) happened to land within a few code values of
  the derived answer (`0x5f5a55`) — a lucky guess, not a derivation. See the build 1156 section.
- ~~A hard horizontal SEAM runs across the middle of the frame where the teal floor plane meets an olive
  band.~~ **Wrong — measured and withdrawn.** The largest jump in the frame is the HORIZON, which belongs
  there; the largest one below it is a luminance edge at a platform's shadowed face, unchanged by any colour
  work. There was never a hue seam. Numbers in the build 1156 section.
- ~~The WEAPON is the brightest object in the frame by a wide margin, near-white against a world in the
  110s.~~ **Wrong — measured and withdrawn.** That was written from looking at the frame. The weapon block
  means `91,104,111` against a frame mean of `127,142,152`: it is DARKER than the world behind it. What
  reads as "near-white" is a specular highlight on the top rail's thin edge (`p90 0.209` over a 17-pixel
  strip), which is what a rail edge is supposed to do. Judging a frame by eye is the failure mode the
  Headless capture section exists to prevent, and it caught me writing this list.

Two of three written from looking at the frame, two of three wrong about the mechanism. The list was worth
keeping only because each entry named a capture that could settle it.

Also outstanding (user actions): upload `server/api/plays.php` beside lobbies.php (build 1230's flywheel is client-live but counts nothing until then); upload `tools/levelgen.mjs` + `fflate.min.js` to the cPanel host
for the in-editor generator (see `server/README.md`), and re-upload the museum GLB.
