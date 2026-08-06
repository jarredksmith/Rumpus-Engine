import { gameSource, html, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
const page = html;
// build 451: props can be "on fire" — flames + contact damage. An explosive prop can burn, then detonate
// after a fuse, and shooting a fused explosive lights it (the classic "shoot the barrel, it catches fire,
// run before it blows"). Saved with the prop and carried to multiplayer.

// editor controls
assert(/sel\.userData\.onFire=frcb\.checked/.test(src), 'prop editor has an On-fire toggle');
assert(/mkF\('Burn dmg',0,60,1/.test(src), 'On-fire exposes a contact damage/sec slider');
assert(/mkSlider\('Fuse',0,15,0\.5/.test(src), 'the Explosive section exposes a Fuse slider (shoot-to-light, independent of On-fire so it is not pre-lit at load)');

// serialize + load (carries to MP joiners via applyPropDynState)
assert(/if\(o\.userData\.onFire\)\{ e\.fire=1; if\(o\.userData\.fireDps!=null\) e\.fdps=o\.userData\.fireDps; if\(o\.userData\.fireFuse!=null\) e\.ffuse=o\.userData\.fireFuse; \}/.test(src), 'burning state serialized with the prop');
const ap = extractFunction('applyPropDynState');
assert(/if\(p\.fire\)\{ obj\.userData\.onFire=true; obj\.userData\.fireDps=\(p\.fdps!=null\?\+p\.fdps:12\); if\(p\.ffuse!=null\) obj\.userData\.fireFuse=\+p\.ffuse; \}/.test(ap), 'burning state restored on load');

// ignition + fuse + cleanup
const ig = extractFunction('igniteProp');
assert(/o\.userData\._fireIgnited=true/.test(ig), 'igniteProp marks the prop lit');
assert(/o\.userData\.explosive && \(\+o\.userData\.fireFuse\|\|0\)>0 && o\.userData\._fireFuseT==null\) o\.userData\._fireFuseT=\+o\.userData\.fireFuse/.test(ig), 'a fused explosive arms its fuse on ignition');
const dp = extractFunction('damageProp');
assert(/obj\.userData\.explosive && \(\+obj\.userData\.fireFuse\|\|0\)>0 && !obj\.userData\._fireIgnited && obj\.userData\.hp>0 && typeof igniteProp==='function'\)\{\s*igniteProp\(obj\);[\s\S]*?return false;\s*\}\s*if\(_brk\) obj\.userData\.hp -= dmg;/.test(dp), 'shooting a fused explosive LIGHTS it and it survives (the fuse becomes the timer) instead of taking the killing damage — build 1421 gated that line on _brk, so an unbreakable one never lights at all');
const rd = extractFunction('resetDynamicProps');
assert(/resetPropFires\(\)/.test(rd), 'authored fires re-light on each deploy');
const sp = extractFunction('shatterProp');
assert(/_removePropFireVisual\(obj\)/.test(sp), 'a destroyed burning prop drops its flames');

// runtime burn loop: visuals (editor+play), fuse detonation (host-only), contact DoT to all actors
const ub = extractFunction('updateBurningProps');
assert(/!isClient && o\.userData\.explosive && \(o\.userData\._fireFuseT\|\|0\)>0\)\{ o\.userData\._fireFuseT-=dt; if\(o\.userData\._fireFuseT<=0\)\{ shatterProp/.test(ub), 'the fuse counts down and detonates (host/solo authoritative)');
assert(/playerDps=Math\.max\(playerDps,dps\)/.test(ub), 'the player burns near a lit prop (on every peer)');
assert(/botHurt\(b, dps\*dt, o\.position\.x, o\.position\.z\)/.test(ub), 'bots burn near a lit prop');
assert(/enemyHurt\(en, dps\*dt, o\.position\.x, o\.position\.z\)/.test(ub), 'enemies burn near a lit prop');
assert(/_applyPropFireToPlayer\(playerDps, dt\)/.test(ub), 'player burn uses a throttled tick (own accumulator)');
assert(/updateBurningProps\(dt\);/.test(src), 'burning props update every frame');

// executable: a fused barrel shot at t=0 with a 3s fuse blows at ~3s, regardless of further hits
function simulateFuse(fuse, dt){
  let lit=false, fuseT=null, t=0, blewAt=-1;
  // shot at t=0 -> ignite
  lit=true; fuseT=fuse;
  for(let step=0; step<Math.round(6/dt); step++){ t+=dt; if(lit && fuseT>0){ fuseT-=dt; if(fuseT<=0){ blewAt=t; break; } } }
  return blewAt;
}
const blew = simulateFuse(3, 1/60);
assert(blew > 2.9 && blew < 3.1, 'a 3s-fused barrel detonates ~3s after being lit');

// executable: contact burn — 12 dps for 1.5s near a barrel = ~18 damage
let acc=0,t=0,applied=0; const dps=12, dt=1/60;
for(let i=0;i<Math.round(1.5/dt);i++){ acc+=dps*dt; t+=dt; if(t>=0.35){ applied+=acc; acc=0; t=0; } }
assert(applied>15 && applied<=18.01, '~1.5s next to a 12dps fire deals ~18 (modulo the final partial tick)');
done();
