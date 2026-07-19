// (build 1009) SELECT + LOBBY round 3 — field feedback on 1008.
// - The select stage frames the model's REAL bounding box (a fixed ~2m assumption beheaded
//   tall/scaled models), re-measured on a 0.5s cadence and smoothed.
// - The card row labels its two groups (CHARACTERS | COLORS) so models and tints read apart.
// - The lobby grid floor is gone (kept: glows, sweep, vignette).
// - A cold-cache lobby portrait was lost when the roster re-rendered mid-load — the async
//   thumb render now fires opts.refresh when it lands on a detached card; the lobby re-renders
//   once (synchronously from cache the second time).
// - Creators can attach a LOBBY BACKDROP image to the level: uploaded via the texture pipeline,
//   whitelisted https image URLs only, serialized with the level, broadcast to every joiner,
//   rendered blurred behind the lobby.
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- executable: the backdrop sanitizer is the security boundary (it rides a network msg) ----
const san = extractFunction('_sanitizeLobbyBg', src);
const ok = new Function('u', san + '\nreturn _sanitizeLobbyBg(u);');
eq(ok('https://rumpusengine.com/community/textures/hangar.jpg'), 'https://rumpusengine.com/community/textures/hangar.jpg', 'hosted https image accepted');
eq(ok('https://h.example/a/b/c.webp?x=1'), 'https://h.example/a/b/c.webp?x=1', 'query strings survive');
eq(ok('http://evil.example/a.png'), '', 'plain http rejected');
eq(ok('https://evil.example/x.svg'), '', 'svg (scriptable) rejected');
eq(ok('javascript:alert(1)'), '', 'javascript: rejected');
eq(ok('https://h/x.png" onload="alert(1)'), '', 'quote-breaking URLs rejected');
eq(ok('data:image/png;base64,aaaa'), '', 'data URLs rejected (they would bloat the lobby broadcast)');
eq(ok(null), '', 'null -> empty');

// ---- stage fit: real bbox, remeasured + smoothed ----
assert(/_csFitT-=dt;/.test(src) && /_csFitT=0\.5;/.test(src), 'fit re-measures on a cadence, not every frame');
assert(/new THREE\.Box3\(\)\.setFromObject\(_csGrp\)/.test(src), 'measures the actual preview group');
assert(/_csFitH=_csFitH\?\(_csFitH\+\(h-_csFitH\)\*0\.5\):h;/.test(src), 'smoothed so the camera never pops');
assert(/const H=_csFitH\|\|2, W=_csFitW\|\|0\.9, baseY=_csFitY\|\|0;/.test(src), 'sane defaults before the first measure');
assert(/const dist=Math\.max\(\(H\*0\.62\)\/Math\.tan\(fovV\/2\), \(W\*0\.62\)\/\(Math\.tan\(fovV\/2\)\*Math\.max\(0\.3,_inspCam\.aspect\)\)\) \+ 0\.5;/.test(src),
  'distance fits BOTH axes with ~24% headroom (no more decapitation)');
assert(/_csFitT=0; _csFitH=0; _csFitW=0; _csFitY=0;/.test(src), 'every preview swap re-measures fresh');

// ---- card groups ----
assert(/gl\.className='csGroupLab'; gl\.textContent=\(e\.kind==='roster'\)\?'CHARACTERS':'COLORS';/.test(src),
  'the row labels its two groups');
assert(/\.csGroupLab \{[^}]*writing-mode:vertical-rl;[^}]*border-right:1px solid #22323b;/.test(html),
  'vertical group labels with a separating rule');

// ---- grid floor gone, scene kept ----
assert(!/#lobby \.modalCard::before/.test(html) && !/lobGrid/.test(html), 'grid floor fully removed');
assert(/#lobby \.modalCard::after \{[^}]*lobSweep|animation:lobSweep/.test(html) || /@keyframes lobSweep/.test(html), 'the sweep stays');

// ---- cold-cache portrait refresh ----
const rt = extractFunction('_renderCharThumb', src);
assert(/if\(swatchEl && swatchEl\.isConnected===false && opts && typeof opts\.refresh==='function'\) opts\.refresh\(\);/.test(rt),
  'an async render landing on a detached card triggers one refresh (now cached -> sync apply)');
const ltr = extractFunction('_lobbyThumbRefresh', src);
assert(/if\(NET\.phase!=='lobby'\) return;/.test(ltr) && /\(NET\.mode==='host'\)\?lobbyRoster\(\):NET\.lobbyRoster/.test(ltr),
  'the lobby refresh re-renders the right roster for host or client');

// ---- creator lobby backdrop: level field + broadcast + apply ----
assert(/lobbyBg: \(typeof lobbyBgUrl==='string' && lobbyBgUrl\) \? lobbyBgUrl : undefined,/.test(src), 'serialized with the level (absent when unset)');
assert(/lobbyBgUrl = \(typeof _sanitizeLobbyBg==='function'\) \? _sanitizeLobbyBg\(level\.lobbyBg\) : '';/.test(src), 'restored (and reset) on level load, sanitized');
assert(/NET\.conns\[id\]\.send\(\{t:'lobby', mode:NET\.gameMode, players:roster, bg\}\)/.test(src), 'the backdrop rides the lobby broadcast to every joiner');
assert(/if\(msg\.bg!=null && typeof _applyLobbyBg==='function'\) _applyLobbyBg\(msg\.bg\);/.test(src), 'clients apply (and clear) it from the broadcast');
assert(/_applyLobbyBg\(lobbyBgUrl\); openModal\('lobby'\);/.test(src), 'the host applies it on entering its own lobby');
const app = extractFunction('_applyLobbyBg', src);
assert(/u=_sanitizeLobbyBg\(u\);/.test(app), 'apply re-sanitizes (network input)');
assert(/<div id="lobbyBgImg"><\/div>/.test(html), 'the backdrop layer exists in the lobby card');
assert(/#lobby #lobbyBgImg \{[^}]*filter:blur\(14px\) brightness\(\.5\) saturate\(1\.05\); transform:scale\(1\.06\);/.test(html),
  'blurred + darkened + overscanned (no sharp blur edges), subtle as requested');

// ---- editor control in the Title screen section ----
assert(/MULTIPLAYER LOBBY BACKDROP/.test(src), 'the Title screen section explains the feature');
assert(/renderUploadRow\(row, 'texture', \(url\)=>\{ lobbyBgUrl=_sanitizeLobbyBg\(url\); dirty\(\); _applyLobbyBg\(lobbyBgUrl\); renderHomePanel\(\); \}\);/.test(src),
  'uploads ride the existing texture pipeline');
assert(/cb\.textContent='Clear'; cb\.onclick=\(\)=>\{ lobbyBgUrl=''; dirty\(\); _applyLobbyBg\(''\); renderHomePanel\(\); \};/.test(src),
  'a set backdrop can be cleared');

done('build 1009: real-bbox select fit, grouped cards, grid floor out, portrait refresh, creator lobby backdrop');
