// build 1325 (platform audit 2.2) — a HOSTILE LEVEL, loaded and played.
//
// The audit's V2: `openInspect` did `hd.innerHTML = '...' + (it.name||id) + '...'` where `it` is
// invCatalog[id] — level data, loaded with a raw JSON.parse(JSON.stringify(...)). Reachable by picking up
// an item and clicking it. Build 1277 escaped three other sinks and did not reach this one.
//
// This probe writes the payload into a level the way a shared file would, loads it through the real
// restoreLevel, opens the real inspect card, and asks the DOM whether a script node was created — the only
// question that matters. A `window.__pwned` canary makes a successful execution loud rather than inferred.
import { withGame } from './driver.mjs';

const PAYLOAD = '<img src=x onerror="window.__pwned=1">';

await withGame(async (P, page) => {
  console.log('--- CONTROL: can this probe detect an injection at all? ---');
  console.log(JSON.stringify(await P(`(function(){
    /* deliberately unsafe, so a null result later means "safe" and not "the probe is blind" */
    /* A SEPARATE CANARY. The first run of this probe used the same one for the control and the test, and
       the control's <img> fired its onerror ASYNCHRONOUSLY — after the reset — so the real test reported
       pwned:1 with zero nodes created in the sink. A control that contaminates the measurement is not a
       control. */
    const d=document.createElement('div'); document.body.appendChild(d);
    d.innerHTML = ${JSON.stringify(PAYLOAD.replace('__pwned','__ctrlPwned'))};
    const made = d.querySelectorAll('img').length;
    d.remove();
    return { injectedNodeCreated: made > 0 };
  })()`)));

  console.log('\n--- LOAD A LEVEL WHOSE ITEM NAME IS A PAYLOAD ---');
  console.log(JSON.stringify(await P(`(function(){
    window.__pwned = 0;
    const lvl = serializeLevel();
    lvl.invItems = { relic: { name: ${JSON.stringify(PAYLOAD)}, type:'object', desc:'x' } };
    lvl.keyNames = { red: ${JSON.stringify(PAYLOAD)} };
    restoreLevel(lvl);
    return { itemName: invCatalog.relic ? invCatalog.relic.name : null,
             keyNameLoadedByRestoreLevel: keyNames.red,
             stillContainsMarkup: /<img/.test(String(invCatalog.relic && invCatalog.relic.name)) };
  })()`)));
  console.log('  (the string SURVIVES — sanitising is about types and caps, not about stripping markup;');
  console.log('   what must not happen is it reaching a markup sink)');

  console.log('\n--- OPEN THE INSPECT CARD, WHICH IS THE SINK ---');
  console.log(JSON.stringify(await P(`(function(){
    window.__pwned = 0;                     /* reset immediately before the sink, not a block earlier */
    giveItem('relic', 1);
    openInspect('relic');
    const card = document.getElementById('inspectCard');
    const shownText = (card.querySelector('div') || {}).textContent || '';
    return { cardOpened: !!card,
             titleShownAsText: shownText.slice(0, 60),
             IMG_NODES_CREATED: card.querySelectorAll('img').length,
             SCRIPT_NODES_CREATED: card.querySelectorAll('script').length,
             pwned: window.__pwned };
  })()`)));

  await page.waitForTimeout(500);           /* an onerror would have fired by now */
  console.log('after a settle:', JSON.stringify(await P(`({ pwned: window.__pwned, controlCanary: window.__ctrlPwned })`)));

  console.log('\n--- THE CAPS AND COERCIONS ---');
  console.log(JSON.stringify(await P(`(function(){
    const long = 'A'.repeat(5000);
    const items = {}; for(let i=0;i<500;i++) items['k'+i] = { name:'x' };
    const out = _sanInvItems(Object.assign({
      big:  { name: long, desc: long, journal: long, model: long, thumb: long },
      typed:{ name:'t', type:'../../etc/passwd' },
      num:  { name:'n', scale: 'not a number' },
      bad:  'a string, not an object'
    }, items));
    return { nameCapped: out.big.name.length, descCapped: out.big.desc.length,
             journalCapped: out.big.journal.length, modelCapped: out.big.model.length,
             unknownTypeFellBack: out.typed.type, badScaleCoerced: out.num.scale,
             nonObjectDropped: !('bad' in out), entriesCapped: Object.keys(out).length };
  })()`)));
  console.log('prototype safety:', JSON.stringify(await P(`(function(){
    const hostile = JSON.parse('{"__proto__":{"polluted":1},"ok":{"name":"fine"}}');
    const out = _sanInvItems(hostile);
    return { polluted: ({}).polluted === 1, keys: Object.keys(out) };
  })()`)));

  console.log('\n--- AND THE SINKS BUILD 1277 CLOSED ARE STILL CLOSED ---');
  console.log(JSON.stringify(await P(`(function(){
    const esc = _creditEsc(${JSON.stringify(PAYLOAD)});
    const link = _creditLinkify('https://x/"onfocus="alert(1)"autofocus="');
    const d = document.createElement('div'); d.innerHTML = link;
    const a = d.querySelector('a');
    return { escaped: esc.indexOf('<') < 0,
             linkifyHref: a ? a.getAttribute('href') : null,
             linkifyLeakedAnAttribute: a ? a.hasAttribute('onfocus') : null };
  })()`)));
}, { settleMs: 9000 });
