# RUMPUS ENGINE — Gameplay & Game-Feel Audit (build 1276)

Domain: how the game *feels* and what game systems exist. Movement, camera, weapons, hit
feedback, enemy AI, physics, vehicles, animation, audio, difficulty, genre coverage.

**Method note.** Every claim below is marked VERIFIED (read in source, line cited) or
HYPOTHESIS. Absence claims were greped for at least three plausible names before being
asserted; the greps used are recorded inline. The previous audit (`docs/AUDIT.md` §Gameplay
Systems) covered *authoring* surface; this one covers *feel*, and does not repeat it. Where a
1252-era gap has since closed (HUD buttons 1255, push verb 1258, per-level PvP mode 1265, prop
triggers 1276) I say so rather than re-listing it.

---

## 1. Verified inventory (with the constants that matter)

### 1.1 Player movement — the strongest single system

| thing | value | line |
|---|---|---|
| walk / sprint / crouch speed | 6 / 12 / 2 u/s | 18029 (`DEFAULT_WORLD`) |
| jump velocity / gravity | 13 / 30 → apex 2.82 m, airtime 0.87 s | 18029 |
| accel / brake / air / air-brake | 14 / 20 / 3.5 / 0.4 | 18515 |
| coyote / jump buffer / jump cooldown | 0.10 s / 0.15 s / **0.50 s** | 18508, 18514 |
| slide | 1.75× sprint launch, decays to 0.4×, 0.55 s CD | 34281–34290 |
| player radius / eye height | 0.8 / 1.7 | 17990 |

Velocity chases the input target exponentially (34260–34267) rather than snapping, so starts,
stops and 180s have weight, and a released jump *carries* (`AIR_BRAKE 0.4` keeps ~67% of speed
after 1 s). Coyote + buffer are consumed on fire so coyote can't grant a double jump (34330–34332).
Slide has its own 0.25 s input buffer and a 0.3 s sprint-grace window (34277–34279). Ledge
mantle scans four forward distances and anchors the hang to the measured wall face (34335–34348).
Ladders (34297–34301), swimming/wading, moving platforms that carry you, effect zones that scale
speed. This is a better-considered locomotion layer than Unity's Starter Assets or Godot's
CharacterBody3D demo, and it is roughly at parity with UE's CharacterMovementComponent defaults
minus root motion and network prediction.

### 1.2 Camera

- FPS: crouch dip, `_landDip` spring (kicked on landing, 34170 / 34550), `_camLean` strafe roll,
  sprint FOV widen (26500, build 1210). Shake is trauma-squared with `dt*2.2` decay, applied as
  rotation offsets (34552–34559).
- Mouse look is **raw** — no smoothing, no acceleration — with a spike-rejection filter for the
  Chrome pointer-lock glitch (18800–18812). Correct for the genre.
- Third-person: exponential damped follow with `tpDamp`, over-the-shoulder side/height offsets
  that blend out under ADS, recursive collision pull-in, and a >1 s-gap snap so a tab-back never
  swoops (24572–24604). This is the useful 80% of a Cinemachine 3rd-person rig.
- Per-level view modes: `fps | chase | top | side` (`activeViewMode()` 24178), with cursor aim in
  top/chase (`cursorAimActive`), a side-scroller lane lock (34269–34272), authored tilt/yaw/height/
  roll and an orbit opt-in.
- Full cinematic system (shots, lens/focus interpolation, roll, ease, hold, DoF, live preview
  window) — see CLAUDE.md. Beyond what Cinemachine gives you without writing timeline code.

### 1.3 Weapons and combat

8 weapons (19253–19262), fully restattable per level (`GUN_STAT_KEYS` 19269, clamped) and
renameable (1240). Rifle 95 ms/12 dmg (632 RPM, 126 dps), sniper 1400 ms/95, shotgun 8 pellets ×9
at 0.08 spread, launcher is the only projectile (blastRadius 7), two melee.

Feel machinery that is genuinely present and correct:
- **dt-correct recoil decay** — `recoil *= Math.pow(0.85, dt*60)` (34612), fixed in 1161 after
  being framerate-dependent.
- **Movement accuracy penalty** with an additive airborne floor so a 0-spread rifle still punishes
  jump-shooting (`_curSpread` 31571–31578: `×(1+1.2·mob)×(air?1.8:1)` plus `0.012·mob + 0.030·air`).
- **Dynamic crosshair bloom** driven by the same `_curSpread`, eased at `dt*12` (31580–31588) — the
  reticle cannot lie about accuracy.
- **Hitmarker with three states** (hit / head / kill, 31873), configurable floating damage numbers
  (31945, per-level colours and size), headshot "dink" (6556), `HEADSHOT_MUL 2` (19562).
- **Enemy hit reactions** (31336–31368, build 1209): directional flinch impulse scaled by damage
  fraction and capped at 2.5, a 0.15 s speed penalty, and a ≥25%-max-HP hit *interrupts* a melee
  wind-up or a charger's lunge. Directional hit animation replicated over the network.
- **Hitstop** — 0.07 s on a kill, 0.2 s on a triple, sim runs at 0.12× real time (31378, 31914,
  34104). Solo only, deliberately.
- **Shell-by-shell shotgun reload** with fire-interrupt (1249), **reload cancel on weapon switch**
  via a token so the stale timeout is a no-op (1172), **per-weapon draw times** (220–450 ms).
- ADS: `BASE_FOV 78 → ADS_FOV 38.20` (29021), blend `dt*14` (~214 ms), separate hip/ADS/scope
  sensitivities, per-weapon authored aim pose, attachments that modify spread/mag/zoom.
- Physics corpses (`spawnCorpse` 31527): a single Rapier cuboid with the death pose frozen, cuboid
  chosen so it lies flat, capped at `RAGDOLL_MAX`. Honest name: "physics corpse", not a ragdoll.

### 1.4 Enemy AI — much better than the genre baseline for a web engine

8 archetypes with real mechanical differences (17754–17768): grunt, runner, brute, **gunner**
(ranged, burst 4 @ 0.09 s gap, strafes at standoff 11, breaks for cover when chunked),
**sapper** (rusher that detonates, blastR 6/dmg 40), **shieldbearer** (soaks frontal damage, turns
at 0.45× rate so you can flank it), **charger** (520 ms telegraphed wind-up then a 30 u/s lunge you
can sidestep), boss. Per-level HP/damage/speed multipliers, clamped (17777–17784).

Perception: cached line-of-sight refreshed ~9×/s with a per-frame raycast budget (19834–19845);
**gunshots are loud** — `alertEnemiesNear` at `HEAR_RADIUS 40 × weapon.loud` wakes patrollers and
turns them toward the sound (19822–19831, 31186); last-known-position pursuit with a give-up window
that extends to 8 s if recently alerted (19867–19875); authored patrol routes with loop/ping-pong.

Pathing: a real two-layer nav grid with 8-way links, corner-cut guards, connected-component
labelling for O(1) unreachable-goal rejection, incremental build so spawning never freezes, a
dirty-cell re-fold when props move, an A* budget of 3 searches/frame and a debug overlay showing
reachability (22490–22560, 22629, 34734–34737). Enemies only route when the *knee-height* sightline
is blocked, otherwise they charge straight (34838–34847) — the right call, and the comment records
that always-pathing was tried in 542 and felt wrong.

Melee: 320 ms telegraphed wind-up, damage lands at the end and only if you are still in reach
(23064, 35057–35069) — you can back out of the swing.

Separation: `sepCap = max(3.5, speedA + speedB)` so anti-overlap can out-run chase steering (34884–34900).

### 1.5 Vehicles / racing

The arcade car is better than anything the three competitors ship in a template. Slip angle from
heading-vs-travel, a grip rate the travel direction chases, **progressive breakaway** past 90% of
the traction circle, **counter-steer recovers grip 1.4×**, handbrake drops grip to 0.16× and brakes,
tyre scrub that bleeds speed in a slide, locked travel direction in the air with heading still free
for air control, pivot-point authoring for models whose origin sits at the tail (27944–27962).
Engine audio with a gearbox and slip-driven tyre screech (28156). Racing: laps, checkpoints, ghost,
race bots with a skill dial, solid car-vs-car collision with shunt reactions, networked standings.

### 1.6 Audio

Fully procedural, no asset dependency, with per-event sample override URLs. Gunshots are three
layers per weapon (sub / body+crack / delayed lowpassed tail, 6527–6543). Reload clicks are timed
to the *real* reload duration. Positional: `_spatialOut` (6481–6495) pans by the component along
the camera's own right axis with `(1 - d/55)²` attenuation. Adaptive procedural music that swells
with intensity, plus a custom music URL. Footsteps paced by horizontal speed (34422–34429).
Heartbeat that quickens as HP drops (32108).

### 1.7 Difficulty / progression

Wave escalation is count (`3 + wave*2`) plus a flat HP ramp capped at wave 25 (+100%, 19787), a
biased type mix that leans on shieldbearers and chargers in later waves, authored wave manifests
(1179), a milestone boss, 8 run upgrades offered between waves (26080–26089: damage, fire rate,
max HP, speed, lifesteal, credits, per-wave regen, grenades), a credit shop, and per-level enemy
tuning. Fall damage exists and is off by default with authored thresholds (17907–17913).

---

## 2. Honest comparison to Unreal / Unity / Godot

### Where Rumpus gives a creator MORE out of the box

1. **A playable game exists at t=0.** Unity's Starter Assets is a capsule with a Cinemachine
   follow cam and no combat. Godot's CharacterBody3D is a class and a docs page. Rumpus opens with
   a shooter that has weapons, enemies with distinct behaviours, waves, a shop, objectives and a
   score screen. Only Lyra is comparable, and Lyra is ~100 GB, a C++ toolchain and a week of GAS
   before you can rename a weapon.
2. **The AI is finished, not a NavMesh baker.** Unity gives you NavMeshAgent — pathing, no
   behaviour. Godot gives you NavigationAgent3D — the same. Unreal gives you Behaviour Trees you
   must author. Rumpus ships eight *tuned encounters* with sound perception, LOS, cover breaks,
   telegraphed attacks and flank-able armour.
3. **An arcade vehicle with a real handling model.** None of the three ship one. Godot's
   VehicleBody3D is a raw raycast vehicle you must tune from zero; Chaos Vehicles is a plugin demo.
4. **Genre switching is a dropdown.** `gameCfg.view` flips FPS / chase / top-down / side-scroll
   with lane locking, cursor aim and per-mode camera framing (24178, 34269). In all three
   competitors that is a rewrite of the controller and camera.
5. **Feel details the templates don't have:** hitstop, damage-fraction-scaled flinch, wind-up
   interruption, dynamic crosshair bloom, per-weapon three-layer gunshot synthesis, dt-correct
   recoil, coyote+buffer, slide with its own input buffer.

### Where Rumpus is genuinely behind

1. **Animation.** `setEnemyAnimState` (10406–10425) is a *discrete state machine with 0.18 s
   crossfades*, not a blend tree. There is no continuous idle→walk→run blend, and **playback rate
   is never synced to actual velocity** — `setEffectiveTimeScale` only ever receives an *authored*
   per-state constant (10402, 10422; the only three call sites). Foot slide is therefore the default
   result on any imported character unless the creator hand-tunes `clipSpeed` per clip. Unity
   Animator, Godot AnimationTree BlendSpace2D and UE BlendSpace all give this for free.
2. **No foot IK.** `ikHold` is *hand*-on-weapon IK (23981, 41822). Greped `footIK`, `foot ik`,
   `twoBone`, `two-bone`, `_ikSolve` → nothing. Characters on slopes and stairs float and sink.
   Godot ships SkeletonIK3D; Unity ships Animator foot IK; UE ships Control Rig.
3. **No real ragdoll.** One cuboid, frozen pose (31527–31546). All three competitors have skeletal
   physics assets.
4. **No network movement prediction/reconciliation.** Remote players are interpolated snapshots
   with a plausibility clamp (1164). UE's CMC does client prediction; this is a real ceiling on how
   PvP feels at latency, and it is architectural, not a missing feature.
5. **No animation notifies driving gameplay** (there is a prop-clip event track, 15463, but the
   player/enemy combat timing is timer-based, not clip-driven), and no root motion at runtime
   (there is an *editor* tool to strip root motion, 14478 — the opposite direction).

---

## 3. What a player notices in the first five minutes

Ranked by how fast it bites.

### F1. There is no mouse sensitivity setting. CRITICAL.
`HIP_SENS = 0.0022` is a `const` (29340). The only consumers are the mouselook handler
(18814–18816) and the editor drag-look (18791). There is a **gamepad** sens slider
(`padPrefs.sens`, 29054, UI at 45398) and **two touch** sliders (`touchLookMul` /
`touchAdsMul`, 29463, UI at 29590–29602). Mouse has none.

Verified by grep for `sensitivity`, `sens`, `lookSens`, `mouseSens`, `breach_sens` — every hit is
pad or touch. This is the single most-requested setting in the genre and its absence is felt in the
first thirty seconds by anyone who owns a mouse they've configured. It is also the cheapest fix in
this report: one `localStorage` multiplier applied at 18814.

Secondary: `ADS_SENS / HIP_SENS = 0.545`, but the ADS zoom is `tan(39°)/tan(19.1°) = 2.34×`, so a
zoom-matched ADS sens would be 0.427. Aiming is ~28% too fast relative to the zoom, which reads as
"the scope is twitchy". `SCOPE_SENS` at 0.20× is closer.

### F2. Recoil never recovers, and has no pattern. HIGH.
Every shot does `player.pitch += 0.010 + rand*0.006` (31174) — 0.6°–0.9°, uniformly random,
**permanent**. I enumerated all 30 writes to `player.pitch`: the only decreases are mouse/pad look,
cursor-aim reprojection, and vehicle/turret entry. There is no recentre, no spring, no recovery term.

Consequences: a 30-round rifle mag walks the view up ~22° and the player must hand-correct all of
it; and because the kick is uniform noise rather than a pattern, **there is nothing to learn**.
CS-style no-recovery is a valid design *only* with a deterministic pattern; CoD/Halo-style random
kick is valid *only* with recovery. Rumpus has taken the one combination that is neither
controllable nor learnable. The visual `recoil` variable *does* decay correctly (34612) — which is
why this reads as "my aim keeps drifting up" rather than "the gun kicks".

### F3. Enemies are silent. HIGH.
Cataloguing all 85 `SFX.*` call sites: enemies produce sound in exactly three places —
`SFX.enemyShot` on a ranged projectile (32061, 32075) and `SFX.kill` on death (31376). There is
**no** approach/footstep, no aggro/spot vocal, no melee swing or whiff, no charger wind-up sound,
no sapper fuse. `SFX.step()` (6581) takes no `at` argument at all, so it can only ever be the
player's own footsteps (34427).

So the 320 ms melee telegraph and the 520 ms charger telegraph — the two mechanics that *require*
a reaction — are purely visual, and a brute closing from behind you is inaudible in a genre where
audio does most of the threat detection. This is also the cheapest large feel win available: the
panner and the distance falloff already exist (`_spatialOut`, 6481) and every enemy already has a
world position; it is ~6 new `SFX` entries and ~5 call sites.

### F4. On a gamepad or a phone the game is much harder than it should be. HIGH.
Greped `aimAssist`, `aim_assist`, `aimassist`, `magnetism`, `stickyAim`, `snapTarget`, `adhes`,
`assist`, `friction` → the only hit is a twin-stick *cursor* nudge at 31259, which is for top-down
aim, not stick aim. There is no rotational slowdown near a target, no bullet magnetism, no target
snap. Rumpus ships a full touch layout editor and a gamepad prefs panel, so it clearly intends
those inputs to be first-class; a 3D FPS with zero aim assist on a stick is not. (Lyra ships aim
assist; Unity/Godot do not, but they also don't ship a shooter.)

### F5. Jumps get eaten in a specific, reproducible window. MED.
`JUMP_CD = 0.5` (18508) against a `JUMP_BUF = 0.15` press buffer (18514). A press that arrives
0.20–0.50 s after the previous jump is buffered, expires at +0.15 s, and is silently dropped even
though the player is grounded and the input was legitimate. Concretely: hop off a 1 m ledge (fall
~0.3 s), press jump on landing → cooldown has 0.2 s left, buffer has 0.15 s → **nothing happens**.
Build 1160 correctly identified that "demanding the exact frame ate half of all slides" and fixed
jump with coyote+buffer; the cooldown re-introduces the same class of eaten input from the other
side. The comment says the cooldown exists to stop hold-to-bunny-hop, but the input is already
edge-triggered (`_jPressed`, 34297) — the cooldown is only rate-limiting *deliberate presses*.
0.15–0.2 s would do the same job with no swallowed input.

### F6. No variable jump height. MED (fatal for the platformer genre).
Greped `jumpCut`, `shortHop`, `holdJump`, `varJump` → zero hits, and the jump is one assignment
(`player.vel.y = JUMP`, 34332) with no release handling. Every jump is exactly 2.82 m. Rumpus
advertises a side-scroll mode with a lane lock (34269) — a 2.5D platformer where you cannot tap for
a short hop is missing the primary verb of the genre. Nor is there a double jump, wall jump, dash
or air-dash (greped `doubleJump`, `wallJump`, `airJump`, `dashCd`, `dodgeRoll` → zero).

### F7. The weapon is welded to the camera. MED.
The viewmodel block (34589–34615) applies: a vertical bob (`sin(t*10)*0.012` moving,
`sin(t*2)*0.004` idle), ADS translation, recoil Z, reload dip, draw dip, melee thrust. There is
**no look-sway** — no lag/counter-rotation from mouse delta — and the camera itself has no walk bob
at all (34546–34550 applies only crouch dip, `_landDip` and shake). The gun therefore tracks a
flick with zero inertia, which is the single most-noticed "cheap" tell in a first-person game. The
sway amplitude that does exist (0.012 world units) is also small enough to be near-invisible.

### F8. Enemies move without mass. MED.
Enemy translation is direct position integration — `en.mesh.position.x += _mvx*spd*dt` (34875),
strafe at 34824, lunge at 34774. There is no velocity state and no acceleration, so an enemy
reaches full chase speed on frame 1 and stops dead on frame 1. Facing *is* smoothed
(`turnToward` at `TURN_RATE`, 35026), which makes the mismatch more visible, not less: the body
rotates while the position slides sideways. This is exactly the defect build 1171 fixed for the
player and did not port to the AI.

### F9. No player-facing difficulty or accessibility options. LOW-MED.
Greped `difficulty`, `'easy'`, `'hard'`, `hardcore` → author-side only (40035). Greped
`colorblind`, `reduceMotion`, `prefers-reduced`, `a11y` → one CSS media query for UI animation
(974), nothing that touches camera shake, the damage flash, motion blur or hitstop. A player who
gets motion sick from `addShake`/`postMotion` has no recourse inside the game.

---

## 4. Smaller verified notes

- **Grenades have no cook and no arc preview** (26165–26185; greped `cookT`, `_throwArc`,
  `trajectory`, `arcLine`). Fuse is a flat 1.5 s, so every throw is a lob you cannot time.
- **Only the launcher is a projectile weapon** (19259). No projectile arc, no charge weapons, no
  beam/continuous fire. The 8 slots can be restatted infinitely but the *fire modes* are two.
- **One vehicle archetype** — ground car. No hover, boat, bike or flyer.
- **Audio has no occlusion, no reverb, no distance filtering and no elevation cue.**
  `_spatialOut` is StereoPanner + `(1-d/55)²` gain (6481–6495); greped `convolver`, `reverb`,
  `createPanner`, `PannerNode` → none. A sound through a wall is as loud as one in the open, and a
  threat above you pans identically to one at your feet.
- **Hitstop is disabled in multiplayer** (31378, `NET.mode==='off'`). Deliberate and correct, but it
  means co-op combat is measurably less punchy than solo and nothing replaces it except the
  multi-kill shake at 31913.
- **The player takes no hitstun or knockback.** `hurtPlayer` (22846) does HP, flash, `SFX.hurt`,
  shake ≤0.5 and a directional indicator. Getting hit costs you nothing but health, which makes
  melee enemies feel weightless to receive.
- Free wins that already exist and are worth knowing about: `fallDamage` is authorable and off by
  default (17907); `loud` per weapon feeds the hearing radius (31186); `dmgNumCfg` is per-level
  (31942); the nav debug overlay colour-codes reachable / cut-off / upper-storey cells (22540).

---

## 5. Score

**7 / 10.**

**Rubric.** A 10 would mean: a creator opens the engine and the default experience feels like a
shipped commercial game in its genre — inputs are fully configurable including mouse sensitivity
and aim assist, the weapon has recoil you can learn and recover from, enemies announce themselves
in audio before they hit you, characters blend and plant their feet, and every supported genre has
its genre-defining verb (variable jump for the platformer, a handling model for the racer, a
recoil pattern for the shooter). A 5 would mean the systems exist but need a programmer to make
them feel like anything.

**Why 7.** The *systems* score higher than 7 — the AI perception/pathing layer, the eight
mechanically distinct enemies, the car handling model, the hit-feedback stack (hitmarker states,
damage numbers, flinch, wind-up interruption, hitstop, dynamic reticle) and the 1171 movement model
are all things a competent studio would be pleased with, and collectively they exceed what a
creator gets from any Unity/Godot template and rival Lyra at a thousandth of the setup cost. The
*feel* score is dragged down by a small number of specific, cheap, high-visibility defects that a
player hits before they hit any of the good parts: no mouse sensitivity (F1), unlearnable
non-recovering recoil (F2), silent enemies (F3), no aim assist off mouse-and-keyboard (F4). Two of
those four are single-digit-line fixes. The structural gaps — no blend trees, no foot IK, no real
ragdoll, no net prediction (§2) — are real and cap the ceiling, but they are the *right* things to
be behind on for a 46,000-line single-file browser engine, and none of them is what a player
notices in the first five minutes.

Fix F1–F4 and this is an 8.5 with no architectural work at all.
