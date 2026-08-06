// build 1406 — a prop signal's parameters survive the save.
//
// Measured with the REAL serializer across all seventeen verbs a signal can carry (probe:
// tools/probe/signal-roundtrip.mjs): FOURTEEN lost every parameter. "Command the nearest enemy to hold at
// post1" serialized to {w:'used', d:'command'} — the verb survives and everything about it is gone. So the
// pressure plate a creator tested spawns a grunt at the player after a reload, silently, because the
// in-memory object is right until the level is saved.
//
// The cause is a HAND-KEPT short-key list, written when signals were tag verbs only. Eight builds since
// added a world verb to the signal dropdown and none of them touched it. That is build 1280's finding one
// layer down, and the reason this test does not check a list of fields: it derives the expected key set
// from the SIGNAL EDITOR'S OWN WRITES, so the next verb that adds a field fails here instead of shipping.
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------------- one derivation, three consumers ----
{
  eq((src.match(/const SIG_KEYS = \{/g) || []).length, 1, 'the mapping exists exactly once');
  eq((src.match(/_sigPack/g) || []).length, 2, '_sigPack: its definition and the one serializer site');
  eq((src.match(/_sigUnpack/g) || []).length, 3, '_sigUnpack: its definition and BOTH loaders');

  // the three sites that used to carry their own copy of the mapping
  assert(/e\.sg=o\.userData\.signals\.map\(_sigPack\)/.test(src), 'serializeLevel packs through it');
  eq((src.match(/obj\.userData\.signals=p\.sg\.map\(_sigUnpack\)/g) || []).length, 2,
    '...and _applyPropEntry (build 1280) and _pfSpawnEntry both unpack through it');
  assert(!/x\.clip=s\.c;/.test(src) && !/x\.c=s\.clip;/.test(src),
    'and no hand-written signal field mapping survives anywhere');
}

// ------------------------------------------------------- the frozen half of the wire format ----
{
  // Every level ever saved uses these twelve. Changing one silently drops that field from existing content.
  const FROZEN = { when:'w', do:'d', target:'t', clip:'c', cs:'n', from:'f', contain:'ci', text:'tx',
                   needItem:'ni', needConsume:'nc', consume:'cn', sound:'so' };
  const table = extractConst('SIG_KEYS');
  for (const k in FROZEN) {
    assert(new RegExp('\\b' + k + ":'" + FROZEN[k] + "'").test(table),
      'pre-1406 short key is unchanged: ' + k + ' -> ' + FROZEN[k]);
  }
  // the collision this forced, and the reason the count field could not take the obvious letter
  assert(/\bn:'q'/.test(table),
    'the count field n takes q, because cs already owns the short key n — a short key is a wire format');
}

// ------------------------------------------------------- executed: pack / unpack ----
const mk = () => new Function(
  'const SIG_KEYS = ' + extractConst('SIG_KEYS') + ';\n' +
  'const SIG_UNKEYS = (function(){ const o={}; for(const k in SIG_KEYS) o[SIG_KEYS[k]]=k; return o; })();\n' +
  'const SIG_STR_MAX = ' + extractConst('SIG_STR_MAX') + ';\n' +
  extractFunction('_sigPack') + '\n' + extractFunction('_sigUnpack') + '\n' +
  'return { _sigPack, _sigUnpack, KEYS: SIG_KEYS };')();

{
  const { _sigPack, _sigUnpack, KEYS } = mk();

  // a signal per world verb, each carrying everything its editor row can write
  const SIGS = [
    { when:'used', do:'spawn',    etype:'brute', n:'3', at:'gate' },
    { when:'used', do:'pickup',   pk:'item', item:'redKey', at:'plinth', once:1 },
    { when:'used', do:'damage',   who:'near', amt:'40', r:'8', at:'pit' },
    { when:'used', do:'teleport', who:'player', at:'vault' },
    { when:'used', do:'give',     item:'coin', n:'5' },
    { when:'used', do:'stat',     stat:'speed', mul:'2' },
    { when:'used', do:'command',  ewho:'nearest', cmd:'hold', at:'post1' },
    { when:'used', do:'view',     vmode:'fixed', vtag:'cam1', vtrack:1, who:'actor' },
    { when:'used', do:'spawnprop',prefab:'turret', at:'pad' },
    { when:'shot', do:'anim',     target:'door', clip:'Open' },
  ];
  for (const s of SIGS) {
    const back = _sigUnpack(_sigPack(s));
    for (const k in s) eq(String(back[k]), String(s[k]), s.do + ' keeps ' + k);
  }

  // a pre-1406 level still loads exactly as it did
  {
    const old = { w:'used', d:'anim', t:'door', c:'Open', ci:1, ni:'redKey', nc:1, cn:1, so:'a.mp3', n:'intro', f:'plate' };
    const s = _sigUnpack(old);
    eq(s.when, 'used'); eq(s.do, 'anim'); eq(s.target, 'door'); eq(s.clip, 'Open');
    eq(s.cs, 'intro', 'the old n short key still means the CUTSCENE name, not a count');
    eq(s.from, 'plate'); eq(s.needItem, 'redKey'); eq(s.sound, 'a.mp3');
    assert(s.contain && s.needConsume && s.consume, 'the booleans are still truthy on the way back');
  }

  // ...and re-saving it emits the same twelve keys it arrived with — a level with nothing new authored is
  // byte-identical, which is what makes this safe to ship over existing content
  {
    const old = { w:'used', d:'anim', t:'door', c:'Open', ci:1, so:'a.mp3' };
    eq(JSON.stringify(_sigPack(_sigUnpack(old))), JSON.stringify(old),
      'pack(unpack(x)) === x for a pre-1406 signal');
  }

  // the emptiness rules, which are what keep a saved level small
  {
    const p = _sigPack({ when:'used', do:'anim', target:'', clip:undefined, contain:false, amt:0, n:'' });
    eq(JSON.stringify(p), '{"w":"used","d":"anim"}',
      'blank, undefined, null and false are omitted — and so is a 0, which every consumer reads as absent');
    eq(JSON.stringify(_sigPack(null)), '{}', 'and a missing signal packs to nothing rather than throwing');
    eq(JSON.stringify(_sigUnpack(null)), '{}');
  }

  // level data is untrusted (build 1325)
  {
    const s = _sigUnpack({ w:'used', d:'anim', tx:'x'.repeat(5000), zz:'not a key of ours',
                           __proto__:'hostile' });
    eq(s.text.length, 300, 'a string is capped on the way in');
    assert(!('zz' in s), 'an unknown short key is dropped rather than trusted');
    assert(Object.getPrototypeOf({}) === Object.prototype, 'and the parse cannot pollute the prototype');
  }

  // booleans emit 1, matching the pre-1406 wire form exactly
  eq(_sigPack({ contain:true, once:true, vtrack:true }).ci, 1);
  eq(_sigPack({ vtrack:true }).vk, 1, 'a checkbox emits 1, not true');
}

// ------------------------------------------------------- THE PROPERTY THAT WOULD HAVE CAUGHT THIS ----
// The defect was not a missing field. It was that the mapping and the editor were separate lists, and the
// editor grew eight times. So: every key the signal editor can WRITE must be a key the table carries.
{
  const row = extractFunction('_sigWorldRow');
  const written = new Set();
  for (const m of row.matchAll(/\bs\.([A-Za-z_$][\w$]*)\s*=/g)) written.add(m[1]);
  for (const m of row.matchAll(/delete\s+s\.([A-Za-z_$][\w$]*)/g)) written.add(m[1]);
  assert(written.size >= 12, 'the editor really does write a set of fields (' + written.size + ')');

  const { KEYS } = mk();
  const missing = [...written].filter(k => !(k in KEYS));
  eq(missing.join(','), '',
    'EVERY field the signal editor writes is carried by SIG_KEYS — the check the hand-kept list could not ' +
    'make, and the one that fails the day a verb adds a field without saying so');

  // the same question of the verb dropdown: a verb that is offered must have a row that configures it
  const VERBLESS = new Set(['toggle','open','close','unlock','win','checkpoint',   // nothing to configure
                            'anim','cutscene','objective','sound','emit']);        // handled by the tag row above
  /* walk BACK from the do-select's own callback to its option list. A fixed-size window reached into the
     WHEN dropdown above it and reported 'destroyed' and 'contact' as verbs with no row — a slice scoped by
     a character count, which is this file's most repeated test defect. */
  const end = src.indexOf('], s.do, v=>{ s.do=v; }');
  assert(end > 0, 'found the signal do-select');
  const dd = src.slice(src.lastIndexOf('mkSel([', end), end);
  const verbs = [...dd.matchAll(/\['([a-z]+)',/g)].map(m => m[1]);
  assert(verbs.includes('view') && verbs.includes('command') && verbs.length > 15,
    'found the signal verb dropdown (' + verbs.length + ' verbs)');
  for (const v of verbs) {
    if (VERBLESS.has(v)) continue;
    assert(new RegExp("s\\.do==='" + v + "'").test(row),
      'the signal editor has a parameter row for every configurable verb it offers: ' + v);
  }
}

// ------------------------------------------------------- build 1404's own gap, closed ----
{
  const row = extractFunction('_sigWorldRow');
  const i = row.indexOf("s.do==='view'");
  assert(i > 0, 'view has a row at all — build 1404 put it in the dropdown and never gave it one');
  const branch = row.slice(i, row.indexOf("s.do==='command'", i));
  assert(/s\.vmode=v/.test(branch), '...that sets the mode');
  assert(/s\.vtag=v/.test(branch) && /s\.vtrack=1/.test(branch),
    '...and the tag and the follow flag, both only when the mode is fixed');
  assert(/if\(s\.vmode==='fixed'\)/.test(branch),
    'the tag row appears only for the fixed camera, exactly as the graph node gates it');
}

// Measured live, tools/probe/signal-roundtrip.mjs, one signal per verb through the real serializeLevel and
// the real loader:
//
//   before   3/17 survive   — music and objective only because `sound` and `text` happened to be in the
//                             list, and `anim` because it is a tag verb
//   after    17/17
//
//   "command nearest -> hold @post1"   {"w":"used","d":"command"}
//                                  ->  {"w":"used","d":"command","a":"post1","ew":"nearest","cm":"hold"}
//   "view fixed on cam1, tracking"     {"w":"used","d":"view"}
//                                  ->  {"w":"used","d":"view","vm":"fixed","vt":"cam1","vk":1}
//
// The probe was wrong once first, and instructively: its first draft PASTED the loader's body inline, so
// after the fix the serializer carried every field and the probe still reported them lost — it was
// measuring its own stale copy of the thing under test. It calls the engine's `_sigUnpack` now.
done('build 1406: a prop signal keeps what was authored on it');
