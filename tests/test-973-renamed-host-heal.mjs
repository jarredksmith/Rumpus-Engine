// (build 973) TWO WOUNDS FROM THE FIELD, ONE ROOT CAUSE EACH:
// 1. The repo rename (breach -> Rumpus-Engine) moved the GitHub Pages asset host and Pages URLs
//    don't redirect — every level pinning a model at the old address 404'd (it looked fine in the
//    author's browser only because the GLBs were cached). _migrateAssetUrl heals at load time in
//    all four fetch choke points, so saved levels / share codes / library levels / published games
//    work without re-editing. The two library levels that pinned the old host are also data-fixed.
// 2. PHP-published levels shipped with every empty {} map corrupted to [] (assoc json_decode);
//    the validator now round-trips in object mode. (Also: shared arrivals boot behind a cover —
//    LOADING GAME… — instead of flashing the engine menu for the whole fetch.)
import { gameSource, html, assert, eq, extractFunction, done } from './harness.mjs';
import { readFileSync } from 'fs';
const src = gameSource();
const lib = readFileSync(new URL('../server/api/_community_lib.php', import.meta.url), 'utf8');
const pub = readFileSync(new URL('../server/api/publish.php', import.meta.url), 'utf8');

// ---- executable: the migration shim ----
const mig = extractFunction('_migrateAssetUrl', src);
const run = new Function('u', mig + '\nreturn _migrateAssetUrl(u);');
eq(run('https://jarredksmith.github.io/breach/player/bernard.glb'),
   'https://jarredksmith.github.io/Rumpus-Engine/player/bernard.glb', 'dead host heals to the renamed host');
eq(run('https://jarredksmith.github.io/atg/basic_crate_2.glb'),
   'https://jarredksmith.github.io/atg/basic_crate_2.glb', 'the atg asset repo is untouched');
eq(run('https://www.rumpusengine.com/x.glb'), 'https://www.rumpusengine.com/x.glb', 'other hosts untouched');
eq(run(null), null, 'non-strings pass through');

// ---- all four fetch choke points apply it ----
assert(/function proxied\(url\)\{\n  url = _migrateAssetUrl\(url\);/.test(src), 'proxied() (manager modifier + fallbacks)');
assert(/function loadGLTFCached\(url, cb, errcb\)\{\n  url = _migrateAssetUrl\(url\);/.test(src), 'loadGLTFCached (every model)');
assert(/function loadTextureCached\(url\)\{\n  url = _migrateAssetUrl\(url\);/.test(src), 'loadTextureCached (prop textures)');
assert(/function texInstance\(url, u, v, srgb, rot\)\{\n  url = _migrateAssetUrl\(url\);/.test(src), 'texInstance (tiled textures)');

// ---- the two library levels are data-fixed too ----
for (const f of ['cars-5.json', 'japanese-village-6.json']) {
  const t = readFileSync(new URL('../community/levels/' + f, import.meta.url), 'utf8');
  assert(!t.includes('github.io/breach/'), f + ' no longer pins the dead host');
}

// ---- PHP: {} survives the publish round-trip ----
assert(/\$level = json_decode\(\$jsonText\);/.test(lib) && !/json_decode\(\$jsonText, true\)/.test(lib),
  'the validator decodes in OBJECT mode — assoc turned every empty {} map into []');
assert(/isset\(\$level->props\) && !isset\(\$level->world\)/.test(lib) && /unset\(\$level->thumb\)/.test(lib),
  'shape check + thumb strip moved to object syntax');
assert(/json_decode\(\$v\['levelJson'\]\);/.test(pub) && /\$level->homepage->slug = \$slug/.test(pub),
  'publish.php slug injection is object-mode too');

// ---- shared arrivals boot behind a cover, never the engine menu ----
assert(/document\.body\.classList\.add\('sharedBoot'\);/.test(html) && /LOADING GAME\\u2026/.test(html),
  'the early script detects ?game=/#lvl= and swaps the pill text');   // early <script>, so pin the full html
assert(/body\.sharedBoot #overlay > :not\(#bootPill\) \{ visibility:hidden; \}/.test(html),
  'the menu is hidden (the pill is not) until the level applies');
assert(/body\.sharedBoot #bootPill \{ display:block; \}/.test(html),
  'the pill outlives the engine boot veil while the level is still fetching');
assert(/try\{ document\.body\.classList\.remove\('sharedBoot'\); \}catch\(e\)\{\}/.test(src),
  'the cover drops once the shared level (or its failure) has resolved');

done('build 973: renamed-host heal at every fetch, PHP {} round-trip fix, shared-arrival boot cover');
