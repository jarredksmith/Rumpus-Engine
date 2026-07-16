// (build 972) UNLISTED GAME PUBLISHING — the other half of sharing: the reviewed community
// library is opt-in discovery; publish.php gives a creator an INSTANT, unlisted URL
// (/game/<slug>) with no review. Owner key (hashed at rest) makes the slug updatable/deletable
// by its creator; admin.php gains a games section for reactive moderation; game.php serves
// OpenGraph unfurls. Game side: a Publish button in the Title screen panel drives the whole flow.
import { gameSource, assert, done } from './harness.mjs';
import { readFileSync } from 'fs';
const src = gameSource();
const pub = readFileSync(new URL('../server/api/publish.php', import.meta.url), 'utf8');
const gp  = readFileSync(new URL('../server/game.php', import.meta.url), 'utf8');
const adm = readFileSync(new URL('../server/api/admin.php', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../server/api/_community_lib.php', import.meta.url), 'utf8');
const rd  = readFileSync(new URL('../server/README.md', import.meta.url), 'utf8');

// ---- publish.php: same validation as the library, key-gated updates, capped ----
assert(/Access-Control-Allow-Origin: \*/.test(pub), 'CORS-open (the Pages copy publishes to the same server)');
assert(/validateSubmission\(\$in\['name'\]/.test(pub), 'the exact library validator guards the door');
assert(/hash_equals\(\(string\)\(\$(old|meta)\['keyHash'\] \?\? ''\), hash\('sha256', \$key\)\)/.test(pub),
  'owner key compared via hash_equals against the stored hash');
assert(/'keyHash' => hash\('sha256', \$key\)/.test(pub), 'the key is stored HASHED, never raw');
assert(/RUMPUS_PUBLISH_INTERVAL/.test(pub) && /RUMPUS_MAX_GAMES/.test(pub) && /RUMPUS_GAMES_PER_IP/.test(pub),
  'rate + volume caps, all env-tunable');
assert(/is_file\(gamesMetaDir\(\) \. '\/' \. \$slug \. '\.json'\) \|\| is_file\(commDir\(\) \. '\/levels\/' \. \$slug \. '\.json'\)/.test(pub),
  'slugs are uniquified and can never shadow a community library level');
assert(/\$level->homepage->slug = \$slug/.test(pub), 'the served copy knows its own URL (first publish serializes before the slug exists)');
assert(!/index\.json/.test(pub), 'publish.php NEVER touches the library index — unlisted means unlisted');
assert(/function gamesDir\(\)/.test(lib) && /function gamesMetaDir\(\)/.test(lib) && /__DIR__ \. '\/gamesmeta'/.test(lib),
  'levels served beside the library; metadata (key hashes, ip hashes) lives under api/ where .htaccess denies the web');

// ---- game.php: OG unfurls + human redirect ----
assert(/og:title/.test(gp) && /og:description/.test(gp) && /og:image/.test(gp), 'OpenGraph tags for link unfurls');
assert(/game\.php\?img=/.test(gp) && /base64_decode\(\$m\[2\]\)/.test(gp), 'og:image is a real URL — ?img= decodes the stored screenshot');
assert(/community\/index\.json/.test(gp), 'reviewed library levels unfurl too (index fallback)');
assert(/http-equiv="refresh"/.test(gp) && /breach\.html\?game=/.test(gp), 'humans are dropped straight into the game');
assert(/htmlspecialchars/.test(gp), 'all echoed metadata is escaped');
assert(/RewriteRule \^game\/\(\[a-z0-9-\]\{1,64\}\)\/\?\$ game\.php\?slug=\$1 \[L,QSA\]/.test(rd),
  'the /game/<slug> rewrite is documented in the deploy README');

// ---- admin.php: reactive moderation for unlisted games ----
assert(/'games' => \$games/.test(adm) && /unpublish_game/.test(adm), 'admin lists unlisted games and can take one down');
assert(/UNLISTED GAMES/.test(adm) && /breach\.html\?game='\+encodeURIComponent\(g\.slug\)/.test(adm),
  'the review page shows them with test-play links');

// ---- game side: the Publish flow ----
assert(/slug: {3}\(ok && typeof h\.slug==='string' && \/\^\[a-z0-9\\-\]\{1,64\}\$\/\.test\(h\.slug\)\) \? h\.slug : '',/.test(src),
  'the published slug rides inside the homepage block');
assert(/id="hpPublish"/.test(src) && /Publish game page \(instant URL\)/.test(src), 'the Title screen panel has the Publish button');
assert(/breach_game_keys/.test(src) && /crypto\.getRandomValues\(a\)/.test(src),
  'owner keys are client-generated and kept per-slug in this browser');
assert(/fetch\(_commApi\(\)\+'publish\.php', \{ method:'POST'/.test(src), 'publishes to the live API');
assert(/const code='RUMPUSLVL:' \+ await encodeLevel\(lvl\);\s*\n\s*const body=\{ name, author, desc:\(homepageCfg\.tag\|\|''\), code, key \};/.test(src),
  'the level ships as a share code; the tagline becomes the unfurl description');
assert(/if\(oldSlug\) body\.slug=oldSlug;/.test(src), 'republishing from the same browser updates the same URL');
assert(/homepageCfg\.slug=d\.slug; keys\[d\.slug\]=key;/.test(src), 'success stores slug + key for later updates');
assert(/publish\.php\?slug='\+encodeURIComponent\(homepageCfg\.slug\)\+'&k='\+k, \{ method:'DELETE' \}/.test(src),
  'the panel can unpublish with the owner key');
assert(/id="hpUnpub"/.test(src), 'an Unpublish button appears once a slug exists');
assert(/uiConfirm\('Your game is LIVE at '\+url/.test(src) && /'Copy link'\)/.test(src),
  'success shows the URL in a themed dialog with copy-link (fullscreen survives)');

done('build 972: instant unlisted game publishing — /game/<slug> URLs, owner keys, OG unfurls, admin takedown');
