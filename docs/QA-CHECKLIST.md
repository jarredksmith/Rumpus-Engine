# BREACH — Release QA Checklist (browser pass)

The Node harness verifies logic; **this list is everything only a human in a browser can verify.**
Ordered by risk (newest / least-exercised systems first). Check items off as you go; for any failure,
note *what you did, what you expected, what happened* — that's enough for a fix.

Test on: **desktop Chrome** (primary), then a quick pass on **Firefox** and **a phone** (touch controls).
Hard-refresh (Ctrl/Cmd+Shift+R) before starting so you're on the latest build (bottom-left shows the build number).

---

## 0. Atmosphere & water (builds 855–863 — newest)

- [ ] **Water zones**: pond over a sculpted basin — surface ripples/glints, swim in deep water (`Space` up, `C` dive, screen tints underwater), wading slows you, a high jump into deep water doesn't hurt
- [ ] **Streams**: flow direction + push carries you visibly; ripples scroll with the current
- [ ] **Waterfalls**: sheet flows DOWN, foam pool animates, standing in it pushes you into the pool; sound gets louder as you approach and respects master volume/mute
- [ ] **Water gameplay**: drive a car into water (slows + bow spray), toss a grabbable crate in (bobs to the surface), lure an enemy through water (visibly slower)
- [ ] **Sun rotation**: drag Sun direction/height — shadows swing live; save/reload keeps the angle
- [ ] **Day/night cycle**: full cycle plays (dawn gold → noon → dusk gold → dark-but-visible night); enter a headlighted car at night → lights on automatically; toggling the cycle off restores the authored sky instantly
- [ ] **Weather**: rain leans and streaks, snow drifts, Amount scales density; check FPS with weather + water + a race on a phone
- [ ] **Editor round-trip**: all of the above survive save → wipe → import, and carry to a joiner in MP

## 0.5 Community library & help (builds 848–854)

- [ ] **Gallery**: Community levels lists all entries with thumbnails/placeholders, badges, filter chips; Play and Open-in-editor both work; Ctrl+Z undoes a load
- [ ] **Submission round-trip**: Submit from the Save tab (frame a nice view first — it's the thumbnail) → paste → approve label → level goes live in the gallery WITHOUT any manual step
- [ ] **Field manual** (`breach-help.html`): loads from the home menu + editor `?`, sidebar filter works, readable on a phone
- [ ] **Help & tutorials**: all three example projects load and are winnable

---

## 1. Racing stack (newest — highest risk)

- [ ] **Track builder**: top view (T) → lay Start line → straights/curves snap to the chain → `Close loop` bridges the final gap exactly (no seam overlap/z-fighting at the joint)
- [ ] **Banked curves**: Bank L/R sit flush with flat neighbours; car + rivals ride the camber without floating/clipping
- [ ] **Barrier walls**: `Walls: whole track` — cars deflect off walls (never pass through or climb them); walls follow banking and ramps
- [ ] **Race deploy**: auto-seated in the car on the grid → 3-2-1-GO countdown (throttle locked until GO) → race HUD pill top-center (P n/N · LAP · time · BEST)
- [ ] **AI rivals** (3, pace 0.85): grid start, believable corner braking, lap at a pace you can race against; RACE LOST screen if one beats you; results screen with per-lap times + best starred when you win
- [ ] **Car contact**: nose touches when it *looks* like it touches (no visible clip); rear-ending shunts a rival forward; side-swipe knocks them off line and they recover; rivals brake behind you instead of phasing through
- [ ] **Ghost lap**: set a best → blue ghost replays it next lap; `G` (in car) toggles it; ghost survives reload; editing the track retires the old ghost
- [ ] **Checkpoint anti-cheat**: cut across the infield → lap voided with a toast
- [ ] **Ramps/jumps in a race**: Ramp ↑/↓ chain rides cleanly; car gets real air off a jump, lands with suspension squat

## 2. Driving feel (rebuilt this cycle)

- [ ] Braking: S while moving slows with real stopping distance, never snaps into reverse; reverse engages only from a stop
- [ ] Turning at speed: corners widen (understeer) but steering never "bricks"; handbrake (Space) drifts
- [ ] Ramp launch: real ramps throw hard, kerbs/small steps don't moonshot; no clipping into ramp faces at speed or shallow angles
- [ ] Wall scrapes: glancing hits bleed speed; head-on stops with bonk + shake; car can't climb walls onto roofs

## 3. Two-machine multiplayer (needs a second device/person)

- [ ] Host/join via room code; lobby ready-up; characters/names sync
- [ ] Co-op: enemies, kill credit, chat, prop sync (move a prop, both see it)
- [ ] A client disconnect mid-match: no frozen carried props, no ghost player left behind
- [ ] **MP race**: both cross laps, standings update (P n/N), first to finish wins on BOTH screens (winner sees results, other sees RACE LOST with the winner's name)
- [ ] Sketchfab-model level: joiner without a token still loads the host's models

## 4. Editor (reorganized this cycle — fresh-eyes pass)

- [ ] Fresh-eyes tab check: is everything where you'd look first? **Crosshair under HUD**, **Cutscenes under Gameplay**, "Objectives & rules" contents match its subtitle
- [ ] Sketchfab token: shows full input only when empty; "Token saved · change" everywhere after
- [ ] Material section: primitive → full editor; imported model → explanatory note (not hidden)
- [ ] Undo (Ctrl+Z) across: place/move/delete prop, track piece, walls toggle, rules changes
- [ ] Save/load roundtrip: save level file → wipe → import → everything back (incl. track, vehicle tuning, credits list)
- [ ] Share link: `Copy link` → open in incognito → level loads + deploys

## 5. CLAUDE.md's standing visual list (older, spot-check)

- [ ] Floor/wall textures + Poly Haven HDRI sky load and tile correctly
- [ ] AI scene builder (describe a scene → furnishes) — with a Sketchfab or Poly Pizza key
- [ ] Post-FX: bloom/motion blur/vignette/grain sliders visibly work; DoF focuses correctly WITH post-FX on
- [ ] Cinematics: roll/ease/hold/DoF per shot; live camera-preview window tracks while scrubbing
- [ ] Inventory panel + 3D item inspector; pickups (transforms, interact-to-pickup)
- [ ] Credits screen (home + pause): engine libs + this level's asset attributions listed

## 6. Cross-cutting

- [ ] Performance: a busy level (20+ enemies or a full race) holds smooth FPS; no stutter creep over 10+ min (leak check)
- [ ] Alt-tab / focus loss mid-fight and mid-drive: nothing stuck held; audio resumes
- [ ] Mobile: touch joysticks (move/look), drive cluster (gas/brake/boost), buttons reachable; HUD readable
- [ ] Death/respawn, checkpoint respawn (adventure mode), campaign level chaining
- [ ] Console: no red errors during a full session (F12 open while you play)

---

**When you're done:** send me the failures list (or "all pass"). I'll fix in build order of severity.
