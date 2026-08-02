# RUMPUS ENGINE — Performance & Scalability Audit (build 1276)

Scope: runtime performance and scalability. All line references are `breach.html` at build 1276
(46,402 lines, 3.6 MB). Every claim below was checked in source; where I could not verify something I
say so explicitly. Method note: I grepped ≥3 synonyms before asserting anything is absent (the previous
audit's headline CRITICAL — "zero raycast acceleration" — was false because a hand-rolled BVH existed
under a non-obvious name; I found it at 12417 and it is real).

---

## 1. Inventory of optimisation machinery (verified) — and what is ON by default

### ON by default
| Machinery | Where | Notes |
|---|---|---|
| Adaptive quality ladder | `_adaptResTick` 6982; steps 6949; `_hiFxOn` 6970 | `ADAPT_ENABLED_DEFAULT = true` (6979). Rung 0→ sheds SSAO+MSAA (`_hiFxOn`), then 4 resolution steps `[1,.85,.72,.66]` (`.5` floor on coarse). Time-based sample window + per-frame 250 ms cap + majority-slow gate (build 1141) — verified, and the 1141 fix is genuinely present, not just documented. |
| Static shadow map | 7024 `shadowMap.autoUpdate=false`; `_dirtyShadows` 8461 | Refresh is request-driven. |
| Shadow refit deadband | `SHADOW_REFIT_TEXELS=8` 8325; `_fitSunShadow` 8335 | Doubles at `_prStepI>0` (8372). |
| Two-cascade sun shadows | `moonFar` 8415 (desktop only), maps 8304/8420 | Both 2048²; coarse gets one 1024² map + PCF (7025). |
| Instancing — primitives | `instanceEligible` 31001, `buildInstancing` 31038 | ≥2 identical; key includes colour/shine/opacity/grain (`_instKey` 31008). |
| Instancing — imported models | `modelInstanceEligible` 31024 | ≥3 copies, decoration-grade only (10 disqualifiers). |
| Animation-rate LOD | `updateMixersLOD` 10057 | Stride 1/2/4 by distance²; bands tighten with `_prStepI`. |
| Spatial collider hash | `_cgQuery` 9415 | 8 m XZ cells; 8 consumers (32032, 32093, 32948, 32990, 33097, 33130, 33148, 34917). |
| Per-mesh raycast BVH | `_buildTriBVH` ~12300, `_bvhRaycastMesh` 12378, install 12417 | Median-split, typed arrays, ≥256 tris, static non-skinned only. |
| Off-thread collider grid | `_mgridCore` 12517 (pure), worker 12799, `MGRID_SYNC_TRIS=30000` 12752 | Fail-solid while in flight; token-guarded. |
| Incremental Rapier statics | `addStaticColliderFor` 29744 (`_physStatic` stamps) | Kills the multi-second full-world rebuild per late GLB. |
| Physics early-out + substep cap | `updatePhysics` 30831 | Returns immediately with nothing dynamic; `PHYS_MAX_SUBSTEPS`. |
| AI raycast budgets | 34736–34738, 23149–23150 | los 5, ground 5, path 5, air 8, repath 3 per frame. |
| Light budget + census + deploy cap | `updateLightBudget` 8587, `_lightCensus` 8557, `enforceEmitterCap` 8575, `_maxShadowLights` 8610 | 48 lights / 24 coarse cap at deploy; shadow-casting placed lights → 0 at any resolution rung. |
| Async auto-exposure readback | `_aeMeter` 7407 | PBO + fence, `clientWaitSync` timeout 0, WebGL2-gated. |
| Texture downscale + GPU pre-upload | `_shrinkTexturesForMobile` 13403, cap 13401 | 1024 default, hard 1024 on coarse; `renderer.initTexture` warm. |
| Model cache: refcount + LRU + byte budget | 13303–13345 | 24 masters / 640 MB (96 MB coarse); big models evicted 3 s after last release. |
| Auto-decimation of heavy characters | `_autoSimplifyChar` 16304 | >60k tris → ~40k via meshopt (lazy CDN wasm). |
| KTX2 / meshopt / Draco | `_ensureKTX2` 16687, `_ensureMeshopt` 16639, `_ensureDraco` 16668 | **Previous audit said KTX2 was "deliberately unwired" — that is now FALSE.** All three load on demand via the loader's own error text (16757–16759). |
| Bounded GLB load queue | `GLB_MAX_CONCURRENT = 3` 13393 | Backoff retries. |
| Hidden-tab halt | `loop()` 34050 | No render, no physics. |
| Built-in profiler | `updatePerfHud` 33245 | render/phys/net/minimap split, draws, tris, geom, tex, **lights** (1257), enemies, mixers. |
| Frame-loop allocation hygiene | build 1168 | Verified real (`_velStashOne` 7381 reuses `userData._pvm`; `_aoHideNoDepth` 7974 writes into a caller array). |

### OFF by default (opt-in)
- **Screen-size prop culling and the shadow-caster LOD rung.** `DEFAULT_WORLD.lodPx: 0` (18029),
  `_lodPxNow` 9916, `_lodTick` 9999. This is the single largest measured lever in the engine —
  builds 1267/1270 measured **−65% draw calls at 600 props** and **−58% at 400 props inside the shadow
  volume** — and it ships disabled because build 1273 could not reproduce a play report. The safety
  work (`LOD_NEAR_KEEP=40` 9913, live re-measure before hiding, `lodReport()` in Level Check) is all
  present and looks sound to me; the feature is simply not on.
- **Adaptive resolution** can be switched off by the player (`adaptResCb` 1403), which also clears the
  FX rung strike-out (45391).
- **Post-processing** can be switched off wholesale by the player (`postFxCb` 1402, `_postOn` 7301,
  `disposePost`). This is a bigger mitigation than the previous audit credited.

### Verified ABSENT (checked ≥3 names each)
- **Occlusion culling of any kind.** No `occlusionQuery`/`createQuery`/`beginQuery`, no Hi-Z, no
  portals/PVS. Every prop in the frustum is submitted.
- **Geometry LOD.** No `THREE.LOD`, no `addLevel`, no distance mesh swap. The only "LOD" is the binary
  screen-size cull (off) and the shadow-cast rung (off). `_autoSimplifyChar` is a one-shot decimation
  at load, not a distance ladder.
- **Clustered / forward+ / deferred lighting.** r149 forward only — correctly documented at 1257 and
  confirmed: `NUM_POINT_LIGHTS` = every light in the graph, dimmed or not.
- **Asset streaming / residency by distance.** Everything a level references loads at deploy; the LRU
  (13341) only evicts **zero-ref** masters, so a level using 100 distinct 20 MB models cannot shed a byte.
- **Texture compression on import.** KTX2 is decoded if a creator's GLB already ships it; nothing
  transcodes a creator's PNG/JPEG-textured GLB. Everything imported lands as RGBA8 + mips.
- **Raycast broad-phase across objects.** `_cgQuery` accelerates box/point/segment queries only.
  `fireShot` (31195) builds `[...enemyMeshes, ...colliders, ...dynamicProps, floor]` and calls
  `intersectObjects(..., true)` **once per pellet** (31262). Same shape at 27071 and 26181/26558.

---

## 2. Real scaling ceilings, and the binding constraint at each stage

### Stage 1 — draw-call submission (the first wall, and the lowest)
Per frame at the top rung with **default world settings** (`ssao:0.9`, `ssr:0.35`, `postMotion:0.62`,
`postRays:0.45`, 18029), the scene geometry is submitted **five times**:

1. main scene → `_postRT` (7992)
2. AO G-buffer prepass, `overrideMaterial` (8059) — gated `_geoWant && _prStepI<=_AO_GEO_MAXSTEP`
3. velocity prepass, `overrideMaterial` (8123) — gated `_postMotion>0.01 && _prStepI===0`
4. near shadow cascade
5. far shadow cascade (`moonFar`, desktop)

…plus the viewmodel twice more (8073, 8132), plus **~16 fullscreen quad passes** (AO + 2 blurs, SSR,
5 bloom downsamples + 4 upsamples, god rays, composite, FXAA/afterimage: 8087–8235).
It also costs **three full JS scene-graph traverses per frame** (`_aoHideNoDepth` ×2 at 8057/8119,
`_velStash` at 8140), ×2 again for `vmScene`.

The engine's own measurements give the coefficient: 400 props inside the shadow volume = **1,334 draw
calls** (CLAUDE.md build 1270), i.e. **≈3.3 calls per prop per frame**. The stock level is 59 props /
107 calls. A browser main thread realistically sustains 2–4k draw calls at 60 fps.

> **Binding constraint: ~600–900 unique (non-instanced) props with culling at its shipped default of 0.**
> Turning `lodPx` to 2 roughly doubles that. Instancing rescues repetition only — ≥2 identical
> primitives / ≥3 identical models with an identical material key (31008/31033). A creator who imports
> 300 *different* Poly Pizza models gets zero batching and hits the wall at roughly a third of that.

Two things make this worse than the count suggests: **`InstancedMesh` and every skinned mesh are
`frustumCulled=false`** (r149 default for instances; 17080 and 16085 for skinned) — so every batch and
every character is submitted in the main pass *and both cascades* regardless of where it is.

### Stage 2 — shadow cost (the constraint during combat, and unsheddable)
`_dirtyShadows` movers (34085–34093) include **any living enemy**. So in any fight, both 2048² cascades
redraw the entire caster set every frame, and every imported prop mesh is `castShadow = true`
unconditionally (17080) with no distance or size gate unless `lodPx > 0`.

**The ladder cannot shed shadows at all.** Map size is fixed at construction (8304/8420); `moonFar` is
never disabled; `PCFSoftShadowMap` is never downgraded on desktop. The only shadow lever the ladder has
is the refit deadband doubling (8372) and `_maxShadowLights → 0` (8612), which affect *placed* lights,
not the sun. Build 1263 states this honestly ("1261's win now applies to quiet scenes rather than to
active gameplay") and I confirm it in code.

> **Binding constraint: caster count × 2 cascades, every frame, once anything is alive.** At 400 props
> that is ~920 of the 1,334 calls. This is the largest single unrecoverable cost on a weak machine.

### Stage 3 — lights
Correctly diagnosed and *bounded* in 1257: `enforceEmitterCap` (8575) caps at 48/24 at deploy;
`LIGHT_SOFT_CAP = 40` (8556) warns in Level Check; the perf HUD shows the load (33259). What remains is
structural: 48 lights is still a 48-iteration loop per fragment of every lit material, on every device.
`updateLightBudget` (8587) fades intensity beyond 16 (8 coarse) but the light must stay in the graph.

> **Binding constraint: ~40 point/spot lights on an integrated GPU** — the warning threshold is
> honestly placed. Above it you are fillrate-bound before you are draw-bound.

### Stage 4 — enemies
Per enemy per frame: skinned draw × (main + AO + velocity + 2 cascades) = 5 submissions × parts;
a mixer (strided 1/2/4); `frustumCulled=false`. Separation is O(n²) (34881) but arithmetic-only —
780 pairs at 40 enemies, ~0.1 ms; the recorded "not a hotspot" verification kill holds. AI raycasts are
hard-budgeted (34736). There is **no alive cap**: `randomWaveDescriptors` is `n = 3 + wave*2` (17852),
so wave 20 = 43 enemies, wave 30 = 63; manifests cap at 40/wave (1179).

> **Binding constraint: skinned draw + shadow submissions, ~40–60 enemies.** The AI is the *cheap* half
> — an unusual and good place to be.

### Stage 5 — memory
Post targets are `HalfFloatType` on WebGL2 (`_postRTType` 7105) and `_postRT` carries 4× MSAA at rung 0
(7546). At a 1920×1080 CSS viewport, dpr 1: `_postRT`(MSAA 4×) + `_compRT` + `_afterA` + `_afterB`
≈ **116 MB**, plus bloom pyramid/SSR/velocity/AO ≈ 21 MB, plus 2× 2048² depth ≈ 33 MB. On a dpr-2
laptop `_prBase = 1.5` and that whole set is ×2.25 → **~310 MB of render targets before a single asset.**
I derived these from the sizes at 7519–7541; they are arithmetic, not measured in a browser.

Add uncompressed RGBA8 model textures: one 1024² map with mips ≈ 5.3 MB; a 50-model level at 3 maps
each ≈ 800 MB, and the LRU cannot touch any of it because every one is referenced.

> **Binding constraint: VRAM, at roughly 40–60 distinct textured models on a 4 GB laptop and far fewer
> on a phone.** `_MODEL_BUDGET_MB` (13308) bounds the *warm cache*, not the live set.

### Stage 6 — load and hitches
Good: 3.6 MB HTML + ~600 KB three (CDN, 1471) + 2.2 MB Rapier; bounded GLB concurrency; collider grids
off-thread over 30k tris; incremental static physics. Remaining main-thread work at deploy:
`trimeshDescFor` (29726) builds a full `Float32Array` of *every triangle in world space* for each
non-primitive static, synchronously, in `buildPhysWorld` (29825). That is the one deploy stall the 1203
worker split did not cover, and CLAUDE.md's own note ("trimesh construction did not" move) is accurate.

---

## 3. Honest comparison — Unreal / Unity / Godot, calibrated to browser + no build step

**Inherent to the platform (not engine failures):**
- No clustered/deferred lighting worth having in r149 forward WebGL2. Unity URP's Forward+ and Godot 4's
  clustered renderer both do better, but neither survives a WebGL2 export intact either.
- No compute shaders in WebGL2 → no GPU culling, no GPU particles, no Hi-Z occlusion the cheap way.
- No asset cooking. Unreal/Unity/Godot all *cook* at build time: BCn/ASTC texture compression, LOD chain
  generation, mesh optimisation, lightmap packing. A no-build-step engine that accepts arbitrary URLs at
  runtime structurally cannot. This is the single biggest inherent gap and it explains most of Stage 5.
- No multithreaded render submission. One JS thread submits every draw.
- **Rumpus wins decisively on time-to-play**: ~6 MB and a click, against Unity WebGL's 20–80 MB WASM and
  Godot 4 web's notorious startup. That is a real performance property, not a consolation.

**Genuine engine gaps (all three competitors ship these, none is platform-blocked):**
1. **No occlusion culling.** Godot has one; Unity has Umbra; Unreal has several. Even a cheap
   portal/room test would matter for the indoor levels 1195 exists to light.
2. **No geometry LOD chain.** Every competitor's LODGroup is table stakes. The meshopt simplifier is
   *already loaded* (16290) — generating 2–3 LOD levels per imported model at load and swapping by the
   same screen-size metric `_lodTick` already computes is a build, not a research project.
3. **The biggest measured lever ships off.** No competitor ships with culling disabled.
4. **No player-facing graphics settings beyond two checkboxes.** Every competitor ships a quality menu.
   A player opening someone else's level with `ssao:1`, `ssr:0.5`, motion blur and god rays authored on
   can turn off *all* post or none of it (1402), and cannot touch shadows, resolution scale or draw
   distance at all. `worldCfg` is creator state; the player has no override.
5. **The ladder has no bottom rung for weak hardware.** `_PR_FLOOR` 0.66 desktop / 0.5 coarse against
   `_prBase = min(dpr, 1.5 | 2.0)` (6947–6950): on any dpr ≥ 1.5 display the *worst* rung is still
   ≈1.0 device pixel per CSS pixel, i.e. full native CSS resolution — with two 2048² cascades and the
   bloom pyramid still running. There is no rung that fits a Celeron Chromebook or a 4-year-old phone.
6. **The mobile path is "start at full quality and discover."** `IS_COARSE` (6938) gates only shadow map
   size/type, DoF, light budget, texture cap and cache MB (25 uses total). SSAO, SSR, per-object motion
   blur, the 5-mip bloom pyramid and god rays all run on a phone at rung 0 until the ladder demotes it
   — at least one 500 ms window of sustained slow frames.

---

## 4. Smaller verified findings

- `_aoHideNoDepth` allocates a fresh array on the **velocity** path (`const _vHid=[]` 8119, `_vmH=[]`
  8128) while the AO path uses module scratch (8057). Build 1168's rule was applied to one caller and
  1246 added a second — the exact "a rule applied in one place is not a rule" pattern 1158 names.
- `buildInstancing` forces `mat.vertexColors = false` (31053) — so build 1195's per-vertex AO bake is
  silently discarded for every instanced primitive during play and returns in the editor. Correct for
  the shared unit geometry; worth stating as a known trade rather than a surprise.
- `intersectObjects` is called per pellet with a freshly spread array of the whole collider list
  (31195/31262). At 500 props × 8 pellets that is ~20k bounding-sphere tests per trigger pull. Not a
  hotspot at the designed scale; it becomes one at 2,000 props, and `_cgQuery` already has the data to
  fix it.
- Level Check reports lights, culling and asset failures but **no aggregate texture MB and no
  draw-call estimate** — the previous audit's quick-win #1 was implemented for lights only. `renderer.info`
  and `_modelMemStats()` (13321) already hold both numbers.
- No `eval`/`new Function` anywhere (1271) — worth noting because it removes a whole class of JIT
  deopt as well as a security class.

---

## 5. Score

**7 / 10.**

Rubric: **10** would mean a browser engine whose shipped defaults hold 60 fps on a low-end laptop at the
scale its own editor invites — every safe optimisation on by default, a geometric LOD chain, some form of
occlusion or portal culling, a light path that does not loop 48 lights per fragment, a quality ladder with
a rung that fits the weakest device it supports, and a player-facing settings menu. **1** would mean no
culling, no batching, no budgets, and no way to measure anything.

**7** because the machinery inventory above is unusually deep for a single-file browser engine and — this
is the part that earns the number — it is *measured*, with control pairs, sweeps and honest retractions
(1141's ladder gate, 1261→1263's shadow reversal, 1273's unreproducible report). The instrumentation
(perf HUD with per-subsystem splits, light census, `lodReport`) is better than most commercial indie
projects. It loses three points for the shipped *configuration* rather than the code: the largest
measured lever is off by default, the largest unrecoverable cost (shadows) is the one thing the ladder
cannot shed, and there is no rung and no menu for the weakest third of the hardware this thing is
supposed to reach in a browser.
