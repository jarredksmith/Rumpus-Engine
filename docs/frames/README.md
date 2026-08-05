# Reference frames

Two frames of the stock level, at a fixed camera, captured at the top quality rung:

    node tools/probe/mkprobe.mjs /tmp/probe-cap
    node tools/probe/shot.mjs --top --only stock-close,stock-wide --out docs/frames --dir /tmp/probe-cap

**They are committed on purpose, at ONE path each, overwritten by every refresh.** `shots/` is gitignored
and this container has rolled back eleven times; a capture that lives only in the working tree is gone by
the next build, and it has twice cost a before/after comparison that a rendering build depended on. Git
holds every prior version at the same path, so `git show <rev>:docs/frames/stock-close.png > /tmp/old.png`
is the A/B reference — and the working tree never carries more than two images.

**Refresh them when a build changes what the frame looks like, in the same commit as the build.** A frame
that is one build stale is worse than none: it will be trusted, and it will be wrong.

**Check the rig before trusting the pixels.** These have been photographed wrong more than once:
- `mkprobe` must stage `img/` or the stock ground and wall textures 404 and `floorMat.map` is null —
  silently. Every frame between builds 1378 and 1382 was judged without them.
- The probe renders at 640x360 and `shot.mjs` at 900x506. Coordinates do not transfer between them.
- A still frame cannot contain a MOTION artifact (specular aliasing, shimmer). Do not ask it to.
- Before believing that a change did nothing, drive a term you know works and check it moves.
