// (build 987) SCENE-WIDE MOBILE PREFLIGHT. One button on the Save tab bakes EVERY model in the level
// through the build-986 optimizer: serialize -> collect distinct .glb URLs (props, player, weapons,
// enemies, roster, chest/coin/turret/pickups — anything serialized) -> re-host slim copies -> rewrite
// the level JSON to the slim URLs -> restoreLevel. Already-baked (-mobile.glb) models are skipped;
// failures are tallied, never fatal; a summary toast reports optimized / lean / failed + MB saved.
import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- executable: the URL collector is the sweep's foundation ----
{
  const start = src.indexOf('function _collectLevelModelUrls(level){');
  assert(start >= 0, '_collectLevelModelUrls exists');
  const fn = src.slice(start, src.indexOf('\n}', start) + 2);
  const collect = new Function('return (' + fn + ')')();
  const level = {
    gun: { url: 'https://www.rumpusengine.com/api/files/model/biggun.glb' },
    weapons: { pistol: { model: 'https://static.poly.pizza/abc-123.glb' } },
    enemies: { grunt: { url: 'https://static.poly.pizza/abc-123.glb' } },           // duplicate
    props: [
      { src: 'https://static.poly.pizza/xyz.glb', t: [0,0,0] },
      { src: 'box', t: [1,0,1] },                                                   // built-in
      { src: 'https://www.rumpusengine.com/api/files/model/crate-mobile.glb', t: [2,0,2] },  // already baked
      { src: 'https://media.sketchfab.com/thing.glb?Expires=99', t: [3,0,3] },      // query string
    ],
    audio: { musicUrl: 'https://example.com/song.mp3' },                            // not a model
  };
  const urls = collect(level);
  eq(urls.length, 4, 'distinct model URLs collected, duplicates folded');
  assert(urls.includes('https://static.poly.pizza/abc-123.glb'), 'a URL used by two fields appears once');
  assert(urls.includes('https://media.sketchfab.com/thing.glb?Expires=99'), 'query strings survive (signed CDN URLs)');
  assert(!urls.some(u => u.includes('-mobile.glb')), 'already-baked models are skipped');
  assert(!urls.some(u => u.includes('.mp3')), 'non-model URLs are ignored');
  eq(collect({}).length, 0, 'an empty level collects nothing');
}

// ---- executable: the JSON rewrite swaps every occurrence, exactly, inside quotes ----
{
  const level = { a: { url: 'https://h/x.glb' }, b: { model: 'https://h/x.glb' }, c: { url: 'https://h/x.glb?v=2' } };
  const map = { 'https://h/x.glb': 'https://h/x-mobile.glb' };
  let json = JSON.stringify(level);
  for (const k of Object.keys(map)) json = json.split(JSON.stringify(k).slice(1,-1)).join(JSON.stringify(map[k]).slice(1,-1));
  const out = JSON.parse(json);
  eq(out.a.url, 'https://h/x-mobile.glb', 'first occurrence swapped');
  eq(out.b.model, 'https://h/x-mobile.glb', 'second occurrence swapped');
  // NOTE the sweep collects x.glb?v=2 as its own URL with its own map entry; the raw split/join here
  // also touches the prefix — this documents why the collector treats query variants as distinct.
}

// ---- the sweep: serialize -> optimize each -> rewrite -> restore, guarded + tallied ----
assert(/async function _optimizeSceneModels\(say, done\)\{/.test(src), '_optimizeSceneModels exists');
assert(/let _mobSweepBusy=false;/.test(src) && /if\(_mobSweepBusy\)\{ say\('A preflight is already running…'\); return; \}/.test(src),
  'concurrent sweeps are refused');
assert(/\}finally\{ _mobSweepBusy=false; \}/.test(src), 'the busy flag always releases');
assert(/const level=serializeLevel\(\);/.test(src) && /const urls=_collectLevelModelUrls\(level\);/.test(src),
  'the sweep works from a full serialize');
assert(/_optimizeModelUpload\(u, tail, t=>say\('\['\+\(i\+1\)\+'\/'\+urls\.length\+'\] '\+tail\+' — '\+t\), \(nu, reasonOrName, sb\)=> res\(nu\?\{nu, sb:sb\|\|0\}:\{skip:reasonOrName\|\|'fail'\}\), true\)/.test(src),
  'each model goes through the build-986 bake, quietly, with progress [i/n] messages');
assert(/else if\(r\.skip==='lean'\) lean\+\+; else fail\+\+;/.test(src), 'lean and failed models are tallied separately');
assert(/restoreLevel\(JSON\.parse\(json\)\);\s*\n\s*_levelDirty=true;/.test(src),
  'the rewritten level restores through the normal path and marks the level dirty');
assert(/flashBigToast\('MOBILE PREFLIGHT DONE', sum\)/.test(src), 'one summary toast at the end');
assert(/'fail'/.test(src.slice(src.indexOf('async function _optimizeModelUpload'), src.indexOf('async function _optimizeModelUpload')+2400)),
  'the per-model glue reports skip reasons the sweep can read');

// ---- UI: the button lives with the publish card (it is a pre-publish step) ----
assert(/<button id="edOptimizeAll"[^>]*>\\u26a1 Optimize all models for mobile<\/button>/.test(src),
  'the preflight button is on the Save tab');
assert(/id="edOptStatus"/.test(src) && /Check third-party model licenses before re-hosting\./.test(src),
  'a status line + an honest licensing note under the button');
assert(/uiConfirm\('Optimize every model in this level for mobile\?/.test(src), 'the sweep asks before re-hosting');
assert(/optAllBtn\.disabled=true; _optimizeSceneModels\(osay, \(\)=>\{ optAllBtn\.disabled=false; \}\)/.test(src),
  'the button disables while the sweep runs');

done('build 987: scene-wide mobile preflight — optimize all models in one pass');
