// (build 818) Editor streamlining:
//  - renderEditorFields (a ~2,000-line wholesale panel rebuild called from ~177 sites) now COALESCES same-frame bursts:
//    the first call in a frame runs synchronously (callers may read the fresh DOM); further calls within ~8ms collapse
//    into one deferred rebuild on the next animation frame.
//  - Touch devices get comfortable hit areas on editor controls (many icon buttons were ~20px).
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// the coalescing gate
assert(/let _refLast = 0, _refQueued = false;/.test(src), 'coalescing state exists');
const ref = extractFunction('renderEditorFields');
assert(/if\(_refQueued\) return;/.test(ref), 'a queued rebuild swallows further calls');
// build 1302: the deferred pass RESETS the clock instead of setting it to now. Setting it re-tripped the
// throttle inside the callback, so the pass re-latched and queued another frame forever and the panel
// stopped rendering entirely — reported from play as "the weapons stats stay on shotgun".
assert(/if\(_rnow - _refLast < 8\)\{ _refQueued = true; requestAnimationFrame\(\(\)=>\{ _refQueued = false; _refLast = 0; renderEditorFields\(\); \}\); return; \}/.test(ref), 'a same-frame burst defers ONE rebuild to the next frame');

// executable: burst arithmetic — 5 calls in one frame = 1 sync rebuild + 1 queued
{
  let last=0, queued=false, syncRuns=0, defers=0;
  const call=(now)=>{ if(queued) return; if(now-last<8){ queued=true; defers++; return; } last=now; syncRuns++; };
  call(100); call(101); call(102); call(103); call(104);
  eq(syncRuns, 1, 'one synchronous rebuild for the burst');
  eq(defers, 1, 'one deferred rebuild queued (the rest swallowed)');
}

// touch hit areas
assert(/body\.touch #editor button \{ min-height:38px; min-width:38px; \}/.test(html), 'editor buttons get a real hit area on touch');
assert(/body\.touch #editor select, body\.touch #editor input\[type="text"\], body\.touch #editor input\[type="number"\], body\.touch #editor input\[type="color"\] \{ min-height:34px; \}/.test(html), 'editor inputs too');

done('build 818: editor rebuild bursts coalesce; touch controls get real hit areas');
