// (build 953) HOST-REWRITER-PROOFING. GoDaddy's "Real User Metrics" (tccl.min.js) rewrites
// served HTML and injected its tracker INSIDE two JS string literals — the popup-window
// document.write() calls — by matching their </head><body></body> text. That turned into
// "SyntaxError: missing ) after argument list" on rumpusengine.com. Fix: the structural tags
// in those strings are split across concatenations ('<bo'+'dy>'), so no serve-time HTML
// rewriter can pattern-match a tag inside our code. Verified against the actual live-file
// corruption captured from rumpusengine.com (3 tccl injection sites, 2 inside these strings).
import { gameSource, assert, eq, done } from './harness.mjs';

const src = gameSource();

// no raw structural-tag text left inside the game script for a rewriter to anchor on
assert(!src.includes('</head><body'), 'no raw </head><body text in the script');
assert(!src.includes('<body></body'), 'no raw <body></body text in the script');

// the split concatenations still rebuild the EXACT popup HTML (executable check)
const writes = src.match(/w\.document\.write\(('(?:[^'\\]|\\.)*'(?:\s*\+\s*'(?:[^'\\]|\\.)*')+)\)/g) || [];
assert(writes.length >= 2, 'both popup writers use split-string concatenation, found ' + writes.length);
const rebuilt = writes.map(w => eval(w.replace(/^w\.document\.write\(/, '').replace(/\)$/, '')));
const pv = rebuilt.find(h => h.includes('camera preview'));
const ed = rebuilt.find(h => h.includes('editor'));
eq(pv, '<!doctype html><html><head><meta charset="utf-8"><title>RUMPUS ENGINE — camera preview</title></head><body></body></html>', 'camera-preview popup HTML rebuilds exactly');
eq(ed, '<!doctype html><html><head><meta charset="utf-8"><title>RUMPUS ENGINE — editor</title></head><body></body></html>', 'editor popup HTML rebuilds exactly');

done('build 953: popup writers are host-rewriter-proof (split tags, identical output)');
