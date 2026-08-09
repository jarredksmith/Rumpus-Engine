// build 1459 (SCOPING RUN) — is the shadow dirty test worth narrowing, and by how much?
//
// The performance audit says `_shDirty` is true whenever ANY enemy is alive, so a wave shooter re-renders
// a 4096 near map and a 2048 far map every frame. That is verified at the line. What is NOT established
// is the size of the win, and the win depends entirely on how much of a real level lies OUTSIDE the
// cascade the maps actually cover.
//
// Both cascades share ONE dirty counter (`_shadowDirtyFrames` -> `renderer.shadowMap.needsUpdate`), so a
// mover inside the FAR volume genuinely needs the refresh. The honest test is therefore against the far
// extent, not the near one the audit suggested — and this run measures whether that leaves anything.
//
// Measure first. If the answer is "almost nothing falls outside", this build should not happen and the
// queue should move on, which is a legitimate outcome.
import { withGame } from './driver.mjs';

const P = (s) => `(function(){ ${s} })()`;

await withGame(async (probe) => {
  const say = (k, v) => console.log(String(k).padEnd(30), JSON.stringify(v));

  const r = await probe(P(`
    const R = {};
    paused = true; _tabHidden = true;
    player.pos.set(0, 2.9, 0); camera.position.set(0, 2.9, 0);
    camera.rotation.set(-0.1, 0, 0, 'YXZ'); camera.updateMatrixWorld(true);
    _fitSunShadow(camera);

    R.arena = ARENA;
    R.shadowDist = worldCfg.shadowDist;
    R.nearHalfExtent = moon.shadow.camera.right;
    R.farHalfExtent = moonFar ? moonFar.shadow.camera.right : null;
    R.nearMap = moon.shadow.mapSize.x;
    R.farMap = moonFar ? moonFar.shadow.mapSize.x : null;
    R.focus = [+_sunTarget.position.x.toFixed(1), +_sunTarget.position.z.toFixed(1)];

    /* How much of the playable area does the FAR cascade actually cover? The volume is a box of
       half-extent F centred on the focus, measured along the light's ground axes. */
    const F = moonFar ? moonFar.shadow.camera.right : moon.shadow.camera.right;
    const ax = { x: -moon.position.z, z: moon.position.x };
    const L = Math.hypot(ax.x, ax.z) || 1; ax.x /= L; ax.z /= L;
    const ay = { x: -ax.z, z: ax.x };
    const fx = _sunTarget.position.x, fz = _sunTarget.position.z;
    const inVol = (x, z) => {
      const dx = x - fx, dz = z - fz;
      return Math.abs(dx*ax.x + dz*ax.z) <= F && Math.abs(dx*ay.x + dz*ay.z) <= F;
    };

    /* sample the arena on a grid */
    let inside = 0, total = 0;
    for(let x = -ARENA; x <= ARENA; x += ARENA/20)
      for(let z = -ARENA; z <= ARENA; z += ARENA/20){ total++; if(inVol(x, z)) inside++; }
    R.arenaCoverage = { inside, total, pct: +(100*inside/total).toFixed(1) };

    /* and where a WAVE actually stands: build 1372 stages the ring 42-63 m from the player */
    let ringIn = 0, ringN = 0;
    for(let a = 0; a < 64; a++){
      const ang = a/64 * Math.PI * 2;
      for(const d of [42, 50, 63]){ ringN++; if(inVol(player.pos.x + Math.cos(ang)*d, player.pos.z + Math.sin(ang)*d)) ringIn++; }
    }
    R.waveRing = { inside: ringIn, of: ringN, pct: +(100*ringIn/ringN).toFixed(1) };

    /* the same question at the biggest arena a creator can author */
    R.bigArena = {};
    for(const A of [70, 200, 500, 1000, 2000]){
      let ins = 0, tot = 0;
      for(let x = -A; x <= A; x += A/20) for(let z = -A; z <= A; z += A/20){ tot++; if(inVol(x, z)) ins++; }
      R.bigArena['arena' + A] = +(100*ins/tot).toFixed(1);
    }
    return R;
  `));

  say('arena half-size', r.arena);
  say('shadowDist (near E)', r.shadowDist);
  say('near cascade half-extent', r.nearHalfExtent);
  say('far cascade half-extent', r.farHalfExtent);
  say('map sizes near/far', [r.nearMap, r.farMap]);
  say('focus', r.focus);
  console.log('');
  say('THIS arena inside far vol', r.arenaCoverage);
  say('a build-1372 wave ring', r.waveRing);
  say('coverage % by arena size', r.bigArena);

  console.log('\n  Read: the win is whatever lies OUTSIDE the far cascade. A wave ring at ' +
              r.waveRing.pct + '% inside means a volume test buys ' + (100 - r.waveRing.pct).toFixed(1) +
              '% of wave frames on this level size.');
}, { settleMs: 3000 });
