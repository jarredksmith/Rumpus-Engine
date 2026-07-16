// (build 854) COMMUNITY LIBRARY POLISH — the gallery earns its keep before it fills up:
//  - submit captures a 256x144 JPEG of the current view through a render target (reliable regardless of
//    preserveDrawingBuffer — the cine-preview technique) and embeds it as level.thumb;
//  - the publish Action LIFTS the thumb into the index entry and STRIPS it from the level file (the index
//    is fetched constantly, the level only on Play), and flags levels that reference sketchfab: models;
//  - the gallery renders the thumb (or a monogram placeholder), a "needs Sketchfab token" badge, and
//    objective filter chips (shown only when the library spans more than one objective).
import { gameSource, html, assert, eq, done } from './harness.mjs';
import { readFileSync } from 'fs';
import { parseIssue, validateSubmission } from '../.github/scripts/publish-level.mjs';
const src = gameSource();

// capture + embed on submit
const cap = src.match(/function _commCaptureThumb\(\)\{[\s\S]{0,2600}?\n\}/)[0];
assert(/readRenderTargetPixels/.test(cap), 'thumb reads through a render target, not the main canvas');
assert(/setViewport\(0,0,sz\.x,sz\.y\)/.test(cap), 'the full-screen viewport is restored after the off-screen render');
assert(/toDataURL\('image\/jpeg', 0\.55\)/.test(cap) && /length<80000/.test(cap), 'small JPEG, capped size');
assert(/const th = _commCaptureThumb\(\); if\(th\) lvl\.thumb = th;/.test(src), 'submit embeds the thumb in the copied JSON');

// publish pipeline lifts thumb + flags sketchfab (executable, through the real validator)
const mk = (lvl)=>'### Level name\n\nT\n\n### Your name (shown in the gallery)\n\nA\n\n### Level JSON\n\n```json\n'+JSON.stringify(lvl)+'\n```\n';
const TH = 'data:image/jpeg;base64,'+'aGVsbG8'.repeat(4)+'=';
const v1 = validateSubmission(parseIssue(mk({ world:{}, props:[{src:'sketchfab:abc123',t:[0,0,0,0,0,0,1,1,1]}], thumb: TH })), 9);
assert(v1.ok, 'submission with thumb + sketchfab prop passes');
eq(v1.entry.thumb, TH, 'the thumb is lifted into the index entry');
eq(v1.entry.sketchfab, true, 'sketchfab usage is flagged');
eq(v1.level.thumb, undefined, '...and stripped from the level file');
const v2 = validateSubmission(parseIssue(mk({ world:{}, props:[], thumb:'data:text/html;base64,PGI+' })), 9);
assert(v2.ok && !v2.entry.thumb, 'a non-image thumb is dropped, not published');
const v3 = validateSubmission(parseIssue(mk({ world:{}, props:[] })), 9);
assert(v3.ok && !v3.entry.sketchfab && !v3.entry.thumb, 'no false flags on a plain level');

// gallery rendering
// build 970 split the gallery into renderCommunity -> _commRenderUI -> _commRenderRows; span all three
const gal = src.match(/async function renderCommunity\(\)\{[\s\S]{0,9500}?\nasync function _commLoad/)[0];
assert(/L\.thumb && \/\^data:image\\\/\(jpeg\|png\);base64,\/\.test\(L\.thumb\)/.test(gal), 'gallery only renders data-URI image thumbs');
assert(/charAt\(0\)\.toUpperCase\(\)/.test(gal), 'entries without a thumb get a monogram placeholder');
assert(/needs Sketchfab token/.test(gal), 'the Sketchfab badge renders');
assert(/kinds\.length>1/.test(gal) && /_commFilter==='all'/.test(gal), 'objective filter chips (only when the library is mixed)');

// the first real submission is flagged in the shipped index
const idx = JSON.parse(readFileSync(new URL('../community/index.json', import.meta.url), 'utf8'));
eq(idx.levels.find(l=>l.file==='cars-5.json').sketchfab, true, 'cars-5 (Sketchfab models) carries the badge flag');

done('build 854: gallery thumbnails via render-target capture, Sketchfab badge, objective filters');
