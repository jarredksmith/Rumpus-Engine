// build 1496 — the Go to level field offers the levels
//
// Reported from play with four screenshots: a trigger firing `newLevel`, an On event node catching it, a
// Go to level node wired to it, and a two-level campaign named Intro / Level 2 in the panel — with the
// level# dropdown offering `#hp #hpf #pid #team #x #z`. "There aren't different levels in the Go to level
// dropdowns."
//
// The field takes a 1-BASED NUMBER (build 1352, which chose 1-based deliberately because that is what the
// campaign panel shows) and it carried the VARIABLE datalist. So the one question a creator opens it to ask
// was the one thing it could not answer, and there was no other surface that could tell them.

import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

/* ================================================================= the node's own table */
{
  const tbl = extractConst('LG_DEFS', src);
  const m = tbl.match(/goto:\s*\{[\s\S]*?\}\s*\],?\s*\}/);
  assert(m, 'the goto node is in LG_DEFS');
  const g = m[0];
  assert(/listId:'lgLevelList'/.test(g), 'the level field points at the LEVEL list');
  assert(!/k:'n'[^}]*listId:'lgVarList'/.test(g), '...and not at the variable list it used to carry');
  /* build 1394 gave `at` no list ON PURPOSE — the tags live in the DESTINATION level, and autocompleting a
     creator into a tag that does not exist there is worse than offering none. That decision stands; what it
     was missing is any hint at all, which is what the placeholder is. */
  assert(/k:'at'[^}]*w:96,ph:'optional'/.test(g), 'the arrive-at-tag field is optional and says so');
  assert(!/k:'at'[^}]*listId/.test(g), '...and still has NO list, which is build 1394\'s decision');
  for(const k of ["k:'n'", "k:'at'", "k:'keep'"])
    assert(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[^}]*ttl:").test(g),
      k + ' explains itself');
}

/* ================================================================= the list, executed */
const build = (function(){
  /* The real refresher, driven against a fake document. Only the level half is exercised — the other nine
     datalists are other builds' and are supplied inert. */
  const fn = extractFunction('_lgRefreshDatalists', src);
  return (levels, vars) => {
    const made = {};
    const doc = {
      getElementById: (id) => made[id] || null,
      createElement: (t) => (t === 'datalist')
        ? { id: '', options: [], set innerHTML(_v){ this.options.length = 0; },
            appendChild(o){ this.options.push(o); } }
        : { value: '', label: '' },
      body: { appendChild: (el) => { made[el.id] = el; } },
    };
    const scope = {
      document: doc,
      campaign: levels == null ? undefined : { levels },
      /* every option source the refresher names, derived from the function itself rather than guessed —
         the first draft missed _lgModalOptions and the rig threw. */
      _lgTagOptions: () => [], _lgEventOptions: () => [], _lgClipOptions: () => [],
      _lgSoundOptions: () => [], _lgVarOptions: () => vars || [], _lgListOptions: () => [],
      _lgPlaceOptions: () => [], _lgModalOptions: () => [],
      prefabLib: {}, invCatalog: {},
    };
    /* and ASSERTED, so a future dependency fails here loudly instead of throwing mid-rig */
    for(const dep of (fn.match(/_lg[A-Za-z]*Options\(\)/g) || []))
      assert(Object.prototype.hasOwnProperty.call(scope, dep.slice(0, -2)),
        'the rig supplies ' + dep + ', which the refresher calls');
    const names = Object.keys(scope);
    new Function(...names, fn + '; _lgRefreshDatalists();')(...names.map(k => scope[k]));
    const el = made['lgLevelList'];
    return el ? el.options.map(o => ({ v: o.value, l: o.label })) : null;
  };
})();

{
  /* THE REPORT, exactly: the reporter's own two-level campaign */
  const out = build([{ name: 'Intro' }, { name: 'Level 2' }], ['score', 'hits']);
  eq(out[0].v, '1', 'the first level is 1');
  eq(out[0].l, 'Intro', '...labelled with its own name');
  eq(out[1].v, '2', 'the second is 2');
  eq(out[1].l, 'Level 2', '...likewise');
  /* build 1352 accepts a variable here so a hub world can branch, so offering ONLY levels would take that
     away silently. Levels first because that is what the field is usually for. */
  assert(out.slice(2).some(o => o.v === 'score'), 'the variables are still offered, after the levels');
  assert(out.findIndex(o => o.v === 'score') > out.findIndex(o => o.v === '2'),
    'and they come AFTER, so the common answer is the first thing in the list');
}
{
  /* the CONTROL: a creator who is not building a campaign must not see phantom levels */
  const out = build([], ['score']);
  assert(!out.some(o => /^[0-9]+$/.test(o.v)), 'no campaign, no numbered entries');
  eq(out.length, 1, 'just the variable');
}
{
  /* an unnamed level still gets a usable row rather than a blank one */
  const out = build([{}, { name: '' }, { name: 'Vault' }], []);
  eq(out[0].l, 'Level 1', 'a level with no name falls back to its number');
  eq(out[1].l, 'Level 2', '...and so does an empty one');
  eq(out[2].l, 'Vault', 'while a named one keeps its name');
}
{
  /* `campaign` is a `let` declared ~30,000 lines below the refresher, and `typeof` does NOT guard a
     temporal dead zone (builds 1127, 1331, 1350, 1383, 1411) — a catch is what actually does. Driven with
     the binding genuinely absent: the other datalists must still be built. */
  const out = build(null, ['score']);
  assert(Array.isArray(out), 'a missing campaign binding does not take the refresher down');
  assert(!out.some(o => /^[0-9]+$/.test(o.v)), '...it just offers no levels');
  const fn = extractFunction('_lgRefreshDatalists', src);
  const i = fn.indexOf("mk('lgLevelList')");
  assert(i > 0, 'the level list is built there');
  assert(/\}catch\(e\)\{\}/.test(fn.slice(i, i + 900)), 'behind a catch, not a typeof');
  assert(!/typeof campaign/.test(fn.slice(i, i + 900)), '...because typeof cannot see a dead zone');
}

/* ================================================================= the renderer learns to explain */
{
  const rn = src.slice(src.indexOf("if(pm.l) wrap.appendChild(document.createTextNode(pm.l));"));
  assert(/if\(pm\.ph\) inp\.placeholder=pm\.ph;/.test(rn.slice(0, 3000)), 'a param can carry a placeholder');
  assert(/if\(pm\.ttl\) wrap\.title=pm\.ttl;/.test(rn.slice(0, 3000)),
    'and a tooltip — on the LABEL, so hovering the words explains them, and so build 1337\'s sweep moves it');
}

/* ================================================================= the failure a blank field produces */
{
  const i = src.indexOf("case 'goto': {");
  const blk = src.slice(i, src.indexOf("case 'lose':", i) > i ? src.indexOf("case 'lose':", i) : i + 6000);
  /* build 1352's two guards are untouched */
  assert(/is not part of a campaign/.test(blk), 'firing outside a campaign still reports');
  assert(/but this campaign has/.test(blk), 'and so does an out-of-range number');
  /* the new one: a BLANK field is the commonest way to get here and "asked for level 0" does not say so */
  assert(/const _blank = \(p\.n == null \|\| String\(p\.n\)\.trim\(\) === ''\);/.test(blk),
    'a blank field is recognised as blank');
  assert(/has no level number/.test(blk), '...and reported as blank');
  assert(/\(1\\u2013' \+ _tot \+ '\)/.test(blk), 'with the range that would actually work');
  /* A refusal must COST NOTHING — it reports and stops, never reports and then loads. Asserted as the
     statement that makes that true rather than by counting `_campaignLoad` in a slice, which was the first
     draft and which build 1415's own COMMENT (naming that function in prose) defeated — the fourth time
     this file has recorded a pin beaten by neighbouring words. */
  /* split on the CALL, not the name: `if(typeof _noteLogicFailure==='function') _noteLogicFailure(...)`
     mentions it twice, so splitting on the bare name yields a fragment between them that contains nothing */
  const calls = blk.split('_noteLogicFailure(').slice(1);
  eq(calls.length, 2, 'two ways to be refused');
  for(const m of calls)
    assert(/^[\s\S]{0,600}?break;/.test(m), 'every reported failure breaks out rather than loading anyway');
  eq((blk.match(/_campaignLoad\(/g) || []).length, 1, 'and there is exactly ONE call that loads');
}

done('build 1496 — the Go to level field offers the campaign\'s own levels by name, still accepts a ' +
     'variable for a branching hub, and a blank one says it is blank instead of reporting "level 0"');
