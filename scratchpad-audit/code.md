# RUMPUS ENGINE — architecture, code quality and engineering-practice audit

Build 1276. Audited 2026-08-02. Domain: maintainability, testing strategy, error handling, docs-as-practice,
build/release, bus factor. Everything below is measured against the tree at `/home/user/Rumpus-Engine`;
where I state a number I state how I got it.

---

## 0. What I verified, and how

- **Counts** — brace-matched parse of the game `<script>` block, extracted with the harness's own regex.
- **Duplication** — verbatim-line frequency over the game block; byte-comparison of the three loader bodies.
- **Test composition** — call-argument extraction for every `assert`/`eq`/`near` in all 1017 harnesses.
- **Test *effectiveness*** — **mutation testing**: 8 realistic single-token defects injected one at a time
  into a sandbox copy, full suite run per mutant.
- **Suite status** — `cd tests && node run-all.mjs` → **1017/1017 passed, 103 s wall**.
- **CI/release** — read `.github/workflows/*.yml` in full.

I modified nothing in the repo; the mutation runs used a sandbox copy under `/tmp`.

**Snapshot note.** All counts are taken at build 1276 (`git show HEAD:breach.html`, 46,402 lines). A
concurrent session began editing `breach.html` as build 1277 at 00:54 during this audit; §4.5 discusses what
it found, because that finding is the cleanest evidence in this report about what the test suite cannot see.

---

## 1. The shape of the thing

```
breach.html                46,402 lines / 3.61 MB (1.12 MB gzip)
  └ game <script> block    39,936 lines  — one closure: window.GAME_START = function(){…}  (breach.html:6466)
  └ 6 smaller blocks       ~130 lines total (boot veil, CDN loader, error trap, Rapier module)
tests/                     1017 harnesses, 51,461 lines
tools/levelgen.mjs         212 KB (dual Node/browser)
CLAUDE.md                  4,149 lines / 325 KB
docs/                      AUDIT.md 44 KB, REFERENCE.md 64 KB, QA-CHECKLIST.md
```

Inside the one closure: **2,023 top-level functions, 973 mutable `let` bindings, 629 `const`** (377 of them
SCREAMING_CASE constants). There are no name collisions — checked.

**Function granularity is genuinely good.** Median top-level function is **7 lines**; mean 29; only **13
exceed 200 lines** and 8 exceed 500. That is better decomposition than the "46k-line single file" framing
implies, and better than several parts of Godot's `scene/` tree. The outliers are all UI:

| function | lines | file:line |
|---|---|---|
| `renderEditorFields` | ~3,037 | breach.html:39468 |
| `loop` | ~1,082 | breach.html:34047 |
| `buildEditorPanel` | ~536 | breach.html:38507 |
| `ensurePost` | ~436 | breach.html:7519 |

`renderEditorFields` is the single worst object in the codebase: a 3,000-line DOM builder that every editor
feature must be threaded into, referenced 23 times from elsewhere as `if(typeof renderEditorFields==='function')
renderEditorFields()`.

**Naming is disciplined**, which surprised me. Verb prefixes are consistent (`apply*` 75, `update*` 69,
`render*` 63, `build*` 50, `ensure*` 48, `refresh*` 33, `sanitize*` 23); `_` marks internal (54% of functions);
only 12 functions have names ≤4 chars. 137 banner comments (`// ---------- Lighting ----------`) give the file
a real table of contents at roughly one section per 290 lines. A newcomer can navigate by grep, and that is not
an accident.

**Coupling is via ambient globals, but the fan-in is narrower than feared.** Top-level function bodies
referencing each: `player` 208/2015 (10%), `NET` 202, `scene` 194, `propModels` 110, `enemies` 74,
`worldCfg` 65, `editorActive` 63, `_levelDirty` 44. There is no dependency-injection story and never will be,
but ~10% fan-in on the biggest globals is a *shared-namespace* problem, not a big ball of mud. `_levelDirty`
is **assigned in 92 places** — that one reads as an unmanaged flag.

---

## 2. The architectural defect: a triplicated loader

A **1,266-character byte-identical block** applying a serialized prop entry onto a live object exists three
times — `loadHostedProps` (**breach.html:17318**), `loadLevelFromNet` (**:23696**), `restoreLevel`
(**:37982**) — plus a fourth partial copy in `_pfSpawnEntry` (**:36740**). I byte-compared the shared span
(`if(p.lk)` … `if(p.trk)`) across all three: **identical**. Each is a single ~1,900-character source line.

Each is a *complete restatement* of the level format's read side:
`lk lkc tg gid pf itr nm fld eh elk dlg npc sg snd att fxc xa j veh trk`. Adding a prop field means editing
four places that nothing links. **No harness asserts the three agree**, and no harness even names all three
(`grep -l` across all 1017 files returns an empty intersection).

CLAUDE.md is aware of the *symptom* and has fixed it twice from the wrong end — build 1162 ("both duplicate
paths spawned only src/transform/dynamic/material — signals, tag, name, interact, locks, dialogue, NPC name, xa
animation, joints and vehicle tuning silently dropped"), build 1252 ("serialized via propEntry to **all four
loader sites**"). The log treats "four loader sites" as a fact of nature. It is a copy-paste that should be one
function; `_pfSpawnEntry` already *is* the right function and the three loaders do not call it.

Broader duplication picture: **349 distinct code lines ≥60 chars appear more than once**, for **526 redundant
line instances**. Most of the rest is benign UI boilerplate (slider-row construction repeated 6–11×, which is a
missing `makeSliderRow()` helper, not a hazard). The loader triplication is the one that costs correctness.

---

## 3. Error handling: 73% of `catch` blocks throw the evidence away

`try {` 830 · `catch(…)` **869**, of which **582 are literally empty** (`catch(e){}` 568, `catch(_e){}` 14)
and **639 are empty or comment-only — 73.5%**. Against that: **59 `console.warn` and 1 `console.error`** in
40,000 lines of code that ingests untrusted level data, WebRTC peers, arbitrary GLBs and three CDN fetches.

Not a theoretical objection. CLAUDE.md's own build-1127 entry describes the exact failure:

> `_skyEnv()` had returned `_skyEnvRT.texture` since build 1119 … at boot it was a **TDZ ReferenceError swallowed
> by the surrounding catch**. The procedural sky lit nothing for eight builds and nothing said so. If a
> `catch(e){ return null; }` guards something whose absence is invisible, that absence needs a test.

The lesson was written down and the pattern was not changed: 582 silent catches remain. The engine has an
excellent piece of machinery for exactly this — `_noteAssetFailure` (build 1167), which dedupes failures, caps
at 40, surfaces them in Level Check and heals on a later success. It is wired to model loading only. That
mechanism generalises to a `_note(subsystem, e)` that every catch calls; the cost is one line per catch and it
would convert the engine's largest blind spot into a visible list.

---

## 4. The test suite, sceptically

### 4.1 What it is

1017 harnesses, all green, 103 s wall clock, no external services, no browser. Genuinely a real asset, and
the run-time is excellent for a suite this size.

### 4.2 What it actually asserts

| measure | value |
|---|---|
| Harnesses that execute **any** engine code (`evalIn`/`evalDecl`/`new Function`) | **406 / 1017 (40%)** |
| Harnesses that assert **only** on source text | **611 / 1017 (60%)** |
| Individual assertions / of those, `.test(`·`.match(`·`.includes(`·`.indexOf(` on source | 12,801 / **7,162 (56%)** |
| Harnesses whose assertions are 100% source-shape | 346 |
| Top-level functions ever passed to `extractFunction` | 1,232 / 2,023 (61%) |

**The headline "128,202 checks" is misleading.** One harness — `test-1250-particle-emitters` — contributes
**104,630 of them (82%)** by looping a sampler. The **median harness has 14 checks**; p90 is 37. The honest
figure is roughly **23,500 meaningful assertions**, of which ~56% are text pins.

### 4.3 The practice is improving sharply, and that matters

Executable-harness ratio by test number: **0–200: 21%** (41/199) · 200–500: 27% · 500–800: 23% ·
800–1000: 34% · **1000–1150: 75%** (102/136) · **1150–1300: 81%** (103/127).

The newest tests are genuinely good. `tests/test-1276-trigger-props.mjs` brace-matches the real branch out of
`updateTriggerZones`, injects it into a `new Function` with stubbed collaborators, and asserts on *behaviour*
(the ball-in-the-goal case, wrong-prop rejection, invisible/destroyed props, and "20 matching props produce ONE
union edge"). That is a better test than most engine repos write. `tests/test-1141`, `test-1148`, `test-1158`
and `test-1113` are the same standard — 1158 replays the real obstacle pass over real geometry and reports
metres climbed.

The liability is the ~550 legacy pin-only harnesses guarding builds 1–800. Some are checksums, not tests.
`tests/test-215.mjs:10` is a **551-character** line asserting a verbatim regex of one source line:

```js
assert(/thumb:c\.thumb\|\|'', animLib:\(typeof c\.animLib==='string' && ANIM_LIB_PACKS\[c\.animLib\]\)\?…/.test(src), …)
```

That fails on any reformat and passes on any behaviour change that preserves the text. It is a change-detector.

### 4.4 Two specific test antipatterns, quantified

- **Compile-then-never-call: 17 confirmed cases.** `tests/test-450.mjs:11` extracts `_newInvId` into a real
  callable, then **re-implements the loop in the test** (`let i=1; while(cat['item_'+i]) i++`) and asserts on
  its own copy. `tests/test-303`, `374`, `401`, `433`, `478`, `479`, `482`, `485`, `489`, `798`, `830`, `1073`,
  `1147`, `1275` are the rest.
- **Tautology assertions.** `tests/test-180.mjs:16-17` defines `place(y,L){return y+L}` and `ser(y,L){return y-L}`
  *in the test* and then asserts `ser(place(y,L),L)===y` — "round-trip still holds". It holds because addition
  is invertible. (The rest of that file is a legitimate executable test of `_maxTerrainOver`.)

### 4.5 What the suite structurally cannot catch — measured

Mutation results are in §4.6. Independently of those, four bug classes are structurally invisible:

1. **Cross-function integration.** Every executable test extracts *one* function and stubs its collaborators.
   The only test that runs the file top-to-bottom is `test-202-boot.mjs`, and its own harness header is
   admirably honest: the browser/THREE stub is a permissive proxy where *every property access returns itself*,
   so "a misspelled DOM id (getElementById returns a stub, never null)" cannot fail. It is a TDZ/throw smoke
   test, not a correctness oracle — as documented.

   **This is not hypothetical, and I verified it at build 1276.** All six prop verbs —
   `showprop`/`hideprop`/`moveprop`/`delprop` (build 1170), `spawnprop` (1216), `pushprop` (1258) — are
   implemented inside `_applyWorldAction` (breach.html@HEAD:11878). That function has **exactly one call
   site** (breach.html@HEAD:11699), and the `if` gating it (breach.html@HEAD:11698) lists
   `spawn|pickup|damage|heal|kill|teleport|give|take|stat|music|command` and **none of the six**. So every
   prop verb fell through to a tag loop that handles only `toggle/open/close/anim/unlock` and did nothing.
   Three builds of shipped, documented, *individually tested* capability that no level could ever reach —
   `tests/test-1170-prop-lifecycle-verbs.mjs`, `test-1216-spawn-prefab-verb.mjs`, `test-1258-push-verb.mjs`
   all pass, because each asserts the handler's source and the editor dropdown's source, and nothing asserts
   that a node reaches the handler. (Verified independently by me against `git show HEAD:breach.html`; a
   concurrent session was fixing it as build 1277 during this audit.)

   The call site compounds it: `try{ _applyWorldAction(s); }catch(e){}` — an empty catch on the sole entry
   to the entire world-verb system. Even a verb that *had* reached it and thrown would have failed silently.
   Findings §3 and §4.5 meet on one line.
2. **Serialize→restore round-trip.** 45 harnesses mention `serializeLevel`; **none executes it against
   `restoreLevel`.** `tests/test-170.mjs` is titled as a round-trip test and is four regex pins. This is the
   invariant the triplicated loader most threatens, and it is unguarded.
3. **Anything rendered.** Acknowledged in CLAUDE.md and compensated with genuinely rigorous headless-capture
   discipline (build 1152's control-pair rule is better methodology than most professional graphics teams
   practise). But the rigs are ad hoc and **not in the repo**: eight `scratchpad/` instruments are cited as
   "the durable version of that measurement" (`edgeq.mjs`, `probe-radiance.mjs`, `ladder2.mjs`, `botstuck.mjs`,
   `rampstuck.mjs`, `probe-ground.mjs`, `head.html`, `critics/ROADMAP.md`) and **`scratchpad/` does not
   exist in the repository.** Zero of eight under version control.
4. **Performance.** No harness measures time. Build 1141's whole finding (the adaptive ladder never fired on
   slow devices) came from a throwaway sweep script that is also not in the repo.

### 4.6 Mutation-test results

Sandbox copy of the tree, one mutation at a time, full `run-all.mjs` per mutant (baseline: 1017/1017).

| # | mutation | result |
|---|---|---|
| M1 | `COYOTE_T` 0.10 → 0.02 (breach.html:18514) | **killed** — test-1160 |
| M2 | **delete `if(p.tg) obj.userData.tag=p.tg;` from `loadLevelFromNet` only** (breach.html:23696) | **SURVIVED — 1017/1017 green** |
| M3 | `SKY_ENV_FLOOR` 0.12 → 0.50 (breach.html:7058) | **killed** — test-1144 (3 checks) |
| M4 | `ENEMY_MIN_R` 0.3 → 0.9, reverting build 1154 (breach.html:19509) | **killed** — test-1154 |
| M5 | `MGRID_MIN_THICK` 0.25 → 1.0, reverting build 1148's doorways (breach.html:12463) | **killed** — test-1148 |
| M6 | `ADAPT_FRAME_CAP` 250 → 100000, reverting the hitch guard (breach.html:6974) | **killed** — test-1141 |
| M7 | coyote timer decays 10× slower (a latent double-jump) (breach.html:34330) | **killed** — test-1160 |
| M8 | `PLANE_B` 2 → 200 (breach.html:12644) | **killed** — test-1148 *and* test-1203 |

**7 of 8 killed. That is a strong mutation score** — better than the 56%-pins figure predicted, and it should
be said plainly: the executable core of this suite is doing real work. Several mutants were caught by tests
that also *recompute the correct value from the source constant*, so they cannot be satisfied by a stale pin.

**And the survivor is precisely §2.** I removed one statement from **one** of the three identical loader
blocks and the suite stayed green. The effect on a running game: every player who joins a multiplayer match
receives a level in which **no prop has a tag**. Verified — `loadLevelFromNet` contains exactly one
`userData.tag=` assignment and does not route through `_pfSpawnEntry`, so nothing restores it. What silently
stops working for the joiner: trigger zones watching props and `_lgTagExists` (breach.html:17254), all four
prop-lifecycle verbs (build 1170), the push verb (1258), logic-graph place resolution (:11771, :11845),
spawn-at-tag (:17848) and joint targets (:29872-29873). Several builds' worth of features disabled for every
joiner, reported as 1017/1017 passing. The suite guards *values it was pointed at*; it cannot notice that an
invariant stated three times has stopped being stated three times.

---

## 5. Build and release process

**There is no CI test gate.** `.github/workflows/` contains exactly two workflows and neither runs the suite:

- `pages.yml` — on **every push to `main`**, upload the repo and `deploy-pages`. Straight to production.
- `publish-level.yml` — community-level publishing (this one is *well* engineered: the shell-injection comment
  around the attacker-controlled level name shows real security thinking).

So the 1017-harness suite exists entirely on the honour system. It is run, and the log shows it is run
carefully — but nothing enforces it, and a bad push is live on rumpusengine.com in minutes with no rollback
step documented. The single highest-value change in this whole report is ~15 lines of YAML.

**No tags**, despite CLAUDE.md's own instruction ("Tag releases as they happen"). **Git history covers 17% of
the project** — 243 commits, oldest is build 1070; for builds 1–1069, CLAUDE.md *is* the history. Hygiene in
the range that exists is good (150–500 line diffs, one feature per commit, messages better written than most
PR descriptions). HEAD is on a feature branch; `main` is behind.

**No linter, no formatter, no type checking, no `.editorconfig`.** `tests/test-01-syntax.mjs` parsing the file
is the only structural gate. In a 40k-line untyped single scope with 973 mutable bindings, a typo in a global
name is a silent runtime `undefined`, and only the boot test would catch the subset that throws.

**Supply chain:** three.js r149 is fetched at runtime from **unpkg → jsdelivr → cdnjs** (breach.html:1470-1473)
with **no Subresource Integrity** (`grep -c integrity= breach.html` → 0), executing with full page rights
alongside localStorage saves and P2P peers. Rapier is vendored locally (2.2 MB in-repo) — so the project
already accepts vendoring, and the inconsistency is unexplained.

---

## 6. The engineering log as a practice

**CLAUDE.md is the best thing in the repository.** 151 sections covering 141 of the 162 builds from
1115–1276, each written as *cause → measurement → decision → what would have been the wrong answer*. Build
1136 opens "Two things I got wrong here, twice" and tabulates them. Build 1152 tabulates **six failed
measurements and why each lied**, and credits the user with the diagnosis after the author had published the
opposite conclusion. Build 1150 re-derives a constant whose original justification had been disproved, keeps
the value, and says why. I have not seen this practised at this quality inside commercial engine teams; it
converts a solo project's hardest asset — the reason a number is what it is — into something transferable.

The source carries the same discipline inline: **2,688 `build N` references naming 706 distinct builds**, so
the rationale for a line is usually next to the line.

Where it fails as *documentation* rather than as a *log*: it is **not chronological** (sections run 1220 →
1219 → … → 1199, jump back to 1182, ascend to 1198, then jump to 1265); its final header reads "Open work (as
of build **1203**)", 73 builds behind; it cites **eight `scratchpad/` instruments that are not in the repo**;
at 325 KB it is 4–6 hours of reading with no separation of "must know" from "war story"; and it covers only
builds ≥1115 — everything about 1–1114 lives in inline comments or nowhere. `README.md` is stale two ways:
"**~27k lines**" (actual 46,402) and "**~590 test harnesses**" (actual 1017).

Two counterweights worth naming: `docs/QA-CHECKLIST.md` is a real, risk-ordered browser gate with the right
framing ("this list is everything only a human in a browser can verify"), and `test-1032`/`test-1253` **pin the
help manual's content as tests** — documentation that fails the build when it goes stale. Very few teams of any
size do that.

---

## 7. The single-file, no-build-step constraint

**Buys:** zero toolchain rot (a checkout opens in a browser forever — the single most common cause of
abandoned solo projects, eliminated); the product *is* the artifact; grep is a complete index, because the
137 banner comments and consistent verb prefixes make it one; no circular-import debugging.

**Costs, measured:** **3.61 MB / 1.12 MB gzipped** shipped unminified to every player, plus 2.2 MB of Rapier.
**No editor tooling** — no LSP indexes a 3.6 MB HTML file, no rename-symbol across 973 globals; 1,884 lines
exceed 200 chars and 1,794 pack ≥6 statements, so the loader block is *one line of 1,942 characters* and
cannot be reviewed in a diff. **No enforced boundaries** — the low fan-in numbers are discipline, not
structure, and discipline does not survive a second contributor. **A bespoke workflow** — CLAUDE.md's
"recurring traps" (re-grep before every edit, re-include the header in a replacement anchor, `/* */` not `//`
when patching mid-line — hit twice, builds 1168 and 1178) is a cost list a multi-file codebase does not have.

**Is the trade still right at 46k?** For this maintainer, yes: builds 1250–1276 shipped SSR, per-object
motion blur, two-cascade shadows and a level library at roughly a build a day with the suite green. The
constraint is not what is slowing this project down.

But it is right for a *narrower* reason than "single file good". What works is the **no-build-step** half —
zero toolchain rot. The **single-file** half is already being violated productively: `tools/levelgen.mjs`
(212 KB) lives outside and is fetched at runtime by the editor, and `server/` holds PHP. The project has
proven it can carry a second file without losing the property that matters, so extracting the editor panel
into a second `<script>` block would cost nothing it actually values.

---

## 8. Against Unreal / Unity / Godot — fairly

The comparison is between one person and 300, so compare *practices*, not throughput.

**Better than the big three:** *rationale capture* — Godot/Unreal comments are overwhelmingly *what*, not
"here is the measurement and the hypothesis it killed"; *suite runtime* — 1017 harnesses in 103 s with no
services, against Godot's tens of minutes and Unreal's hours; *docs as tests* — `test-1032`/`test-1253` fail
when the manual goes stale, which almost nobody does at any scale.

**Decisively worse, and structurally so:** *a compiler* — C++/C# catch the whole typo/arity/type class for
free, which is why 973 globals in one scope is scarier here than 973 members in Unity; *enforced boundaries*
— Godot's `core/ scene/ servers/` split and Unreal's `.Build.cs` dependency declarations make "the editor must
not reach into the renderer" a build error, whereas here the prop-verb bug (§4.5) is precisely a boundary
nobody could see; *CI as a gate* — all three block merge on red, this deploys to production on every push;
*functional tests* — Godot has a headless scene-running suite, Unreal has automation tests and a device farm,
here there is no round-trip test, no headless play test, no perf test, and the capture rigs are not in the
repo; *release engineering* — no tags, and the level format did not read its own version field until build
1165 (~1,160 builds of writing `v:1` and never inspecting it, which the log states plainly).

**Comparable:** function decomposition (median 7 lines), naming discipline, and the honesty of in-tree
comments about known bad behaviour. `updateEnemyShots`, `_aeMeter` and `adoptModelLights` hold up against
equivalent Godot code.

---

## 9. Bus factor and onboarding cost

Bus factor is **1**; the question is whether the artifacts change that. The honest ramp for a second
contributor: **4–6 h** on CLAUDE.md (325 KB, non-chronological, no "must-know" tier), **2–3 h** on
`docs/REFERENCE.md` + `AUDIT.md`, **minutes** to locate any subsystem (banner comments and naming are good),
and **unbounded** to know what a change may touch — 973 globals in one scope, no boundaries, no types.

The two real blockers are not file size. (a) 611 harnesses assert code *shape*, so a legitimate refactor
produces a wall of red indistinguishable from a real break — the suite actively penalises the cleanup a new
contributor would want to do first. (b) Nothing tells you the loader block exists three times, or that a new
verb needs registering in a gate 180 lines from its handler. Both are fixable without abandoning the
single-file model.

---

## 10. Ranked recommendations

1. **Collapse the three loaders into `_pfSpawnEntry`** (breach.html:17318 / 23696 / 37982). Until then, add a
   harness that byte-compares the three spans and fails on divergence — that is ~20 lines and closes the
   highest-frequency latent-bug source in the codebase.
2. **Add a CI test job.** `on: push` → `cd tests && npm ci && node run-all.mjs`, and make `pages.yml` depend on
   it. ~15 lines of YAML for the largest single risk reduction available.
3. **Write reachability tests, and the serialize→restore round-trip.** The prop-verb bug (§4.5) and the M2
   mutant are the same shape: everything the test points at is correct, and the *path between* them is not
   tested. Two concrete harnesses close most of it — (a) for every verb/node/action the editor offers, assert
   the dispatch gate that reaches its handler actually names it; (b) build a synthetic level covering every
   `propEntry` field, push the real `serializeLevel` output through the real apply block, assert field-for-field.
4. **Make silent failure visible.** Route the 582 empty catches through a `_note(subsystem, e)` built on build
   1167's `_noteAssetFailure` machinery. The log already contains the proof this matters (build 1127, eight
   builds of a dead sky).
5. **Commit the measurement rigs.** Move the eight cited `scratchpad/` instruments into `tools/probes/` —
   described as durable, not versioned; the log's largest integrity gap.
6. **Split `renderEditorFields`** (breach.html:39468, ~3,037 lines) by tab; extract the slider-row
   construction (11 verbatim copies) into one helper.
7. **Add SRI to the three.js CDN chain**, or vendor it as Rapier already is.
8. **Housekeeping:** tag releases; fix README's "~27k lines"/"~590 harnesses"; re-sort CLAUDE.md and update
   its "Open work (as of build 1203)" header.

---

## 11. Score

**Rubric.** *10 = a codebase a competent stranger could take over in a week: enforced boundaries, no duplicated
invariants, failures that announce themselves, a test suite whose green means behaviour is preserved rather
than text is unchanged, and a release pipeline that cannot ship a red build. 1 = undocumented, untested,
unbuildable.*

# 7 / 10

Above a typical solo game project by a wide margin, and above some commercial code I have read on the specific
axis of *why things are the way they are*. The decomposition is real (median 7-line functions), the naming is
consistent, the suite runs in 103 s and is green, the newest 20% of tests are genuinely excellent behavioural
tests, **7 of 8 injected defects were killed**, and the engineering log is a class apart.

It is not an 8 because the suite's strength is concentrated exactly where its author aimed it and absent
everywhere else, and I have two independent demonstrations of that from one afternoon. Deleting one statement
from one of three identical loader blocks leaves the suite green while stripping tags from every prop a
multiplayer joiner receives. And **three builds of prop verbs shipped fully dead** — implemented, offered in
the editor, individually tested, and unreachable because their only call site's gate never named them.

Three things are load-bearing and broken: a **byte-identical 1,266-character invariant copied into three
functions with nothing testing they agree**; **582 catch blocks that discard the exception**, in a codebase
whose own log documents that pattern costing eight builds of a dead sky and whose world-verb system was
entered through one of them; and a **release pipeline that pushes to production on every commit without
running the suite it took 1017 harnesses to build**.

It is not lower because none of those is carelessness. Each is a known, documented, one-day fix deprioritised
in favour of shipping, the mutation score says the tests that exist are honest tests, and the log's habit of
writing down what it got wrong is the strongest predictor available that these would be fixed properly if
they were prioritised. Fix items 1–3 in §10 and this is an 8.5.
