# RUMPUS ENGINE — Full Competitive Audit (build 1252)

Six independent critic reviews, each benchmarking one dimension against Unreal, Unity, Godot, and the
browser-native competitors (Roblox, Fortnite Creative, Core, PlayCanvas). Method: every claim was a
hypothesis until verified in source with citations — the same discipline as the build-1159 panel,
where a "CRITICAL" died on verification.

## The verdict, merged

**For its niche — open a URL, build a game, press Play, send a link — Rumpus is a fair competitor
today, and on friction it beats all of them.** No competitor matches: zero install, zero account,
one-file distribution, instant unlisted publishing, editing on a phone browser. The rendering stack
exceeds stock Unity WebGL exports (per-object motion blur, SSR, bokeh + autofocus, async
auto-exposure, height fog — measured, not just present). The P2P netcode carries more anti-cheat
hardening than most indie multiplayer games ever ship. The systems density (logic graph with
per-player variables and payloads, contact signals, branching dialogue, persistence, eight
objectives, racing) exceeds what Fortnite Creative had for years.

**Where it is NOT yet fair competition — the six structural ceilings, one per dimension:**

1. **Rendering scale:** no geometric LOD or occlusion culling — a big creator level degrades the
   whole frame instead of the distant props. (Also: no interior GI for hand-built levels.)
2. **Editor ceiling:** no scripting escape hatch — the closed verb vocabulary means creators
   recombine what the engine knows; they cannot invent a mechanic the authors didn't pre-build.
   (Also: ONE local save slot with a real data-loss trap in the remix flow.)
3. **Gameplay ownership:** the competitive multiplayer loop and the screen belong to the engine —
   no authorable PvP modes, no clickable UI (no shops/menus), no persistent world state.
4. **Platform identity:** zero accounts — ownership is a localStorage hex key, moderation has no
   report button, and the networking substrate is free third-party infrastructure with no SLA.
5. **Performance floor:** unbounded forward-lit point-light counts (the budget dims but the shader
   still pays), and the quality ladder's bottom rung is too high for Chromebooks.
6. **Documentation:** the product outran its own manual by ~160 builds; the newest features are
   discoverable only by reading the source. (Addressed in part by docs/REFERENCE.md and the
   help-file update shipped alongside this audit.)

**The cross-cutting release-blocker view:** for a friends-and-communities release, ship today after
the infrastructure quick wins (paid TURN, self-hosted PeerServer, local peerjs). For a public
release with strangers and minors, identity + reporting are the blockers, ahead of any engine
feature.

## Consolidated quick-win list (highest leverage, roughly ordered)

1. Fix the shipped-docs factual errors (help "GitHub account needed", `.breach` claims, BREACH
   wordmark, "Export .json" label). *(Done in build 1253.)*
2. Dirty-check before `restoreLevel` on share/gallery/import loads + a named local level list —
   kills the #1 data-loss trap.
3. `report.php` + a report button (pattern exists: notifyModerator, admin queue, salted-IP limits).
4. Stand up real infra: RUMPUS_ICE_JSON with paid TURN, self-hosted PeerServer, local peerjs.min.js.
5. A `button` HUD widget kind that fires a logic event — unblocks shops/menus/tycoon in one stroke.
6. Perf census in Level Check: point-light count, texture MB, draw calls; deploy-time emitter-light cap.
7. Marquee over lights + `_pfEntryOf` carrying lights — every bulk tool inherits.
8. Wire the already-fetched Draco decoder into the runtime GLTF loader; wire the KTX2 transcoder.
9. Throttle the moving-camera shadow refresh; add one deeper quality rung for Chromebooks.
10. `prop` as a trigger-volume subject + a `push` verb + per-level killTarget — creator-owned game
    modes begin here.

The six full reports follow.

---

# RUMPUS ENGINE — Rendering Audit (build ~1248)

## 1. VERDICT
**Yes — for its niche, a fair competitor, and in post-processing breadth ahead of what most Unity WebGL / Godot-web exports actually ship.** Linear-light ACES with single-encode discipline (7029/7060–7061, `_OETF_GLSL`/`uEncode` 8203), half-float intermediates (7105), 4× MSAA scene target (7514–7517), two-cascade camera-following sun shadow with texel snapping (8325–8419), IBL from procedural sky / HDRI / inverse-ACES scene probe (9136–9188), and a post stack — pyramid bloom, SSAO, floors-SSR, god rays, per-object motion blur, Vogel-disc bokeh + autofocus, LUT grading, async auto-exposure, height/inscatter fog — more complete than a stock URP WebGL export. Every effect rides the adaptive ladder (6982–7016; per-pass gates 8020/8098/8109/8167). The real gaps are in **scaling the frame**: no geometric LOD, no occlusion culling, a single spawn-anchored reflection probe, no interior GI, no point-light shadows.

## 2. Confirmed strengths (citations)
- Colour management correct with legacy story: legacyMode=false + sRGB out (7060–7061), ACES (7029), LEGACY_EXPOSURE (7038), half-float post chain + 8-bit fallback (`_postRTType` 7104–7116), raw shaders carry verbatim ACES/OETF (`_ACES_GLSL` 7084–7096).
- Real post stack: CoD 13-tap pyramid bloom + soft knee (7549–7610); SSAO on a dedicated half-res G-buffer with rule-based no-depth sweep (7462–7539, 8024–8093); sun-disc god rays (7612–7635, 8166–8186); floors-SSR (7636–7690, 8098–8105); LUT strips (7306–7333); FXAA when MSAA absent (8208–8214).
- Per-object motion blur: true velocity buffer, per-draw prev matrices, rotation fallback, shutter normalization, cut detection (7338–7388, 8106–8142).
- Bokeh DoF + autofocus: 32-tap golden-angle disc, highlight weighting, own-CoC weights, capped radius (7192–7245); crosshair autofocus with ghost filtering (`_dofAutoTick` 7134–7156).
- Auto-exposure async PBO/fence, median-of-3, dead-zone, ±1.5-stop clamp, WebGL1 inert (`_aeMeter` 7407–7456).
- Shadows: two cascades (near fit + 4× far, `moonFar` 8390–8399), texel snapping (8334–8344), texel-derived normalBias (8323–8324), per-fragment cascade pick patched into lights_fragment_begin (8410–8419), static shadow maps dirty-flagged (7024), creator spot/dir shadows budgeted (16896–16909).
- IBL: procedural PMREM, HDRI skies (`_skyHdriUrl` 17490), scene probe through exact ACES inverse (9136–9188), envMapIntensity floor (7058–7059).
- Atmospherics: height fog + inscatter into every built-in material via ShaderChunk, fog colour from the sky's own horizon (9104–9113), day/night, weather, soft particles (7474–7496).
- Pre-GI stand-ins: sun-coloured bounce (8265+), per-vertex sky-visibility bake over BVH (9360–9449), generated-level radiance lightmaps aoMap→lightMap (16507–16516).
- The viewmodel is inside the frame — colour, AO, velocity (8004–8005, 8067–8076, 8126–8135).
- Perf architecture: adaptive ladders with hitch rejection (6982–7016), instancing (30286), animation-rate LOD (9820), emitter-light budget (8509–8521), GLB light adoption (16431–16461), KTX2 + meshopt (16072–16113), anisotropy 8 (7063).

## 3. Ranked gaps
1. **No geometric LOD, no occlusion culling — CRITICAL (large UGC levels).** No THREE.LOD/addLevel anywhere; frustum culling only; everything behind a wall still draws. Only relief is instancing + the resolution ladder, which pays geometry cost with IMAGE QUALITY (whole frame degrades instead of distant props). Biggest structural disadvantage vs every competitor.
2. **No GI for interiors — HIGH.** Real lightmaps only for generator arenas (16507–16516). Hand-built levels: flat bounce (8265+) + sky-visibility vertex bake (9360+) — occlusion-shaped, not light transport. An interior room has no bounce between surfaces.
3. **Point lights never cast shadows — MED-HIGH.** Deliberate (16892–16896, spot/dir only). A creator's lamp lights through walls unless they know to use a spot.
4. **Reflections wrong away from spawn — MED.** One probe captured at SPAWN (9169–9170), refreshed only on sky change (9197). No local/box probes. SSR floors-only (no roughness in G-buffer, 7642–7645).
5. **Runtime Draco GLBs fail — MED.** `_mkGLTFLoader` wires KTX2 + meshopt only (16072–16076); no DRACOLoader at play time, though the decoder EXISTS in the optimizer path (15803–15818). A Draco asset throws (3280–3282) → capsule + failure report. Sketchfab pipelines emit Draco.
6. **AA degrades below top rung; no temporal option — MED.** MSAA only at rung 0 (7514–7517); the median player sees 85% res + FXAA. Partly a three-r149 platform ceiling.
7. **No volumetric lighting — LOW-MED.** God rays vanish when sun leaves frame (8172 gate); no interior shafts; fog unshadowed. Baseline web exports don't ship volumetrics either.
8. **Pinned to three r149 — LOW now, compounding.** No WebGPU, no BatchedMesh (r159+, attacks gap 1), hand-patched ShaderChunks raise upgrade cost.
9. Minor: no OIT; decal pool 64 (28105); no planar mirrors; WebGL1 loses AE + MSAA gracefully.

## 4. Quick wins
1. Wire the already-fetched Draco decoder into `_mkGLTFLoader` (code exists 15811–15818).
2. Re-shoot the scene probe from the player's position when far from spawn (buildSceneProbe takes a position; throttle exists 9197).
3. Distance-based visibility culling for small props (camera distances already computed per frame for lights 8515–8521 and mixers 9834).
4. A "point light = no shadow" warning in levelIssues().
5. Surface the quality rung in the settings UI (turn "the game went blurry" into informed reports).


---

# RUMPUS ENGINE editor audit — vs Unity / Unreal / Godot / Roblox Studio / Core

## 1. VERDICT
For "open a URL, build a level, press Play, send someone a link," Rumpus beats all five named engines on friction. No install/account/build step; one-click test loop with play-from-camera + wave selection (37921–37922); three-lane sharing (instant unlisted URL 44183, reviewed community submission 38014, `#lvl=` share/challenge links 9635). Mid-tier feature surface (outliner, prefabs with instance update, cross-tab clipboard, snapping with local space, terrain brushes, align/distribute/array, command palette, preflight lint) is at Godot/Roblox-Studio parity for covered workflows. NOT a fair competitor for the creator who outgrows built-in mechanics: closed logic vocabulary (~19 node types, 26 verbs, no script escape hatch), single local save slot with a real data-loss trap in the remix flow, and every bulk tool is props-only. The gap to Roblox is not UI; it's that on Roblox you can build a game the platform authors never imagined.

## 2. Confirmed strengths
- 4-step do-to-advance editor coach (`EDTUT_STEPS` 29460–29465, never blocks), help modal, field manual, Ctrl+K palette covering actions AND settings jumps (42797, 43131).
- Best-in-class test loop: edPlay instant deploy; edPlayHere (1224) plays from the editor camera with start-wave picker; P toggles back; autosave flushes first.
- Undo/redo done right: 60-deep fork-on-edit (`pushUndoSnapshot` 36996–37008), Ctrl+Shift+Z/Ctrl+Y, selection preserved across undo (1163), hide/lock undoable, one snapshot per paste/array gesture.
- Transform tooling at parity for props: world/local gizmo (1173), snap with invert modifier (1146), Alt-drag dup, Shift+D, full-config duplicate via `_pfEntryOf`/`_pfSpawnEntry`, align/distribute/array (35842–35879), lock/group-aware marquee in top view.
- Real asset story: web search, auto scale-and-ground (`_fitPropToSize` 35111), drag-drop local .glb with content-hash IndexedDB (16114–16149), scene asset browser (37429), per-primitive textures + bulk material edit.
- Preflight competitors don't ship: `levelIssues()` (38064+) leading with failed loads, device-local model warnings, orphaned keys/locks, attribution; level size audit + one-click mobile optimization; format versioning read (37020).
- Systems breadth for non-programmers: logic graph with autocomplete datalists, campaign-persistent variables, wave manifests, animation editor with .rumpusanim export, cutscene editor with preview, dialogue, HUD widgets, title screens, terrain sculpt/paint/scatter, water zones, particle emitters with per-emitter controls.
- Touch/mobile editing supported at all (43196) — none of the five competitors author in a phone browser.

## 3. Ranked gaps
**#1 CRITICAL — No scripting escape hatch; closed logic vocabulary.** `LG_DEFS` (10795–10818): 7 events, 6 flow, 4 state (scalar Math A-op-B), a do node of 26 verbs (10813). No Lua/JS sandbox anywhere. No spatial queries, no iteration over entities, no custom per-prop properties (tags only), no custom camera control, no arbitrary input reading. Creators make VARIANTS of shipped genres, not new mechanics (grapple, crafting, economy, custom AI). Builds 1169/1170/1216 each added a few verbs — the treadmill is the evidence: every new idea needs an engine release.

**#2 CRITICAL — One local save slot; the remix flow can destroy your own work.** Only local store is `SAVE_KEY='breach_level_v1'` (9611/36375). No named local library (only remote community, prefabs, manual .json export 37666). Opening any `#lvl=`/`?game=` link calls restoreLevel over the working level with NO dirty check (45319–45347). Autosave default-ON every 20s (36352) — "open someone's level to remix" + one edit overwrites your only save within 20 seconds; undo is session-memory only. All five competitors have a project list; Roblox adds cloud version history. The most likely way a real creator loses a week of work.

**#3 HIGH — Everything that isn't a prop is second-class in every bulk workflow.** Marquee iterates propModels only and clears selLights (18251/18257); click-select is either/or (41769, 42536–42540); clipboard is `{format:'rumpusprops'}` (35756); prefabs store def.props only (35958); align/array are props-only (35842–35879). Marquee exists ONLY in top view (18224). A lamp model + its light can never be moved/copied/prefabbed/arrayed as one thing.

**#4 MED-HIGH — No transform parenting; grouping is flat.** Groups are shared gid; folders are outliner metadata. No parent-child transform (a crate on a moving platform doesn't ride it; moveprop is a teleport). Competitors are built on scene-graph parenting; Roblox welds.

**#5 MED-HIGH — Multi-room interiors are brute-force box-stacking.** 10 primitives, no CSG/boolean, no wall/room/spline tool. A doorway is four boxes forever. 1148 fixed the COLLIDER for imported doorways; authoring never got a tool. Roblox union/negate; Unreal modeling mode; Godot CSG. Mitigations: build-snap (929), grid snap, arena generator.

**#6 MED — No collaboration.** Editor strictly solo (blocked in PvP 43162; no edit-state sync protocol). Roblox Team Create is a primary reason friend groups pick it. Strategic absence for a social platform.

**#7 MED — Logic debugging is post-hoc text.** 1214's logicFailures is good; no live pulse/wire highlight, no variable watch, no breakpoints. Workaround: authoring debug HUD widgets into the level.

**#8 MED — Imported-model materials read-only; local models don't travel.** Hint says it itself (41162): material editing is built-in shapes only. A slightly-wrong-colored asset means Blender. Local models honestly flagged device-only; offline creators can build but never ship their own assets.

**#9 MED — HUD/UI authoring is variables-only.** Labels/timers/bars (36666); no buttons, images, panels, layout. Roblox/Core ship full UI systems.

## 4. Quick wins
1. Dirty-check before restoreLevel on share/gallery/import loads + suppress autosave until the creator explicitly saves a foreign level (converts #2 into an inconvenience).
2. A named local level list (thin localStorage index over the existing serializer; prefab library 35917 is the exact pattern).
3. Marquee in fly view + marquee over lights/spawns (the projection loop at 18251 already does the work).
4. Let clipboard/prefabs/array carry lights — `_pfEntryOf` is the one chokepoint (35923); every bulk tool inherits.
5. Live logic pulse flash — `_lgPulse` (10517) is one function; flashing the node/wire DOM gives 80% of Blueprint debugging for near-zero scope.
6. "Save as / load" buttons beside Export/Import (37663–37666).


---

# RUMPUS ENGINE — Gameplay Systems Audit (vs Unity/Godot templates, Roblox, Fortnite Creative)

## 1. VERDICT
Fair competitor for **solo and co-op experience genres** — wave shooters, story/exploration, puzzle, racing, platformer-lite — and its authoring density per system (trigger volumes with per-player identity, contact signals with need-N/consume semantics, branching conditional dialogue, per-game namespaced persistence, a logic graph with arithmetic, event payloads and per-player variables) exceeds what Fortnite Creative shipped with for years. NOT a fair competitor for what Roblox actually gets played for: **authored competitive multiplayer** (the four PvP modes are hardcoded and lobby-configured, not level-authored), **custom interactive UI** (the HUD displays three widget kinds and clicks none of them), and **persistent player-built worlds** (persistence saves numbers, items, one checkpoint — never world state). The pattern: the SIMULATION primitives exist and are excellent; the OWNERSHIP of the match loop and the screen still belongs to the engine.

## 2. Confirmed strengths
- Eight authored objectives, all implemented: eliminate | survival | extraction | defend | destroy | escort | puzzle | race (17274; runtimes 32038–32144; editor 39021).
- The logic graph is a real language: `_lgPulse` (10517) — setvar/addvar/math (÷0-safe), branch, counter, delay/interval/repeat (#i)/random (weighted)/once/emit/toast (var interpolation)/win/lose, read game stat; event payloads `#x/#z/#hp/#hpf/#pid/#team` (10455–10476); per-player vars via `@` (10468); `#here` (11231).
- World verbs with authority discipline (`_applyWorldAction` 11358): typed squad spawns, pickups, damage/heal/kill scoped incl. ACTOR, teleport, give/take, stat multipliers (LG_STATS 11335), music, prop lifecycle + spawnprop (11373/11382), enemy commands (LG_CMDS 11357). Host-authoritative, mirrored.
- Prop-on-prop detection — the puzzle/sports keystone: contact signals (`_contactObjectPresent`/`_consumeTouchers` 11465–11517) with tag filter, containment, N-distinct counting, consume-on-deposit. With grab/throw (29356) + Rapier ball colliders (28925), "ball in the goal" is authorable TODAY.
- Trigger volumes with per-player edges (19404–19509): enter/exit/stay, once, cadence, per-actor identity; dying counts as exit.
- Branching dialogue (1076): choices, `[if]` conditions, goto labels (27677), first-line signal (27694).
- Persistence & campaigns: namespaced per-published-game saves of vars + inventory + checkpoint (10380–10448); campaigns as one file, interstitials, carried vars (36379–36432).
- Racing complete: laps, implicit checkpoints, ghost, race bots, networked standings (24835), per-lap times (43533).
- Deep tunability: full weapon sheets + rename + models (18588–18624), per-level enemy mods (17176), ~50-param vehicles (26376), per-level camera views (17331), per-level build menu (29606), water with flow/swimming (19881), moving platforms that carry players (11619).

## 3. Ranked gaps
**#1 CRITICAL — No authorable interactive UI.** `_sanitizeHudWidgets` (10621–10643): text|timer|bar, display-only, cap 24. No button, no clickable anything, no image, no menu. The only purchase UI is the loot-chest supply cache — hardcoded three engine slots, consumed after one purchase (27825–27838). No shop, quest log, upgrade menu, clickable scoreboard. Roblox's economy-game genre lives behind this wall.

**#2 CRITICAL — Competitive multiplayer loop is engine-owned.** `pvpMode()` (22157) knows duel/ffa/tdm/cp only; win target set in the LOBBY (NET.killTarget 25018); KOTH ends via broadcastDuelOver (22645) with no authored hook. Graph's only victory verb is gameWon() — global co-op clear; no team/player win verb, no rounds, no respawn-wave authoring. CTF does not exist (no flag-carry anywhere). Cap 8 players. A creator can build A multiplayer game — only the four Rumpus ships.

**#3 HIGH — No allied combat AI.** Friendlies "never aggro, never attack" (17097, 19117); no enemy-vs-enemy targeting, no factions (grep zero), turret player-operated only. Tower defense unbuildable at any effort.

**#4 HIGH — Persistence cannot save world state.** `_persistStore` (10409–10417): vars, __inv, __cp only. Player builds, runtime prefabs, destroyed/moved props evaporate. Deploy-menu items carry no cost field (29606–29620) so "spend money to place a building" isn't authorable either.

**#5 MED — Graph can query and command, not push.** No impulse/velocity verb (prop verbs 11373; moveprop is a teleport). No stat reads a prop's position (10541–10553 all player/match). Triggers can't sense props (TRIG_WHO 19404). Soccer works; pinball flippers and "ball on YOUR half" don't.

**#6 MED — Fixed rosters.** Eight weapon slots (18588) restat/rename/remodel but never MORE; only launcher is a projectile. Eight enemy archetypes (17154), stat-tunable, fixed behaviors. One vehicle model (arcade ground car).

**#7 LOW-MED — Campaigns strictly linear.** Only transition is gameWon()'s campaignIdx++ (43500–43508). No goto-level verb: no hub worlds, level-select, branching.

## 4. Quick wins
1. **A `button` HUD widget kind that fires a named logic event** — widget system, sanitizer, host-mirroring, logicEvent all exist; converts the display layer into an interface; unblocks shops/quest logs/tycoon menus.
2. **`prop` as a fourth TRIG_WHO** (tagged, same `_trigContains`) — positional prop sensing for sports/physics puzzles.
3. **Per-level `killTarget`/`gameMode` in the serialized game block** — host already applies received killTarget (24847); first inch of creator-owned PvP.
4. **A `push` world verb** (impulse on tagged dynamic props) — bodies, tag resolver, wact mirror all in place.
5. **A `goto level` campaign verb** — `_campaignLoad(i)` (36424) is one index assignment away from hub worlds.
6. **A `hostile`-flag counterpart to friendly markers** (enemies that fight other teams) — cheapest entry to gap #3; detection/pathing/attack exist, only target-selection generalizes.

Note deliberately NOT a gap: sports goal detection — covered by contact signals with from-tag + contain feeding emit (11465–11498); the audit initially had this wrong until the contact-signal code was read.


---

# RUMPUS ENGINE — Multiplayer & Platform Audit (vs Roblox / Fortnite Creative / Core / Unity–Godot netcode)

All claims verified in breach.html and server/ at the cited functions/lines.

## 1. VERDICT

Rumpus is a genuinely credible **"play with friends" UGC engine** and an impressively hardened one for P2P — host-authoritative claim bounding (`_netDmg`/`_netDmgBudget`/`_plausibleMove`/`_structAllow`), delta snapshots, host migration, a moderated library, instant unlisted publishing with OpenGraph unfurls, and a discovery flywheel are all real and all verified. That is more anti-cheat and platform plumbing than most indie P2P games ever ship. But it is **not fair competition as a *platform*** in the Roblox/Fortnite Creative sense, and the gap splits cleanly in two. The architecture ceilings: 8 players per room with a browser tab as the server, a cheating-host trust hole no client-side code can close, doubled relay latency, and no persistent shared worlds — sessions, not places. The missing-but-buildable layer: **identity**. There are zero accounts anywhere (the meta tags advertise it: "no install, no account", line 18); every ownership primitive is a random hex key in `localStorage`, every name is freeform, mute is per-session by display name, and there is no report button on anything. For a friends-and-communities release this is shippable today; for a *public* release where strangers meet children in chat-enabled P2P rooms, moderation and identity are the release blockers, and the free third-party networking substrate (public PeerJS broker, `freeturn.net` TURN with `free`/`free` credentials) is a single point of failure the project doesn't control.

## 2. Confirmed strengths (citations)

- **Claim bounding is real and layered — best-in-class for P2P.** Damage magnitude derived from the level's own weapons (`_netDmgCap`/`_netDmg`, 24720–24733); per-source per-kind leaky buckets (`_netDmgBudget`, 24744, pvp 500/s, pve 1500/s); sender identity taken from the connection, never the packet (`handleClientMsg`, 24770–24807); **relayed** third-party `pvpHit` clamped through the same caps before forwarding (build 1205, 24787–24798); movement plausibility with a once-per-3s teleport allowance (`_plausibleMove`, 24259–24272); structural flood control on `pAdd/pMov/pDel/chat` (`_structAllow`, 24760–24772). Unity/Godot give you *none* of this out of the box.
- **Host migration exists** (build 1201, 24158–24250): deterministic no-coordination election (`_migRank`), derived room ids (`_migPid`), state adopted from the last snapshot with keyframed enemy type+hp (24342–24343), rejoiners reclaim ids via connection metadata (`_hostOnConnection`, 24982–24990). Honest documented limits (logic-graph vars and PvP bots don't survive, 24166–24168).
- **Bandwidth discipline**: delta + keyframe snapshots, cm/mrad quantization, changed-only sublists, tombstones (build 1197, `serializeWorld` 24314–24364); 20 Hz tick (`netTick`, 24680–24688); room ceiling with clean `'full'` refusal (`_maxPlayersFor`, 24981–24987).
- **Liveness engineering**: 8 s silence detection both directions (`_netTimedOut`, 21687–21689; 24692–24701), lobby-phase keepalive (25240–25254), joins self-heal via keyframe-on-conn-change (24340).
- **Discovery stack that actually exists**: lobby directory with owner keys, salted IP hashes, server-clock TTL pruning, per-IP caps (`lobbies.php`); play counts + thumbs with hour/ever rate limits (`plays.php`); "Most played" sort wired in (`_commRenderRows`, 45047).
- **A real moderation pipeline for the library**: full validation at the door (500 KB cap, decode, shape, text sanitizer — `submit.php`, `_community_lib.php validateSubmission`), review queue with email/Discord alerts, approve/reject/unpublish (`admin.php`).
- **Instant unlisted publishing with social unfurls**: `publish.php` + `game.php` — owner-key update/delete, per-IP and global caps, OpenGraph tags (build 972).
- **Asset hosting with two-sided signature sniffing** (`_sniffUpload` 44603–44619 mirrored in `upload.php`), quotas, admin delete.
- **Chat filter + mute at render** (`_chatClean`/`addChatLine`, 22746–22772): stranger links collapse to `[link]`, leet-normalised masking, own text untouched, `/mute` local.
- **Zero-friction sharing**: `#lvl=` gzip URL codes + challenge links (`encodeLevel`/`buildShareLink`, 9619–9645), campaigns with persisted variables (10364–10448).
- **Self-hoster escape hatches on every service**: `breach_lobby_db`, `breach_plays_db`, `breach_comm_api`, `breach_ice` overrides (25215, 44965, 44582, 24920).

## 3. Ranked gaps

### G1 — Identity does not exist. CRITICAL · FEATURE (buildable, but the foundation everything else needs)
No accounts anywhere. A player is `(nm&&nm.value.trim())||('Player'+rand)` (25266). Impersonation is typing someone's name; mute is by display name, evaded by renaming (accepted, 22749–22750); creator attribution is an unverifiable string (`submit.php` `author`); ownership of published games and uploads is a random hex in `localStorage` (`_uploadKey` 44595–44599) — clear browser data and a creator permanently loses control of every game URL and upload, no recovery. Roblox/Fortnite/Core make accounts the substrate; without one, moderation (G2), persistence (G5) and social (G8) can't be built properly.

### G2 — Moderation is one person and there is no report button. CRITICAL · FEATURE
No report endpoint or in-game report affordance for players, chat, levels, or unlisted games (1178 deferred it). Unlisted games go live without review. Chat filter is an 11-word English list (`_CHAT_BAD`, 22752). Uploaded images signature-checked for format, never content. Admin is a single shared password defaulting to 'CHANGE-ME' (`admin.php`). The legal-exposure gap for a public release with minors.

### G3 — Networking substrate is free third-party infra with no SLA. CRITICAL · half CEILING, half FEATURE
Signaling on the public PeerJS cloud broker (25021, 24931); library from three public CDNs (43585–43587). Default TURN `freeturn.net` creds `free`/`free` (24925–24929) — already lost one relay ("openrelay RETIRED", 24922). `ice.php` exists but ships unset. Peer ids guessable: 5-char `Math.random` room codes (43584) published in the lobby; migration slots deterministic (`_migPid`, 24169) so anyone who saw a lobby code can pre-claim the migration id and be promoted to fake host.

### G4 — Player count and host-in-a-tab. HIGH · ARCHITECTURE CEILING
Hard cap 8 per room (2 duel) — `_maxPlayersFor()` (24981). Host tab simulates everything, fans out 20 Hz over reliable/ordered channels (head-of-line blocking, 25032), relays all client-to-client (doubled latency). No interest management, no dedicated server, no headless host. Bounds the kinds of games (no BR, no MMO-lite, no persistent town).

### G5 — Nothing persists server-side; worlds are sessions. HIGH · CEILING for shared state, FEATURE for personal state
All progression in localStorage (~60 write sites). No cloud saves, no cross-device (Safari can evict). No Roblox-DataStore equivalent; a "game" exists only while its host tab is open. Personal cloud saves buildable (after G1); shared persistent worlds are a P2P ceiling.

### G6 — Clients must trust the host absolutely. HIGH · ARCHITECTURE CEILING
Every protection guards the host from clients; the host is a player and clients apply its relays verbatim (24275, 24258). WebRTC exposes every peer's IP to every peer (doxxing/DDoS surface; mitigable only by forcing TURN). Verified own-goal: the host's personal Sketchfab API token is sent to every joiner behind a fixed XOR whose decoder ships in the same file (`_sfPack`/`_sfUnpack` 16252–16253, sent 25000, applied 24851).

### G7 — Discovery is a hallway, not a platform. MED · FEATURE (+ small ceiling)
Lobby list only shows pre-game lobbies (25224, 25201) — no join-in-progress browsing despite rejoin machinery; no region/ping, no matchmaking, no friends. Flat-file backend caps: 200 lobbies, 500 tracked levels, 500 published games — honest for hundreds of users, saturates below platform scale (deliberate trade).

### G8 — Social table stakes absent. MED · FEATURE
No voice chat, no parties/friends/invites beyond code/URL, no persistent block list (mute is per-session Set, 22751), no spectator mode, no creator analytics beyond raw counts.

## 4. Quick wins

1. **Stand up real infrastructure for launch**: set `RUMPUS_ICE_JSON` (client already wired, 24913–24917) with paid TURN creds, self-hosted PeerServer, serve `peerjs.min.js` locally (repo did this exact move for Rapier, build 961). Kills the worst of G3 with zero client code.
2. **Add `report.php` + a report button** on chat lines, library rows, game pages. Pattern exists: `notifyModerator()`, `admin.php` queue, salted-IP rate limits. Cheapest dent in G2.
3. **Persist the mute list** (one line each way) + de-duplicate display names at join (`_hostOnConnection` owns naming) — blunts rename-evasion.
4. **"Creator passport" export/import**: bundle `breach_upload_key`, publish owner keys, campaign vars into a downloadable file. Turns G1's silent permanent loss into a recoverable failure without building accounts.
5. **Stop lending the Sketchfab token** (25000) or gate behind explicit host consent naming the risk.
6. **List in-progress games as joinable** — keep heartbeating after `phase==='playing'` with a `joinable` flag; rejoin/mid-match welcome paths (24997, 25001) already handle late arrivals.
7. **Pre-claim migration slots defensively**: host holds `'<code>-m<gen+1>'` as a second Peer — closes the fake-host-promotion vector for one idle broker registration.


---

# RUMPUS ENGINE — Performance Audit (build ~1250)

## 1. VERDICT
On its designed scale — arena-sized levels, ≤40 enemies/wave, low hundreds of props — genuinely performance-competitive with Unity WebGL and Godot web exports on mid-range laptops, and wins decisively on time-to-play (~3.5 MB HTML + 2.2 MB Rapier + CDN three vs Unity's 20–80 MB WASM). Real verified engineering: per-frame raycast budgets, spatial grid collision, static-by-default shadows, pooled lights, off-thread colliders, an adaptive ladder proven to fire. Roblox (native client, clustered lighting, dedicated servers) wins scaling headroom; Rumpus matches it only on instant access. Real ceilings: (a) unbounded forward-lit point-light count — the budget dims but never removes lights from the shader loop; (b) the ladder's floor is too high for the weakest third of hardware (Chromebooks bottom out at ~native 1080p with the full post stack + two 2048² cascades); (c) "static" shadows are defeated every frame the player moves.

## 2. Confirmed strengths
- Ladder sheds in the right order: MSAA+AO+SSR+velocity first (`_hiFxOn` 7004), then resolution rungs (6949); G-buffer prepass survives 3 rungs; god rays die at bottom; rung changes rebuild targets, not materials (7547).
- Collision queries grid-accelerated (`_cgRebuild`/`_cgQuery` 9330–9352); coarse rejects before per-part boxes (32349).
- AI raycasts hard-budgeted (los/ground/path budgets 5/5/5, air 8; 33973, 22338, 34075); separation distance-check-only pairs.
- Shadows static by design (autoUpdate=false 7024); two-tier mover dirtying (33316–33327); emitter + imported lamp lights never cast (8511, 16460).
- Off-thread collider derivation (12185–12206); incremental static physics adds (28995).
- Instancing: primitives ≥2, identical models ≥3, keyed by full material state (30286–30322).
- Skinned animation LOD strides mixers 1/2/4 by distance (9820).
- Light pools + `_hitchLightWatch` standing guard (33313); GLB lights normalized ≤4/model, distance-culled (16434–16465).
- Texture downscale cap 1024 (mobile hard), GPU pre-upload warm (12841–12850).
- Allocation hygiene real (1168); AE readback async PBO+fence (1182).
- Built-in profiler (updatePerfHud 32495–32510): render/phys/net/minimap + draws/tris/geom/tex.
- Netcode bounded: 20 Hz, deltas + keyframes, anti-cheat buckets double as flood protection.
- Physics early-outs when nothing dynamic (30084); capped substeps; hidden tab stops sim+render (33299).

## 3. Ranked gaps
**#1 CRITICAL — Unbounded scene light count; the budget dims, the shader still pays.** `applyPropEmissive` creates 1–5 real PointLights per emissive prop (12450–12454); GLBs keep ≤4 each (16448); pools seat 12–44 baseline. `updateLightBudget` (8514–8528) zeroes INTENSITY beyond 16/8 nearest, but by the engine's own count-rule the lights stay in the scene → `NUM_POINT_LIGHTS = total`, and r149's forward renderer loops all of them per fragment (no clustering). A 30-emissive-prop level = 50–90-light loop per pixel on an iGPU. No deploy cap, no Level Check warning; `_hitchLightWatch` fires on count CHANGES only.

**#2 HIGH — The ladder's floor is too high for the weakest hardware.** Desktop rungs bottom at 0.66 × 1.5 DPR ≈ native 1080p (6949/6946); below the bottom rung nothing else sheds: two 2048² PCFSoft cascades (8304/8395), bloom pyramid, fog, composite, minimap all keep running. A Celeron Chromebook has no rung that fits.

**#3 HIGH — "Static shadows" re-render every frame the player moves.** `_fitSunShadow` (8325–8350) reports moved when the snapped focus jumps >½ texel (~1.5 cm at shadowDist 30); walking moves ~10 cm/frame → `_dirtyShadows(1)` nearly every moving frame; BOTH cascades redraw the whole caster set (all props and enemies cast, 16484/18921). The tiered mover-dirtying only pays standing still.

**#4 MED — Top rungs submit scene geometry 3–5×.** Main + AO prepass (rungs 0–2) + velocity (rung 0) + two cascades while moving; plus 4–5 full scene-graph traversals/frame (`_aoHideNoDepth` ×2×2, `_velStash`). Draw submission is CPU-bound in WebGL.

**#5 MED — Draw calls scale with unique props; instancing rescues only repetition.** ≥2 identical prims / ≥3 identical models by full key. 100 unique models × parts = hundreds of unbatchable draws × #4. Skinned enemies frustumCulled=false (16484, 18941): off-screen waves still draw + GPU-skin.

**#6 MED — Texture memory is uncompressed RGBA.** No GPU compression: KTX2 hook deliberately unwired (4507 drops KTX2; 16066 build 917 notes missing transcoder). 1024² map ≈ 5.3 MB with mips; Poly Haven 2K toggle quadruples; 50 models × 3 maps ≈ 800 MB. No aggregate MB figure in Level Check.

**#7 LOW-MED — JSON at 20 Hz over a PeerJS star.** Snapshot + stringify change-detection per 50 ms; per-client duplicate sends (24367); reconcileProps re-tuples statics per 80 ms (24421). Fine to ~8 players; no interest management; honestly P2P.

**#8 LOW — Physics solid.** Edges: non-primitive statics build full trimeshes on the MAIN thread at deploy (29048 — grid boxes moved to the worker in 1203, trimesh construction did not); awake dynamics sync O(N)/frame (30101).

## 4. Quick wins
1. Perf census in Level Check: total point-light count, aggregate texture MB, draw-call estimate (numbers exist in renderer.info + emitterLights.length).
2. Deploy-time cap on registered emitter lights — bounds NUM_POINT_LIGHTS at zero runtime cost.
3. Throttle the moving-camera shadow refresh (every 2nd–3rd frame, or halve the far cascade at rungs ≥1).
4. One deeper desktop rung / shadow-quality shed below 0.66 — the Chromebook rung.
5. Wire the KTX2 transcoder (hooks present since build 917).
6. Revisit frustumCulled=false on enemy models.
7. Show light count + shadow-redraw indicator in the perf HUD.


---

# RUMPUS ENGINE — Content Pipeline & Onboarding Audit (build 1252)

## 1. VERDICT
The first hour is genuinely competitive with Roblox Studio's onboarding — do-to-advance coaches in play and editor, six loadable tutorial projects, keyless CC0 asset search with automatic attribution, accountless publish that beats Roblox's account-gated flow — but the funnel degrades sharply off the happy path because **the product has outrun its own documentation by ~160 builds and hides its newest pipeline features behind knowledge you can only get from reading the source**. The field manual (breach-help.html) is deep and mostly accurate to ~build 1089, still carries the pre-rebrand "BREACH" wordmark and `.breach` export claims, and documents none of: local .glb drag-import (1177), clipboard (1176), snapping (1146), local gizmo space (1173), scene-asset browser (1147), wave manifests (1179), Math/Read-stat nodes (1169), prop verbs (1170), particle emitters (1250), the plays flywheel (1230), or the instant `/game/` publish. The in-game help actively misinforms ("GitHub account needed" for publishing — false since build 958). The asset pipeline rests on single-founder infrastructure (personal Cloudflare proxy, cPanel server, an unhosted levelgen.mjs) whose failure modes surface to novices as CORS jargon. Compared to Godot/Unity docs discipline, documentation is the competitive gap; compared to Roblox, discoverability of sharing/import is.

## 2. Confirmed strengths
- Two do-to-advance coach pills, correctly scoped (TUT_STEPS 29388–29450; EDTUT_STEPS 29460–29464, shared pill with owner tagging).
- Help & tutorials modal with one-click loadable example projects (HELP_TOPICS 44462–44541) — race, arena, puzzle, top-down, side-scroller, landscape.
- Keyless, credited asset search at every model slot: Poly Pizza baked shared key + proxy (12790), Poly Haven textures/HDRIs, Freesound; every pick records attribution (37313, 37536) merged into the pause-menu Asset credits (1166) + MODEL CREDITS fold.
- Level Check is a real pre-flight (38064–38111): failed loads first, device-local model warnings, lock/key mismatches, orphan tags, cutscene path issues, logic failures, CC-BY exposure flags.
- Publishing better than documented: accountless review submit + GitHub fallback; INSTANT unlisted URL publish with update-in-place (44150); share links, .rumpus export, challenge links, campaigns; plays/thumbs gallery ranking.
- Real pipeline tooling: scene-asset browser, one-click mobile optimization + license caveat, level size audit, model cache manager with refcounts, prefabs embedded in shared levels, kitbash part editor.
- Local import with an honest sharing story (1177): content-hash IndexedDB, "this device only" toast, clean failure on other devices.
- Findability: per-tab MODE_HINTs, Ctrl+K palette, settings search with cross-tab chips, menu bar.

## 3. Ranked gaps (by funnel position)
**GAP 1 CRITICAL — The asset search's lifeline is a personal proxy whose failure mode speaks DevOps to beginners.** PP_DEFAULT_PROXY = personal workers.dev (12793); error text tells novices to deploy a Cloudflare Worker (37549). Same pattern: Tools → Generate arena requires tools/levelgen.mjs hosted beside the game (42809) — the cPanel upload is STILL outstanding per CLAUDE.md, so the primary domain's Tools menu advertises a feature that errors.

**GAP 2 CRITICAL — "Learn a feature you don't know exists" has no answer after ~build 1089.** Undocumented anywhere a creator can reach: drag-import, clipboard, snapping + Ctrl-invert, world/local gizmo, scene-asset browser, wave manifest mini-language (11-word hint only), Math/Read-stat, prop verbs, emitters, auto-exposure, the flywheel. The only current documentation is CLAUDE.md, which creators never see.

**GAP 3 HIGH — Live factual errors at the sharing step.** (a) In-game Help: "Submit to community library: ... (GitHub account needed)" (44540) — false since 958; the button itself says "No account needed". (b) Manual says exports are `.breach` (help:200/763/1219); actual is `rumpus-level-*.rumpus`; the button label still reads "Export .json" (37666) — three names for one file. (c) The manual's nav brand renders "BRE A CH" (help:73) 300 builds after the rename.

**GAP 4 HIGH — Bring-your-own-asset is invisible.** Drag-import wired (18155) but advertised nowhere; the only surface saying "Drop a .glb" is the failure toast after a WRONG-type drop (16136). No file-picker button → touch/tablet creators have no local-import path at all.

**GAP 5 MED-HIGH — The fastest publish is filed under the wrong noun.** Instant unlisted `/game/` publish lives inside the Title screen section (44150) while the prominent Save-tab publish card offers only the review queue. Help/manual omit it entirely.

**GAP 6 MED — Sharing traps warned passively, not at commitment.** Sketchfab levels require every recipient's own token (44536) with no steer at pick time toward the shareable source; the publish click never calls levelIssues() (37995) — a creator can submit a level whose props won't load for anyone.

**GAP 7 MED — The editor tutorial ends before the funnel does.** fly/add/move/play only; no save/export/publish step; exit toast points at the (stale) manual. The "share it" leg of the tagline has zero guided path.

**GAP 8 LOW — Naming drift across three help doors and two panels** (Instructions vs Field manual vs Help & tutorials; "Submit to community library" vs "Publish to community"; "Files → model upload" vs the visible "Save" tab label).

## 4. Quick wins
1. Fix the three factual lies: HELP_TOPICS "GitHub account needed" (44540), `.breach` claims + BREACH nav brand in breach-help.html, "Export .json" button label (37666).
2. Advertise drag-import where creators look (the "Add from URL" hint, 40553) + a Browse-file affordance.
3. Call levelIssues() in the publish click path and show blockers in the submit modal.
4. Surface the instant /game/ publish beside the community publish card.
5. Complete the outstanding host upload of tools/levelgen.mjs + fflate.min.js.
6. Append a "since build 1090" changelog-style section to the field manual covering the ~12 undocumented features.


---

