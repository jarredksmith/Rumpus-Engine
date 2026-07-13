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

## What it does / limits

- Hosts heartbeat every 5s while their pre-game lobby is open; entries expire
  20s after the last heartbeat (server clock — client clocks are never trusted).
- Owner keys: the first heartbeat for a room code owns it; updates/closes need
  the same key, so nobody can overwrite or close someone else's lobby.
- Abuse caps: 3 lobbies per IP, 200 total, 2KB request bodies, names sanitized
  server-side. IP addresses are stored only as salted hashes and never returned.
