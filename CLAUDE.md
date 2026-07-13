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
