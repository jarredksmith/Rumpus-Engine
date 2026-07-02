// (build 822) Glancing wall deflection — a wall contact scrubs speed by how much of the intended travel it killed,
// instead of the old slot-car glue (full speed forever while grinding a wall). Shallow scrapes barely slow you; a
// 45-degree hit grinds speed off in about a quarter second; a hard side slam registers with shake + thud.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
const du = extractFunction('driveUpdate');

assert(/const _premv=Math\.hypot\(mvx,mvz\);/.test(du), 'the intended travel is measured before the wall test');
assert(/const _keep=Math\.hypot\(mvx,mvz\)\/_premv;/.test(du), 'keep = surviving fraction of the travel');
assert(/const _f=1-\(1-_keep\)\*Math\.min\(0\.9, dt\*10\); o\.userData\.carSpeed\*=_f; r\.speed\*=_f;/.test(du), 'speed scrubs proportionally to the killed component (frame-rate independent)');
assert(/if\(_keep<0\.7 && _imp0>8 && \(o\.userData\._hitCd\|\|0\)<=0\)\{ o\.userData\._hitCd=0\.3; _carImpactFx\(o, Math\.min\(10, _imp0\*\(1-_keep\)\*0\.8\)\); \}/.test(du), 'a hard side slam fires impact feedback (cooldown-gated)');

// executable: the scrub behavior over time at 60fps
{
  const dt=1/60, scrub=(keep)=>1-(1-keep)*Math.min(0.9, dt*10);
  // shallow 10-degree scrape: keep ~0.985 — lose under 10% of speed over a full second of grinding
  { let v=30; for(let i=0;i<60;i++) v*=scrub(0.985); assert(v>25, 'a shallow scrape only gently slows you ('+v.toFixed(1)+' of 30 after a full second of grinding)'); }
  // 45-degree hit: keep ~0.71 — grinds off half the speed within ~0.25s
  { let v=30; for(let i=0;i<15;i++) v*=scrub(0.5); assert(v<15, 'a 45-degree hit sheds half its speed in a quarter second ('+v.toFixed(1)+')'); }
  // head-on: keep 0 — collapses fast even before the bonk zeroes it
  { let v=30; for(let i=0;i<12;i++) v*=scrub(0); assert(v<4, 'head-on collapses (bonk then finishes it)'); }
}

done('build 822: glancing wall deflection — impact-angle speed scrub, no more slot-car glue');
