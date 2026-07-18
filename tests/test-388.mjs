import { gameSource, extractFunction, html, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 513: first-run onboarding. The instructions modal now carries a touch-controls block alongside the
// keyboard one, shows whichever matches the device, and auto-opens once for a cold visitor.

// ---- the modal has a touch-controls block ----
assert(/<div id="controlsTouch" style="display:none">/.test(html), 'a touch-controls block exists');
assert(/Left stick<\/b> move/.test(html) && /Drag the right side<\/b> to look/.test(html), 'touch block describes the mobile controls');

// ---- syncInstrControls shows the device-appropriate block ----
const sync = extractFunction('syncInstrControls');
const run = (touch)=>{ const els={controls:{style:{}}, controlsTouch:{style:{}}};
  new Function('isTouch','document','return ('+sync+')')(touch, { getElementById:id=>els[id]||null })();
  return els; };
{ const e=run(true);  eq(e.controls.style.display,'none','keyboard hidden on touch'); eq(e.controlsTouch.style.display,'','touch shown on touch'); }
{ const e=run(false); eq(e.controls.style.display,'','keyboard shown on desktop'); eq(e.controlsTouch.style.display,'none','touch hidden on desktop'); }

// ---- opening the instructions syncs first; build 985: no first-run auto-open ----
assert(/ib\.onclick=\(\)=>\{ syncInstrControls\(\); openModal\('instrModal'\); \};/.test(src), 'the Instructions button syncs controls before opening');
// build 985: the first-run instructions modal no longer auto-opens (standard controls). The "seen"
// flag is still written on boot, but openModal('instrModal') is never called automatically.
assert(/try\{ localStorage\.setItem\('breach_seen','1'\); \}catch\(e\)\{\}/.test(src),
  'boot marks the visitor as seen without opening any modal (build 985: first-run pop-up removed)');
assert(!/!localStorage\.getItem\('breach_seen'\) && !_sharedArrival\)\{ localStorage\.setItem\('breach_seen','1'\); syncInstrControls\(\); openModal\('instrModal'\)/.test(src),
  'the old first-run auto-open block is gone');

done();
