# Images the marketing pages expect

Save these into this folder with **exactly these filenames**. Until a file exists, the page removes that
figure rather than showing a broken image — so nothing looks wrong, you just lose the visual. That means you
can add them a few at a time and upload whenever you like.

Aim for **1600×900** (16:9) JPEGs, quality ~80, ideally under 300 KB each. Everything is cropped to 16:9
with `object-fit: cover`, so a 16:9 source needs no cropping at all. The one exception is `social-card.jpg`
— see the note at the bottom.

---

## Priority 1 — the nine the homepage needs

These are the ones you already have screenshots for. Nothing else matters until these are in.

| File | Which of your screenshots | Used where |
|---|---|---|
| `social-card.jpg` | **133816** (blue "BUILD IT · BREAK IT · SHARE IT" card) | Link previews on **every** page — highest leverage file here |
| `hero.jpg` | **161257** (racing, monster truck) or **160820** (torch-lit cinematics) | Homepage headline backdrop, FAQ headline backdrop |
| `editor.jpg` | **154606** (gizmo + model browser) | Homepage "Place it, don't program it", no-code step 2, /compare/ backdrop |
| `cinematics.jpg` | **161043** (cinematics builder, camera path) | Homepage "Cutscenes with real camera control", Story card |
| `racing.jpg` | **161257** (racing) — or **161213** if hero uses racing | Homepage "Five genres, one editor", Racing card |
| `shot-enemies.jpg` | **161213** (ENEMIES & BOTS, burning car) | Homepage gallery |
| `shot-materials.jpg` | **161308** (material spheres on terrain) | Homepage gallery |
| `shot-interior.jpg` | **161126** (interior, checkered floor) | Homepage gallery, Campaign card |
| `shot-fps.jpg` | **161355** (FPS view with crate) | Homepage gallery, Shooter card |

---

## Priority 2 — new grabs for the interior pages

These don't exist yet. Each one is a specific, quick capture. Roughly in order of value:

| File | What to capture | Used on |
|---|---|---|
| `logic-graph.jpg` | The node graph with a real chain wired up — an event node on the left connected to two or three outcome nodes. Busy enough to look capable, not so busy it's soup. | **/make-a-game-without-coding/** headline backdrop **and** its "Logic graph" card |
| `browser-chrome.jpg` | The engine running **with the browser's address bar and tabs visible**. This is the only shot on the site that proves "it runs in a browser" at a glance — don't crop the chrome off. | **/browser-game-engine/** headline backdrop |
| `trigger-volume.jpg` | A trigger volume selected in the editor — the wireframe box visible in the world, its settings panel open beside it. | /make-a-game-without-coding/ |
| `variables.jpg` | The variables panel with several named values in it. Real names beat `var1`, `var2`. | /make-a-game-without-coding/ |
| `dialogue.jpg` | The dialogue editor with a few NPC lines and at least one branching reply visible. | /make-a-game-without-coding/ |
| `share-link.jpg` | The share panel with a level packed into a link. Fine to use a real one — share links are public by design. | /make-a-game-without-coding/ step 6 |
| `genre-topdown.jpg` | Gameplay from the top-down twin-stick camera. | /browser-game-engine/ genre cards |
| `genre-sidescroll.jpg` | Gameplay from the side-scroll camera, ideally with 3D scenery visible behind the lane. | /browser-game-engine/ genre cards |
| `physics.jpg` | Physics caught mid-event — props toppling, a ragdoll falling, a vehicle mid-collision. Motion is the point; a tidy scene doesn't sell it. | /browser-game-engine/ |
| `mobile.jpg` | The engine on an actual phone, **on-screen touch controls visible**. A photo of a phone or a device-frame mockup both work — it just has to read as a phone. | /faq/ "Running it" |
| `community.jpg` | The in-game community library, listing levels other people published. | /faq/ "Sharing and publishing" |
| `model-search.jpg` | The in-editor model search with results showing. | /faq/ "Building games" |
| `animation-editor.jpg` | The animation editor with a rigged character and its keyframe timeline. | /faq/ "Building games" |
| `showcase.jpg` | Your single best-looking finished level. This one sits under "Where Rumpus Engine is the right choice" and is doing persuasion, not explanation — pick the prettiest thing you've built. | /compare/ |
| `multiplayer.jpg` | Two players visible in the same level. A split screen of two machines works, or one player watching another's avatar. | /compare/ |

---

## Notes

**Headline backdrops want to be dark or moody.** `hero.jpg`, `browser-chrome.jpg`, `logic-graph.jpg` and
`editor.jpg` all sit behind white headline text at 42% opacity with a gradient over them. A bright, busy shot
fights the headline. If one of your picks is too light, lower `.hero .bg img{ opacity }` in `rumpus-site.css`.

**Don't use the caption-baked shots for the editorial rows.** Three of your screenshots have marketing text
burned into them (CINEMATICS BUILDER, ENEMIES & BOTS, FULL RACING GAMEPLAY). Beside a headline that says the
same thing they read as duplicated. They work well in the gallery, where the image carries its own label, and
they're excellent as social/OG cards.

**UI shots need to be legible at half size.** The card and figure images render around 500–560 px wide on a
desktop. If a panel's labels are unreadable at that size, zoom the browser to 125% before you capture, or
crop tight to just the panel rather than showing the whole editor.

**`social-card.jpg` should be 1200×630**, not 16:9. That's the size Facebook, X, Discord, Slack and LinkedIn
crop to. The blue logo card is close to the right shape already. This one file controls how every page looks
when anyone pastes a link — it's the highest-leverage image here.

**The logo** (`RumpusEngine.svg`) is white-only, so it only works on dark backgrounds. That's fine for this
site; if you ever need it on light, you'll want a dark variant.

## Video

The three YouTube videos are embedded on the homepage as click-to-play. Only a thumbnail loads up front — the
YouTube player is injected when someone actually clicks, which keeps roughly a megabyte of third-party script
per video off the initial page load. Thumbnails come from `i.ytimg.com`; if an ad-blocker blocks that host
the panel and play button still work.
