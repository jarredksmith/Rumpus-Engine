// (build 182) Grab/drop moved onto a dedicated action bound to G and middle-mouse (scroll-wheel push);
// grenade throw relocated from G to F. E still grabs+uses (touch Use routes through interact()).
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

assert(/function grabAction\(\)\{ if\(heldProp\) releaseHeld\(\); else tryGrabProp\(\);/.test(src), 'dedicated grabAction (grab/drop)');
assert(/if\(e\.code==='KeyG'\)\{ if\(drivingCar && typeof _ghostToggle==='function'[^\n]*else grabAction\(\); \}/.test(src), 'G grabs / drops on foot (build 841: in a race car it toggles the ghost)');
assert(/if\(e\.code==='KeyF'\) throwGrenade\(\);/.test(src), 'grenade relocated to F');
assert(!/if\(e\.code==='KeyG'\) throwGrenade\(\)/.test(src), 'G no longer throws a grenade');
assert(/else if\(e\.button===1\)\{ e\.preventDefault\(\); grabAction\(\); \}/.test(src), 'middle-mouse (scroll-wheel push) grabs / drops');
// E still works (grab fallback + use) so touch Use keeps grabbing
assert(/if\(e\.code==='KeyE'\) interact\(\);/.test(src) && /if\(!nearTarget\)\{ tryGrabProp\(\); return; \}/.test(extractFunction('interact')), 'E still grabs+uses');
assert(/txt = _grabLabel \|\| \(isTouch \? 'Hold USE to grab' : '\[G \/ MMB\] Grab'\)/.test(src), 'prompt shows the new grab keys (or a custom grab label; touch says Hold USE — build 908)');
done('grab rebind: G + middle-mouse, grenade -> F');
