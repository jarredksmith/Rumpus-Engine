// (build 869) NO MORE COPY-PASTE — Submit to community library now PRE-FILLS the GitHub issue form:
// the level rides in the URL as `BREACHLVL:` + the share-link codec ('g'+base64url(gzip(json))), which
// fits GitHub's ~8K URL budget for most levels. The publish Action decodes the code back to JSON. The
// JPEG thumbnail barely compresses, so if the URL is too long WITH it, the game retries WITHOUT it
// before falling back to the old clipboard+paste flow (which still carries the thumb).
import { gameSource, assert, eq, done } from './harness.mjs';
import { gzipSync } from 'zlib';
import { parseIssue, validateSubmission, decodeLevelCode } from '../.github/scripts/publish-level.mjs';
const src = gameSource();

// ---- the Action decodes real codes (round-trip through the actual codec format) ----
const lvl = { world:{ arena:90 }, props:[{src:'box',t:[1,2,3,0,0,0,1,1,1]}], game:{ objective:'race' } };
const b64url = (buf)=>buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const gCode = 'g' + b64url(gzipSync(Buffer.from(JSON.stringify(lvl))));
eq(JSON.parse(decodeLevelCode(gCode)).game.objective, 'race', "the 'g' (gzip) code decodes");
const rCode = 'r' + b64url(Buffer.from(JSON.stringify(lvl)));
eq(JSON.parse(decodeLevelCode(rCode)).world.arena, 90, "the 'r' (raw) fallback decodes");

// ---- through the full validator, exactly as the form delivers it ----
const FIX = '### Level name\n\nZip Line\n\n### Your name (shown in the gallery)\n\nZ\n\n### Level JSON\n\n```json\nBREACHLVL:' + gCode + '\n```\n';
const v = validateSubmission(parseIssue(FIX), 11);
assert(v.ok, 'a pre-filled submission validates');
eq(v.entry.file, 'zip-line-11.json', '...and publishes normally');
eq(v.entry.objective, 'race', '...with the decoded level\'s objective');
const bad = validateSubmission(parseIssue(FIX.replace(gCode, 'g%%%not-base64%%%')), 11);
assert(!bad.ok && /did not decode/.test(bad.reason), 'a mangled code is rejected with a clear reason');

// ---- the game side: prefill first, thumb-shedding retry, clipboard fallback retained ----
const sub = src.match(/#edSubmitComm[\s\S]{0,2200}/)[0];
assert(/'BREACHLVL:' \+ await encodeLevel\(lvl\)/.test(sub), 'prefill uses the share-link codec');
assert(/&level-json=/.test(sub) && /u\.length<=1900/.test(sub), 'prefills the level-json field, capped under GitHub\'s REAL budget (build 950: it 500s far below the documented 8K — safe is ~2K)');
assert(/delete noThumb\.thumb; const u2=mk\('BREACHLVL:' \+ await encodeLevel\(noThumb\)\)/.test(sub), 'retries without the thumbnail before giving up');
assert(/str = code;/.test(sub) && /Level code copied/.test(sub), 'too big to prefill -> the COMPACT code rides the clipboard and the note names the paste box (build 950)');
assert(/navigator\.clipboard\.writeText\(str\)/.test(sub), 'the clipboard+paste flow survives as the oversized fallback');
assert(/thumbnail skipped/.test(sub), '...and the toast says when the thumb was shed');

done('build 869: submissions arrive pre-filled — compressed level in the URL, Action-side decode, thumb-shedding retry');
