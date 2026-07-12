// (build 210) Optional Sketchfab model source: off by default (Poly Pizza stays default), enabled via a
// toggle in the model search. Auth = the user's API token. Models download as zipped glTF -> unzip (fflate)
// -> load via blob URLs. A prop's src is stored as 'sketchfab:<uid>' so it re-resolves on level load.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// central loader recognizes the sketchfab: scheme (covers props, gun, station)
const lg = extractFunction('loadGLTFCached');
assert(/url\.indexOf\('sketchfab:'\)===0\)\{ const _ac=new AbortController\(\); _glbAborters\[url\]=_ac; loadSketchfabModel\(url\.slice\(10\)/.test(lg), 'loadGLTFCached routes sketchfab: URLs to the Sketchfab loader (with an abort controller, build 945)');

// data layer
assert(/function sfGetToken\(\)/.test(src) && /function sfSetToken\(/.test(src), 'token storage helpers');
assert(/function sfEnabled\(\)/.test(src) && /function sfSetEnabled\(/.test(src), 'enable toggle helpers (off by default)');
assert(/localStorage\.getItem\(SF_ON_KEY\)==='1'/.test(src), 'Sketchfab is opt-in (only on when explicitly enabled)');
assert(/function sfSearch\(query, cb, errcb, animatedOnly\)/.test(src) && /api\.sketchfab\.com\/v3\/search\?type=models&downloadable=true/.test(src), 'search hits the Sketchfab v3 search API');
assert(/\(animatedOnly\?'&animated=true':''\)/.test(src), 'an animated-only filter is appended to the search (build 397)');

// zip download + load
const ld = extractFunction('loadSketchfabModel');
assert(/v3\/models\/'\+uid\+'\/download/.test(ld), 'resolves the download endpoint');
assert(/Authorization:'Token '\+tok/.test(ld), 'authenticates the download with the user token');
assert(/ff\.unzipSync\(new Uint8Array\(buf\)\)/.test(ld), 'unzips the glTF archive');
assert(/setURLModifier/.test(ld) && /byBase\[base\(u\)\]/.test(ld), 'maps archive entries to blob URLs for GLTFLoader');
assert(/function ensureFflate\(\)/.test(src) && /fflate/.test(src), 'fflate is lazy-loaded for unzip');

// UI: Poly Pizza stays the default; Sketchfab appears only when enabled + selected
assert(/function _modelSourceBar\(host, rerender\)/.test(src), 'source switch bar');
assert(/function renderSketchfabSearch\(host, onPick\)/.test(src), 'Sketchfab search panel');
const rms = extractFunction('renderModelSearch');
assert(/_modelSourceBar\(host/.test(rms) && /sfEnabled\(\) && _modelSource\(\)==='sf'\) renderSketchfabSearch/.test(rms), 'single-slot search defaults to Poly Pizza, swaps to Sketchfab when chosen');
const rmb = extractFunction('renderModelBrowser');
assert(/_modelSourceBar\(host/.test(rmb) && /renderSketchfabSearch\(body/.test(rmb), 'props browser offers the Sketchfab source');
assert(/function renderModelSearchPP\(/.test(src) && /function renderModelBrowserPP\(/.test(src), 'original Poly Pizza renderers preserved as PP variants');

// pagination: 'Show more' follows the API's next-page cursor and appends
assert(/function sfFetchPage\(url, cb, errcb\)/.test(src) && /cb\(\(d\.results\|\|\[\]\)\.map\(sfMap\), d\.next\|\|null\)/.test(src), 'search returns results + next-page cursor');
const rss=extractFunction('renderSketchfabSearch');
assert(/mb\.textContent='Show more'/.test(rss) && /sfLastResults=sfLastResults\.concat\(more\); sfNextUrl=next; render\(\)/.test(rss), 'Show more appends the next page');
done('sketchfab model source');
