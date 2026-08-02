# RUMPUS ENGINE — Platform / Distribution / Safety audit (build 1276)

Domain: everything *around* the engine. Sharing & publishing, the UGC gallery, licensing &
attribution, identity, moderation, content safety for minors, privacy, security posture against
untrusted level data, docs, onboarding, accessibility, legal exposure.

**Method note.** Every claim below is marked VERIFIED (grepped/read in source, citation given) or
INFERRED. Where I claim something is *absent* I list the search terms I tried. I did not run the
game; nothing was modified except this file.

---

## 1. INVENTORY (verified)

**Distribution.** One file, `breach.html` (46,402 lines, 3.6 MB), GitHub Pages + a cPanel PHP host
at `www.rumpusengine.com`. Marketing site: `index.html`, `faq/`, `compare/`, `player/`,
`make-a-game-without-coding/`, `browser-game-engine/`, `llms.txt`, `sitemap.xml`, `robots.txt`.

**Four sharing lanes, all verified:**
1. `#lvl=` gzip share codes / challenge links — `levelCodeFromUrl` 9709, consumed 46366.
2. `.rumpus` file export (plain JSON) — 38892, campaign export 37275.
3. Instant **unlisted** publish → `/game/<slug>` — `server/api/publish.php`, landing page
   `server/game.php` with OpenGraph unfurls and a `?img=` thumbnail proxy.
4. **Reviewed** community library — `server/api/submit.php` → `api/pending/` → `admin.php`
   approve → `community/levels/*.json` + `community/index.json`.
   A *second, still-live* path exists: GitHub issue form → `.github/workflows/publish-level.yml` →
   `.github/scripts/publish-level.mjs` (fallback when the PHP host is unreachable, breach.html
   39021/39036, `COMM_SUBMIT_URL` 45627).

**Backend (`server/api/`, 921 lines PHP total).** `lobbies.php` (live lobby directory, salted IP
hashes, per-IP cap 3, global cap 200, TTL prune), `plays.php` (play/thumb counts), `publish.php`
(unlisted games, owner-key hashed, 500 global / 20 per IP), `submit.php` (queue, 200 global / 5 per
IP / 30 s interval, moderator email + Discord webhook), `admin.php` (single-password review UI),
`upload.php` (model/texture/sound uploads, magic-byte sniffing, 20 files & 60 MB per key),
`ice.php` (TURN config, ships unset), `_community_lib.php` (shared validation).

**Attribution & credits.** `levelCreditsList()` 45450, `collectLevelCredits()` 45477,
`showCreditsModal` 45457 (textContent — safe), `renderCreditsScreen` 45486 (innerHTML — see §2),
`LIB_CREDITS`/`ASSET_SOURCES`/`ENGINE_CREDITS` 45423+, `levelIssues()` flags a `sketchfab:` prop
with no attribution. Reachable from the main menu (44860) and the pause menu (45385).

**Identity.** None. `NET.name` is `(mpName.value.trim())||('Player'+rand)` (26016). Ownership is a
hex key in `localStorage` (`breach_upload_key`, `breach_game_keys`). No account exists anywhere —
searched `login|signIn|signUp|oauth|account|session token|jwt` → 0 relevant hits.

**Moderation.** Library submissions are reviewed. **Unlisted games publish with zero review**
(`publish.php` line 40+ — POST, validate, write). Chat filter + `/mute` at render, `_chatClean`
23488+. `/mute` is per-session, by display name.

**Storage.** 84 distinct `breach_*` localStorage keys enumerated. Sensitive ones:
`breach_upload_key`, `breach_game_keys`, `breach_sketchfab_token`, `breach_anthropic_key`
(16857), `breach_lvl_*` (the local level library), plus the *self-hoster overrides*
`breach_comm_api`, `breach_lobby_db`, `breach_plays_db`, `breach_ice`.

---

## 2. SECURITY — what an untrusted level can actually do

### 2.1 What is already closed — and it is genuinely good work

- **Zero `eval` / `new Function`.** VERIFIED: `grep -n "\beval(" / "new Function"` → the only hits
  are the *comment* at 10737–10744 explaining why the build-1271 expression escape hatch is a
  hand-written tokenizer + Pratt parser (`LGX_FUNCS` 10746, `_lgxTokens` 10756). The grammar
  cannot express property access, indexing or assignment. This is the single best security
  decision in the codebase and it should be advertised.
- **Homepage / title-screen block fully sanitized** — `_sanitizeHomepage` 44893: text fields strip
  `<>` and clamp length, colours regex-gated to `#rrggbb`, font whitelisted against `HUD_FONTS`,
  slug regex-gated, images through `_hpImg` 44886 (data:image or http(s), 300 chars).
- **HUD widgets hardened** — `_sanitizeHudWidgets` 11064; labels set via `textContent` (11280);
  `_hwSafeUrl` 11057 rejects quotes, parens, backslash, whitespace and angle brackets before the
  url is interpolated into `background-image:url("…")` at 11244. Correct, and correctly commented.
- **Dialogue, objective banner, win/lose text, NPC names, character names** all escaped
  (`_creditEsc` 28459/28461/28463/32808/44574/44615, `_esc` 24616).
- **Toasts and Level Check use `textContent`** (9729, 39144). Community gallery rows use
  `textContent` and validate the thumb data-URI (46099–46122). Lobby rows use `textContent`.
- **`admin.php`'s review UI escapes** everything it prints (`esc()`, 5 chars including quotes).
- **Server-side**: `plain()` strips markdown/HTML metacharacters; `validateSubmission` decodes,
  shape-checks and size-caps; thumbs regex-gated to `data:image/(jpeg|png);base64,…` ≤100 KB;
  slugs regex-gated before any filesystem write; owner keys stored as SHA-256 and compared with
  `hash_equals`; `upload.php` sniffs magic bytes and refuses anything else.

### 2.2 OPEN — four DOM-injection vectors from level data (all VERIFIED in source)

The pattern: newer surfaces were written with a sanitizer; four older ones were never revisited.

| # | Sink | Untrusted source | Cap | Reachability |
|---|---|---|---|---|
| V1 | `renderCreditsScreen` **45495** → `_creditLinkify` **45485** → `href="$1"` | prop `att` → `userData.attribution` (loaded **uncapped, unsanitized** at 17318 / 23696 / 36746 / 37982; also over the wire at **25191**) | none | Pause menu → **Asset credits**, or main menu → Credits |
| V2 | `openInspect` **28757** — `hd.innerHTML='…'+(it.name\|\|id)+'…'` | `invCatalog[id].name` from `level.invItems` (28666, 38040 — `JSON.parse(JSON.stringify(...))`, no sanitize) | none | Pick up an item → click it in the inventory |
| V3 | `checkProximity` **28285** — `` `…${keyDisplayName(lk)}` `` | `keyNames` from `level.keyNames` (23705, deep-copied raw; `keyDisplayName` 20060 returns it verbatim) | none | Walk up to any locked prop |
| V4 | `checkProximity` **28282** — `` `…${w.name} rounds` `` and `_pickupLabel` 28186–28188 → 28293 | `WEAPONS[k].name` from `level.weapons[k].nm` (`_wepApplyName` 19280) | 24 chars | Walk up to an ammo station / an interact pickup |

**V1 is the sharpest.** `_creditEsc` escapes `& < >` but **not `"`**, and `_creditLinkify` then
drops the matched URL into a double-quoted `href`. The URL character class is `[^\s)]+`, which
permits `"`. So an attribution of the form
`https://x/"onfocus="…"autofocus="` (no spaces, no parentheses — backtick-call syntax covers the
lack of parens) breaks the attribute and executes. The comment on that line —
*"escape first, then linkify — safe against markup in author-supplied strings"* — is **wrong**, and
being wrong in a comment is why it survived. `attribution` is the *only* prop string in the loader
that gets no `String(...).slice(...)` treatment while `nm`, `fld`, `npc`, `dlg` all do.

V4's 24-char cap is not a mitigation: `<svg onload=eval(name)>` is 23 characters, and the page that
links to the level controls `window.name`.

**Also verified: the safe credits renderer is dead code.** `bindPauseMenu` assigns
`#pauseCredits.onclick` twice — line **45379** to the safe `showCreditsModal` (build 1166, uses
`textContent`, comment literally says *"attributions are UNTRUSTED level data"*), then line **45385**
to `openCredits` → the vulnerable `renderCreditsScreen`. Last write wins. The fix build 1166
shipped has never actually run on that button.

### 2.3 What the payload gets — the impact is not cosmetic

Same-origin as `breach.html`, so an XSS reads/writes **all** of localStorage:
- `breach_upload_key` / `breach_game_keys` → permanent takeover of every game the victim ever
  published (`publish.php` DELETE and slug-update are gated on this key alone) and every asset they
  uploaded.
- `breach_sketchfab_token`, `breach_anthropic_key` (a real, billable API key — 16858).
- `breach_comm_api` / `breach_lobby_db` / `breach_plays_db` / `breach_ice` are read as endpoint
  overrides, so an XSS can **permanently repoint the victim's client at an attacker-run backend** —
  a persistent backdoor that survives closing the tab. This is the escalation nobody has costed.
- `breach_lvl_*` and `SAVE_KEY` → silently corrupt or exfiltrate the victim's whole level library.

**Moderator escalation (the one that matters most).** `admin.php` stores the review password in
`sessionStorage.rumpus_admin_pw` and offers a **"▶ Test play"** link that opens
`../breach.html#lvl=<submitted code>` with `target="_blank"` — same origin. Chrome and Firefox
*clone* sessionStorage into a browsing context opened from a same-origin link, so the untrusted
level runs in a tab that can read the moderator's admin password, plus all of the localStorage
above. Submitting a level whose only unusual property is a crafted `att` string is a plausible
path from "anyone on the internet" to "control of the community library". Even discounting the
sessionStorage clone, the moderator's own upload/publish keys are certainly reachable.

### 2.4 Command injection in the GitHub publish Action (VERIFIED, live path)

`.github/scripts/publish-level.mjs:42` — `_plain` strips ``[<>`*_[\]#|]`` but **not** `$`, `(`, `)`,
`;` or `"`. The resulting `name` is emitted as a step output and interpolated by GitHub *before*
bash sees it, into:

```yaml
git commit -m "community: publish \"${{ steps.pub.outputs.name }}\" (#${{ … }})"
```

`$( … )` inside double quotes is command substitution. The workflow holds `contents: write`,
`issues: write`, `actions: write` and pushes to `main` — which **is** the GitHub Pages source that
serves `breach.html` to every player. Mitigating: it fires only when a maintainer adds the
`approved` label. Not mitigating: the maintainer is looking at a level, not auditing a shell
string, and the whole point of the label is to be routine. This is the highest-blast-radius bug in
the repository. Fix is one line: pass the name through `env:` and use `"$NAME"`.

### 2.5 Fetch surface — what a level makes the client request

A level can direct the browser to fetch arbitrary `http(s)` URLs through: prop `src`
(`isModelSrc` 12429 — note the second alternative `/\.(glb|gltf)(\?|$)/i` accepts *any* scheme
whose string ends in `.glb`), per-weapon/enemy/player/chest/coin/turret/grenade/attachment model
urls, per-primitive textures, `audioZones[].url`, custom SFX, the HDRI sky url, `lobbyBg`,
homepage `bg`/`logo`, and HUD widget `img`. There is **no host allowlist, no confirmation prompt
and no disclosure**. Consequences, in order of realism:

1. **IP + User-Agent beaconing.** Opening a shared level link hands the player's IP to whoever
   authored it. For a product marketed to children this is the sharpest privacy edge in the whole
   system, and it is invisible.
2. Unbounded bandwidth/memory (the `data:` branch of `isModelSrc` plus arbitrary remote GLBs).
3. Cross-site request forgery is limited (GLTFLoader uses GET, no credentials), so this is a
   tracking/DoS problem rather than an auth problem.

### 2.6 Supply chain — no SRI, no CSP (VERIFIED)

`grep -n "Content-Security-Policy|X-Frame-Options|integrity=|crossorigin"` across `breach.html`,
`index.html`, `pages.yml`, `htaccess-root.txt` → **zero hits**. Meanwhile:

- **three.js — the entire renderer — is loaded from `unpkg.com`, jsDelivr, cdnjs** (1471–1473), no
  SRI. Anyone who compromises unpkg owns every Rumpus session.
- PeerJS from the same three CDNs (44629), no SRI.
- Draco / KTX2-Basis / meshopt decoders + wasm from jsDelivr (16375, 16644, 16675, 16695).
- Google Fonts stylesheet twice (31, 6704) — an unconditional third-party request on every load.
- Rapier **is** vendored locally (`rapier3d-compat.js`) and fflate is vendored-first (16895). So the
  project already knows how to do this; three.js and PeerJS are simply the ones that never got it.

---

## 3. RELEASE BLOCKERS, in priority order

1. **Fix the Action command injection** (§2.4). One line. Repo/Pages compromise otherwise.
2. **Fix V1–V4 and delete the shadowed `openCredits` binding** (§2.2). Add `"` to `_creditEsc`,
   cap+sanitize `p.att` like `p.nm`, `textContent` the three prompt/inspector sinks. Half a day.
   Then add a test-pin: *no level-derived string reaches `innerHTML` unescaped*.
3. **A report button + `report.php`.** VERIFIED absent: `grep -icE "reportLevel|report\.php|
   flagContent|reportGame|abuse|takedown|blocklist|blockUser|reportUser"` → 0 in `breach.html` and
   0 in every `server/api/*.php`. Unlisted games publish instantly with no review and there is no
   way for anyone to tell you about a bad one. For a public launch with minors this is the legal
   exposure, not a feature gap. Every pattern needed already exists (`notifyModerator`, the
   `admin.php` queue, salted-IP rate limits).
4. **Privacy policy + terms + a stated minimum age.** VERIFIED absent: zero occurrences of
   `privacy|terms|dmca|coppa|gdpr` in `index.html`, `breach-help.html` or `faq/index.html`. You
   collect salted IP hashes (`ipHash()`), store display names, expose every player's real IP to
   every peer over WebRTC, and ship a chat channel — with no notice, no age gate, no DMCA agent and
   no takedown route. COPPA applies below 13 in the US; GDPR treats a salted IP hash as personal
   data; the UK Age Appropriate Design Code applies to a service likely to be accessed by children.
   This is the cheapest blocker on the list to clear and the most expensive to ignore.
5. **Ship real infrastructure.** `ice.php` exists but is unset; the default TURN is `freeturn.net`
   with `free`/`free` (24925-ish, unchanged since the last audit); signalling is the public PeerJS
   cloud broker. Self-host PeerServer, buy TURN, vendor `peerjs.min.js` and `three.min.js` with SRI.
6. **`admin.php` hardening.** Single shared password, default `CHANGE-ME` (guarded — it refuses to
   act, good), 30 attempts/IP/hour, no 2FA, no audit log, and the review UI opens untrusted content
   in its own origin (§2.3). At minimum: move Test-play to a sandboxed iframe or a separate origin,
   and stop keeping the password in sessionStorage.
7. **Stop lending the host's Sketchfab token to every joiner.** Still live: `_sfPack` 16844 /
   `_sfUnpack` 16845 (fixed XOR, decoder ships in the same file), sent at 25748, applied 25599.
   Flagged in the previous audit, unchanged.
8. **Docs.** `docs/REFERENCE.md` says "verified at build 1252"; the help file's newest build-stamped
   content is 1089. The build-1271 expression system — the answer to the loudest editor complaint —
   is documented in **neither** (`grep -ci "expression"` → 0 in both). Shipping an escape hatch
   nobody can find is the same as not shipping it.
9. **Accessibility.** Census: `aria-label` 47, `role="` **0**, `tabindex` **0**, colour-blind modes
   **0**, UI/font scale **0**, `prefers-reduced-motion` **1** (and it decorates a lobby sweep
   animation, not gameplay), photosensitivity/epilepsy warning **0**, screen-shake toggle **0**.
   Key rebinding exists (`breach_binds_v1`), hold/toggle sprint & crouch exist, FOV exists. A game
   with bloom, muzzle flash, explosions and god rays shipping to the public with no photosensitivity
   warning is an easy, embarrassing miss; the rest is below web-baseline but not a launch blocker.

**Not blockers, and previously listed as such — credit where due:** the "one local save slot"
data-loss trap is largely closed (a named local library, `_libName` 37189 / `breach_lvl_*` 37198,
plus build 1254's rescue slot at 38947 and the "unsaved work was backed up" toast 37141).

---

## 4. HONEST COMPARISON

The right comparison set is Roblox / Fortnite Creative / itch.io, not Unreal/Unity/Godot — the
latter distribute *builds*, and the person who compiles the binary is the person who ran the code.
Rumpus, like Roblox, executes **strangers' content in a shared runtime**, which is the whole
problem.

| | Roblox | Fortnite Creative | itch.io | **Rumpus** |
|---|---|---|---|---|
| Identity | account, age verification, parental controls | Epic account | account for creators | **none** |
| Content review | automated + human, pre-publish | automated + human | ToS + reactive | library reviewed; **unlisted games not reviewed at all** |
| Report button | on every player, game, chat message | yes | yes | **none anywhere** |
| Chat safety | ML filters + age-tiered chat | age-tiered | n/a | 11-word English list + per-session `/mute` by display name |
| Sandbox | Luau in a real sandbox, capability-gated | closed verb set | it's a download; the browser is the sandbox | closed verb set + a genuinely safe expression parser — **but four HTML sinks defeat it** |
| Privacy posture | policy, COPPA/GDPR programs, DPO | Epic's | policy | **no policy, no age gate, WebRTC leaks every IP** |
| Distribution friction | install / launcher | launcher | download | **URL. Best in class, by a mile.** |
| Supply chain | vendored | vendored | n/a | **three.js from unpkg, no SRI** |

**Where Rumpus genuinely wins:** friction (no install, no account, one file, instant unlisted
publish with OpenGraph unfurls), transparency of the pipeline, and a P2P claim-bounding layer more
serious than most shipped indie multiplayer. The moderation *plumbing* that exists (queue, notify,
approve/reject/unpublish, salted-IP limits, magic-byte upload sniffing) is better than most solo
projects ever build.

**Where the comparison is not close:** the anonymity that makes onboarding frictionless is the same
anonymity that makes moderation impossible. Roblox's model is that **identity is the substrate** —
reporting, banning, parental controls and monetisation all hang off it. Rumpus has built the
review queue but not the thing a report would point *at*. And itch.io — the closest analogue to
"no account, just a link" — still gets to say "this is a download, you chose to run it"; Rumpus
executes the stranger's content automatically the moment the link is clicked.

---

## 5. SCORE

**5 / 10.**

**Rubric.** *10* would mean: a public launch could happen tomorrow without a lawyer or a security
engineer flinching — accounts (or a deliberate, documented anonymity model with compensating
controls), a report button on every surface with a queue behind it, a published privacy policy and
age policy that match what the code actually collects and transmits, no untrusted string reaching
the DOM unescaped, SRI or vendoring on every third-party script, a CSP, licences satisfied at play
time, docs current with the build, and WCAG-baseline accessibility.

**Why 5 and not lower:** the plumbing is real and mostly well built. Two of the four sharing lanes
are genuinely hardened end-to-end, the newer input surfaces (homepage, HUD widgets, dialogue,
expressions) show a sanitize-at-the-boundary discipline that most projects never reach, the server
endpoints are careful about slugs, keys, quotas and magic bytes, and the credits system exists and
is reachable at play time — which is the actual CC-BY requirement.

**Why 5 and not higher:** three things a public release cannot survive, all verified in source. A
shell-injection in the publish Action that reaches `main`, and therefore reaches every player's
`breach.html`. Four level-data → DOM injections whose payoff is the victim's publish keys, their
Anthropic key, and a persistent backend override — one of which is reachable by *submitting a level
and waiting for the moderator to press Test play*. And a complete absence of the safety layer a
UGC platform for minors is legally required to have: no report button, no age policy, no privacy
policy, no disclosure that a level can beacon a child's IP to an arbitrary server. The engine is
further along than the platform around it, and that gap is exactly what this score measures.
