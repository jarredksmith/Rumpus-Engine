// (build 990) LEVEL SIZE AUDIT. Phones crash on heavy levels by running out of memory, and the
// waste hides in plain sight: the station/coin/turret loaders gate on the URL being set, NOT on
// whether the feature is used, so a disabled station still downloads its model. The audit walks
// the SERIALIZED level (the same truth a share code ships), sizes every remote asset, flags
// configured-but-unused slots with one-tap clears, and gives a phones-will-crash verdict.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- executable: the pure collector against a fixture level ----
const collect = new Function('return (' + extractFunction('_auditCollect') + ')')();
const L = {
  props: [ { src:'https://h/crate.glb', t:[0,0,0] }, { src:'https://h/crate.glb', t:[1,0,1] },
           { src:'box', t:[2,0,2] }, { src:'https://h/tree.glb', t:[3,0,3] } ],
  player: { url:'https://h/hero.glb', thumb:'data:image/jpeg;base64,'+'a'.repeat(4000) },
  roster: [ { name:'Scout', url:'https://h/scout.glb', thumb:'data:image/jpeg;base64,'+'b'.repeat(2000) } ],
  enemies: { grunt:{ url:'https://h/grunt.glb' }, runner:{ url:'' } },
  weapons: { pistol:{ model:'https://h/pistol.glb' } },
  invItems: { medkit:{ model:'https://h/medkit.glb' } },
  pickupModels: { ammo:{ url:'https://h/ammo.glb' } },
  station: { url:'https://h/station.glb' }, stationEnabled: false,
  coin: { url:'https://h/coin.glb', on:false },
  turret: { url:'https://h/turret.glb' }, turrets: [],
  chest: { url:'https://h/chest.glb' },
  grenade: { model:'https://h/nade.glb' },
  world: { sky_hdri:'https://h/sky.hdr', floorTex:'https://h/floor.jpg', wallTex:'' },
  audio: { musicUrl:'https://h/track.mp3', sounds:{ shoot:{ rifle:'https://h/bang.ogg' } } },
  audioZones: [ { url:'https://h/amb.mp3' } ],
  homepage: { on:true, bg:'data:image/jpeg;base64,'+'c'.repeat(8000) },
};
const r = collect(L);
const by = (where)=>r.items.find(it=>it.where===where);

// props fold duplicates into one row with a count; primitives are skipped
assert(by('Prop ×2') && by('Prop ×2').url==='https://h/crate.glb', 'duplicate prop URLs fold into one ×N row');
assert(by('Prop ×1') && by('Prop ×1').url==='https://h/tree.glb', 'single prop counted');
assert(!r.items.some(it=>it.url==='box'), 'built-in shapes are not assets');

// every slot type is inventoried
for(const w of ['Player model','Character: Scout','Enemy: grunt','Weapon: pistol','Item: medkit',
                'Pickup: ammo','Loot chest','Grenade','Sky (HDR)','Floor texture','Music',
                'Sound: shoot/rifle','Audio zone #1'])
  assert(by(w), 'inventoried: '+w);
assert(!r.items.some(it=>it.where==='Enemy: runner'), 'empty URLs are skipped');
assert(!r.items.some(it=>it.where==='Wall texture'), 'blank texture slots are skipped');

// the three provably-dead slots flag as unused (their loaders gate on the URL, not the toggle)
eq(by('Ammo station').unused, true, 'station model flags unused when the station is OFF');
eq(by('Coin').unused, true, 'coin model flags unused when coins are OFF');
eq(by('Turret').unused, true, 'turret model flags unused with zero turrets placed');
eq(by('Loot chest').unused, false, 'chest is never auto-flagged (modes can still use it)');
eq(by('Enemy: grunt').unused, false, 'enemy models are informational, never auto-flagged');

// unused flags flip off when the feature is on
const r2 = collect({ ...L, stationEnabled:true, coin:{ url:'https://h/coin.glb', on:true }, turrets:[{x:0}] });
eq(r2.items.find(it=>it.where==='Ammo station').unused, false, 'station used -> not flagged');
eq(r2.items.find(it=>it.where==='Coin').unused, false, 'coins on -> not flagged');
eq(r2.items.find(it=>it.where==='Turret').unused, false, 'turrets placed -> not flagged');

// inline data-URI weight (thumbs + backdrop) is totalled separately — share-code weight, not a download
const est = n => Math.round(('data:image/jpeg;base64,'.length + n) * 0.75);   // same estimate the collector uses (prefix included)
eq(r.inlineBytes, est(4000)+est(2000)+est(8000), 'inline thumbnail bytes totalled');
eq(collect({}).items.length, 0, 'an empty level audits clean');

// ---- executable: the KB/MB formatter ----
const _fmtKB = new Function('return (' + extractFunction('_fmtKB') + ')')();
eq(_fmtKB(2048), '2 KB', 'small sizes in KB');
eq(_fmtKB(3.2*1048576), '3.2 MB', 'big sizes in MB');
eq(_fmtKB(500), '1 KB', 'never shows 0 KB for a real file');

// ---- the size fetcher: HEAD first, GET+abort fallback, proxied for cross-origin ----
assert(/async function _assetHeadSize\(url\)\{/.test(src), '_assetHeadSize exists');
assert(/\{ method:'HEAD' \}/.test(src) && /const ac=new AbortController\(\); const r=await fetch\(u, \{ signal:ac\.signal \}\)/.test(src),
  'HEAD first, then a GET aborted after the headers');
assert(/const u = \(typeof proxied==='function'\) \? proxied\(url\) : url;/.test(src), 'cross-origin sizes go through the CORS proxy');

// ---- the report: verdict thresholds on MODEL bytes (what phones decode into GPU memory) ----
assert(/const mb=modelTotal\/1048576;/.test(src) && /mb>50 \?/.test(src) && /mb>25 \?/.test(src),
  'verdict: >50 MB of models = crash-likely, >25 MB = risky, else phone-friendly');
assert(/Phone-friendly/.test(src) && /phones will likely crash/.test(src), 'the verdict says it plainly');
assert(/if\(it\.where==='Ammo station'\) stationModelUrl='';\s*\n\s*else if\(it\.where==='Coin'\) coinCfg\.url='';\s*\n\s*else if\(it\.where==='Turret'\) turretModelUrl='';/.test(src),
  'Clear buttons empty exactly the three provably-dead slots');
assert(/pushUndoSnapshot\(\);\s*\n\s*if\(it\.where==='Ammo station'\)/.test(src), 'clears are undoable');
assert(/Optimize all models for mobile \(above\)/.test(src), 'the report points at the build-987 preflight');

// ---- UI wiring on the Save tab ----
assert(/<button id="edAuditBtn">Audit level size<\/button>/.test(src), 'the Audit button sits on the Save tab');
assert(/auditBtn\.onclick=\(\)=>_renderLevelAudit\(p\.querySelector\('#edAudit'\)\)/.test(src), 'wired to the report host');
assert(/let _auditBusy=false;/.test(src) && /finally\{ _auditBusy=false; \}/.test(src), 'double-runs refused, flag always releases');

done('build 990: level size audit — full asset inventory, unused-slot clears, crash verdict');
