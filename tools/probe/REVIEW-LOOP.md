# The AAA review loop

(Capture output lands in `shots/`, which is gitignored — the frames are evidence for a round, not source.)

A round is: **capture → critique → implement → re-capture → re-critique**, and it does not end until a
critic who was shown the frames cold says they would pass as a shipped title.

## Capture

```
node tools/probe/mkprobe.mjs                    # rebuild the probe copy after EVERY breach.html edit
node tools/probe/shot.mjs --top --out shots/rN  # the default level, five poses
node tools/probe/shot-arena.mjs --all --out shots/rN-arena
```

**`--top` is not optional.** This sandbox renders ~1.5 fps under SwiftShader, so the adaptive ladder
(build 1141) reaches its bottom rung within seconds: FXAA only, 66% of native, MSAA and SSAO shed. A frame
captured without pinning is a real frame *for a weak device* and a useless one for judging the ceiling.
Every shot set records the `aa` state it was taken at in its json; if it does not say `MSAA x4`, throw it
away.

`shots.json` / `arenas.json` beside each set record, per frame: the camera position, **what the centre ray
actually hit** (mesh, material, src), the fov, the live exposure, the AA state, the light load, and the
draw/triangle counts. Read WHO before attributing anything to a surface — three separate builds in
`CLAUDE.md` were spent reasoning about a surface that was not in the frame.

The centre-hit reporter filters objects that are not DRAWN, because r149's `Raycaster` ignores the visible
flag on the mesh and on its ancestors alike (build 1267). Without that filter the play grid — hidden by
build 1133 — wins the centre ray and the reporter lies.

## One capture at a time

Six critic agents running headless Chromium in parallel put this 4-core box at **load average 38**, and a
capture launched into that never finished its 90-second boot. Serialise: capture first, hand the frames to
the critics, and let them measure rather than each booting their own browser. Any timing measured on a
saturated box is noise.

## Critique

Critics are **read-only**. They may write under their own `shots/critic-*/` directory and `/tmp`, and they
may create new probe scripts, but they never touch `breach.html`, `tests/` or the shared probe tools —
otherwise two agents race on one file and every measurement afterwards is against an unknown build.

Each critic owns one dimension (rendering, art direction, feel, editor, performance, audio+UI) and must
deliver findings that carry: what a player/creator sees, the mechanism **verified in source** with a line
number, **measured** evidence, what an AAA engine does instead, and a size estimate. A claim that was not
verified in code is a hypothesis and has to say so — `CLAUDE.md` records several confident findings that
died the moment somebody ran the grep.

## Implement

The orchestrator holds the pen. One feature per build, syntax check → `test-202-boot` → full suite →
update stale pins → add a numbered test → bump `BUILD_VERSION` → commit.
