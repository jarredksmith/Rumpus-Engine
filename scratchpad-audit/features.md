# FEATURE SURFACE / EXPRESSIVENESS AUDIT — build 1276

Domain: what a creator can actually EXPRESS. Logic graph, triggers/zones, inventory, dialogue/NPCs,
quests, HUD, cutscenes, campaigns, persistence, prefabs, and the ceiling on authorable game types.

**Method.** Every claim below is either (a) quoted from source with a line number, or (b) EXECUTED —
I extracted the real function with `tests/harness.mjs` and drove it. Where I say something is missing
I name the ≥3 synonyms I grepped. Two claims I expected to make died on verification and are marked
DIED so they are not re-derived later.

**Score: 6 / 10.** Rubric at the end.

---

## 1. The authoring vocabulary that actually exists (verified)

### 1.1 Logic graph — 24 node types (`LG_DEFS`, breach.html:11300–11326)

| category | nodes |
|---|---|
| EVENTS (7) | `start`, `event` (named), `interval` (every N s, N times / ∞), `onkill`, `onwave`, `onspot` (enemy spots you), `onhurt` (enemy damaged) |
| FLOW (6) | `branch` (A op B, 6 operators), `counter` (target, reset pin, `reached`/`each` outs), `delay`, `repeat` (N times, gap, `#i` index), `random` (4 weighted outs), `once` (with reset) |
| STATE (6) | `setvar` (literal or random int range), `addvar`, `math` (+ − × ÷ min max mod), `expr` (build 1271), `list` (build 1269), `read` (build 1169) |
| ACTIONS (5) | `do` (27 verbs), `toast` (`{var}` interpolation), `emit`, `win`, `lose` |

Runtime switch: `_lgPulse` at 10893. Budget-capped at 400 pulses/frame with a creator-facing toast
(10894–10897) — a wiring loop degrades one frame, never the game.

**Variables** are NUMBERS ONLY, and that is a deliberate documented invariant (comment at 10598–10607:
`+logicVars[k]||0` is assumed by the HUD mirror, the `hudv` net message and campaign persistence).
Names ending `@` are per-player (`_lgVarKey`, 10723 — appends `_lgCtx.pid`). Event payload tokens
`#x #z #hp #hpf #pid #team` resolve through `_lgNum` (10853–10860).

**Expression node** (`_lgxTokens`/`_lgxCompile`/`_lgxEval`, 10754–10852) is a real precedence-climbing
parser: `|| && == != < <= > >= + - * / % ^`, unary ±, parens, right-assoc `^`, and 11 functions
(`LGX_FUNCS`, 10746: abs floor ceil round sqrt sign min max clamp lerp rand). Div/mod by zero → 0;
non-finite → 0; unknown identifier is a variable read, never a call; `hasOwnProperty` guard against
`__proto__`/`constructor`. Compile cache is bounded. This is the safest possible escape hatch for a
share-a-link engine and it is well built.

**Lists** (`logicLists`, 10608; node at 10922–10946): push, fill 1..N, clear, shuffle (Fisher-Yates),
draw, drawrand, remove, len, has, at, **matches** (ordered sequence compare — the combination-lock
question). Caps 64 lists × 256 entries. Numbers only. Per-player via `hand@`.

**Read game stat** (10958–10990) — 11 stats: hp, maxhp, ammo (mag), reserve, score, credits, wave,
enemies-alive, seconds-elapsed, count-of-item-id, distinct-item-kinds.

### 1.2 The 27 verbs (`do` node dropdown, 11320; handlers 11687 + 11878)

`toggle · open · close · anim · unlock` (tag-targeted props + tagged scene lights, 11736–11742)
`win · cutscene · objective · checkpoint · sound · emit` (no target)
`spawn` (8 enemy types, 1–20, at a place) · `pickup` (17 kinds incl. 4 key colours + inventory item)
`damage · heal · kill · teleport` (who: player / **the event's player** / all enemies / nearest enemy)
`give · take` (item id × n) · `stat` (speed/jump/gravity/maxhp/dmg × multiplier) · `music`
`command` (hunt / patrol / hold / alert-to-place / calm / move-post)
`showprop · hideprop · moveprop · delprop · pushprop · spawnprop` ← **all six are dead. See §2.**

`_lgPlaceAt` (11749–11763) resolves a "place" to: `#here` (the event's own position), `me`/`player`,
`start`, or any prop tag / trigger-zone event name — picking randomly among ties so a squad scatters.

### 1.3 Triggers and zones

- **Trigger volumes** (`_migrateTrigger` 20095, `updateTriggerZones` 20167): a CYLINDER (x,z,r,y,h —
  `_trigContains` 20135; no box, no rotation). `on` = enter / exit / stay-every-N-s. `who` = player /
  enemy / any / **prop** (build 1276, optional `ptag`). Once-only flag. Players get per-actor edges
  with identity (`_trigStepActor`, 20146) and a payload of pid/team/x/z; enemies and props get a
  UNION edge with no identity.
- **Prop signals** (`fireSignals` → `_applySignalAction`, 11665–11742): `when` = destroyed / interacted
  (E) / contact (an object placed on/in it). Plus `sigNeed` — N *distinct* senders before it reacts
  ("all 3 generators"), `needItem`/`needConsume` gating, `consume`, `contain`.
- **Other zone kinds**: death zones, jump pads, ladders, fire zones (dps + full VFX authoring),
  water zones, waterfalls, audio zones, spawn region, and **fx zones** (`FX_KINDS` 21001: heal, hurt,
  slow, haste, lowgrav — with `who` targeting players OR enemies, 21041–21049).

### 1.4 Everything else, verified present

- **Inventory** (28665–28690): per-level item catalog with name/desc/3D model/thumb/scale, `type`
  object|journal, and `useType` none | key (colour-matched to `lockId`) | heal | ammo | **place**
  (a held item that drops into the world carrying its own tag + signals, build 688).
- **Dialogue** (`_dlgParse` 28363): a real mini-language — `#label` sections, `-> label` / `-> end`
  tail jumps, `> reply` buttons (max 6), `[if expr]` conditions on lines AND replies,
  `{set v = / + / - x}` and `{event name}` marks, an author-facing linter (`_dlgLint` 28405).
  NPC name field. Choices and lines pulse the logic graph.
- **HUD** (`_sanitizeHudWidgets` 11064): 5 widget kinds — text, timer (M:SS), bar (value/max),
  **button** (fires a named logic event; on a client it rides `actEv` to the host, 11190–11202),
  **image** (art as the widget or as any widget's background, url-validated 11048). 8 anchors,
  pixel offsets, colour, alpha, `when` visibility gate on a variable.
- **Cutscenes** (`cineCfg`; `_cineFireShotEv` 33390): named, callable mid-game by verb, per-shot
  path/lens/focus/DoF/roll/ease — and **each shot can fire a logic event**, which makes the cutscene
  system a real sequencer rather than a camera toy.
- **Objectives** — 8 (editor row 40043): eliminate, survival, extraction, defend, destroy, escort,
  puzzle, race. Plus a PvP mode field per level (duel/ffa/tdm/cp + score target, 17889).
- **Waves** — authored manifests (`parseWaveManifest`): `3x grunt, 2x runner @gate`, `-` for a
  breather, caps 20/term 40/wave 2 bosses 50 waves, falls back to the formula past the end.
- **Persistence** (10617–10703): author-named variables survive level→level, committed only on CLEAR
  (dying rewinds), optionally across tab close, namespaced per game slug. Plus persistent inventory
  and persistent checkpoint. **Numbers only** (`campaignVars[k]=+logicVars[k]||0`, 10700).
- **Prefabs** (`prefabLib` 36680): named, localStorage-backed, 100 max, instance-aware (editing the
  def re-applies to instances, 36849–36866), merged from loaded levels without clobbering.
- **Campaigns** (37260–37310): a linear array of levels in localStorage, interstitial cards, export/
  import as one `.rumpus` file.
- **Creator diagnostics**: `levelIssues()` (39058) and `_noteLogicFailure` (17233) — a verb pointed at
  a tag no prop carries, a missing prefab, a dead place, a failed asset all surface in Level Check.
  This is better than most hobby engines and much better than Blueprints' silent nulls.

---

## 2. FINDING 1 (CRITICAL, executed): six of the 27 verbs never reach their handler

`_applyWorldAction` (11878) implements `showprop/hideprop/moveprop/delprop` (11893), `pushprop`
(11919) and `spawnprop` (11942). The ONLY authoring surface that offers them is the `do` node
(11320) — the prop-signal editor's verb list (39297) deliberately omits them. The `do` node
dispatches through `_applySignalAction` (11002–11007).

`_applySignalAction`'s router (11698) lists only:

```js
if(s.do==='spawn'||s.do==='pickup'||s.do==='damage'||s.do==='heal'||s.do==='kill'
 ||s.do==='teleport'||s.do==='give'||s.do==='take'||s.do==='stat'||s.do==='music'||s.do==='command'){
```

No prop verb is in it. Execution falls to `if(!s.target) return;` then the tag loop (11714–11726),
which handles only toggle/open/close/anim/unlock — so a matching prop is found and nothing happens.

**Executed** (extracted the real `_applySignalAction`, stubbed `_applyWorldAction` as a recorder):

```
hideprop   reached _applyWorldAction: NO      damage   reached _applyWorldAction: YES
showprop   NO   moveprop  NO   delprop  NO   pushprop  NO   spawnprop  NO
```

`spawnprop` is dead twice over: the `do` node's forwarded object (11004–11006) has no `prefab` key,
so even with routing it would call `_lgSpawnPrefab('')`.

`git log -S"s.do==='showprop'"` returns exactly one commit — build 1170 — and its diff never touches
the dispatcher. **These have never worked.** Three shipped builds (1170 "props gain a runtime
lifecycle", 1216 "spawn prefab", 1258 "the push verb") advertise capability the editor cannot reach.

Why the tests missed it is the file's own recorded pattern ("Two fixes that were applied to the wrong
half", build 1158): `test-1170` asserts the handler's source (`extractFunction('_applyWorldAction')`
matches the verb list) and the dropdown's source — both true — and never asserts that a `do` node
reaches the handler. `test-1216` and `test-1258` do the same.

Consequence for expressiveness: **a level cannot destroy, hide, show, move, shove or create a prop at
runtime.** The only runtime prop mutation left is `xa` keyframe animation (`xaApply`, 10537) via
open/close/toggle, and `unlock`. Doors survive. Bridges that drop, rubble that clears, a ball that
resets, a tower you build, a barricade you shove — none of them work.

---

## 3. Four games, end to end

### A. Escape-room puzzler — **BUILDABLE**

Everything needed is present and routes: `puzzle` objective spawns no enemies (32147); trigger
cylinders; `interacted` signals with `needItem` gating; `sigNeed` for "all three plates"; key items
(`useType:'key'` → `lockId` → `unlock`); `contact` signals for "put the idol on the pedestal"; the
List node's `matches` for an ordered combination; HUD buttons as a keypad; branching dialogue with
`[if]` and `{set}`; `checkpoint`; `cutscene` on solve; `win`. The one thing you must design around is
§2 — a solved puzzle cannot make the wall *vanish*, it must swing/slide via `xa`. Acceptable.
Secondary friction: no string variables, so every clue is a number; trigger volumes are cylinders, so
a rectangular pressure plate is approximate.

### B. Tower defence — **NOT BUILDABLE. Two named walls.**

1. **There is no damage-in-a-radius-at-a-place.** `damage`/`kill` resolve targets through
   `_lgEnemyTargets` (11764): `'enemies'` is *every* live enemy in the level, and `'nearest'` measures
   from `player.pos.x/z` (11769) — nearest to the PLAYER, never to a tower. So a placed tower cannot
   hurt what is near IT. The only autonomous per-place damage in the engine is an fx zone of kind
   `hurt` with `who` including enemies (21043–21047) — and no verb creates, moves, resizes or toggles
   an fx zone, and `spawnprop` (which would at least place the model) is dead per §2.
   *Synonyms grepped before claiming absence:* `explode|blast|aoe|radius|splash|damageAt|hurtAt|
   areaDamage|_lgEnemyTargets` — nothing.
2. **Enemies have no goal but the player.** `command` gives hunt/patrol/hold/alert/post; `post` sets a
   standing position, not a route to defend/breach, and there is no "on enemy reached X" beyond a
   `who:'enemy'` trigger zone whose edge is a UNION boolean (20213–20222) — so a leak can be detected
   *once*, never counted. There is no lives counter primitive (a var works) and no "creep escaped"
   hook.

You can build a wave-survival horde map that *looks* like tower defence. You cannot build the genre's
verb: place a thing, it kills what walks past it.

### C. Racing time-trial with upgrades — **HALF BUILDABLE**

Racing itself is strong and largely engine-owned: `race` objective, a track-piece builder where every
piece is an implicit checkpoint (≥60% visited or the lap does not count), 3-2-1 standing start, per-lap
/ best-lap clocks, a ghost (G), AI bots with a skill slider, off-track detection.

The time trial: authorable via the `time` read-stat (seconds since deploy) plus trigger volumes on the
start/finish line and `branch` — that works, and I expected it not to (**DIED**: "you can't measure a
lap" is false for a single-lap trial).

**The wall is the upgrades.** `stat` is the only stat verb and `_lgApplyStat` (11857–11867) bends
SPEED / JUMP / GRAV / player.maxHp / run.dmgMul — *on-foot player values only*. Nothing in the verb
set touches vehicle tuning (`vehicleApply`), and the engine's own upgrade cards (`UPGRADES`, 26080)
are 8 hardcoded combat perks handed out between waves in eliminate mode, unreachable from a race and
uneditable by a creator. Also unreadable: lap number, lap time, best lap and finish position are not
in the `read` stat list (10958–10990) and no logic event fires on a lap or a finish, so a graph cannot
even react to the result it just watched. Verified by reading the full stat switch and grepping
`onlap|onrace|onfinish|lapTime|raceLap` against `LG_DEFS`.

### D. Co-op horde shooter with a shop — **BUILDABLE, with a co-op HUD wall**

The spine is there: authored wave manifests; `onwave`/`onkill` with the killer's `#pid`/`#team`;
per-player variables (`coins@`); HUD buttons that work from a client (`actEv` → host graph, 11198);
`give`/`take`/`pickup` to hand out items and weapons; `stat` for buffs; `damage who:'actor'`.

Two real walls, one soft and one hard:

- *Soft:* **the engine's own currency is read-only to the graph.** `credits` and `score` are readable
  (10967–10968) and mutated only by engine paths (`credits+=v` at 22776 from coin pickups; `score+=500`
  at 31389). There is no `setscore`/`addcredits` verb — grepped `credits|score|money|coins|currency`
  across the verb list. So a creator-authored shop must run a *parallel* currency and the engine's
  coin drops, credit HUD and loot-crate shop (`openShop` 28546 — a fixed engine item list) sit beside
  it doing nothing. Two economies on one screen.
- *Hard:* **HUD widgets cannot show a per-player value.** Build 1231 gave the graph per-player
  variables and taught `toast` to interpolate them — its regex is `[\w#@]+` (11008). The HUD widget's
  interpolation regex is `[\w#]+` with no `@` (`_hwText`, 11176), and the host→client mirror sends one
  scalar per name for everyone (`v[k]=+logicVars[k]||0` at 11289, broadcast to all conns). A widget
  bound to `coins@` resolves through `_lgVarKey` against a `_lgCtx` that is empty outside an event
  cascade, i.e. pid 0 — the HOST's value, shown to every player. So "your money: 340" is impossible in
  co-op; only a shared team pool works. That is the exact feature a shop needs.

---

## 4. Honest comparison

**Where Rumpus's curated vocabulary is genuinely BETTER for its audience**

1. **Failure is legible.** `_noteLogicFailure` + `levelIssues()` tell a creator *"a 'toggle' action
   targets the tag vaultDoor, but no placed prop has that tag"*. Blueprints gives you an
   `Accessed None` at runtime in a log nobody opens; GDScript gives a stack trace. For a
   14-year-old on a Chromebook this is the single biggest usability edge in the product.
2. **Nothing can hang the game.** The 400-pulse budget, the bounded expression parser, the list caps,
   the spawn cap, the `isFinite` guards that turn every degenerate arithmetic into 0 instead of NaN
   — a bad graph produces a bad game, never a frozen tab. Bolt and GDScript both let you write an
   infinite loop that kills the browser.
3. **The verbs are game-shaped, not engine-shaped.** "Spawn 3 brutes at @gate", "command all enemies
   to lose the player", "give 1 red key to the event's player" are one node each. In Blueprints each
   is a spawn transform, a class reference, a behaviour-tree blackboard write. Rumpus's `at` place
   resolver (tag / `#here` / `me` / `start`, with random tie-breaking) is a genuinely elegant
   abstraction that neither Unity nor Godot ships.
4. **The mini-languages beat widget forests.** Dialogue rows, wave manifests and expressions are all
   plain text with linting. That is the right call and it is not what a bigger engine would do.
5. **Everything ships in the level.** No packages, no plugin versions, no import step. Unity's Asset
   Store is a strength you pay for in project rot; Rumpus levels from build 900 still load.

**Where the ceiling is real, and it is not close**

1. **No user-defined data.** No strings, no structs, no arrays of objects, no per-prop variables. A
   variable is a global float. Unity/Godot/Unreal all give you typed data and per-instance state.
   Concretely: you cannot store "which NPC gave which quest", you cannot name anything at runtime,
   and you cannot write an inventory system the engine didn't ship.
2. **No object handles.** The graph addresses props by TAG, never by identity: `moveprop crate`
   (were it wired) moves every crate with that tag. There is no "the prop that triggered this", no
   iteration over a set, no reference passed between nodes. Every Blueprint is built on object refs;
   this graph has none.
3. **No functions with parameters and no return values.** `emit`/`event` is a call, but it carries no
   arguments other than the ambient `_lgCtx` payload, and nothing returns. Reuse is copy-paste.
4. **No quest/objective system at all** — verified: `grep -i quest` matches only `request*`. The
   objective is ONE 160-char string (`setGoal`, 32811) plus whatever HUD widgets the creator wires.
   No multi-step tracker, no journal (the inventory has a `journal` item type, which is a text page,
   not a quest log).
5. **The event surface is thin on the player.** There is no `onplayerdeath`, `onrespawn`, `onpickup`,
   `onitemused`, `onweaponfired`, `onlevelwon`. Verified against `LG_DEFS` (11300) and every
   `_lgFireEvents`/`logicEvent` caller (10861–10891, 11157, 11200, 11697, 14037, 20207, 20221, 25628,
   28453, 28487, 31373, 32905, 33392). A lives system, a death-penalty, a "you found your first key"
   moment — none have a hook. This is the cheapest big win available.
6. **Campaigns can't be shared.** `encodeLevel`/`buildShareLink` (9708) and the publish path (39008,
   45245) take ONE level. A campaign is a localStorage array exported as a file (37267). The entire
   distribution advantage of the product — send a link — does not apply to multi-level games. The
   per-game persistence namespace (10647–10655) is a partial workaround nobody would find.
7. **Game modes belong to the engine.** 8 objectives + 4 PvP modes, each a hardcoded win condition.
   Godot has no game modes because you write them; Rumpus has 12 and you get those 12.

The fair summary: Rumpus is roughly where **Fortnite Creative 1.0** was — a rich, safe, curated device
kit — with a better logic graph than Creative's device wiring and a far worse data model than any
scripting language. It is not competing with Blueprints and should not pretend to.

---

## 5. Score

**Rubric.** 10 = a creator can author a complete, novel game genre the engine's authors did not
anticipate, end to end, and share it in one link: user-defined data, object references, reusable
parameterised logic, a full event surface, and no advertised verb that does nothing.

**6 / 10.**

Earned: 24 node types, 27 verbs, 8 objectives, 5 HUD widget kinds, a dialogue mini-language with
conditions and a linter, an inventory with usable items, ordered lists, a safe expression evaluator,
per-player variables, cross-level persistence, prefabs, cutscene-driven sequencing, and the best
creator-facing error reporting I have seen in a hobby engine. Two of my four test games build
end to end and a third builds most of the way. That is a lot of expressiveness.

Withheld: 6 of the 27 verbs (22% of the action vocabulary, and the three most recent expressiveness
builds) are unreachable from the editor — verified by execution, not by reading. Beyond that, the data
model is a flat bag of floats with no strings, no object references and no parameterised reuse; the
player-side event surface has no death, no pickup and no level-end hook; multi-level games cannot be
shared by link; and the engine keeps the currency, the upgrade table and the shop to itself. Fixing §2
is a one-line router change and would move this to a 7 immediately.

---

## 6. Cheapest leverage, ranked

1. **Route the six prop verbs** — add them (and forward `prefab`) at 11698, and add a test that drives
   a `do` NODE rather than the handler. One line + one test; recovers three builds of shipped work.
2. **`@` in HUD widget interpolation + a per-player `hudv` mirror** — unblocks every co-op shop,
   scoreboard and personal objective. `_hwText` 11176, mirror 11288.
3. **Player-side event nodes**: `ondeath`, `onrespawn`, `onpickup`, `onwin`. Four entries in `LG_DEFS`
   plus four `_lgEnemyEvent`-style call sites. Unblocks lives, penalties, roguelike loops.
4. **A `score`/`credits` write verb** — one branch in `_applyWorldAction`; retires the two-economy
   problem and makes the engine's coin drops usable by an authored shop.
5. **`damage … within R of <place>`** — one option on the existing `who` field. Unblocks tower
   defence, traps, bombs, and the whole "a thing in the world hurts things near it" class.
6. **A campaign share link** — encode the level array the way `encodeLevel` encodes one.
