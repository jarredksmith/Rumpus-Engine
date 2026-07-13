# RUMPUS ENGINE

*(formerly BREACH)*

**A single-file browser game studio — build worlds, play them (FPS, driving & racing, top-down, side-scroll), and share them with peer-to-peer multiplayer and a community level library.**
Everything — engine glue, editor, netcode, assets pipeline — ships in one `breach.html`. No build step, no server.

### ▶ [Play now](https://jarredksmith.github.io/breach/breach.html)

## What's inside

- **Arena FPS** — wave combat, seven objective types (eliminate, survival, extraction, defend, destroy, escort, puzzle), upgrades, bots
- **Racing** — snap-together track builder (curves, banking, ramps, barrier walls), race objective with AI rivals, ghost laps, lap timing, standing starts, car-to-car contact
- **Driving** — physics-informed arcade handling: lateral-G cornering, suspension, ballistic jumps, per-vehicle tuning
- **Level editor** — in-browser: terrain sculpting, free model search (Poly Pizza / Sketchfab), signals & locks, NPCs & dialogue, cutscene editor, campaigns
- **Multiplayer** — PeerJS/WebRTC co-op and PvP with room codes; levels sync to joiners automatically, including multiplayer racing
- **Sharing** — a whole level compressed into a URL; challenge links with score targets
- **Community library** — an in-game gallery of player-built levels; submit yours via a GitHub issue and a bot publishes it on approval
- **Help & tutorials** — in-game guide with one-click loadable example projects

## Controls (quick reference)

|  | |
|---|---|
| Move / look | `WASD` + mouse · `Shift` run · `Space` jump · `C` slide |
| Combat | click shoot · `R` reload · `F` grenade · `V` melee |
| World | `E` interact · `G` grab/carry/throw · `L` flashlight |
| Driving | `E` enter/exit · `W/S` gas/brake · `A/D` steer · `Space` handbrake · `Shift` boost |
| Editor | `P` open/play · `F` fly · `T` top view · `Ctrl+Z` undo |

Tutorials: **Help & tutorials** on the home menu. Full reference: **[Field manual](https://jarredksmith.github.io/breach/breach-help.html)** — every editor tab, section and slider documented.

## Tech

[three.js](https://threejs.org) r149 · [Rapier](https://rapier.rs) physics · [PeerJS](https://peerjs.com) networking — single HTML file, ~27k lines.
Asset attributions are collected per level and shown on the in-game **Credits** screen.

## Development

```
cd tests
node run-all.mjs        # ~590 test harnesses (a few require the `three` npm package)
```

The repo root `breach.html` is the entire game; `tests/` is a Node harness that extracts and executes game functions directly. See `CLAUDE.md` for the build workflow and `docs/QA-CHECKLIST.md` for the release browser pass.

## License & credits

Code © Jarred Smith. Built on MIT/Apache-2.0 libraries; user-added models/sounds come from Poly Pizza, Sketchfab, Poly Haven and Freesound under their respective Creative-Commons licenses — see the in-game Credits screen for the per-level list.
