// build 1461 — per-prop variables: the graph gets per-INSTANCE state.
//
// The feature audit's CRITICAL: every variable was ONE number under ONE global name, so eight doors each
// needing their own three-hit counter meant eight variables and eight branch chains inside a 200-node
// budget — and a tycoon's per-building upgrade level, a tower-defence's per-tower rank or a shop's twelve
// items were simply unsayable.
//
// The value lives on the prop (`userData._lv`) and is MATCH state, never level data: `logicStart` clears
// it and no serializer writes it (build 1170's rule — a runtime verb must not edit the level).
//
// `#self` is what makes it per-INSTANCE rather than per-tag. A tag names a SET here (build 1299), so a
// write to a tag reaches every prop carrying it — right for "reset all the plates", useless for a counter.
// `#self` resolves to `_lgCtx.prop`, the prop whose own signal is firing, which SURVIVES an `emit`
// because `logicEvent` does not reset the context (build 1397).

import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// The four primitives, lifted from source and executed — never restated (a rig that restates a helper
// keeps passing against a stale copy).
const CORE = extractConst('LG_PV_MAX', src) !== undefined
  ? `const LG_PV_MAX = ${extractConst('LG_PV_MAX', src)};` : '';
assert(/^\d+$/.test(String(extractConst('LG_PV_MAX', src))), 'LG_PV_MAX is a plain number cap');

const PRIMS = CORE + '\n'
  + extractFunction('_lgVarProps', src) + '\n'
  + extractFunction('_lgPropVarGet', src) + '\n'
  + extractFunction('_lgPropVarSet', src) + '\n'
  + extractFunction('_lgPropVarClear', src);

const mkProp = (tag) => ({ userData: tag == null ? {} : { tag } });

// ---------------------------------------------------------------- 1. get / set, and the two poison guards
{
  const run = new Function(`
    ${PRIMS}
    const o = { userData:{} };
    const out = {};
    out.unset = _lgPropVarGet(o, 'hits');            /* never written */
    _lgPropVarSet(o, 'hits', 3);   out.wrote = _lgPropVarGet(o, 'hits');
    _lgPropVarSet(o, 'hits', 3.5); out.frac  = _lgPropVarGet(o, 'hits');
    _lgPropVarSet(o, 'hits', NaN); out.nan   = _lgPropVarGet(o, 'hits');
    _lgPropVarSet(o, 'hits', 1/0); out.inf   = _lgPropVarGet(o, 'hits');
    out.ctor = _lgPropVarGet(o, 'constructor');      /* build 1271: a plain object inherits it */
    out.proto = _lgPropVarGet(o, '__proto__');
    _lgPropVarSet(o, '', 9); out.blankName = JSON.stringify(o.userData._lv);
    _lgPropVarSet(null, 'x', 1);                      /* must not throw */
    out.noUd = _lgPropVarGet({}, 'x');
    return out;`)();

  eq(run.unset, 0, 'a prop that has never been written reads 0 — the same as an unset logicVar');
  eq(run.wrote, 3, 'a written value reads back');
  eq(run.frac, 3.5, '...fractions included, so a rank can be an average');
  eq(run.nan, 0, 'NaN is refused at the WRITE (build 1169: one NaN poisons every later compare)');
  eq(run.inf, 0, '...and so is Infinity');
  eq(run.ctor, 0, 'an inherited property name reads 0, not a Function (build 1271\'s hasOwnProperty rule)');
  eq(run.proto, 0, '...__proto__ likewise');
  eq(run.blankName, '{"hits":0}', 'a blank name writes nothing');
  eq(run.noUd, 0, 'a malformed prop reads 0 rather than throwing');
}

// ---------------------------------------------------------------- 2. `#self` is the event's own prop
{
  const run = new Function(`
    ${PRIMS}
    let propModels = [];
    let _lgCtx = {};
    const a = { userData:{ tag:'door' } }, b = { userData:{ tag:'door' } };
    propModels = [a, b];
    const out = {};
    _lgCtx = { prop: b };
    out.self  = _lgVarProps('#self').length;
    out.isB   = _lgVarProps('#self')[0] === b;
    out.blank = _lgVarProps('')[0] === b;        /* a blank tag means the same thing */
    out.nul   = _lgVarProps(null)[0] === b;
    out.pad   = _lgVarProps('  #self  ')[0] === b;
    _lgCtx = {};
    out.noCtx = _lgVarProps('#self').length;      /* outside an event: NOBODY, never everybody */
    out.tag   = _lgVarProps('door').length;       /* a tag is the whole SET */
    out.miss  = _lgVarProps('nope').length;
    return out;`)();

  eq(run.self, 1, '`#self` resolves exactly one prop');
  assert(run.isB, '...the prop whose event is firing');
  assert(run.blank, 'a blank tag means `#self`');
  assert(run.nul, '...and so does a missing one');
  assert(run.pad, '...whitespace trimmed');
  eq(run.noCtx, 0, 'outside an event `#self` resolves NOBODY — never every prop (fail closed)');
  eq(run.tag, 2, 'a real tag resolves the whole SET (build 1299)');
  eq(run.miss, 0, 'a tag nobody carries resolves nothing');
}

// ---------------------------------------------------------------- 3. eight doors, ONE tag, ONE graph
// This is the whole feature, executed: the write must reach only the door that fired, or the counter is
// the global variable this build exists to replace.
{
  const run = new Function(`
    ${PRIMS}
    ${extractFunction('_applyWorldAction', src).slice(0, extractFunction('_applyWorldAction', src).indexOf("const who="))}
      return 'PARTIAL'; }
    let _lgCtx = {};
    const propModels = [];
    for(let i = 0; i < 8; i++) propModels.push({ userData:{ tag:'door' } });
    /* three hits on door 3, one on door 6 — through the real verb, from the real signal shape */
    const hit = (o) => { _lgCtx = { prop:o }; _applyWorldAction({ do:'setpropvar', target:'#self', pvn:'hits', pvv:1, pvop:'add' }); _lgCtx = {}; };
    hit(propModels[3]); hit(propModels[3]); hit(propModels[3]);
    hit(propModels[6]);
    const counts = propModels.map(o => _lgPropVarGet(o, 'hits'));
    /* now a TAG write: reset every plate at once */
    _applyWorldAction({ do:'setpropvar', target:'door', pvn:'hits', pvv:0, pvop:'set' });
    const after = propModels.map(o => _lgPropVarGet(o, 'hits'));
    return { counts, after };`)();

  eq(JSON.stringify(run.counts), '[0,0,0,3,0,0,1,0]',
    'eight doors sharing ONE tag keep EIGHT separate counts — the entire point of the build');
  eq(JSON.stringify(run.after), '[0,0,0,0,0,0,0,0]',
    '...while a TAG write reaches the whole set at once, which is what "reset all the plates" needs');
}

// ---------------------------------------------------------------- 4. the verb, driven directly
{
  const body = extractFunction('_applyWorldAction', src);
  const head = body.slice(0, body.indexOf('const who='));
  assert(/^function _applyWorldAction\(s\)\{\s*if\(s\.do==='setpropvar'\)\{/.test(head.replace(/\s*\/\*[\s\S]*?\*\//g, '')),
    'the branch is the FIRST thing the world handler does, so nothing below can claim the verb first');

  const run = new Function(`
    ${PRIMS}
    let reports = [];
    function _noteLogicFailure(m){ reports.push(m); }
    ${head}
      return 'PARTIAL'; }
    let _lgCtx = {};
    const propModels = [{ userData:{ tag:'plate' } }];
    const out = {};
    _applyWorldAction({ do:'setpropvar', target:'plate', pvn:'n', pvv:5, pvop:'add' });
    out.add1 = _lgPropVarGet(propModels[0], 'n');
    _applyWorldAction({ do:'setpropvar', target:'plate', pvn:'n', pvv:5, pvop:'add' });
    out.add2 = _lgPropVarGet(propModels[0], 'n');
    _applyWorldAction({ do:'setpropvar', target:'plate', pvn:'n', pvv:2, pvop:'set' });
    out.set  = _lgPropVarGet(propModels[0], 'n');
    _applyWorldAction({ do:'setpropvar', target:'plate', pvn:'n', pvv:-1 });   /* no pvop = add */
    out.dflt = _lgPropVarGet(propModels[0], 'n');
    _applyWorldAction({ do:'setpropvar', target:'plate', pvn:'n' });           /* no amount */
    out.noAmt = _lgPropVarGet(propModels[0], 'n');
    out.r0 = reports.length;
    _applyWorldAction({ do:'setpropvar', target:'', pvn:'n', pvv:1 });         /* #self, no context */
    out.rSelf = reports.length;
    _applyWorldAction({ do:'setpropvar', target:'nope', pvn:'n', pvv:1 });     /* tag nobody carries */
    out.rTag = reports.length;
    out.msgSelf = reports[0] || '';
    out.msgTag  = reports[1] || '';
    _applyWorldAction({ do:'setpropvar', target:'plate', pvn:'   ', pvv:1 });  /* blank name */
    out.rBlank = reports.length;
    out.longName = (()=>{ const n = 'x'.repeat(200);
      _applyWorldAction({ do:'setpropvar', target:'plate', pvn:n, pvv:7 });
      return Object.keys(propModels[0].userData._lv).filter(k=>k[0]==='x')[0].length; })();
    return out;`)();

  eq(run.add1, 5, 'add writes 5 onto an unset value');
  eq(run.add2, 10, '...and accumulates');
  eq(run.set, 2, 'set replaces');
  eq(run.dflt, 1, 'no pvop means ADD, which is the commoner authoring');
  eq(run.noAmt, 1, 'a missing amount is 0, not NaN');
  eq(run.r0, 0, 'a resolving write reports nothing');
  eq(run.rSelf, 1, '`#self` outside an event is REPORTED, not silent (build 1214)');
  eq(run.rTag, 2, '...and so is a tag nobody carries');
  assert(/event's own prop/.test(run.msgSelf) && /fire it from a prop signal/.test(run.msgSelf),
    'the #self message names the cause AND the fix');
  assert(/`nope`/.test(run.msgTag) && /no placed prop has that tag/.test(run.msgTag),
    'the tag message names the tag that missed');
  eq(run.rBlank, 2, 'a blank name does nothing and reports nothing — there is no target to name');
  eq(run.longName, 40, 'a level-authored name is capped at LG_PV_MAX before it indexes an object');
}

// ---------------------------------------------------------------- 5. the READ takes the FIRST
// A write is the whole set; a read is one place. That asymmetry is build 1394/1412's rule and it has to
// be asserted, because the two halves are 1,300 lines apart and either could drift.
{
  const dispatch = src.slice(src.indexOf("case 'propvar': {"), src.indexOf("case 'propx': case 'propy'"));
  assert(/_lgVarProps\(p\.item\)/.test(dispatch), 'the read resolves through the SAME resolver as the write');
  assert(/_ps\[0\]/.test(dispatch), '...and takes the FIRST prop — a read is one place');
  assert(/slice\(0, LG_PV_MAX\)/.test(dispatch), '...with the same name cap');
  assert(/\(_nm && _ps\.length\) \? _lgPropVarGet\(_ps\[0\], _nm\) : 0/.test(dispatch),
    'an unresolved read is 0, never undefined — a graph compares this');

  const run = new Function(`
    ${PRIMS}
    let _lgCtx = {};
    const a = { userData:{ tag:'t' } }, b = { userData:{ tag:'t' } };
    const propModels = [a, b];
    _lgPropVarSet(a, 'v', 11); _lgPropVarSet(b, 'v', 22);
    const readTag = (() => { const _nm='v', _ps=_lgVarProps('t'); return (_nm && _ps.length) ? _lgPropVarGet(_ps[0], _nm) : 0; })();
    _lgCtx = { prop: b };
    const readSelf = (() => { const _nm='v', _ps=_lgVarProps('#self'); return (_nm && _ps.length) ? _lgPropVarGet(_ps[0], _nm) : 0; })();
    _lgCtx = {};
    const readMiss = (() => { const _nm='v', _ps=_lgVarProps('nope'); return (_nm && _ps.length) ? _lgPropVarGet(_ps[0], _nm) : 0; })();
    return { readTag, readSelf, readMiss };`)();

  eq(run.readTag, 11, 'a tag read takes the FIRST prop carrying it');
  eq(run.readSelf, 22, '`#self` reads the event\'s own prop, whichever it is');
  eq(run.readMiss, 0, 'an unresolved read is 0');
}

// ---------------------------------------------------------------- 6. MATCH state, not level data
{
  assert(/_lgPropVarClear\(\);/.test(extractFunction('logicStart', src)),
    'logicStart clears every per-prop value — the same scope as logicVars');
  const ls = extractFunction('logicStart', src);
  assert(ls.indexOf('_lgPropVarClear') < ls.indexOf('_persistSeed'),
    '...before the persisted carry seeds, so a carried value can never be wiped by it');

  // nothing serializes it — a runtime verb must not edit the level (build 1170). Every `_lv` in the
  // engine lives inside one of the three primitives, so there is no fourth site to keep in step.
  {
    const inPrims = (extractFunction('_lgPropVarGet', src) + extractFunction('_lgPropVarSet', src)
      + extractFunction('_lgPropVarClear', src)).match(/\b_lv\b/g) || [];
    // ...counted against a COMMENT-STRIPPED source: the design note above the primitives names `_lv`
    // in prose, and a bare-name count that includes prose is the trap this file records nine times.
    const all = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').match(/\b_lv\b/g) || [];
    eq(all.length, inPrims.length, 'every `_lv` reference in the engine belongs to the three primitives');
    assert(all.length >= 5, '...and there are genuinely some to count');
  }
  assert(!/_lv\b/.test(extractFunction('propEntry', src)), 'propEntry never writes it');
  assert(!/_lv\b/.test(extractFunction('_applyPropEntry', src)), '...and the one applier never reads it');

  const run = new Function(`
    ${PRIMS}
    const propModels = [{ userData:{ tag:'a' } }, { userData:{ tag:'b' } }, null];
    _lgPropVarSet(propModels[0], 'n', 4); _lgPropVarSet(propModels[1], 'n', 9);
    const before = [_lgPropVarGet(propModels[0],'n'), _lgPropVarGet(propModels[1],'n')];
    _lgPropVarClear();
    const after = [_lgPropVarGet(propModels[0],'n'), _lgPropVarGet(propModels[1],'n')];
    return { before, after, keys: Object.keys(propModels[0].userData).join(',') };`)();
  eq(JSON.stringify(run.before), '[4,9]', 'values are live during a match');
  eq(JSON.stringify(run.after), '[0,0]', '...and a fresh match starts from zero, with a null hole survived');
  eq(run.keys, 'tag', '...the store is DELETED rather than emptied, so a prop carries no residue');
}

// ---------------------------------------------------------------- 7. the wire — build 1277's rule
// A test that pins the two ENDS of a wire proves nothing about the wire. The router names the verb, the
// signal short-key table carries its three fields, and both authoring surfaces offer it.
{
  const router = src.slice(src.indexOf("||s.do==='showprop'"), src.indexOf("||s.do==='showprop'") + 400);
  assert(/s\.do==='setpropvar'/.test(router),
    'the signal router names the verb — the link build 1277 found six verbs missing');

  const sk = src.slice(src.indexOf('const SIG_KEYS'), src.indexOf('const SIG_KEYS') + 1800);
  assert(/pvn:'pn'/.test(sk) && /pvv:'pw'/.test(sk) && /pvop:'po'/.test(sk),
    'all three fields survive a save (build 1406: fourteen of seventeen verbs once lost every parameter)');

  const dov = src.slice(src.indexOf("do:       { t:'Do action'"), src.indexOf("do:       { t:'Do action'") + 4000);
  assert(/\['setpropvar','Set prop value'\]/.test(dov), 'the Do node offers it');
  assert(/ifv:\['verb',\['toggle'[^\]]*'setpropvar'\]\]/.test(dov),
    '...and the tag field is shown for it, or there is no way to type `#self`');
  assert(/k:'pvop'[^}]*ifv:\['verb','setpropvar'\]/.test(dov), '...with the add/set picker');
  assert(/k:'pvn'[^}]*ifv:\['verb','setpropvar'\]/.test(dov), '...the name');
  assert(/k:'pvv'[^}]*ifv:\['verb','setpropvar'\]/.test(dov), '...and the amount');

  const rd = src.slice(src.indexOf("read:     { t:'Read game stat'"), src.indexOf("read:     { t:'Read game stat'") + 3000);
  assert(/\['propvar','Prop value'\]/.test(rd), 'the Read node offers the other half');
  assert(/ifv:\['stat',\['propx','propy','propz','propdist','propvar'\]\]/.test(rd),
    '...sharing the tag field with the position stats, so the vocabulary is one vocabulary');
  assert(/k:'pvn',l:'of',w:72,ifv:\['stat','propvar'\]/.test(rd), '...plus the name it reads');

  assert(/\} else if\(s\.do==='setpropvar'\)\{/.test(src),
    'the signal editor builds the row, or the verb is offered and unauthorable');
}

// ---------------------------------------------------------------- 8. the context, and its unwind
{
  const ev = extractFunction('_lgPropEvent', src);
  assert(/_lgCtx\.prop = o;/.test(ev), 'a prop event names the prop it is about');
  assert(ev.indexOf('_lgCtx.prop = o;') < ev.indexOf('fireSignals'),
    '...before the signals fire');
  assert(/finally \{ _lgCtx = _pv; \}/.test(ev),
    '...and the whole context is unwound in a finally, or a later `#self` acts on a stale prop');

  // it must survive an emit: logicEvent does not reset the context (build 1397)
  assert(!/_lgCtx\s*=/.test(extractFunction('logicEvent', src)),
    'logicEvent does NOT reset the context — that is what carries `#self` through a signal -> emit -> On event chain');
}

done('build 1461 (feature audit CRITICAL): the logic graph had no PER-INSTANCE state — every variable was one number under one global name, so eight doors each needing a three-hit counter meant eight variables and eight branch chains inside a 200-node budget, and a tycoon\'s per-building upgrade level or a tower-defence\'s per-tower rank was unsayable. A value now lives on the prop (`userData._lv`) as MATCH state: `logicStart` clears it, no serializer writes it, and a fresh match starts from zero (build 1170 — a runtime verb must not edit the level). `#self` is what makes it per-INSTANCE rather than per-tag: a tag names a SET here (build 1299) so a write to one reaches every prop carrying it, which is right for "reset all the plates" and useless for a counter; `#self` resolves to `_lgCtx.prop`, the prop whose own signal is firing, and it SURVIVES an `emit` because `logicEvent` does not reset the context (build 1397) — so eight doors share ONE tag, ONE graph and ONE node pair and each keeps its own count, executed here as [0,0,0,3,0,0,1,0]. The asymmetry is deliberate and asserted at both ends 1,300 lines apart: a WRITE is the whole set, a READ takes the FIRST (build 1394/1412’s rule). Both failure modes are reported by name rather than being silent (build 1214), `#self` outside an event resolves NOBODY rather than everybody, the name is capped before it indexes an object, NaN and Infinity are refused at the write (build 1169) and an inherited property name reads 0 (build 1271). The wire is pinned end to end — router, SIG_KEYS short keys, both node tables and the signal editor row — because build 1277 found six verbs that had shipped with both ends pinned and nothing in between');
