import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 629: fix "shoot-to-light fuse" explosives. The Fuse is now authored under Explosive (NOT gated behind
// "On fire"), so a fused barrel is no longer pre-lit at load and detonating on its own. And the FIRST shot LIGHTS
// it (it survives) so the fuse becomes the timer — "shoot the barrel, watch it catch, run" works as intended.

// --- editor: Fuse lives with Explosive, and On-fire no longer auto-arms a fuse ---
assert(/mkSlider\('Fuse',0,15,0\.5,\(sel\.userData\.fireFuse!=null\?sel\.userData\.fireFuse:0\)/.test(src), 'Fuse slider is under Explosive, default 0 (= blows instantly when destroyed)');
const onFireToggle = src.match(/frcb\.onchange=\(\)=>\{[^\n]*\};/)[0];
assert(!/fireFuse/.test(onFireToggle), 'toggling On-fire no longer sets a fuse (so it cannot pre-light a timed bomb at load)');

// --- damageProp: light-and-survive on the first shot ---
const dp = extractFunction('damageProp');
assert(/igniteProp\(obj\);[\s\S]*?return false;\s*\}\s*if\(_brk\) obj\.userData\.hp -= dmg;/.test(dp), 'the igniting shot returns before applying the killing damage');

// --- executable: shooting a fused explosive lights it and it survives; a follow-up shot pops it ---
const deps = `
  let igniteCalls=0, shatterCalls=0;
  function igniteProp(o){ igniteCalls++; o.userData._fireIgnited=true; }
  function shatterProp(){ shatterCalls++; }
  function defaultHpFor(){ return 30; }
  const performance={ now:()=>0 };
  function playPropHitSound(){ return false; }   /* build 1305: the per-prop impact sound; this harness owns the ignite/shatter branches */
`;
const api = new Function(deps + '\n' + extractFunction('damageProp') + '\n return { damageProp, counts:()=>[igniteCalls, shatterCalls] };')();
const mkObj=(o)=>({ userData:Object.assign({ phys:{}, breakable:true, hp:30 }, o), traverse:()=>{} });

// a fused barrel, one big shot:
const barrel = mkObj({ explosive:true, fireFuse:3 });
const broke1 = api.damageProp(barrel, 999, null, null, 6, 1);
let [ig, sh] = api.counts();
eq(ig, 1, 'the shot LIGHTS the fused barrel');
eq(sh, 0, 'it is NOT destroyed by that shot (the fuse will blow it)');
eq(barrel.userData.hp, 30, 'the igniting shot deals no killing damage');
assert(broke1 === false, 'damageProp reports the prop survived');

// a second shot, now that it's lit, can pop it early:
const broke2 = api.damageProp(barrel, 999, null, null, 6, 1);
[ig, sh] = api.counts();
eq(sh, 1, 'a follow-up shot on the burning barrel detonates it early');
assert(broke2 === true, 'the early pop reports destroyed');

// a NON-fused explosive still just shatters when shot to 0 hp (unchanged behavior):
const plain = mkObj({ explosive:true, fireFuse:0 });
api.damageProp(plain, 999, null, null, 6, 1);
[ig, sh] = api.counts();
eq(sh, 2, 'a fuse-less explosive shot to 0 hp shatters/detonates immediately as before');

done('shoot-to-light fused explosives: authorable without pre-lighting + survive the igniting shot (build 629)');
