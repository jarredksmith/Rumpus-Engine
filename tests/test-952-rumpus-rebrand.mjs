// (build 952) THE REBRAND — BREACH becomes RUMPUS ENGINE for the first public release.
// Strategy is visible-name-only: every player-facing string changes, every COMPATIBILITY
// identifier stays — breach.html / breach-help.html filenames (live Pages URLs), breach_*
// localStorage keys (players' saves), and old BREACHLVL: codes + .breach files import forever.
// New exports emit RUMPUSLVL: and .rumpus; the publish Action accepts BOTH prefixes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gameSource, html, assert, done } from './harness.mjs';

const src = gameSource();
const dir = path.dirname(fileURLToPath(import.meta.url));

// visible identity
assert(/<title>RUMPUS ENGINE — build & play worlds in your browser<\/title>/.test(html), 'page title');
assert(/<h1><img id="menuLogo" src="img\/RumpusEngine\.svg" alt="RUMPUS ENGINE"><\/h1>/.test(html), 'menu wordmark (SVG logo since build 960, RUMPUS ENGINE alt fallback)');
assert(/\/\/ BUILD IT · BREAK IT · SHARE IT/.test(html), 'tagline');
assert(/>RUMPUS ENGINE<\/div>'/.test(src), 'loading-screen wordmark');
assert(/RUMPUS ENGINE is built on open-source libraries/.test(src), 'credits line');
assert(/@media \(max-width: 480px\) \{ #overlay \.sub \{ letter-spacing: 2px; font-size: 12px; \} \}/.test(html),
  'tagline fits one line on phones');

// new share-code prefix + extension (emitters)
assert(/const code='RUMPUSLVL:' \+ await encodeLevel\(lvl\);/.test(src), 'submit emits RUMPUSLVL:');
assert(/mk\('RUMPUSLVL:' \+ await encodeLevel\(noThumb\)\)/.test(src), 'no-thumb fallback emits RUMPUSLVL:');
assert(/a\.download = 'rumpus-level-' \+ stamp \+ '\.rumpus';/.test(src), 'level export is .rumpus');
assert(/a\.download = 'rumpus-campaign-' \+ stamp \+ '\.rumpus';/.test(src), 'campaign export is .rumpus');

// legacy compatibility is PRESERVED (importers accept the old era)
assert((html.match(/accept="\.rumpus,\.breach,\.json,application\/json"/g) || []).length >= 2,
  'level import accepts .rumpus AND .breach');
assert(/_campImp\.accept='\.rumpus,\.breach,\.json,application\/json';/.test(src),
  'campaign import accepts .rumpus AND .breach');
assert(/breach_tut_done/.test(src) && /'breach_/.test(src), 'breach_* localStorage keys kept (players’ saves)');

// no stray visible-BREACH left in UI strings (allow identifiers: filenames, storage keys, URLs, codes)
const visibles = src.match(/BREACH/g) || [];
const allowed = src.match(/BREACHLVL|breach_|breach\.html|breach-help\.html|jarredksmith\/breach|\.breach/g) || [];
assert(visibles.length === (src.match(/BREACHLVL/g) || []).length,
  'every remaining all-caps BREACH in the game source is a BREACHLVL compat token, not a visible name');
void allowed;

// the publish Action accepts both eras' prefixes
const pub = readFileSync(path.join(dir, '..', '.github', 'scripts', 'publish-level.mjs'), 'utf8');
assert(/\/\^\(BREACHLVL\|RUMPUSLVL\):\//.test(pub), 'publish Action tests both prefixes');
assert(/replace\(\/\^\(BREACHLVL\|RUMPUSLVL\):\/, ''\)/.test(pub), 'publish Action strips both prefixes');

done('build 952: RUMPUS ENGINE rebrand — visible name changed, compatibility identifiers preserved');
