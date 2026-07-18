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

## Deploying community submissions (`api/submit.php` + `api/admin.php`) — build 958

1. **Edit `api/admin.php` first**: change the `$ADMIN_PASSWORD = 'CHANGE-ME';` line near the
   top to your own password. The page refuses to do anything until you do.
2. Upload `api/_community_lib.php`, `api/submit.php`, and `api/admin.php` into the same
   `public_html/api/` folder as the lobby service.
3. Upload the repo's `community/` folder (index.json + levels/ + .htaccess) to
   `public_html/community/` — the `.htaccess` inside it makes the catalog readable
   cross-origin so the GitHub Pages copy of the game shares the same live library.
4. **Get alerted about new submissions** (optional, recommended): near the bottom of
   `api/submit.php`, inside `notifyModerator()`, set either or both:
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
   later. Nothing goes live without you pressing Approve.

Hardening: submissions are fully validated at the door (decode, 500 KB level cap, shape
check, name/author sanitization) so junk never enters the queue; per-IP limits (30s between
submissions, 5 pending max), 200-entry queue cap; admin brute-force brake (30 attempts/hour
per IP); the level slug and file writes are whitelisted patterns under flock.

Back up `public_html/community/` now and then — with submissions moving here, GoDaddy holds
the master copy of the library (levels also remain in the GitHub repo up to the point you
switched, and you can commit new ones there whenever you like as an archive).

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
