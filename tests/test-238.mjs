import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 334: (1) per-level custom key display names everywhere a key is named,
//            (2) Spawns target moved from the Props(build) tab to the Enemies tab.

// --- executable: keyDisplayName fallback + custom + trimming ---
const kdn = new Function('keyNames', extractFunction('keyDisplayName') + '\nreturn keyDisplayName;');
assert(kdn({})('red') === 'RED KEY', 'no custom name -> COLOR KEY fallback');
assert(kdn({ red:'Engine Room Keycard' })('red') === 'Engine Room Keycard', 'custom name wins');
assert(kdn({ gold:'   ' })('gold') === 'GOLD KEY', 'whitespace-only name falls back');

// --- the name is used at every player-facing surface ---
assert(/flashToast\(k\.key \? keyDisplayName\(k\.key\)\.toUpperCase\(\) : k\.label\);/.test(extractFunction('applyPowerupLocal')), 'pickup toast');
const tu = extractFunction('tryUnlockProp');
assert(/keyDisplayName\(lk\)\.toUpperCase\(\)\+' USED'/.test(tu) && /NEEDS '\+keyDisplayName\(lk\)\.toUpperCase\(\)/.test(tu), 'unlock + locked toasts');
// build 1277: key names are level-authored and this is an innerHTML sink, so they go through _creditEsc
assert(/Unlock \\u2014 \$\{_creditEsc\(keyDisplayName\(lk\)\)\}/.test(src) && /needs \$\{_creditEsc\(keyDisplayName\(lk\)\)\}/.test(src), 'proximity prompt');
assert(/ch\.textContent=keyDisplayName\(k\)\.toUpperCase\(\); ch\.style\.maxWidth='130px';/.test(extractFunction('renderKeyChips')), 'HUD chips show the name, ellipsized');

// --- persistence: serialize (only non-empty), boot restore, runtime level-load restore ---
assert(/keyNames: Object\.keys\(keyNames\)\.reduce\(\(a,k\)=>\{ const n=\(keyNames\[k\]\|\|''\)\.trim\(\); if\(n\) a\[k\]=n; return a; \}, \{\}\),/.test(src), 'serialized compactly');
/* build 1325: both load paths go through _sanKeyNames now (level data is untrusted), and restoreLevel —
   which had no line for keyNames at all, so the second level you opened kept the first one's — gained one. */
assert(/let keyNames = _sanKeyNames\(savedLevel && savedLevel\.keyNames\)/.test(src), 'boot restore');
assert(/keyNames = _sanKeyNames\(level\.keyNames\)/.test(extractFunction('loadLevelFromNet')), 'runtime level-load restore beside pickupModels');
assert(/keyNames = _sanKeyNames\(level\.keyNames\)/.test(extractFunction('restoreLevel')), '...and a plain level load, which never restored them');

// --- editor: name input appears for key kinds, appends to gHost (scope-audited container) ---
const ni = src.indexOf("// keys: optional display name ('Engine Room Keycard')");
assert(ni > 0, 'key-name editor block exists');
const niBlock = src.slice(ni, ni + 1200);
assert(/pkHost\.appendChild\(nrow\);/.test(niBlock), 'name row appends to the Pickups module host (build 343)');
assert(/if\(v\) keyNames\[kc\]=v; else delete keyNames\[kc\];/.test(niBlock), 'empty input clears the custom name');
assert(!/\bhint\(/.test(niBlock) && !/[^gA-Za-z]host\./.test(niBlock), 'no out-of-scope helpers/containers (332/333 regression class)');

// --- spawns now live on the Enemies tab ---
assert(/build:\s*\['props','lights','station','extract','turrets'\]/.test(src), 'spawns gone from the build tab; player/pstart moved to the Player mode (build 652)');
assert(/player:\s*\['player','pstart'\]/.test(src), 'the Player area owns the avatar + start targets (build 652)');
assert(/enemies:\s*\['spawns'\]/.test(src), 'enemies tab owns the spawns target');
assert(/enemies:\s*\['enemies','gizmo','object','transform','boltfx'\]/.test(src), 'enemies mode renders the spawn picker, fields, gizmo sections + enemy gunfire FX (build 647)');
// custom models for keys need no new code: the pickup-model row is generic over kinds
assert(/const pm = pickupModels\[newPickupKind\] \|\| \(pickupModels\[newPickupKind\]=\{ url:'', scale:1 \}\);/.test(src), 'per-kind model row covers key kinds');
done();
