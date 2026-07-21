import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 343: Pickups is its own Gameplay-tab module; placed pads are re-kindable in place;
//            entering the editor never plays the intro cinematic or its audio.

// --- pickups module ---
assert(/sec\('Pickups', 'pickups', '<div id="edPickups"><\/div>'\)/.test(src), 'Pickups has its own section');
assert(/rules:\s*\['game','pickups','loot','invitems','buildmenu','logic','cutscenes'\]/.test(src), 'shown on the Gameplay tab between Game and Loot');
const pk = src.indexOf("const pkHost = (editorEl && editorEl.querySelector('#edPickups')) || gHost;");
assert(pk > 0, 'pickups render targets its own host (gHost fallback kept)');
assert(src.indexOf("pkHost.innerHTML=''", pk) > pk, 'module clears its own host each pass');

// --- per-spot kind editing ---
const rowI = src.indexOf('PICKUP_KIND_OPTS.forEach(o=>{ const op=document.createElement');
assert(rowI > 0, 'per-spot dropdown built from the shared global list');
assert(/ks\.onchange=\(\)=>\{ pushUndoSnapshot\(\); sp\.kind=ks\.value;/.test(src), 'changing a kind updates the spot + markers in place');
assert(/const PICKUP_KIND_OPTS = \[\['health','\+Health'\]/.test(src), 'kind list hoisted to module scope');
assert(/const KINDS=PICKUP_KIND_OPTS;/.test(src), 'add-row reuses the same list');

// --- palette submenu (covered in detail by test-241; spot-check the kind fan-out) ---
assert(/for\(const k of Object\.keys\(POWERUP_KINDS\)\)/.test(src), 'submenu offers every kind, keys included');
assert(/pk\.key\?keyDisplayName\(pk\.key\):pk\.label/.test(src), 'key entries show their custom names');

// --- no cinematic in the editor ---
assert(/function maybeStartIntroCine\(\)\{ if\(typeof editorOpen!=='undefined' && editorOpen\) return;/.test(src), 'intro never starts while the editor is open');
const te = extractFunction('toggleEditor');
const openI = te.indexOf('editorEl.style.display');
const cancelI = te.indexOf('_cineIntroPending = false;');
const killI = te.indexOf('if(_cineActive){ try{ endCinematic(); }catch(e){} }');
assert(cancelI > openI && killI > cancelI, 'editor open cancels a deferred intro and ends a running one');
// endCinematic is the audio kill switch, so the running-cine path silences the track too
assert(/_stopCineAudio\(\);/.test(extractFunction('endCinematic')), 'ending the cine stops its audio');
done();
