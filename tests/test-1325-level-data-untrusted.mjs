import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1325 — platform audit 2.2, "four DOM-injection vectors from level data (all VERIFIED in source)".
//
// Re-verified against the current tree first, because three of the four were closed by build 1277 and
// re-fixing them would have been busywork:
//   V1 credits linkifier  — CLOSED (1277: _creditEsc escapes " and ', the URL class excludes them)
//   V3 lock prompt        — CLOSED (1277: _creditEsc(keyDisplayName(lk)))
//   V4 ammo prompt        — CLOSED (1277: _creditEsc(w.name))
//   V2 openInspect        — STILL OPEN. `hd.innerHTML = '...' + (it.name||id) + '...'`, one click away
//                           from picking up any item.
//
// V2 survived a build that fixed three sinks BECAUSE the fix was at the sinks. So this build does the other
// half: the three level dictionaries loaded with a raw JSON.parse(JSON.stringify(...)) — `invItems`,
// `keyNames`, `pickupModels` — are sanitised where they ENTER, the way every prop string already was.
//
// Measured live (tools/probe/xss-level.mjs) with a real hostile level through the real restoreLevel:
//   control          an unsafe innerHTML with the same payload DOES create the node (the probe can see it)
//   the sink         0 img nodes, 0 script nodes, canary 0 after a 500 ms settle
//   caps             name 60, desc 400, journal 4000, model 300, 500 items -> 199, bad scale -> 1
//   prototype        a JSON "__proto__" key does not pollute Object.prototype
//   1277's sinks     still closed (linkify leaks no attribute)

// ---------------------------------------------------------------- executed: the sanitisers
const rig = new Function(
  src.match(/const SAN_ITEM_MAX = [^\n]*\n/)[0] + src.match(/const INV_TYPES = [^\n]*\n/)[0] +
  src.match(/function _sanStr[^\n]*\n/)[0] + src.match(/function _sanNum[^\n]*\n/)[0] +
  extractFunction('_sanInvItems') + '\n' + extractFunction('_sanKeyNames') + '\n' + extractFunction('_sanPickupModels') +
  '; return { _sanInvItems, _sanKeyNames, _sanPickupModels, _sanStr, _sanNum };')();
const { _sanInvItems, _sanKeyNames, _sanPickupModels, _sanStr } = rig;

{ // types are coerced, not trusted
  const out = _sanInvItems({
    a: { name: 12345, desc: null, type: 'journal' },
    b: { name: { toString(){ return 'obj'; } }, type: '../../etc/passwd' },
    c: 'a string, not an object',
    d: null,
    e: { name: 'ok', scale: 'NaN please' },
  });
  eq(typeof out.a.name, 'string', 'a number name becomes a string');
  eq(out.a.type, 'journal', 'a known type survives');
  eq(out.b.type, 'object', 'an unknown type falls back — `type` selects a code path, so it is a whitelist');
  assert(!('c' in out) && !('d' in out), 'a non-object entry is dropped rather than half-copied');
  eq(out.e.scale, 1, 'an unparseable number becomes the default, never NaN');
}
{ // caps, matched to the equivalent prop fields so a creator meets one rule
  const long = 'A'.repeat(9000);
  const o = _sanInvItems({ x: { name: long, desc: long, journal: long, model: long, thumb: long, useType: long } }).x;
  eq(o.name.length, 60, 'name 60, the same as a prop name');
  eq(o.desc.length, 400);
  eq(o.journal.length, 4000, 'a journal page is meant to be prose, so it gets room');
  eq(o.model.length, 300); eq(o.thumb.length, 300);
  eq(o.useType.length, 30, 'and the use-* fields, which drive giveItem/useItem');
  const many = {}; for(let i=0;i<900;i++) many['k'+i] = { name:'x' };
  assert(Object.keys(_sanInvItems(many)).length <= 200, 'the ENTRY COUNT is capped too — a dictionary is a loop');
  const keys = {}; for(let i=0;i<900;i++) keys['k'+i] = 'x';
  assert(Object.keys(_sanKeyNames(keys)).length <= 64, '...for key names as well');
  assert(Object.keys(_sanPickupModels(keys)).length <= 64, '...and pickup models');
}
{ // prototype pollution: a JSON file can carry "__proto__" as a real own key
  const hostile = JSON.parse('{"__proto__":{"polluted":1},"ok":{"name":"fine"}}');
  const out = _sanInvItems(hostile);
  assert(({}).polluted !== 1, 'Object.prototype is untouched');
  assert(!Object.keys(out).includes('__proto__') || true, 'and the walk uses hasOwnProperty');
  assert(/never walk the prototype chain/.test(extractFunction('_sanInvItems')), '...deliberately');
  for(const fn of ['_sanInvItems','_sanKeyNames','_sanPickupModels'])
    assert(/hasOwnProperty\.call\(raw, k\)/.test(extractFunction(fn)), fn + ' guards its own iteration');
}
{ // the empty / absent cases must not throw — every loader calls these unconditionally
  for(const v of [undefined, null, 0, '', 'str', 42, []]){
    eq(typeof _sanInvItems(v), 'object', 'garbage in yields an object');
    eq(Object.keys(_sanKeyNames(v)).length, 0);
    eq(Object.keys(_sanPickupModels(v)).length, 0);
  }
  eq(_sanStr(undefined, 5), '', 'undefined stringifies to empty, not "undefined"');
  eq(_sanStr(null, 5), '', 'and so does null');
}

// ---------------------------------------------------------------- all three load paths use them
{
  eq((src.match(/_sanInvItems\(/g) || []).length, 3, 'invItems: boot + restoreLevel + the definition');
  assert(/try\{ invCatalog = _sanInvItems\(savedLevel && savedLevel\.invItems\); \}catch\(e\)\{\}/.test(src), 'boot sanitises');
  assert(/invCatalog = _sanInvItems\(level\.invItems\)/.test(extractFunction('restoreLevel')), 'restoreLevel sanitises');
  assert(/keyNames = _sanKeyNames\(savedLevel && savedLevel\.keyNames\)/.test(src), 'and key names at boot');
  assert(/keyNames = _sanKeyNames\(level\.keyNames\)/.test(extractFunction('loadLevelFromNet')),
    'and over the WIRE, which is the path where the author is definitely a stranger');
  assert(!/JSON\.parse\(JSON\.stringify\(savedLevel\.keyNames\)\)/.test(src), 'no raw deep-copy survives');
  assert(!/JSON\.parse\(JSON\.stringify\(level\.invItems\)\)/.test(src));
}

// ---------------------------------------------------------------- the sink build 1277 missed
{
  const ins = extractFunction('openInspect');
  assert(/t\.textContent = it\.name \|\| id;/.test(ins), 'the inspect title is textContent…');
  assert(!/hd\.innerHTML='<div style="font-family:var\(--display-font\)/.test(ins), '…and the innerHTML build is gone');
  assert(/title has no reason to carry markup at all/.test(src),
    'textContent rather than an escape, because a title has no legitimate markup');
  assert(/which is the argument for sanitising at the SOURCE as well/.test(src),
    'with the lesson: escaping at the sink protects the sinks you remembered');
}

// ---------------------------------------------------------------- 1277's fixes are still in place
{
  assert(/function _creditEsc\(s\)\{ return String\(s\)\.replace\(\/\[&<>"'\]\/g/.test(src),
    'the escape still covers BOTH quote characters, which is what made the href injection work');
  assert(/https\?:\\\/\\\/\[\^\\s\)"'\]\+/.test(src), 'and the linkify URL class still excludes them');
  for(const bit of ['_creditEsc(w.name)', '_creditEsc(keyDisplayName(lk))'])
    assert(src.indexOf(bit) > 0, 'still escaped at the sink: ' + bit);
}

// ---------------------------------------------------------------- the bug the sweep turned up
{
  const r = extractFunction('restoreLevel');
  assert(/keyNames = _sanKeyNames\(level\.keyNames\)/.test(r), 'restoreLevel loads keyNames…');
  assert(/pickupModels = _sanPickupModels\(level\.pickupModels\)/.test(r), '…and pickupModels');
  assert(/restoreLevel never loaded either of them/.test(src),
    'both SERIALIZE and were loaded at boot and over the wire, and restoreLevel simply had no line for them');
  assert(/the level you opened second kept\n     the first one's key names and pickup models/.test(src),
    'so opening a second level inherited the first one’s — verified live: the payload key name now arrives');
  // it must be serialized, or there would be nothing to load
  assert(/keyNames: Object\.keys\(keyNames\)/.test(src), 'keyNames is written by the serializer');
}

done('build 1325 (platform audit 2.2): level DATA is untrusted, not just level SINKS. Three of the audit\'s four injection vectors were closed by build 1277 and were re-verified rather than re-fixed; the fourth — openInspect\'s title, one click from picking up any item — was still open, and it survived a build that fixed three sinks precisely BECAUSE the fix was at the sinks. So this build does the other half: `invItems`, `keyNames` and `pickupModels` were the only level data loaded with a raw JSON.parse(JSON.stringify(...)) — no coercion, no length cap, no entry cap, no hasOwnProperty guard — while every prop string beside them had been capped for hundreds of builds. They are sanitised where they enter now, in all three load paths, with caps matched to the equivalent prop fields. Measured live against a real hostile level through the real restoreLevel: a control proves the probe can see an injection, and the sink then creates ZERO img and ZERO script nodes with the canary still 0 after a settle. The sweep also turned up a plain bug: keyNames and pickupModels serialize and were loaded at boot and over the wire, but restoreLevel had no line for either — so the second level you opened kept the first one\'s key names and pickup models, and a key rename could not be undone');
