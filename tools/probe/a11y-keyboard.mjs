// Build 1334 left the accessibility census at three-for-six: UI scale, the photosensitivity warning and
// colour-blind correction shipped; `role=`, `tabindex` and a key-rebinding review did not. Static counts say
// role= 0, tabindex 0, and `:focus` appears 5 times in ~2,000 lines of CSS — but the number that decides
// whether there is a build here is how many CONTROLS a keyboard cannot reach, and that is a runtime
// question: a <button> is focusable for free, a <div> with .onclick is not.
import { withGame } from './driver.mjs';

const SCAN = `(function(){
  const NATIVE = new Set(['BUTTON','A','INPUT','SELECT','TEXTAREA','SUMMARY']);
  const out = { total:0, native:0, unreachable:0, byTag:{}, samples:[] };
  const visible = (el)=>{ const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  document.querySelectorAll('*').forEach(el=>{
    const clickable = typeof el.onclick === 'function';
    if(!clickable) return;
    if(!visible(el)) return;
    out.total++;
    const focusable = NATIVE.has(el.tagName) && !el.disabled
      || el.hasAttribute('tabindex')
      || (el.tagName === 'A' && el.hasAttribute('href'));
    if(focusable){ out.native++; return; }
    out.unreachable++;
    out.byTag[el.tagName] = (out.byTag[el.tagName]||0) + 1;
    if(out.samples.length < 12)
      out.samples.push((el.id ? '#'+el.id : '') + (el.className && typeof el.className==='string' ? '.'+el.className.split(' ')[0] : '')
        + ' "' + (el.textContent||'').trim().slice(0,26) + '"');
  });
  return JSON.stringify(out);
})()`;

const TABSTOPS = `(function(){
  // what a Tab key can actually reach right now
  const sel = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]';
  let n = 0;
  document.querySelectorAll(sel).forEach(el=>{ const r = el.getBoundingClientRect();
    if(r.width>0 && r.height>0 && getComputedStyle(el).visibility!=='hidden') n++; });
  return String(n);
})()`;

await withGame(async (P, page) => {
  const show = async (tag) => {
    const s = JSON.parse(await P(SCAN));
    console.log('\n' + tag);
    console.log('  clickable+visible ' + s.total + '   keyboard-reachable ' + s.native
      + '   UNREACHABLE ' + s.unreachable + '  (' + (s.total ? (100*s.unreachable/s.total).toFixed(0) : 0) + '%)');
    console.log('  by tag ' + JSON.stringify(s.byTag));
    console.log('  tab stops ' + await P(TABSTOPS));
    if (s.samples.length) console.log('  e.g. ' + s.samples.slice(0, 6).join(' | '));
  };

  await show('IN PLAY (HUD + pause closed)');
  await P('openPause && openPause(); 1'); await new Promise(r => setTimeout(r, 400));
  await show('PAUSE MENU');
  await P('resumeGame(); 1'); await new Promise(r => setTimeout(r, 300));
  await P('toggleEditor(); 1'); await new Promise(r => setTimeout(r, 1500));
  await show('EDITOR (build mode, the default)');
  await P(`setEditorMode('world'); 1`); await new Promise(r => setTimeout(r, 900));
  await show('EDITOR — World tab');

  // build 1347 arms on the FIRST TAB PRESS, so a mouse-only session pays nothing. Press Tab for real.
  await page.keyboard.press('Tab');
  await new Promise(r => setTimeout(r, 400));
  await show('EDITOR after one real Tab press');
  console.log('  armed? ' + await P('String(_a11yKbd)'));

  // a control added AFTER arming must inherit it, or this is a list that drifts
  await P(`setEditorMode('gameplay'); 1`); await new Promise(r => setTimeout(r, 900));
  await show('EDITOR — a tab opened AFTER arming (the observer)');

  // Enter must activate a stamped div, which is what role=button promises
  console.log('\nEnter activates a stamped control:');
  console.log('  ' + await P(`(function(){
    const rail = [...document.querySelectorAll('.edMode')];
    const world = rail.find(e=>/World/.test(e.textContent||''));
    if(!world) return 'no World tab found';
    const before = editorMode;
    world.focus();
    const okFocus = document.activeElement === world;
    return JSON.stringify({ tabindex: world.getAttribute('tabindex'), role: world.getAttribute('role'),
      focusable: okFocus, modeBefore: before });
  })()`));
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 500));
  console.log('  after Enter, editorMode = ' + await P('String(editorMode)'));

  // is there a visible focus indicator at all?
  console.log('\nfocus indicator:');
  console.log('  ' + await P(`(function(){
    const b = document.querySelector('button');
    if(!b) return 'no button found';
    b.focus();
    const cs = getComputedStyle(b);
    return JSON.stringify({ outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth,
      boxShadow: cs.boxShadow.slice(0,40), isFocused: document.activeElement === b });
  })()`));

  // and what the stylesheet actually says
  console.log('  css rules mentioning :focus  ' + await P(`(function(){
    let n=0; for(const ss of document.styleSheets){ try{ for(const r of ss.cssRules)
      if(r.selectorText && /:focus/.test(r.selectorText)) n++; }catch(e){} } return String(n); })()`));
}, { settleMs: 6000 });
