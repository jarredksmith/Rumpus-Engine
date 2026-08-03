// build 1321 — reported from play: "the circle plus button gets slightly obscured with the file menu UI."
//
// Measures the actual geometry and, more to the point, WHICH ELEMENT IS ON TOP at the circle's own pixels —
// elementFromPoint is the only honest test of "obscured", because z-index decides it, not the rectangles.
import { withGame } from './driver.mjs';

const REPORT = `(function(){
  const bar = document.getElementById('edMenuBar');
  const btn = document.getElementById('edAdd');
  const fab = document.getElementById('edAddFab');
  if(!btn) return { noFab:true, barShown: !!(bar && getComputedStyle(bar).display !== 'none') };
  const b = btn.getBoundingClientRect(), r = bar ? bar.getBoundingClientRect() : null;
  const shown = !!(bar && getComputedStyle(bar).display !== 'none');
  /* who actually owns the pixels along the circle's vertical centre line */
  const at = (y)=>{ const e = document.elementFromPoint(Math.round(b.left + b.width/2), Math.round(y));
                    return e ? (e.id || e.className || e.tagName) : null; };
  return {
    menuBarShown: shown, barBottom: r ? +r.bottom.toFixed(1) : null,
    fabTopCss: fab ? fab.style.top || getComputedStyle(fab).top : null,
    circle: { top:+b.top.toFixed(1), bottom:+b.bottom.toFixed(1), h:+b.height.toFixed(1) },
    pxHiddenBehindBar: r ? +Math.max(0, Math.min(r.bottom, b.bottom) - b.top).toFixed(1) : 0,
    ownerAtCircleTop:    at(b.top + 2),
    ownerAtCircleMiddle: at(b.top + b.height/2),
    zFab: fab ? getComputedStyle(fab).zIndex : null,
    zBar: bar ? getComputedStyle(bar).zIndex : null,
  };
})()`;

await withGame(async (P, page) => {
  await page.setViewportSize({ width: 1280, height: 720 });   // >= 760, so the menu bar is wanted
  console.log('open the editor:', JSON.stringify(await P(`(function(){ if(!editorOpen) toggleEditor();
    if(typeof _edMenuSync==='function') _edMenuSync();
    return { editorOpen, bodyHasClass: document.body.classList.contains('edMenuBar'), w: window.innerWidth }; })()`)));
  await page.waitForTimeout(700);
  console.log('\\nwide (bar shown):', JSON.stringify(await P(REPORT), null, 1));

  console.log('\\n--- and the case the bar is NOT wanted: the + must not float down for nothing ---');
  await page.setViewportSize({ width: 700, height: 720 });
  await page.waitForTimeout(500);
  /* setViewportSize does not reliably deliver a resize event here — the first run of this probe read
     menuBarShown:true at 700px, which _edMenuSync's own >=760 rule says is impossible. Drive the sync
     directly and assert the precondition, or the narrow measurement is worthless. */
  console.log('  forced sync   :', JSON.stringify(await P(`(function(){ _edMenuSync();
    return { w: window.innerWidth, bodyHasClass: document.body.classList.contains('edMenuBar') }; })()`)));
  await page.waitForTimeout(200);
  console.log('narrow (no bar) :', JSON.stringify(await P(REPORT), null, 1));
}, { settleMs: 9000 });
