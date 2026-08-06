import { gameSource, extractFunction, extractConst, assert, done } from './harness.mjs';
const src = gameSource();

// build 1280: the three loaders' byte-identical apply blocks became ONE function, _applyPropEntry,
// which all three call. So a field now appears TWICE in the file: there, and in _pfSpawnEntry's
// deliberate near-copy for prefabs/paste. The intent below is unchanged — the field survives a load
// by every path — and it is now structural rather than a count of duplicated text.
// build 706: a signal can require a specific inventory item. The signal only fires if the player carries that item
// (optionally consuming it) — like a key, but any inventory item. e.g. press E on a door, it opens only if you
// found the hidden note.

// --- executable: fireSignals gates on the required item, consumes when asked, denies when absent ---
const fn = new Function('hasItem','takeItem','invCatalog','flashToast','SFX','_applySignalAction',
  extractFunction('fireSignals') + '\nreturn fireSignals;');
const mk = (held) => {
  const calls = { fired:[], taken:[], toast:[] };
  const inv = new Set(held);
  const f = fn(
    id=>inv.has(id),
    id=>{ inv.delete(id); calls.taken.push(id); return true; },
    { note:{ name:'Hidden Note' } },
    m=>calls.toast.push(m),
    { deny:()=>{} },
    s=>calls.fired.push(s.do)
  );
  return { f, calls, inv };
};
// has the item -> fires
{ const { f, calls } = mk(['note']);
  f({ userData:{ signals:[{ when:'interacted', do:'open', target:'door', needItem:'note' }] } }, 'interacted');
  assert(calls.fired.join()==='open' && calls.taken.length===0, 'with the item, the gated signal fires (and is not consumed unless asked)'); }
// missing the item -> blocked + toast on E
{ const { f, calls } = mk([]);
  f({ userData:{ signals:[{ when:'interacted', do:'open', target:'door', needItem:'note' }] } }, 'interacted');
  assert(calls.fired.length===0, 'without the item, the gated signal does not fire');
  assert(/NEEDS HIDDEN NOTE/.test(calls.toast.join('|')), 'a deny toast names the required item on E'); }
// consume flag removes the item after firing
{ const { f, calls, inv } = mk(['note']);
  f({ userData:{ signals:[{ when:'interacted', do:'unlock', target:'door', needItem:'note', needConsume:true }] } }, 'interacted');
  assert(calls.fired.join()==='unlock' && calls.taken.join()==='note' && !inv.has('note'), 'consume removes the item after a successful fire'); }
// ungated signals are unaffected
{ const { f, calls } = mk([]);
  f({ userData:{ signals:[{ when:'interacted', do:'toggle', target:'x' }] } }, 'interacted');
  assert(calls.fired.join()==='toggle', 'a signal with no needItem fires normally'); }

// --- serialize + restore carry the gate (compact ni/nc) ---
{ const T = extractConst('SIG_KEYS');   /* build 1406 */
  assert(/\bneedItem:'ni'/.test(T) && /\bneedConsume:'nc'/.test(T) &&
         /e\.sg=o\.userData\.signals\.map\(_sigPack\)/.test(extractFunction('propEntry')), 'needItem/needConsume serialized'); }
assert(/obj\.userData\.signals=p\.sg\.map\(_sigUnpack\)/.test(extractFunction('_applyPropEntry')),
  'restored at every prop-load site');

// --- editor UI: a "needs item" picker + consume toggle per signal ---
const ui = extractFunction('buildSignalsUI');
assert(/gl\.textContent='needs item';/.test(ui), 'each signal row has a needs-item picker');
assert(/if\(gs\.value\) s\.needItem=gs\.value; else \{ delete s\.needItem; delete s\.needConsume; \}/.test(ui), 'choosing an item sets needItem; clearing removes the gate');
assert(/cl\.appendChild\(document\.createTextNode\('consume'\)\)/.test(ui), 'a consume toggle appears once an item is required');

done('build 706: signals can require (and consume) a specific inventory item');
