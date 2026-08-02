# RUMPUS ENGINE — EDITOR / TOOLS AUDIT (build 1276)

Domain: creator-facing editor — viewport, selection, gizmos, undo, outliner, prefabs, assets,
inspector, panels, discoverability, shortcuts, diagnostics, onboarding, mobile.

Method: every claim below was grepped in `breach.html` before being written. Claims that the
previous audit (`docs/AUDIT.md`, build 1252) made and that are now **wrong** are listed in §6 —
four of its nine ranked gaps have been closed or materially narrowed since, and I am not repeating
them as findings.

**SCORE: 7 / 10** (rubric in §7)

---

## 1. VERIFIED INVENTORY

### Viewport & camera
- Three modes: **walk** (edit from the player body), **fly** (`editorFreeFly`, WASD + drag-look,
  Q/E vertical, 34515–34522), **top** (orthographic-ish `topCam`, `activeCam()` 26963).
- `F` frames the selection (`_edFrameSelected` 43042; approaches from the current side, sets fly),
  `Shift+F` toggles fly, `T` toggles top. Guarded against text-field focus (18636–18650).
- Top view: wheel zoom (18741, multiplicative, cap tracks `ARENA`), middle/right-drag pan (18898).
- **No orbit-around-pivot camera.** Verified: greps for `orbit` in the editor path return only the
  animation-editor modal (15043), the character preview, and the car follow-cam. Every other engine
  on the comparison list orbits with Alt/MMB. `F` then fly-look is the substitute and it is worse:
  after framing, any look-drag pivots on the *camera*, so the object walks out of frame.

### Selection
- `selProps` / `selLights` / `selSpawns` / `selTurrets` / `selPickup` (42644+). **One type is active
  at a time** — `activeSel()` (42811) returns `selProps` or `selLights` by `editorActive`, and every
  tab switch does `selProps.length=0; selLights.length=0` (43384–43396).
- Shift+click adds; groups (`groupId`, Ctrl+G / Ctrl+Shift+G, 18616–18620) select as a unit.
- **Marquee is top-view only** — `if(editorTopView) _marqueeStart(e); else editorDragLook = true;`
  (18826). Build 1275 taught it lights (18852–18885) but did not give it a second camera.
- No `Ctrl+A` select-all (grepped `KeyA`: only Shift+A = quick-add). The outliner's per-type
  "select every … shown" button (43773) is the only select-all, and it is per kind.

### Gizmo
- Translate / rotate / scale, `1`/`2`/`3`, `4` toggles proportional scale (18621–18634).
- **World/Local space** (build 1173, `_gizmoRefQuat`, 43150/43158/43164) — axes and the drawn handle
  both rotate by the primary's quaternion; lights/zones return null so world mode is byte-identical.
- **Snapping** (build 1146): grid 0.5 m, angle 15°, scale 0.25, each with a 0-disables step
  (42600–42632); `Ctrl`/`Cmd` **inverts** rather than enables (`_snapOn` 42632). Single objects snap
  resulting position, groups snap the delta, scale snaps size, rotate snaps the angle turned.
- Group transform about the selection pivot (`applyGroupDrag`, `gizmoDrag.group` 43173).
- **Grid/angle only — no vertex, edge, face or surface snapping.** `buildSnap` (30464) is the *play
  mode* build-menu ghost, not the editor gizmo; verified at 30590.
- Works on touch: the look pad tries `tryGizmoGrab` first, drags the handle, and a clean tap
  dispatches a synthetic click to select (29376–29390); gizmo scale ×1.5 on touch (43095).

### Undo / redo
- `pushUndoSnapshot` (37924) → `JSON.stringify(serializeLevel())`, 60 deep, dedup against the last,
  redo cleared on a new edit (fork-on-edit, build 1129).
- `performUndo`/`performRedo` (38079/38092) record selected nids, `restoreLevel`, reselect
  (build 1163), with a 350 ms second pass for async model spawns.
- Hide/lock are undoable, one snapshot per gesture (43797–43801).

### Outliner (build 1036/1038, 43516–43830)
- Five type groups (props, lights, enemy spawns, turrets, pickups) + **folders** for props
  (`userData.folder`, serialized), drag-to-file including whole selections (`_outDropTarget` 43535).
- Search over name/tag/folder, a tag dropdown with counts, per-row eye (hide while editing) and
  padlock (dodges viewport clicks *and* the marquee, 18865), double-click rename (rebuild-proof via
  `_outClick2` 43530), folder-wide hide/lock/select, "Move N →" folder picker.
- Coalesced rebuild at ~6 Hz (`_outQueueRefresh` 43818).

### Assets
- Web search (Poly Pizza + Sketchfab) at every model slot, attribution auto-recorded (38181–38481).
- **Scene asset browser** (`renderSceneAssets` 38357) — groups `propModels` by `src`, live cached
  thumbnails, ×count badge, click to add another, `◉` selects every copy and frames it (38404–38421).
- **Local .glb drag-import** (build 1177): SHA-256 content hash → IndexedDB → `local:` src, 64 MB cap,
  honest "this device only" story surfaced in Level Check (39095).
- Auto fit-and-ground on add (`_fitPropToSize` 35820, opt-out checkbox 40980).
- Model **part editor** (`renderModelParts` 45865): per-part recolor/delete + kitbash primitives,
  baked to a new `.glb` via `_bakeModelEdits` (45834).
- Model cache manager with refcounts, level size audit, one-click mobile optimisation.

### Prefabs / clipboard / arrange
- `_pfEntryOf` / `_pfSpawnEntry` (36688 / 36734) is the single chokepoint. Full prop config, identity
  stripped, pivot-relative. **Build 1228 made attached lights ride the entry** (36700–36707), so
  duplicate, Alt-drag, clipboard, array and prefabs all copy a lamppost as a lamppost.
- Clipboard (build 1176): Ctrl+C/V, tagged `{format:'rumpusprops'}` into the *system* clipboard so
  paste works across levels and tabs; 100-entry cap; one undo per paste (36515–36555).
- Prefab library persists across levels and rides inside shared levels (`prefabDefs`), with instance
  tracking + Update-from-selection (36880+).
- Align / distribute / array (36607–36655), all through `_pfEntryOf`.

### Level management
- **Level library** (build 1262, 37185–37260): named index in localStorage, payloads in IndexedDB
  (`lvl:<id>`), 40 entries, Save-as-new / Open / Duplicate / Rename / Delete, active slot tracks the
  open entry. UI at 38902–38946.
- **Remix trap closed** (build 1254, 37132–37160): any foreign load (share link, `?game=`, gallery,
  import, example) marks `_foreignLevel`, pauses *every* automatic save path incl. `beforeunload`,
  and stashes unsaved work to a one-deep rescue slot with a Restore row.
- Autosave 20 s, Ctrl+S, format version read + refuse-on-`minV` (`_levelFormatCheck` 37941).

### Diagnostics & discoverability
- `levelIssues()` (39058) — light census with the remedy, cull accounting, failed asset loads,
  logic failures from the last run, device-local models, lock/key mismatches, orphan signal tags,
  dead cutscene references, un-wirable signal mechanisms, CC-BY exposure. Genuinely better preflight
  than Unity or Godot ship.
- Ctrl+K command palette (44119–44197): actions + every settings section, keyword-indexed by the
  section's own text. Settings search box with cross-tab chips. Per-tab `MODE_HINT`s. Menu bar
  (File/Edit/Tools/Help, 44010–44045). Resizable, dockable, collapsible, pop-out panel.
- 4-step do-to-advance editor tutorial (`EDTUT_STEPS` 30210), never blocking, touch variants.

---

## 2. HONEST COMPARISON — Unreal / Unity / Godot

Calibration: this is one HTML file with no build step, targeting hobbyists. That legitimately
excuses a *lot*: no C++/C# module system, no asset database, no source control integration, no
material graph, no profiler. It does **not** excuse the things below, because they are the same cost
in any UI toolkit and every competitor has had them for a decade.

| Capability | Unreal | Unity | Godot | Rumpus 1276 |
|---|---|---|---|---|
| Orbit camera around selection | ✔ | ✔ | ✔ | ✖ (fly + F-frame only) |
| Marquee in the perspective view | ✔ | ✔ | ✔ | ✖ (top view only, 18826) |
| Transform parenting / scene graph | ✔ | ✔ | ✔ (the whole model) | ✖ — see §4.1 |
| Multi-object property edit | ✔ | ✔ | ✔ | Partial — materials only (42209) |
| Undo as a command diff | ✔ | ✔ | ✔ | ✖ — full-level snapshot (§4.2) |
| CSG / boolean / room tools | ✔ modeling mode | ProBuilder | ✔ CSG nodes | ✖ (10 primitives) |
| Clickable diagnostics | ✔ | ✔ | ✔ | ✖ — plain text (39143) |
| Live script/graph debugging | ✔ Blueprint | ✔ | ✔ | ✖ — post-hoc text (39093) |
| Collaboration | ✔ (Multi-User) | ✔ (Collab/PlasticSCM) | ~ | ✖ (zero greps) |
| Project list / multiple scenes | ✔ | ✔ | ✔ | ✔ (build 1262) |
| Preflight lint of the *content* | partial | ✖ | ✖ | ✔ **better than all three** |
| Author in a phone browser | ✖ | ✖ | ✖ | ✔ (partial — §4.6) |
| Zero install / zero account / one-click share | ✖ | ✖ | ✖ | ✔ |

Where the browser genuinely changes the standard: no asset database, no import pipeline, no
profiler window, no material graph, single-window-ish layout. Where it does **not**: parenting,
multi-select property edit, marquee in perspective, orbit, clickable errors, and copy/paste in a
menu are all DOM/maths work with no platform excuse. Godot's editor is ~2 MB of scenes and does all
of them.

---

## 3. THREE WORKFLOWS WALKED END TO END

### W1 — "Import a crate, place three, tag them, wire a trigger, save, share"
1. `+` → the menu has **no model entry at all** (`ADD_ITEMS` 38689–38700: box/sphere/cylinder/cone/
   ramp/stairs/light/turret/enemy spawn/pickup/zone). Model import lives in the Build tab's
   *Add from URL* / model-browser fold. A first-timer who has learned `+` cannot find it.
2. Search → click → `addSceneProp` fits and grounds it (35876). Good. ~4 clicks.
3. Two more copies: the asset browser tile (38380) or Shift+D. Good.
4. **Tag all three: three separate operations.** The tag field writes
   `tagObj.userData.tag` where `tagObj = editorTargets.props.obj()` — the *primary* (42158–42160).
   Selecting three and typing `crate` tags one. Nothing in the UI says so, and the Gizmo hint two
   folds up says "**3 selected (group)**" (40860). Same for `interact`, signals, name, dialogue.
5. Trigger: `+` → Zone → … except triggers are **not** in the zone submenu (`ZONE_ADD` 38688 has
   audio/death/jumppad/ladder/fire/water/fx — no trigger). Triggers live only in the Gameplay tab's
   Triggers panel (37750). Two different mental models for "add a volume".
6. Panel itself is excellent: event name with `lgEvtList` autocomplete, who = player/enemy/anything/
   **a prop** (build 1276) with a prop-tag field, and an inline `⚠ No event name — this trigger does
   nothing yet` (37812).
7. Logic tab → On event → Do. Fine.
8. Save (Ctrl+S) / Save-as-new to the library / Publish. **Publish never calls `levelIssues()`** —
   verified: the only two call sites are 39058 (def) and 39135 (`renderLevelIssues`); `edSubmitComm`
   (38988) serialises and posts. A creator with three `local:` props can ship a level nobody can load,
   and the engine already knows (39095).

**Cost: ~22 interactions, 3 of them redundant (per-prop tagging), 2 discovery dead-ends.**

### W2 — "Block out a two-room building"
1. Add box, scale, `Ctrl` off/on for snapping — good, and 1146's grid genuinely makes walls flush.
2. A doorway is four boxes. **No CSG, no boolean, no wall/room tool** — verified: zero greps for
   `csg|boolean|subtract` outside an unrelated comment at 20143; 10 primitives (13285).
3. Duplicating a wall: Shift+D / Ctrl+C+V — but **neither is in the Edit menu** (44022–44026: Undo,
   Redo, Delete all objects. That is the whole menu). Copy/paste (1176), duplicate, group, array and
   snapping are all keyboard-only and undocumented in-app.
4. Select the twelve blocks to raise them 3 m: gizmo drag works on the group; **typing `3` in the Y
   field moves exactly one of them** — `props.apply()` (35282) is `const o=this.obj()`. This is the
   single sharpest trap in the editor: the panel says 12 are selected, the field is right there, and
   it silently acts on one.
5. On a terrain level every primitive lands at **y = 0**: `editorDropPoint` computes the terrain
   height (35843) and `addSceneProp` throws it away — `spawnProp(src, [px, 0, pz, …])` (35875).
   `_fitPropToSize` grounds *models* only. On a hill, a new box is buried.

### W3 — "Undo a bad ten minutes on a 300-prop level"
- Every `pushUndoSnapshot` serialises the **whole level** (37927) and every `performUndo` runs
  `restoreLevel` (37963), which removes all props and **re-spawns all 300 through `spawnProp`**
  asynchronously, re-runs every collider build, rebuilds every light, marker and zone panel.
- Sixty of those snapshots are held with **no byte cap** (37931). A terrain level serialises a 49×49
  float grid (`worldCfg.terrain.h`, 39676) — tens of KB per snapshot before a single prop.
- Practical effect: Ctrl+Z on a large level is a visible full-level reload with model pop-in, and
  history is unbounded in memory. Compare: Godot/Unity undo is a reversible command; ten thousand
  entries cost nothing.
- Correct and worth keeping: selection survives (1163), one snapshot per gesture, fork-on-edit.

---

## 4. RANKED FINDINGS

### 4.1 CRITICAL — Undo is a whole-level snapshot-and-reload
`pushUndoSnapshot` 37924 · `performUndo` 38079 · `restoreLevel` 37963.
Cost is O(level) in time and memory on *every* edit gesture — including a slider drag
(`rng.addEventListener('mousedown', ()=>pushUndoSnapshot())`, 42477) and every world-panel control
(39515). The architecture is the ceiling on how large a level anyone can comfortably author, and it
is invisible until a creator's level gets big — which is exactly when they can least afford it.
*Cheapest real fix:* keep the snapshot model but (a) cap total bytes not entries, (b) diff prop
arrays on restore and only respawn props whose entry actually changed — the nids to do it already
exist (`_selNids`, `_healLevelNids`).

### 4.2 CRITICAL — The property inspector ignores the multi-selection
`props.apply()` 35282 · `updateFieldDisplays` 42410 · `commit` 42456. The gizmo is group-aware, the
material fold is group-aware and *says so* ("Editing N selected props — changes apply to all",
42209), and the transform fields, the tag field (42158), interact (42163), signals, name and
dialogue are all primary-only with no indication. Two different rules for one selection, in adjacent
folds. A creator who tags 30 crates one at a time will conclude the editor is fine; a creator who
assumes the fields follow the selection will silently corrupt their level.

### 4.3 HIGH — Diagnostics name the problem and cannot take you to it
`renderLevelIssues` 39133: `d.textContent = msg`, no handler. "A signal targets tag 'vaultDoor', but
no prop carries that tag" is a great message with nowhere to click. The outliner already searches by
tag and `selectAssetInstances` (38404) already knows how to select-and-frame — the two are three
lines apart from being wired together. Same for the asset-failure entries (the url is known) and the
logic failures.

### 4.4 HIGH — `levelIssues()` is never run at the commitment point
Verified: two call sites only (39058, 39135). Publish (`edSubmitComm` 38988), the instant `/game/`
publish, share-link copy and `.rumpus` export all skip it. This was quick-win #3 in the build-1253
audit and is still open. The single highest-value 10-line change in this domain.

### 4.5 HIGH — No transform parenting; the scene is flat
Zero greps for `parentTo|attachTo|userData.parent|parentNid`. Groups are a shared `groupId` (36566);
folders are outliner metadata (43535). Consequences that show in play, not just authoring: a crate on
a moving platform does not ride it, `moveprop` is a teleport, a rotating assembly must be authored as
one mesh. Build 997's light-attach and build 1228's entry carry are a *special case* of parenting
implemented once; generalising them is the structural fix.

### 4.6 MED-HIGH — Mobile authoring stops at the fly camera
Verified: **zero `touchstart`/`touchmove` handlers** in the whole file (one `touchstart` at 18496,
which only sets `isTouch`). Everything is pointer events. Consequences:
- Top view pan is `mousedown` button 1/2 (18898) and zoom is `wheel` (18741) → **top view is
  unreachable on a phone**, and with it the marquee, which is top-view only. A touch creator has *no*
  multi-select at all beyond the outliner.
- No pinch-zoom anywhere in the viewport.
- The gizmo/select path lives on the *look* pad (29376), i.e. one half of the screen; taps on the
  stick half do nothing.
- The animation editor refuses touch outright (14666) — correctly, but it is the only one that says so.
Rumpus is the only engine in the comparison that authors on a phone at all; that makes the half-built
half more conspicuous, not less.

### 4.7 MED — The last 120 builds of editor features are keyboard-only and undocumented in-app
The Edit menu is Undo / Redo / Delete-all (44022). Absent from *every* menu, palette and panel:
Copy, Paste, Duplicate, Group/Ungroup, Array, Align, Snap toggle, Select-all (which does not exist —
no `Ctrl+A`), Local/World space, the outliner's folder system. The Ctrl+K palette (44119) covers
actions and settings but not objects and not Redo. This is the editor half of the onboarding audit's
GAP 2 and it has not moved.

### 4.8 MED — The part editor excludes exactly the models that most need it
`renderModelParts` 45870: `if(!/^https?:/i.test(url) || !/\.glb(\?|#|$)/i.test(url))` → a `local:`
src (build 1177's drag-import) fails the test and gets "Part editing works on direct .glb models",
which is both true and useless. And the whole feature requires `_uploadAsset` → the founder's cPanel
`upload.php` (45671): offline or host-down, a creator cannot recolor a part of their own model.
Two features shipped 20 builds apart that do not know about each other.

### 4.9 MED — Logic debugging is a text log
`logicFailures` (17232) surfaced through `levelIssues` (39093) is good and was worth shipping. There
is still no live pulse, no wire highlight, no variable watch, no breakpoint. The graph is now 22 node
types (`LG_DEFS` 11300), 26 verbs and an expression language (1271) — expressive enough that
"why didn't that fire" is now a real question with no instrument. `_lgPulse` is one function;
flashing the node DOM as it executes is ~15 lines and would be the highest-leverage editor addition
in the file.

### 4.10 MED — No CSG / room / spline tools; a doorway is four boxes forever
Ten primitives (13285), grid snap, the arena generator. Mitigated but not solved. This is the honest
ceiling on hand-built interiors and it is the same ceiling the previous audit found.

### 4.11 LOW-MED — Small verified sharp edges
- New **primitives ignore terrain height** (35875 vs 35843) — buried boxes on sculpted levels.
- The `+` menu offers 6 of the 10 primitives (no dome/tube/torus/pillar) and no model entry (38689).
- Triggers are not in the `+` → Zone submenu (38688) though every other volume is.
- "+ Add trigger (**at me**)" (37757) actually uses `editorDropPoint` (37766) — the label lies when
  flying.
- Transform fields show **5 decimal places** (42452) for a position in metres.
- `libOpen` (37231) does not ask before replacing unsaved work; it relies on 1254's one-deep rescue.
- The outliner renders one DOM row per object with no virtualisation (43760+), rebuilt on a 160 ms
  coalesce during edits.
- `renderEditorFields` (39468) tears down and rebuilds the whole panel on every change, with a
  scroll-restore microtask (39478) as the mitigation — works, but it is why a `oninput` text field
  anywhere in the panel has to be `onchange`.

---

## 5. WHAT IS GENUINELY BEST-IN-CLASS

Stated plainly because a critic who only lists faults is not calibrated:

1. **`levelIssues()` (39058) has no equivalent in Unity, Unreal or Godot.** It lints the *content* —
   orphan tags, unreachable mechanisms, dead cutscene references, licence exposure, and a light
   census that explains the cost model and the remedy. Nobody else ships this.
2. **The test loop.** `edPlay` / `edPlayHere` (play from the editor camera at a chosen wave), `P`
   back, autosave flushed first. Faster than any of the three, and not because of the browser.
3. **`_pfEntryOf` as the one chokepoint** (36688). Duplicate, Alt-drag, clipboard, array and prefabs
   cannot drift apart, and build 1228 made all five learn attached lights in one place. That is the
   right architecture and it is rarer than it should be.
4. **The remix trap fix** (1254) + the level library (1262). The previous audit's #2 CRITICAL was a
   real data-loss hole; it is closed properly — foreign levels stand down every automatic save path
   including `beforeunload`, and unsaved work is rescued rather than warned about.
5. **Snapping's `Ctrl`-inverts decision** (42632) with the checkbox that says so. That is a genuinely
   better ergonomic than Unity's hold-to-enable, argued and documented.

---

## 6. PREVIOUS-AUDIT CLAIMS THAT ARE NOW FALSE

Do not re-raise these:
- ~~"One local save slot"~~ — level library, build 1262 (37185).
- ~~"The remix flow can destroy your own work"~~ — build 1254 (37132).
- ~~"Marquee cannot catch lights"~~ — build 1275 (18852). *Still true:* marquee is top-view only, and
  the selection remains single-type.
- ~~"Prefabs/clipboard store props only, a lamp + its light can never be copied as one thing"~~ —
  build 1228 (36700). *Still true:* a **standalone** light (not attached to a prop) is not copyable.
- ~~"HUD authoring is variables-only, no buttons"~~ — `button` + `image` widget kinds, builds 1255 /
  1260 (`_sanitizeHudWidgets` 11064).
- ~~"No scripting escape hatch"~~ — materially narrowed by the Expression node (build 1271, 10732):
  a hand-written Pratt parser over numbers, variables and a fixed function table, deliberately not
  `eval`. It is a *scalar expression* language, not scripting — no iteration, no entity queries, no
  per-frame code — so the "creators build variants of shipped genres" ceiling stands, one rung higher.

---

## 7. SCORE — 7 / 10

**10 would mean:** a hobbyist can build, organise, diagnose and ship a 500-object multi-room level
entirely in one browser tab — selecting and editing any mix of object types, parenting things that
move together, undoing instantly at any level size, clicking a diagnostic to land on the object that
caused it, discovering every tool from the UI without reading source, and doing a meaningful share of
it on a phone — at Godot's scene-tooling parity for everything the browser does not genuinely
prevent.

**7 because:** for the workflows it covers, this is at or above Godot parity, and the preflight lint,
the test loop and the sharing story are ahead of all three commercial editors. But three of the gaps
are structural rather than missing polish — undo cannot scale past medium levels, the inspector
disagrees with the gizmo about what "selected" means, and there is no parenting — and one is pure
neglect: the tool knows about problems it refuses to help you reach or to check before you publish.
It loses a point for each of: the undo architecture, the multi-selection split, and the
discoverability/mobile shortfall (features that exist but cannot be found, and a phone editor with no
multi-select). It keeps 7 rather than 6 because nothing in the list is a data-loss risk any more —
build 1254 and 1262 removed the last one — and because the diagnostic and asset-pipeline work is
genuinely ahead of the field.

**If only three things ship next:** (1) call `levelIssues()` in the publish path and make the entries
clickable; (2) make the transform/tag/interact fields respect the multi-selection the way the material
fold already does; (3) live pulse-flash the logic graph.
