# RUMPUS ENGINE — rendering & visual fidelity audit (build 1276)

Auditor's ground rules: every claim below was checked against `breach.html` at the cited line. Where I
claim something is missing, the greps I ran are named. `tests/run-all.mjs` was run: **1017/1017 harnesses
pass** — the engineering discipline in CLAUDE.md is real, not aspirational.

This is not a repeat of `docs/AUDIT.md` (build ~1248). Builds 1249–1276 added ambient particle emitters,
Draco, screen-size LOD/shadow rungs (shipped OFF), a light census + deploy cap, shadow-refit deadband and
named shadow movers. Nothing in 1249–1276 touched the core lighting/colour path, so the structural findings
below are the ones that survived the last audit *and* three more builds of scrutiny.

---

## 1. Verified inventory

### Colour / tone
| thing | where | verified |
|---|---|---|
| ACES filmic tone map, exposure 1.25 default | 7029–7030, toggle 18336 | yes |
| `ColorManagement.legacyMode=false`, `outputEncoding=sRGBEncoding` | 7060–7061 | yes |
| `LEGACY_EXPOSURE` / `colorV` legacy-content story | 18334 | yes |
| single-encode discipline (`_OETF_GLSL` + per-pass `uEncode`) | 7071, 8206, 7270 | yes |
| verbatim ACES for raw ShaderMaterials (`_ACES_GLSL`, `uTM`/`uExpo`) | 7084, water 20632 | yes |
| half-float post targets with an 8-bit probe fallback | `_postRTType` 7104–7116 | yes |
| LUT strip grade (N×N², raw-loaded, half-texel inset) | 7311–7333, shader 7749 | yes |
| async auto-exposure (PBO + fence, timeout-0 poll, median-of-3, soft knee) | `_aeMeter` 7407–7458 | yes |

### Post chain (order as executed in `_renderPostFX` 7986–8236)
scene→`_postRT` (or DoF→`_postRT`) → AE meter → viewmodel drawn *into* the frame → half-res G-buffer prepass
→ SSAO kernel + bilateral blur → SSR march → velocity buffer → 5-mip pyramid bloom (13-tap CoD down, 9-tap
tent up) → god rays → composite (AO×, +bloom, +SSR, +rays, encode, contrast, sat, LUT, vignette, grain) →
reprojection motion blur → FXAA → screen.

- 4× MSAA on the scene target, top adaptive rung only (`_desiredPostSamples` 7514).
- SSAO on its own half-res normal+viewdistance G-buffer (`_matAOGeo` 7843), AO power curve, bilateral upsample.
- SSR: 24-step exponential march, **floors only** by a view-space up test, fresnel weight, edge fade (7645–7686).
- Velocity buffer (7780+) with skinning and instanceMatrix handled; per-object motion blur.
- Soft particles + soft water shoreline read the same G-buffer (`_softSprite` 7474, water 20652).
- God rays: radial march of bloom mip 1, sun-screen-position gated (8163–8186).

### Lighting / shadows
- Sun `moon` (8301) + second cascade `moonFar` (8415, desktop only), per-fragment cascade pick patched into
  `lights_fragment_begin`; texel-snapped fits, texel-derived `normalBias` (`_sunNormalBias` 8324).
- `shadowMap.autoUpdate=false` (7024) with `_dirtyShadows()` + an 8-texel refit deadband (1261).
- Hemisphere fill (8261) + `worldAmbient` (8263) + **`bounceLight`** — one sun-coloured `AmbientLight`
  scaled by sun and daylight factor (8279–8300). This is the engine's only "indirect" term.
- Creator-placed lights can cast shadows, **spot/dir only**, budgeted to 4 desktop / 2 mobile, zeroed off the
  top rung (17496–17509, `updateShadowLightBudget` 8616). Point lights deliberately never cast.
- Emitter-light budget: distance-ranked fade (`updateLightBudget` 8587) plus a hard deploy cap of 48/24
  (`enforceEmitterCap` 8575) that *removes* lights from the graph rather than hiding them.
- Light census + Level Check warning past 40 point/spot lights (8557, 39065).
- Pooled lights everywhere (blast/chest/fire) because a light-count change recompiles every material.

### Sky / atmosphere / water
- Analytic sky: zenith→horizon ramp, Mie forward lobe, limb-softened disc, ground half — written twice, once
  in GLSL for the dome and once in JS for IBL/fog/hemisphere (8926–9030, `applySky` 9154). Fog colour is
  sampled from the sky's own horizon ring.
- HDRI sky path (`.hdr` via inlined RGBELoader) outranks the procedural dome.
- Environment: **one** 128² scene cube probe at `playerSpawn`, ACES-inverted to raw radiance, PMREM'd
  (`buildSceneProbe` 9209, requested once at deploy 44353). Phones fall back to sky-only.
- Height fog + sun inscatter patched into three's own fog chunks, so every built-in material inherits it;
  sprites and instanced meshes get bespoke variants (build 1181).
- Water: circular discs, analytic crossed-sine normals, fresnel mix to a live sky colour, sun glint, soft
  shoreline via the G-buffer, ACES + fog applied by hand (20619–20700).
- Weather: rain as `LineSegments` streaks, snow as sprite `Points`, ~1400 particles in a 46×30 box riding the
  camera (21172–21230).

### Materials / textures
- `MeshStandardMaterial` for engine surfaces; `floorMat` is `MeshPhysicalMaterial` (8917). Imported glTF gets
  the full inlined loader including `KHR_materials_clearcoat/sheen/transmission/iridescence` (2105–2110).
- Procedural surface detail: one 256² noise field → Sobel normal + roughness, world-span-quantised tiling
  (`_procSurface` 8660, `applyProcSurface` 8772).
- Object-space detail for UV-less imports via `onBeforeCompile`, frequency normalised per mesh bbox (8839).
- KTX2 / meshopt / Draco loaders, all lazy (16626–16700); anisotropy 8 on every imported map (17101).
- Per-primitive albedo + normal + roughness maps with per-prop tiling and rotation (`applyPropTexture` ~12880).
- Instancing for primitives (≥2) and identical imported models (≥3), material state in the key (31040–31085).
- Per-vertex sky-visibility bake for creator levels over the 1097 BVH (`_bakeTick` 9496–9548).
- Screen-size prop culling + a shadow-only rung above it, **default off** (`lodPx:0`, 9901–9975).

**Nothing in the domain is a fake.** Every subsystem I opened is real, guarded, and tested.

---

## 2. Honest comparison

Calibration first: Nanite, Lumen, hardware RT, virtual shadow maps and MegaLights are not fair asks of a
single HTML file on three r149 with no build step. I do not count them. What *is* fair: what a Unity URP
WebGL build, a Godot 4 web export, or PlayCanvas ships out of the box.

**Ahead of the realistic competition:**
- Post breadth. A stock URP WebGL build gives you bloom + a colour LUT and that is roughly it; URP's SSAO is
  a renderer feature you wire up, SSR is not in URP at all, motion vectors on WebGL are a fight. Rumpus ships
  pyramid bloom, SSAO on a real G-buffer, SSR, per-object motion blur, god rays, bokeh DoF with autofocus,
  LUT, async auto-exposure and height+inscatter fog, all riding one adaptive quality ladder.
- Colour-management rigour. The single-encode invariant, the raw-shader ACES/OETF snippets, the `colorV`
  legacy story and the inverse-ACES probe are more careful than most shipped Unity projects.
- Instrumentation. Radiance probes, light censuses, `lodReport()`, control-paired headless capture. Godot and
  Unity give you better *tools*; almost nobody uses them this rigorously.

**Behind, and it matters:**
- **GI.** Godot 4 ships LightmapGI *and* VoxelGI *and* SDFGI. Unity ships Progressive Lightmapper + Light
  Probes + APV. Rumpus has one flat ambient bounce term and a per-vertex occlusion bake. For a hand-built
  interior this is the difference in kind, not degree.
- **Reflection probes.** Godot/Unity: place as many as you like, box-projected, blended. Rumpus: one, at spawn.
- **Point-light shadows.** Godot and Unity give omni shadows on request. Rumpus: spot/dir only, by policy.
- **Temporal AA / upsampling.** Godot 4 has TAA + FSR; Unity has TAA. Rumpus has 4× MSAA (top rung) or FXAA.
  No temporal accumulation means no specular AA and no cheap upscale on weak hardware.
- **Volumetrics.** Godot 4 has volumetric fog with light shafts from *any* light. Rumpus's god rays are a
  screen-space radial blur that only works when the sun is near the frame (gate at 8168).
- **Sky.** Godot's `PhysicalSkyMaterial` does Rayleigh/Mie; Rumpus's is a gradient plus a Mie lobe. Neither
  ships clouds; Rumpus has none at all (grepped `cloud|Cloud|cirrus|cumulus|nimbus` — nothing in the game
  script). The HDRI path is the real answer here and it exists.
- **Water.** Circles only. No planar reflection, no screen-space refraction, no depth-based absorption, no
  caustics, no shoreline foam beyond the alpha fade. Godot's default water demo beats it.
- **Renderer age.** r149 is January 2023. Every `ShaderChunk` string-replace, every `#include <fog_vertex>`
  patch and every "pinned against the real three build" test is a hard lock to a three-year-old renderer.
  That is a deliberate, defensible choice — but it is a compounding one.

**Verdict on the comparison:** in *post-processing and colour* Rumpus beats a default URP WebGL export. In
*lighting the scene in the first place* it is behind Godot 4 by a clear margin, and that is the half that
decides whether a creator's level looks good.

---

## 3. The gaps that actually matter — ranked

### #1 CRITICAL — the entire post chain runs on LDR, post-ACES values

`renderer.toneMapping = ACESFilmicToneMapping` (7029) applies **inside every material's program**, so
`_postRT` already holds tone-mapped, roughly [0,1] colour before a single post pass runs. Then:

- bloom thresholds `L(c)` on those values (`_matBloomDown.pre()` 7566–7573, default `postThresh 0.62`);
- SSR adds a tone-mapped reflection (7686 / composite 7741);
- god rays march the tone-mapped bloom mip;
- auto-exposure meters the tone-mapped frame.

ACES compresses everything above ~2.0 into the last few percent of the range. A lamp at 3× white and a sun at
1000× white land within a few code values of each other, so **they bloom identically**. Bloom stops being an
intensity cue and becomes "a glow on anything bright-ish", which is exactly what the frame looks like. The
same compression is why build 1198's auto-exposure oscillated: CLAUDE.md's own diagnosis — *"the ACES shoulder
makes a near-white sky insensitive to exposure, so the loop hunts across it"* — is this defect, described
from the other side.

Corroborating evidence that this is structural and known: `applyPropEmissive` clamps `emissiveIntensity` to 2
(13006). It has to — there is no headroom above ACES for a value of 20 to mean anything.

The buffer is already `HalfFloatType` (7110). The fix is to set `renderer.toneMapping = NoToneMapping` **once
at boot** (the recompile cost the log rightly fears at 1186 and 18337 is a per-*change* cost, not a per-frame
one), move exposure and `_ACES_GLSL` into the composite where the snippet already lives, and meter
pre-tonemap. It needs a `colorV`-style legacy story because every saved level's bloom would change — which is
precisely the kind of migration this codebase already knows how to do. This is the single highest-return
change available in the domain.

### #2 CRITICAL — hand-built levels have no GI, one probe, and the stand-in is plumbed into the wrong term

Three separate problems that compound into "interiors look wrong":

**(a) The only indirect term is a flat `AmbientLight`.** `bounceLight` (8279) is `sunColor × mix(floor,
wall, 0.4)` scaled by sun — a whole-scene constant. It arrives at full strength inside a sealed, windowless
room. Correct as a pre-GI stand-in outdoors (build 1149's measurements are good); nothing at all indoors.

**(b) The per-vertex bake multiplies ALBEDO, so it darkens direct sunlight.** `_bakeTick` (9540–9546) writes
sky visibility into the `color` attribute and sets `material.vertexColors = true`. In r149,
`<color_fragment>` does `diffuseColor.rgb *= vColor` **before** lighting, and `diffuseColor` feeds
`RE_Direct` as well as `RE_IndirectDiffuse`. So a vertex at 50% sky visibility loses 32% of its *direct sun*
too — on top of the shadow map, which already answers direct occlusion correctly, and on top of SSAO, which
is applied again in the composite (7733). Occlusion is an indirect-only term; the correct slot is `aoMap`,
which needs UV2 that arbitrary GLBs do not have — which is why vertex colours were chosen. The fix stays in
the engine's own idiom: patch `<lights_fragment_maps>` / the indirect term via `onBeforeCompile` (the file
already does exactly this for the paint splat at 9297, object detail at 8843 and the cascade pick at 8435)
and apply `vColor` to indirect only. Right idea, wrong shader slot.

**(c) One reflection probe, at spawn.** `buildSceneProbe` (9209) positions `_spCam` at `playerSpawn` and
`requestSceneProbe()` has exactly one call site (44353, deploy). No creator control, no parallax correction,
no blending, no re-capture on edit. Every chrome surface anywhere in a 2000-unit level reflects the spawn
point's surroundings. Cheapest real improvement: let a creator place N probe markers, capture them at deploy
into one PMREM array, and pick nearest per prop at `finalizeProp` time. That is a day's work and it is the
difference between an interior that reads as a room and one that reads as an outdoor prop moved indoors.

### #3 HIGH — three verified defects, each contradicting the file's own stated intent

**(a) Depth of field silently disables all antialiasing.** `ensurePost` sets `_postRT.samples = 4` at the top
rung (7541). With DoF on, the scene rasterises into `_dofRT` — single-sampled, because it carries a
`DepthTexture` — and `_runDofTo` blits the *already-aliased* result into `_postRT` (7265–7271). But the FXAA
gate is `const _fx = _matFXAA && (_postRT.samples||0) === 0;` (**8208**), which is false because the target
still declares 4 samples. So at rung 0 with DoF enabled the frame gets **neither MSAA nor FXAA** — and pays
for a 4× multisampled target that only ever receives fullscreen quads. The comment three lines above (8203)
states the opposite intent verbatim: *"FXAA covers the one path 4x MSAA cannot — DoF."* One-line fix:
`const _fx = _matFXAA && ((_postRT.samples||0) === 0 || dofEnabled);` plus skipping MSAA allocation when DoF
is on. Worth a test that asserts *some* AA is active on every path.

**(b) Alpha-cutout foliage writes solid quads into the G-buffer — the sixth arrival of the 1152 rule.**
`_aoHideNoDepth` (7974–7985) sweeps on `depthWrite === false || transparent === true`. A glTF `alphaMode:
MASK` material is **opaque** with `depthWrite: true` and `alphaTest > 0` — so it is not swept, and
`scene.overrideMaterial = _matAOGeo` (7843) replaces `alphaTest` and `map` along with everything else. The
generator emits every grass, flower and reed card exactly this way (`tools/levelgen.mjs` 1760–1762,
`alphaMode:'MASK', alphaCutoff:0.32` at 3161). Result on any garden/foliage level: each grass card stamps a
full rectangle into the AO buffer (rectangular occlusion shadows on the ground), into the SSR buffer (floor
reflections blocked by invisible boxes), and into the velocity buffer (rectangular motion streaks). Three's
own shadow path handles this correctly — `getDepthMaterial` copies `alphaTest`/`map` — so it is only the
engine's three custom prepasses that are wrong. The predicate needs a third clause (`m.alphaTest > 0`) *or*,
better, `_matAOGeo`/`_matVel` need an alpha-test variant. CLAUDE.md asks "if a sixth appears, ask what ELSE
the renderer draws that is not a child of the scene" — this one *is* a child of the scene; it is content the
predicate's shape cannot express.

**(c) Imported models and engine primitives are lit by different amounts of environment.** `_envInten(metal)
= max(0.12, metalness)` (7059) is applied at `primitiveMat` (12838), `applyPropShine` (13044), `floorMat`
(18361), `wallMat` (18373) and the instancing clone (31051). The imported-material pass (17098–17114) sets
anisotropy and adopts lightmaps and **never touches `envMapIntensity`** — verified by grepping every
occurrence in the game script: five sites, all engine-authored. So an imported GLB keeps three's default of
**1.0** against a primitive's **0.12**: up to 8.3× more image-based ambient, most visible in shade where the
environment dominates. A creator cannot make an imported crate match a primitive crate. CLAUDE.md (build
1150) records unifying this, measuring it, and reverting because `max(floor, metal)` cost the metalness-0.4
weapon 27% — a correct call on that *shape* of fix. The shape that works is the one that note already
identifies: `envMapIntensity = 1` everywhere with `worldCfg.sky` scaled to compensate, plus a legacy `sky`
migration. Three builds later it is still open and it is still visible.

### #4 MED — creator-facing material and terrain surface is thin
- No **alpha cutout** for creator materials (grepped `alphaTest` across the game script: one hit, the snow
  sprite at 14728). Foliage cards, chain-link, grates and decals-as-props are unbuildable without either
  z-fighting or blend-sorting artifacts; opacity <1 forces `transparent` (13052).
- Primitives get albedo/normal/roughness only — no metalness, AO or **emissive** map (12880–12890).
- **Terrain splat blends `diffuseColor` only** (9297–9310): three paint layers, colour-only, so painted rock
  and grass share one procedural normal/roughness. The splat is a fixed 256² over the whole `ARENA*2` span —
  55 cm/texel at the default 70, **15.6 m/texel** at the maximum arena of 2000. No triplanar, so cliffs
  stretch. Terrain painting does not scale with the arena sizes the engine advertises.
- Decals are a single flat quad offset along the hit normal (28880–28893), unlit `MeshBasicMaterial`, bullet
  holes only — no projected/clipped decals, and no creator-placed decal at all.

### #5 MED — placed lights have no runtime budget at all
`registerEmitterLight` is called from emissive props (13014) and adopted GLB lights (17036/17058) — **not**
from `buildLight` (17471). So the Lights tool, the thing a creator actually lights a level with, produces
point/spot lights that are never distance-culled, never faded, and never touched by `enforceEmitterCap`.
Level Check warns past 40 (39067) and that is the whole defence. Routing `buildLight`'s point/spot through
the same registry (keeping shadow-casters exempt) is a small change with a real floor-raising effect.

---

## 4. Small, concrete, cheap
1. FXAA gate at 8208 (see 3a). One line.
2. `m.alphaTest > 0` in `_aoHideNoDepth`'s predicate (7981) as a stopgap for 3b; alpha-tested prepass
   variants as the real fix.
3. FXAA currently runs **after** film grain (composite 7758 → present 8228), so it partially smooths the
   grain it was never meant to see. Grain belongs after AA.
4. `renderer` is constructed with `antialias: true` (6939) which never applies once post is on — documented
   at 7541, but it still costs a multisampled default framebuffer. Pass `antialias: false`.
5. Weather is a box that follows the camera (21206) with no occlusion test — it rains indoors.
6. `enforceEmitterCap` drops lights past the cap but nothing tells the *creator in the editor*; the Level
   Check message (39068) only appears after a deploy has already dropped them.

---

## 5. Score

**7 / 10.**

Rubric: **10** would be a browser engine where a non-expert creator gets a genuinely good-looking game with
no rendering knowledge — real GI or high-quality lightmaps for hand-built interiors, multiple
parallax-corrected reflection probes, omni-light shadows, temporal AA with upsampling, a true HDR
(pre-tone-map) post chain, volumetric fog, planar or screen-space water, a complete PBR authoring surface
including cutout and emissive maps, and no verified defects in the frame. **5** would be "three.js with
bloom and a shadow map" — what most web engines ship.

**7** because the *breadth* and the *rigour* are genuinely exceptional: two-cascade texel-snapped sun
shadows, a half-res G-buffer feeding four consumers, pyramid bloom, SSR, per-object velocity, LUT grading,
async auto-exposure with a proven-stable control loop, height+inscatter fog patched into three's own chunks,
object-space detail for UV-less imports, and a single-encode colour invariant defended by tests. That is
ahead of a stock Unity WebGL or Godot web export on post, and the engineering log's measure-don't-argue
discipline is better than most commercial teams'.

Not 8, because the frame is still structurally LDR (the highest-leverage defect in the domain, and one the
half-float buffers are already paying for), because hand-built interiors have no light transport and the only
stand-in is wired into albedo instead of the indirect term, because there is exactly one reflection probe,
and because three verified defects — DoF killing all AA, cutout foliage polluting three prepasses, and
imported-vs-primitive environment intensity differing by 8× — each contradict an intent this file states in
its own comments.

Not 6, because none of that is sloppiness. Every one of these is a considered trade with the reasoning
written down; they are the *next* builds, not a mess to clean up.
