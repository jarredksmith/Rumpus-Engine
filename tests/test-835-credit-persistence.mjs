// (build 835) CREDIT PERSISTENCE — the release-blocking licensing gap. Placed props always persisted their own
// attribution (att), but the 12 creditAsset() slots — enemy / pickup / chest / coin / weapon-attachment /
// inventory models, turret models and Freesound audio — lived in a SESSION-ONLY Set: publish or reload a level
// and those CC attributions silently vanished. Now the registry is serialized with the level (credits:[...]),
// re-seeded by both level loaders AND the boot path, and the credits screen keeps listing them. Also adds the
// missing Google Fonts (SIL OFL 1.1) line to the library credits.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// --- serialization: the registry ships with the level (capped + string-coerced, omitted when empty) ---
assert(/credits: \(typeof assetCredits!=='undefined' && assetCredits\.size\) \? \[\.\.\.assetCredits\]\.slice\(0,200\)\.map\(s=>String\(s\)\.slice\(0,240\)\) : undefined,/.test(src), 'serializeLevel writes the credit registry');

// --- both level loaders + the boot path re-seed it ---
{
  const m=src.match(/if\(Array\.isArray\(level\.credits\) && typeof creditAsset==='function'\) level\.credits\.forEach\(c=>creditAsset\(String\(c\)\)\);/g);
  assert(m && m.length===2, 'both level loaders restore credits (found '+(m?m.length:0)+')');
}
assert(/if\(savedLevel && Array\.isArray\(savedLevel\.credits\)\) savedLevel\.credits\.forEach\(c=>creditAsset\(String\(c\)\)\);/.test(src), 'the boot path seeds credits from the saved level');

// --- fonts are credited as a shipped dependency ---
assert(/Google Fonts \(Rajdhani, Orbitron, JetBrains Mono \+ the HUD faces\)/.test(src) && /SIL OFL 1\.1/.test(src), 'the HUD font stack is in LIB_CREDITS');

// --- the credits screen still renders all three sections + per-level assets ---
assert(/ENGINE &amp; LIBRARIES/.test(src) && /ASSET SOURCES/.test(src) && /ASSETS IN THIS LEVEL/.test(src), 'credits screen sections intact');
assert(/const crb=document\.getElementById\('creditsBtn'\); if\(crb\) crb\.onclick=openCredits;/.test(src), 'credits reachable from the home menu');
assert(/const pc=document\.getElementById\('pauseCredits'\); if\(pc\) pc\.onclick=openCredits;/.test(src), 'credits reachable from the pause menu');

// --- executable: register -> serialize-shape -> reload round trip using the real functions ---
{
  const block = "const assetCredits = new Set();\n"
    + extractFunction('creditAsset') + '\n'
    + extractFunction('collectLevelCredits') + '\n';
  const env = new Function('"use strict";'
    + 'const propModels=[{userData:{attribution:"Crate by Bob [CC-BY] — via Poly Pizza"}}];\n'
    + block
    + `return { creditAsset, collectLevelCredits,
        dump:()=>[...assetCredits],
        size:()=>assetCredits.size };`)();
  env.creditAsset('Zombie by Ann [CC-BY] — via Sketchfab');
  env.creditAsset('  Zombie by Ann [CC-BY] — via Sketchfab  ');   // dupes + whitespace collapse
  env.creditAsset('Engine loop by cj [CC0] — via Freesound');
  env.creditAsset(''); env.creditAsset(null);
  eq(env.size(), 2, 'registry de-dupes and ignores empties');
  const all=env.collectLevelCredits();
  eq(all.length, 3, 'screen list = prop attributions + registry');
  assert(all.includes('Crate by Bob [CC-BY] — via Poly Pizza'), 'prop credits still collected');
  // the serialized shape (what a published level carries), then a fresh session re-seeds from it
  const shipped=[...env.dump()].slice(0,200).map(s=>String(s).slice(0,240));
  const env2 = new Function('"use strict";'
    + 'const propModels=[];\n' + block
    + 'return { seed:(cr)=>{ cr.forEach(c=>creditAsset(String(c))); return collectLevelCredits(); } };')();
  const back=env2.seed(shipped);
  eq(back.length, 2, 'a reloaded level restores every registered credit');
  assert(back.includes('Engine loop by cj [CC0] — via Freesound'), 'sound credits survive the publish/reload cycle');
}

done('build 835: CC credits persist with the level — loaders + boot re-seed the registry; fonts credited');
