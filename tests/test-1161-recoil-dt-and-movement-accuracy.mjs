// build 1161: three weapon-feel fixes from the review panel, each verified before building.
//
// 1. `recoil *= 0.85` PER FRAME — framerate-dependent: at 144Hz recoil recovered ~2.4x faster than at 60,
//    and a 30fps phone wallowed. The one dt-blindness in a codebase that uses dt everywhere else.
// 2. Movement cost accuracy NOTHING — sprint-jump-360 sniping was pixel-accurate. Bots have paid a
//    run-and-gun penalty since build 933; the player never did. The additive airborne floor is the load-
//    bearing part: rifle and sniper have spread 0.0, and a multiplier of zero is zero.
// 3. Spread sampled as (rand-.5, rand-.5) — a SQUARE in aim space, so a shotgun's corner pellets landed
//    √2 wider than its edge pellets. Now angle + sqrt-radius: uniform over a disc, same max deviation.
import { gameSource, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. framerate-independent decay
{
  assert(/recoil \*= Math\.pow\(0\.85, dt\*60\);/.test(src), 'recoil decay is a half-life in dt, not a per-frame multiplier');
  assert(/muzzle\.intensity \*= Math\.pow\(0\.6, dt\*60\); flashMat\.opacity \*= Math\.pow\(0\.5, dt\*60\);/.test(src),
    '...and so are the muzzle flash and its sprite');
  assert(!/recoil \*= 0\.85;/.test(src), 'the raw per-frame decay is gone');
  // executable: one second of decay must land at the same value at any framerate
  const after = (fps) => { let r = 1; for (let i = 0; i < fps; i++) r *= Math.pow(0.85, (1 / fps) * 60); return r; };
  near(after(30), after(60), 1e-9, '30fps and 60fps agree after one second');
  near(after(144), after(60), 1e-9, '...and 144fps');
  near(after(60), Math.pow(0.85, 60), 1e-9, '...at exactly the value the 60fps tuning always produced');
}

// ---------------------------------------------------------------- 2. movement costs accuracy
{
  assert(/const _hspd = Math\.hypot\(player\.vel\.x, player\.vel\.z\);/.test(src), 'horizontal speed is read at fire time');
  assert(/const _penAdd = \(0\.012\*_mob \+ \(player\.onGround \? 0 : 0\.030\)\) \* \(1 - adsBlend\*0\.6\);/.test(src),
    'airborne adds a spread FLOOR that zero-spread weapons pay too — the anti sprint-jump-sniping term');
  assert(/const spread = w\.spread \* \(1 - adsBlend\*0\.8\) \* _penScale \+ _penAdd;/.test(src),
    'base spread keeps its ADS tightening, scaled and floored by movement');
  // executable: replay the formula across the states that matter
  const S = (wspread, ads, hspd, grounded) => {
    const mob = Math.min(1, hspd / 12);
    const scale = (1 + 1.2 * mob) * (grounded ? 1 : 1.8);
    const add = (0.012 * mob + (grounded ? 0 : 0.030)) * (1 - ads * 0.6);
    return wspread * (1 - ads * 0.8) * scale + add;
  };
  eq(S(0.0, 1, 0, true), 0, 'a standing, aimed sniper is still perfectly accurate — nothing tuned was taken away');
  eq(S(0.08, 0, 0, true), 0.08, 'a standing hip shotgun keeps its exact authored spread');
  assert(S(0.0, 0, 12, false) >= 0.03, 'THE fix: a sprint-jumping sniper now has real spread (' + S(0, 0, 12, false).toFixed(3) + ')');
  assert(S(0.0, 1, 12, false) > 0 && S(0.0, 1, 12, false) < S(0.0, 0, 12, false),
    'ADS mitigates the airborne penalty but never erases it');
  assert(S(0.02, 0, 12, true) > S(0.02, 0, 0, true), 'running widens an SMG');
  assert(S(0.02, 0, 12, false) > S(0.02, 0, 12, true), 'and jumping widens it further');
}

// ---------------------------------------------------------------- 3. circular spread
{
  assert(/const _sa = Math\.random\(\)\*Math\.PI\*2, _sr = Math\.sqrt\(Math\.random\(\)\)\*0\.5\*spread;/.test(src),
    'pellets sample angle + sqrt-radius — uniform over a disc');
  assert(/const sx = Math\.cos\(_sa\)\*_sr, sy = Math\.sin\(_sa\)\*_sr;/.test(src), '...into the same sx/sy the cone math consumes');
  assert(!/const sx = \(Math\.random\(\)-0\.5\)\*spread, sy = \(Math\.random\(\)-0\.5\)\*spread;/.test(src), 'the square sampler is gone');
  // executable: max deviation preserved, corners gone
  let maxR = 0; const spread = 0.08;
  for (let i = 0; i < 20000; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.5 * spread;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    maxR = Math.max(maxR, Math.hypot(x, y));
  }
  assert(maxR <= 0.5 * spread + 1e-12, 'no pellet exceeds the old max deviation (tuned reach unchanged)');
  assert(maxR > 0.45 * spread, '...and the disc is actually filled to its rim');
  // the square sampler provably produced corners past the disc
  let sq = 0; for (let i = 0; i < 20000; i++) { const x = (Math.random() - 0.5) * spread, y = (Math.random() - 0.5) * spread; if (Math.hypot(x, y) > 0.5 * spread) sq++; }
  assert(sq > 2000, 'the old square put ~21% of pellets outside the intended circle (' + (sq / 200).toFixed(1) + '% here)');
}

done('build 1161: recoil and muzzle decay are framerate-independent half-lives, movement and airtime finally cost accuracy (with an additive floor so zero-spread snipers pay it too), and spread is a uniform disc instead of a square — standing-still values byte-identical to the old tuning');
