// build 1335 — the fetch surface: what a level makes a player's browser contact, and the opt-in block.
//
// The block is the half that needs a real control. Headless Chromium here has no route to the open
// internet, so "the image failed to load" proves nothing at all — a network failure and a refusal look
// identical. The discriminator is the `securitypolicyviolation` event, which ONLY fires from CSP. So each
// run asks for the same two URLs, one off-origin and one same-origin, and reports which of them the
// POLICY refused rather than which of them arrived.
import { withGame } from './driver.mjs';

const HOSTS_JS = `(function(){
  const m = levelRemoteHostsNow();
  return [...m.entries()].map(([h,e])=>[h,e.n]);
})()`;

async function run(block) {
  return withGame(async (P, page) => {
    const live = await page.evaluate(() => !!window.__TP_BLOCKED);
    const stock = await P(HOSTS_JS);

    // a level that points somewhere: the walk must find every one of them, in fields it was never told about
    await P(`(function(){
      const p = propModels[0];
      if(p) p.userData.src = 'https://models.example.com/a.glb';
      worldCfg.hdri = 'https://sky.example.org/x.hdr';
      worldCfg.lut  = 'https://sky.example.org/lut.png';
      if(!hudCfg.widgets) hudCfg.widgets = [];
      hudCfg.widgets.push({ kind:'image', img:'https://img.example.net/card.png', x:10, y:10 });
      return 1; })()`);
    const seeded = await P(HOSTS_JS);
    // showThirdPartyModal lives INSIDE the game closure, so it is opened through the trampoline and only
    // the resulting DOM is read from the page.
    await P('showThirdPartyModal(); 1');
    const modal = await page.evaluate(() => {
      // the page already contains other .modalBack markup (community, help), so take the LAST one — the
      // one just appended. Querying the first matched an unrelated card and reported a null checkbox.
      const backs = [...document.querySelectorAll('.modalBack')];
      const c = backs[backs.length - 1].querySelector('.modalCard');
      // one row per host: the two-child flex rows, read as "host / N files"
      const rows = [...c.children].filter(d => d.children.length === 2 && d.tagName === 'DIV')
        .map(d => d.children[0].textContent + ' = ' + d.children[1].textContent);
      const out = { title: c.firstChild.textContent, hosts: rows,
        checkbox: !!c.querySelector('input[type=checkbox]').checked,
        note: (c.querySelector('label') || {}).nextSibling ? c.querySelector('label').nextSibling.textContent : null };
      backs[backs.length - 1].remove();
      return out;
    });

    // the control pair: same-origin and off-origin, and WHO refused them
    const fetchTest = await page.evaluate(async () => {
      const seen = [];
      const h = e => seen.push(e.violatedDirective + ' <- ' + e.blockedURI);
      document.addEventListener('securitypolicyviolation', h);
      const img = (u) => new Promise(r => { const i = new Image(); i.onload = () => r('loaded'); i.onerror = () => r('failed'); i.src = u; setTimeout(() => r('timeout'), 2500); });
      // POSITIVE CONTROL: a same-origin fetch must still succeed under the policy, or the block would be
      // breaking the engine rather than protecting it. An off-origin one must be refused BY THE POLICY —
      // "failed" alone is worthless here, since this sandbox has no route to the open internet either way.
      const same = await fetch('/three.min.js', { method:'HEAD' }).then(r => 'ok ' + r.status).catch(e => 'REFUSED (' + e.message.slice(0,40) + ')');
      const offFetch = await fetch('https://img.example.net/x.png').then(r => 'ok ' + r.status).catch(e => 'blocked/failed');
      const off = await img('https://img.example.net/x.png');
      await new Promise(r => setTimeout(r, 300));
      document.removeEventListener('securitypolicyviolation', h);
      return { same, off, offFetch, violations: seen };
    });

    return { live, stock, seeded, modal, fetchTest,
      booted: await P('({gameOn, props: propModels.length})'),
      issue: await P("levelIssues().filter(function(s){return /other site/.test(s);})[0] || null") };
  }, { settleMs: 4000, firstRun: false, initBlock: block });
}

for (const block of [false, true]) {
  console.log('\n===== breach_tpblock = ' + (block ? '1  (the opt-in block)' : '0  (default)'));
  const r = await run(block);
  console.log('  policy live       ' + r.live);
  console.log('  game              ' + JSON.stringify(r.booted));
  console.log('  stock level       ' + JSON.stringify(r.stock) + '   <- the SHIPPED level already contacts two');
  console.log('  seeded level      ' + JSON.stringify(r.seeded));
  console.log('  modal             ' + JSON.stringify(r.modal.title) + ' ' + JSON.stringify(r.modal.hosts));
  console.log('  modal note        ' + JSON.stringify(r.modal.note));
  console.log('  same-origin fetch ' + r.fetchTest.same + '   <- must stay OK, or the block breaks the engine');
  console.log('  off-origin fetch  ' + r.fetchTest.offFetch);
  console.log('  off-origin img    ' + r.fetchTest.off);
  console.log('  CSP refusals      ' + JSON.stringify(r.fetchTest.violations));
  console.log('  Level Check       ' + JSON.stringify(r.issue));
}
