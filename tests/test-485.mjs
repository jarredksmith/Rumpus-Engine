import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 632: kill the explosion/rocket stutter. (1) Each blast used to new+add then remove a PointLight; changing
// the scene's light COUNT forces three.js to recompile every lit material — a hitch per blast. Now blast lights
// are pooled (created together once, count never changes). (2) Cosmetic debris dropped CCD (heavy on up to 90 bodies).

// --- wiring ---
assert(/function _blastLightAt\(pos, R\)/.test(src), 'pooled blast-light helper exists');
assert(/const bl=_blastLightAt\(pos, R\);/.test(src), 'explodeAt uses the pooled light');
assert(/const bl = _blastLightAt\(pos, R\);/.test(src), 'explodeGrenade uses the pooled light');
assert(/if\(e\.light\) e\.light\.intensity = 0; explosions\.splice/.test(src), 'a finished blast just dims its pooled light (kept in the scene)');
assert(!/scene\.remove\(e\.light\)/.test(src), 'the per-blast scene.remove(light) — the recompile trigger — is gone');
const sf = extractFunction('spawnFragments');
assert(!/setCcdEnabled/.test(sf), 'cosmetic debris no longer enables CCD');

// --- executable: the pool is created ONCE and reused, so the scene light count never grows past the pool ---
const deps = `
  let added=0;
  const scene={ add:()=>{ added++; } };
  function PL(c,i,d){ this.color=c; this.intensity=i; this.distance=d; this.position={ copy:(p)=>{ this.px=p.x; } }; }
  const THREE={ PointLight:PL };
  const _blastLightPool=[]; let _blastLightN=0;
`;
const api = new Function(deps + '\n' + extractFunction('_blastLightAt') + '\n return { at:_blastLightAt, pool:()=>_blastLightPool, added:()=>added };')();

const L1 = api.at({x:1,y:2,z:3}, 5);
eq(api.pool().length, 6, 'first blast creates the whole pool at once');
eq(api.added(), 6, 'all 6 lights are added to the scene together (count fixed up front)');
eq(L1.intensity, 30, 'the blast light is lit');
eq(L1.distance, Math.max(12, 5*2.5), 'distance scales with the blast radius');

for(let i=0;i<10;i++) api.at({x:0,y:0,z:0}, 8);   // ten more blasts
eq(api.pool().length, 6, 'later blasts reuse the pool — light count never grows');
eq(api.added(), 6, 'no further scene.add (so no shader recompile)');
const L2 = api.at({x:0,y:0,z:0}, 20);
eq(L2.distance, Math.max(12, 20*2.5), 'a reused light re-takes the new blast radius (a uniform change, no recompile)');

done('explosion stutter: pooled blast lights (fixed light count) + no CCD on debris (build 632)');
