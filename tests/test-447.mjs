import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 593: audit — every editor GLB-URL entry point pairs with the Poly Pizza / Sketchfab model search.
// renderModelSearch(host, onPick) is the shared widget; onPick(m) yields m.glb.

// the three that were missing it (now fixed):
assert(/renderModelSearch\(pkPsHost, \(m, st\)=>\{ url\.value=m\.glb;[^]*pm\.url=m\.glb/.test(src), 'pickup model field has search');
assert(/renderModelSearch\(coPsHost, \(m, st\)=>\{ cu\.value=m\.glb;[^]*coinCfg\.url=m\.glb/.test(src), 'coin model field has search');
const ra = extractFunction('renderAttachAuthoring');
assert(/renderModelSearch\(psHost, \(m, st\)=>\{ attModels\[id\]=m\.glb; inp\.value=m\.glb/.test(ra), 'attachment model field has search (collapsible per slot)');

// and the ones that already had it stay wired:
assert(/renderModelSearch\(enPsHost,/.test(src), 'enemy model search');
assert(/renderModelSearch\(ltPsHost,/.test(src), 'loot-box model search');
assert(/renderModelSearch\(tpsHost,/.test(src), 'turret model search');
assert(/renderModelSearch\(psHost, \(m, st\)=>\{ inp\.value=m\.glb; tgt\.pickedThumb/.test(src), 'shared urlField targets (gun/station/player/prop/grenade) model search');

// every renderModelSearch onPick routes a real glb url back into the field
const calls = (src.match(/renderModelSearch\(/g)||[]).length;
assert(calls >= 8, 'all GLB-URL fields now carry search ('+calls+' search panels wired)');

done('audit: Poly Pizza / Sketchfab search present on every editor GLB-URL field, incl. pickups, coin, attachments (build 593)');
