// (build 824) The three "physics feels off" reports, fixed at the root:
//  1. NO SOLID THROW off ramps — while airborne, driveStep kept applying throttle/decel and engine braking bled speed,
//     and gravity was 0.85x. Now: ballistic flight — momentum carries (2%/s aero drag only), FULL gravity, near-zero
//     tire grip in the air (travel direction locked; heading still swings for air control).
//  2. SMALL BUMPS LAUNCHED THE CAR — launch fired off the one-frame climb RATE: a 0.3m kerb at 60fps reads as
//     climb 18 m/s -> full launch. Now launch = ramp SLOPE x forward speed (the true ballistic continuation), with a
//     ~0.2s ramp memory so the lip frame (front sample past the edge) still throws hard.
//  3. ANGLE CLIPPING — wall rays covered only ±0.8 of the width (corners exposed) and were axis-only, so a diagonal
//     approach could thread a corner. Now: 5 rays across the full width + one diagonal ray along the true motion.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
const du = extractFunction('driveUpdate');

// --- 1. ballistic flight ---
assert(/const _airb = \(o\.userData\._carGrounded===false\);/.test(du), 'airborne state gates the tire physics');
assert(/const r = _airb \? \{ speed:\(o\.userData\.carSpeed\|\|0\)\*\(1-0\.02\*dt\), yawDelta:0 \}/.test(du), 'in the air momentum carries — no engine, only 2%/s aero drag');
assert(/if\(!_airb && Math\.abs\(throttle\)<0\.01/.test(du), 'engine braking needs wheels on the ground');
assert(/if\(_airb\) grip=0\.02;/.test(du), 'near-zero tire grip in flight (travel locked; heading = air control)');
assert(/if\(!_airb && handbrake && Math\.abs\(r\.speed\)>0\.1\)/.test(du), 'the handbrake cannot slow a flying car');
assert(/_vy -= GRAV\*\(_airb\?1:0\.85\)\*dt;/.test(du), 'FULL gravity in flight — a heavy arc, not a float');

// --- 2. slope-based launch ---
assert(/const _slope=\(gF-gB\)\/\(2\*_hd\);/.test(du), 'slope measured from the front/back ground samples');
assert(/const _launch=\(_slope>0\.06 && _slope<1\.2 && Math\.abs\(r\.speed\)>2\) \? Math\.min\(_slope\*Math\.abs\(r\.speed\), 18\)\*_lm : 0;/.test(du), 'launch = slope x speed; wall faces (slope>1.2) and crawling never launch');
assert(/_vy = \(_slope < -0\.05\) \? Math\.max\(_launch, o\.userData\._rampVy\|\|0\) : _launch;/.test(du), 'at the crest/lip the remembered ramp vy throws; on the ramp it rides continuously');
assert(/o\.userData\._rampVy = Math\.max\(_launch, \(o\.userData\._rampVy\|\|0\)\*\(1-Math\.min\(1,dt\*6\)\)\);/.test(du), 'the ramp memory decays in ~0.2s (no phantom hops later)');
// executable: the kerb-vs-ramp distinction the old climb-rate model got wrong
{
  const launch=(slope,speed)=>(slope>0.06 && slope<1.2 && Math.abs(speed)>2)?Math.min(slope*Math.abs(speed),18):0;
  // a 0.3m kerb step: slope over a ~4m wheelbase = 0.075 -> tiny pop instead of the old FULL launch
  near(launch(0.075, 20), 1.5, 1e-9, 'a kerb at speed gives a 1.5 m/s nudge, not a 15 m/s moonshot');
  // a 30-degree ramp at 20 m/s: slope 0.58 -> vy 11.6 — a real jump
  near(launch(0.58, 20), 11.6, 1e-6, 'a real ramp throws hard (vy = slope x speed)');
  eq(launch(2.5, 20), 0, 'a wall face never launches');
  eq(launch(0.58, 1), 0, 'crawling off a ramp just drops');
}

// --- 3. wall coverage ---
const cw = extractFunction('_carWall');
assert(/for\(const off of \[-span\*0\.95, -span\*0\.45, 0, span\*0\.45, span\*0\.95\]\)/.test(cw), '5 rays cover the full width including the corners');
assert(/if\(mvx!==0 && mvz!==0\)\{ const _dl=Math\.hypot\(mvx,mvz\); if\(_carWall\(o, mvx\/_dl, mvz\/_dl, _dl, _h\)\)\{ mvx=0; mvz=0; \} \}/.test(du), 'a diagonal ray closes the corner-threading gap');

done('build 824: ballistic air + slope-based launch + corner-proof walls');
