// (build 971) CREATOR TITLE SCREENS — a level can carry a `homepage` block (title, tagline,
// backdrop capture, accent, button set). Arriving via a share link (#lvl=) or a game URL
// (?game=slug), that screen fronts the engine menu: players see the creator's game. It is a
// separate layer above #overlay (whose innerHTML is volatile — end screens overwrite it), synced
// by a MutationObserver so it only ever covers the REAL menu (#menuLogo present).
import { gameSource, html, assert, eq, extractFunction, done } from './harness.mjs';
const src = gameSource();

// ---- executable: the sanitizer is the security boundary for shared data ----
const san = extractFunction('_sanitizeHomepage', src);
const run = new Function('h', san + '\nreturn _sanitizeHomepage(h);');
const off = run(null);
eq(off.on, false, 'absent block -> off (no bleed between level loads)');
eq(off.showMp, true, 'MP button defaults on');
const full = run({ on:1, title:'x'.repeat(99), tag:'y'.repeat(200), accent:'#AaBb12', bg:'data:image/jpeg;base64,abc', showMp:false, junk:'z' });
eq(full.on, true, 'on coerces to boolean');
eq(full.title.length, 48, 'title capped at 48');
eq(full.tag.length, 90, 'tagline capped at 90');
eq(full.accent, '#AaBb12', 'six-hex accent accepted');
eq(full.showMp, false, 'MP button can be hidden');
eq(full.junk, undefined, 'unknown fields do not survive');
eq(run({ accent:'red' }).accent, '', 'non-hex accent dropped');
eq(run({ accent:'#fff' }).accent, '', 'short hex dropped');
eq(run({ title:'a<b>c</b>' }).title, 'abc/b', 'angle brackets stripped from title');
eq(run({ bg:'data:text/html;base64,x' }).bg, '', 'non-image backdrop dropped');
eq(run({ bg:'data:image/png;base64,'+'a'.repeat(160000) }).bg, '', 'oversized backdrop dropped');

// ---- wiring: serialize + restore + editor section ----
assert(/homepage: \(homepageCfg && homepageCfg\.on\) \? _sanitizeHomepage\(homepageCfg\) : undefined,/.test(src),
  'serializeLevel ships the block only when enabled');
assert(/homepageCfg = _sanitizeHomepage\(level\.homepage\); if\(typeof renderHomePanel==='function'\) renderHomePanel\(\); if\(typeof _syncGameHome==='function'\) _syncGameHome\(\);/.test(src),
  'restoreLevel restores (or resets) the block and refreshes panel + layer');
assert(/sec\('Title screen', 'titlescreen', '<div id="edHomePanel"><\/div>'\)/.test(src), 'editor gets a Title screen section');
assert(/files: {3}\['titlescreen','levelfile','campaign'\]/.test(src), '...living in the Files mode');
assert(/_commCaptureThumb\(640,360,0\.62,150000\)/.test(src), 'backdrop capture asks for a 640x360 frame');

// ---- the layer: menu-only visibility, play/mp/remix/badge, preview ----
const sync = extractFunction('_syncGameHome', src);
assert(/getElementById\('menuLogo'\)/.test(sync) && /classList\.contains\('hidden'\)/.test(sync),
  'visible ONLY over the real menu — #menuLogo present and overlay shown (never over end screens)');
assert(/if\(_hpPreviewing\) return;/.test(sync), 'the editor preview owns the layer until closed');
assert(/new MutationObserver\(\(\)=>\{ try\{ _syncGameHome\(\); \}catch\(e\)\{\} \}\)\.observe\(_ovEl, \{ attributes:true, attributeFilter:\['class'\], childList:true \}\)/.test(src),
  'a MutationObserver keeps the layer glued to overlay class + content changes');
const ens = src.match(/function _ensureGameHome\(\)\{[\s\S]{0,3200}?\n\}/)[0];
assert(/const sb=document\.getElementById\('startBtn'\); if\(sb\) sb\.click\(\);/.test(ens),
  'PLAY drives the same start path as the engine menu (veil queueing included)');
assert(/getElementById\('mpOpenBtn'\); if\(b\) b\.click\(\)/.test(ens), 'MULTIPLAYER opens the real MP modal');
assert(/_hpDismissed=true; _syncGameHome\(\)/.test(ens), 'the remix link reveals the engine menu underneath');
assert(/href="https:\/\/www\.rumpusengine\.com" target="_blank" rel="noopener">MADE WITH RUMPUS ENGINE<\/a>/.test(ens),
  'every creator page carries the engine badge');

// ---- boot: share links show the title screen; ?game=<slug> fetches by name ----
assert(/if\(homepageCfg\.on\) _syncGameHome\(\);/.test(src), 'share-link boot fronts the title screen');
assert(/\[\?&\]game=\(\[a-z0-9\\-\]\{1,64\}\)/.test(src), 'the slug is strictly whitelisted');
assert(/for\(const dir of \['games\/','levels\/'\]\)/.test(src),
  'unlisted games/ namespace first, reviewed community library second');
assert(/Could not find the game/.test(src), 'a bad slug reports instead of hanging');
// build 985: the first-run instructions modal was removed entirely, so a creator title screen is
// never interrupted by it (nothing auto-opens on boot — the "seen" flag is just written).
assert(!/openModal\('instrModal'\)\s*;\s*\}\s*\}catch/.test(src) && /try\{ localStorage\.setItem\('breach_seen','1'\); \}catch/.test(src),
  'no first-run modal auto-opens over a creator title screen (build 985: pop-up removed)');

// ---- CSS: layering — above the menu (20), below editor (30) & modals (60); preview above editor ----
assert(/#gameHome \{ position:fixed; inset:0; z-index:22;/.test(html), 'layer sits just above the menu');
assert(/#gameHome\.preview \{ z-index:55; \}/.test(html), 'preview rises above the editor panel, under modals');
assert(/#gameHome \.hpBg \{[^}]*object-fit:cover/.test(html), 'backdrop covers, never distorts');

done('build 971: creator title screens — custom game homepage on share links + ?game= URLs');
