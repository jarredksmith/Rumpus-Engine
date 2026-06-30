// (build 68) Persistent best + end-of-run summary. recordRun() compares the run to the stored best,
// persists the new maxes, and flags records; runSummaryHTML() renders the win/death stats.
import { gameSource, extractFunction, done, assert, eq } from './harness.mjs';
const src = gameSource();

assert(/let runKills = 0;/.test(src), 'per-run kill counter exists');
assert(/function killEnemy\(en, sx, sz\)\{\n  runKills\+\+;/.test(src), 'kills are counted');
assert(/runKills=0;/.test(src), 'kills reset each run');
assert(/const BEST_KEY='breach_best'/.test(src) && /localStorage\.setItem\(BEST_KEY/.test(src), 'best persists to localStorage');
assert(/\$\{runSummaryHTML\(\)\}/.test(src), 'summary injected into the end screens');

function mkStore(init){ let v = init ? JSON.stringify(init) : null; return { getItem:()=>v, setItem:(k,val)=>{ v=val; }, raw:()=>v }; }
function build(store, score, wave, kills, credits){
  return new Function('localStorage','score','wave','runKills','credits', `
    const BEST_KEY='breach_best';
    ${extractFunction('loadBest')}
    ${extractFunction('recordRun')}
    ${extractFunction('runSummaryHTML')}
    return { recordRun, runSummaryHTML };
  `)(store, score, wave, kills, credits);
}

// fresh device: first run is an all-new best
let store = mkStore(null);
let r = build(store, 500, 5, 10, 7).recordRun();
eq(r.isBest.score && r.isBest.wave && r.isBest.kills, true, 'first run sets every best');
eq(r.anyBest, true, 'first run is a record');
eq(JSON.parse(store.raw()).score, 500, 'best persisted');

// a worse run beats nothing and leaves the stored best intact
r = build(store, 300, 3, 4, 2).recordRun();
eq(r.anyBest, false, 'worse run sets no record');
eq(JSON.parse(store.raw()).wave, 5, 'stored best wave unchanged');

// a partial record: higher score, equal/lower wave+kills
store = mkStore({ score:500, wave:5, kills:10 });
r = build(store, 600, 4, 10, 0).recordRun();
eq(r.isBest.score, true, 'new high score detected');
eq(r.isBest.wave, false, 'lower wave is not a record');
eq(r.isBest.kills, false, 'equal kills is not a record');
eq(JSON.parse(store.raw()).score, 600, 'persists the higher score');
eq(JSON.parse(store.raw()).wave, 5, 'keeps the higher prior wave');

// summary HTML reflects records
const html1 = build(mkStore(null), 100, 2, 3, 5).runSummaryHTML();
assert(/NEW BEST/.test(html1), 'record run shows NEW BEST');
const html2 = build(mkStore({score:9999,wave:99,kills:999}), 10, 1, 1, 0).runSummaryHTML();
assert(/BEST · score 9999/.test(html2) && !/NEW BEST/.test(html2), 'non-record shows the standing best');
done('persistent best + run summary');
