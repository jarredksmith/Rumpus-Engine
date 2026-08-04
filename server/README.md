# RUMPUS ENGINE — server pieces (cPanel / any PHP host)

These files are the self-hosted backend for features that need a tiny bit of server:
GitHub Pages stays the static home of the game; these run on your own PHP host
(GoDaddy cPanel or anything similar).

## Deploying the lobby directory (`api/lobbies.php`)

1. In cPanel **File Manager**, create a folder `api` inside `public_html`.
2. Upload `api/lobbies.php` and `api/.htaccess` into it.
3. That's it — no database, no config. The script stores its data in
   `rumpus-lobbies.json` next to itself (the `.htaccess` blocks anyone from
   reading that file directly).

Smoke test: open `https://www.rumpusengine.com/api/lobbies.php` in a browser —
you should see `{}` (an empty JSON object). Host a multiplayer game in RUMPUS
ENGINE and reload that URL: your lobby appears; close the lobby and it's gone.

The game's endpoint is set by `LOBBY_DB` in `breach.html`. Self-hosters can point
their copy elsewhere with `localStorage.setItem('breach_lobby_db', 'https://their-host/api/lobbies.php')`
(or `'off'` to disable the browser), no rebuild needed.

## Deploying play counts + thumbs (`api/plays.php`) — build 1230

1. Upload `api/plays.php` into the same `public_html/api` folder as `lobbies.php`.
2. That's it — same pattern: no database, data lives in `rumpus-plays.json` next to
   itself (the existing `.htaccess` already blocks direct reads of every `.json`),
   and it shares `rumpus-salt.txt` with the lobby directory (one IP salt per host).

Smoke test: open `https://www.rumpusengine.com/api/plays.php` — you should see `{}`.
Play a community-library level in the game and reload: its file name appears with a
count. Rate limits: one play per level per IP per hour; one thumbs-up per level per
IP ever. IPs are stored only as salted hashes and never returned.

Self-hosters point their copy elsewhere with
`localStorage.setItem('breach_plays_db', 'https://their-host/api/plays.php')`
(or `'off'` to disable the feature), no rebuild needed.

## Deploying community submissions (`api/submit.php` + `api/admin.php`) — build 958

1. **Edit `api/admin.php` first**: change the `$ADMIN_PASSWORD = 'CHANGE-ME';` line near the
   top to your own password. The page refuses to do anything until you do.
2. Upload `api/_community_lib.php`, `api/submit.php`, and `api/admin.php` into the same
   `public_html/api/` folder as the lobby service.
3. Upload the repo's `community/` folder (index.json + levels/ + .htaccess) to
   `public_html/community/` — the `.htaccess` inside it makes the catalog readable
   cross-origin so the GitHub Pages copy of the game shares the same live library.
4. **Get alerted about new submissions** (optional, recommended): near the bottom of
   `api/_community_lib.php` (it lived in `api/submit.php` until build 1346, when `report.php`
   became a second caller), inside `notifyModerator()`, set either or both:
   - `$NOTIFY_EMAIL` — any address; sent via the server's mail() as `noreply@rumpusengine.com`.
     Check your spam folder for the first one and mark it Not Spam.
   - `$NOTIFY_DISCORD` — a Discord channel webhook URL (in Discord: Server Settings →
     Integrations → Webhooks → New Webhook → Copy URL). This one pushes to your phone
     instantly via the Discord app and can't land in spam — the better option.
   Each alert includes the level name, author, size, queue length, and the admin.php link.
   Alert failures never affect the player's submission.
5. Review queue: open `https://www.rumpusengine.com/api/admin.php`, enter your password,
   **Load queue**. Each submission has **▶ Test play** (opens the actual level in the game),
   **Approve** (publishes: writes `community/levels/<slug>.json`, updates `index.json`,
   thumbnail lifted into the gallery) and **Reject**. Published levels can be **Unpublish**ed
   later. Nothing goes live without you pressing Approve. The same page carries player reports
   (see the report section below), unlisted games and uploaded assets.

Hardening: submissions are fully validated at the door (decode, 500 KB level cap, shape
check, name/author sanitization) so junk never enters the queue; per-IP limits (30s between
submissions, 5 pending max), 200-entry queue cap; admin brute-force brake (30 attempts/hour
per IP); the level slug and file writes are whitelisted patterns under flock.

Back up `public_html/community/` now and then — with submissions moving here, GoDaddy holds
the master copy of the library (levels also remain in the GitHub repo up to the point you
switched, and you can commit new ones there whenever you like as an archive).

## Deploying player reports (`api/report.php`) — build 1346

Players can report a chat line, a level, a game page or another player from inside the game; the
report lands in the same review queue as level submissions and shows up in a **REPORTS** section
at the top of `admin.php`.

1. Upload `api/report.php` into `public_html/api/` (beside `submit.php`).
2. **Re-upload `api/_community_lib.php` and `api/submit.php` at the same time.** The moderator
   alert (`notifyModerator()`) moved out of `submit.php` into the shared library in this build so
   both endpoints use one copy — an old `submit.php` against the new library, or the reverse, is a
   fatal PHP error on the next submission. These three files go up together.
3. **Re-upload `api/admin.php`** — it gains the REPORTS section and the Dismiss action.
4. Alerts: if you already set `$NOTIFY_EMAIL` / `$NOTIFY_DISCORD`, they now live near the bottom of
   `api/_community_lib.php` instead of in `submit.php` — **move your values across** or alerts go
   quiet. Reports arrive flagged 🚩 with the reason, the target and the reported text; level
   submissions still arrive 🕹️ exactly as before.

Nothing else to configure — no database, no new folder. Reports are stored as `rep_*.json` in
`public_html/api/pending/` beside the level submissions (the existing `api/.htaccess` already
blocks direct reads of every `.json`).

Smoke test: `curl -X POST -H 'content-type: application/json' -d '{"kind":"chat","reason":"spam","text":"buy gold at example.com","room":"ab12cd"}' https://www.rumpusengine.com/api/report.php`
should return `{"ok":true,"id":"rep_…"}`. Open `admin.php`, **Load queue** — it appears at the top
with the reported line quoted. **Dismiss** closes the report (and only the report; it does not
touch what the report named — use Unpublish / Delete for that).

The endpoint takes `POST` JSON `{kind, reason, target, note, text, room}`:

| field | required | notes |
|---|---|---|
| `kind` | yes | `chat` \| `level` \| `game` \| `player` — anything else is a 400 |
| `reason` | no (defaults `other`) | `harassment` \| `sexual` \| `violence` \| `hate` \| `spam` \| `other` |
| `target` | yes, **except** for `chat` | the level file, game slug or player name — 120 chars |
| `text` | **yes for `chat`** | the reported message itself — 300 chars |
| `note` | no | the reporter's own words — 500 chars |
| `room` | no | lobby code it happened in; a malformed one is dropped, not fatal |

**Why a chat report must carry the message.** Multiplayer chat here is peer-to-peer — the line
never touches this server, so there is no log to look up and no message id to quote. A chat report
that arrives without the text is an accusation the moderator cannot act on, so the endpoint refuses
it at the door rather than storing something unactionable.

Hardening: `kind` and `reason` are whitelists; every text field goes through the same `plain()`
sanitizer the library uses, with caps; the reporter is identified only by the salted `ipHash()`
shared with `lobbies.php`/`plays.php` (a raw IP is never stored and never returned — the admin page
shows an 8-character fingerprint so you can spot one person spamming the queue); 20s between
reports per reporter and 20 open reports each; 4 KB request bodies; atomic writes under flock. The
queue is capped at 500 reports and **drops the oldest to make room rather than refusing the newest**
— refusing (the 503 `submit.php` returns when its queue is full) would let a flood of junk reports
silence real ones.

Tuning: `RUMPUS_REPORT_INTERVAL` in the PHP environment sets the seconds between reports per
reporter (default 20; `0` really does mean none here).

## Deploying unlisted game pages (`api/publish.php` + `game.php`) — build 972

Creators can publish a game with its own title screen to an instant URL — no review, and it
never appears in the community library (unlisted: only people with the link find it).

1. Upload `api/publish.php` into `public_html/api/` (beside the other services).
2. Upload `game.php` into `public_html/` (beside `breach.html`).
3. Add the pretty-URL rewrite to `public_html/.htaccess` (create the file if needed):

   ```
   RewriteEngine On
   RewriteRule ^game/([a-z0-9-]{1,64})/?$ game.php?slug=$1 [L,QSA]
   ```

That's it. Levels land in `public_html/community/games/` (served with the same CORS-open
`.htaccess` as the library); creator records live in `public_html/api/gamesmeta/` (blocked
from the web by `api/.htaccess`). `https://www.rumpusengine.com/game/<slug>` serves
OpenGraph tags — shared links unfurl on Discord/Reddit/social with the game's own name and
screenshot — then drops the visitor straight into the game.

Smoke test: in the game, editor → Files → Title screen → enable, then **Publish game page**.
Open the URL it returns; you should land on the creator's title screen.

Moderation: these are live WITHOUT review, so `admin.php` has an **UNLISTED GAMES** section —
spot-check it now and then; **Unpublish** kills a link instantly. Creators can update or
unpublish their own game from the same browser they published from (an owner key, stored
hashed, protects each slug). Abuse caps: 60s between publishes per IP, 20 games per IP,
500 global, and the exact validation + text sanitizer the reviewed library uses.

## Deploying asset uploads — models, textures, sounds (`api/upload.php`) — build 974/975

Creators can upload their own `.glb` models, image textures (PNG/JPEG/WebP) and sounds
(MP3/OGG/WAV) straight from the editor; each hosts on your server and the URL works in shared
and published levels.

1. Upload `api/upload.php` into `public_html/api/`.
2. Create these three folders and upload the matching `.htaccess` from the repo into each — this
   is the security piece (nothing executes from them, and each serves only its own media type):
   - `public_html/community/models/`   ← `community/models/.htaccess`   (.glb)
   - `public_html/community/textures/` ← `community/textures/.htaccess` (.png/.jpg/.webp)
   - `public_html/community/sounds/`   ← `community/sounds/.htaccess`   (.mp3/.ogg/.wav)

Caps (env-tunable, see the top of `upload.php`): 12 MB per model (8 before build 988), 4 MB per texture/sound; 20
files / 60 MB per creator (shared across types); 1000 files / 3 GB global; 20s between uploads
per IP. Every upload must pass a file-signature check on both client and server, so only real
models/images/sounds land. `admin.php` gains an **UPLOADED ASSETS** section (type-tagged, with
sizes, a disk total, an Inspect link and one-click Delete).

If large uploads fail with "empty upload": raise `post_max_size` (cPanel → MultiPHP INI
Editor) to at least the largest cap (12 MB) — REQUIRED for the build-988 cap raise: a
`post_max_size` still at 8M silently truncates bigger uploads before PHP sees them.

Bandwidth note: every fresh player downloads a level's assets (then caches them for a week).
If a popular game strains the host, putting the domain behind Cloudflare's free proxy serves
these cached files from their CDN instead — a later, no-code step.

## Speeding up first load on the cPanel host (build 961)

- Upload **`rapier3d-compat.js`** (repo root, ~2.2 MB) next to `breach.html` — the game now
  loads physics from this local file instead of a CDN, which removes the biggest download
  from the boot path (and the console 404).
- Recommended `public_html/.htaccess` additions so repeat visits are fast while updates still
  arrive immediately:

  ```
  <IfModule mod_headers.c>
    <FilesMatch "\.html$">
      Header set Cache-Control "no-cache"
    </FilesMatch>
    <FilesMatch "\.(js|svg|woff|glb)$">
      Header set Cache-Control "public, max-age=604800"
    </FilesMatch>
  </IfModule>
  ```

  (`no-cache` still allows ETag revalidation — browsers get a tiny 304 instead of the full
  file when nothing changed; the week-long cache on js/svg/woff/glb covers the physics build,
  logo, font and animation library.)

## What it does / limits

- Hosts heartbeat every 5s while their pre-game lobby is open; entries expire
  20s after the last heartbeat (server clock — client clocks are never trusted).
- Owner keys: the first heartbeat for a room code owns it; updates/closes need
  the same key, so nobody can overwrite or close someone else's lobby.
- Abuse caps: 3 lobbies per IP, 200 total, 2KB request bodies, names sanitized
  server-side. IP addresses are stored only as salted hashes and never returned.

## ice.php (build 1015 — optional TURN relay config)

Deploy `api/ice.php` beside the other API files. By default it returns `[]` and the game
uses its built-in STUN + free TURN relay. If same-network (same WiFi) joins are unreliable
for your players, supply your own TURN service (e.g. Cloudflare Calls TURN, Twilio NTS, or a
coturn box) by setting `RUMPUS_ICE_JSON` in the PHP environment to a JSON array of ICE
servers — the game picks it up automatically on the next session. Players can also override
locally via the `breach_ice` localStorage key.

## The root `.htaccess` (build 1090)

`htaccess-root.txt` in this folder is the root rewrite/caching config. Upload it to
`public_html/.htaccess` (with the leading dot). Keep a copy of the old one first.

The one line that matters most is `DirectoryIndex`. Naming only `breach.html` REPLACES Apache's
default `index.html`, so every page folder (`/faq/`, `/compare/`, …) makes Apache look for a
`breach.html` inside it, find nothing, and return **403 Forbidden**. Listing both files fixes it:

    DirectoryIndex index.html breach.html    # "/" = the landing page, game at /breach.html
    DirectoryIndex breach.html index.html    # "/" = the game, marketing pages still work

Either order works for the marketing pages — the difference is only what the bare domain serves.
The landing page forwards `#lvl=`, `?game=` and `?challenge=` to `breach.html`, so share links minted
against the bare domain keep working whichever you pick.

The file also forces one canonical address (https + www), because `http://` and the bare domain both
answer 200 today, which splits ranking signals across four spellings of the same site.

## Marketing pages (build 1090)

The repo root carries the static site: `index.html`, `rumpus-site.css`, `sitemap.xml`, `robots.txt`,
`llms.txt`, and the folders `browser-game-engine/`, `make-a-game-without-coding/`, `compare/` and
`faq/`. Upload them into `public_html` alongside `breach.html`. They are plain static files — no PHP,
no build step.

### The Material Museum in the community library

`community/levels/material-museum.json` + its entry in `community/index.json` put the generated
material showcase in the in-game library. It references the model at
`https://www.rumpusengine.com/community/models/material-museum.glb`, so to go live:

1. Generate it: `TEXSIZE=512 node tools/levelgen.mjs museum material-museum.glb` (~10.7 MB).
2. Upload that file to `public_html/community/models/`.
3. Re-upload `community/index.json` and `community/levels/material-museum.json`.

The other generated arenas (keep, spine, castle, caldera) can join the library the same way —
generate, upload the .glb, copy the level json and add an index entry.

### The in-editor arena generator needs one extra file (build 1104)

Editor → Tools → **Generate arena…** fetches `tools/levelgen.mjs` from the site and runs it in
the browser. GitHub Pages serves it automatically (it's in the repo). On the cPanel host, upload
**two** files (both are in the repo root / `tools/`):

- `tools/levelgen.mjs` → `public_html/tools/` (or flat as `public_html/levelgen.mjs`)
- `fflate.min.js` → `public_html/` beside `breach.html` — the compressor that writes the model's
  PNG textures. Build 1107 loads this local copy first and only falls back to a CDN, so the
  generator (and Sketchfab model unzipping) keep working on networks that block CDNs.

Without them the dialog says so plainly rather than failing silently.

### Google Analytics lives in the repo now (build 1091)

The GA4 tag (`G-8R98ZNS9HN`) was originally hand-pasted into the uploaded copies only, which meant every
re-upload from git silently switched analytics off until someone noticed and pasted it back. It is now in
the repo copies of `breach.html` and all five marketing pages, right after `<head>`. Uploading straight
from the repo is safe; don't strip it, and don't paste a second copy in on the server.
