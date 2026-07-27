# Images the marketing pages expect

Save these into this folder with **exactly these filenames**. Until a file exists, the page removes that
figure rather than showing a broken image — so nothing looks wrong, you just lose the visual.

Aim for **1600×900** (16:9) JPEGs, quality ~80, ideally under 300 KB each. Everything is cropped to 16:9
with `object-fit: cover`, so a 16:9 source needs no cropping at all.

| File | Which of your screenshots | Used where |
|---|---|---|
| `hero.jpg` | **161257** (racing, monster truck) or **160820** (torch-lit cinematics) | Full-bleed behind the homepage headline |
| `editor.jpg` | **154606** (gizmo + model browser) | "Place it, don't program it" |
| `cinematics.jpg` | **161043** (cinematics builder, camera path) | "Cutscenes with real camera control" |
| `racing.jpg` | **161257** (racing) — or **161213** if hero uses racing | "Five genres, one editor" |
| `shot-enemies.jpg` | **161213** (ENEMIES & BOTS, burning car) | Gallery |
| `shot-materials.jpg` | **161308** (material spheres on terrain) | Gallery |
| `shot-interior.jpg` | **161126** (interior, checkered floor) | Gallery |
| `shot-fps.jpg` | **161355** (FPS view with crate) | Gallery |
| `social-card.jpg` | **133816** (blue "BUILD IT · BREAK IT · SHARE IT" card) | Link previews on every page |

## Notes

**The hero image wants to be dark or moody.** It sits behind white text at 42% opacity with a gradient over
it. A bright, busy shot will fight the headline. If your pick is too light, lower `.hero .bg img{ opacity }`
in `rumpus-site.css`.

**Don't use the caption-baked shots for the editorial rows.** Three of your screenshots have marketing text
burned into them (CINEMATICS BUILDER, ENEMIES & BOTS, FULL RACING GAMEPLAY). Beside a headline that says the
same thing they read as duplicated. They work well in the gallery, where the image carries its own label, and
they're excellent as social/OG cards.

**`social-card.jpg` should be 1200×630.** That's the size Facebook, X, Discord, Slack and LinkedIn crop to.
The blue logo card is close to the right shape already. This one file controls how every page looks when
anyone pastes a link — it's the highest-leverage image here.

**The logo** (`RumpusEngine.svg`) is white-only, so it only works on dark backgrounds. That's fine for this
site; if you ever need it on light, you'll want a dark variant.

## Video

The three YouTube videos are embedded on the homepage as click-to-play. Only a thumbnail loads up front — the
YouTube player is injected when someone actually clicks, which keeps roughly a megabyte of third-party script
per video off the initial page load. Thumbnails come from `i.ytimg.com`; if an ad-blocker blocks that host
the panel and play button still work.
