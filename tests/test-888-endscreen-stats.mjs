// (build 888) OBJECTIVE-AWARE END SCREENS — "when I finish a race it says score 0, kills zero, then my
// best score/wave/kills — since it's a race I shouldn't see those. Make sure other gameplay types only
// show what is applicable." runSummaryHTML (shared by the win AND death screens) now branches:
// race → credits + the persistent TRACK RECORD (laps + session best already live in the headline);
// puzzle → credits (+ score only if something actually scored); combat objectives keep the full block.
// recordRun is skipped for race/puzzle so those runs never touch the shooter's best records.
import { gameSource, extractFunction, evalDecl, assert, eq, done } from './harness.mjs';

const src = gameSource();
const bind = (deps) => evalDecl(extractFunction('runSummaryHTML', src), 'runSummaryHTML', deps);
const boom = () => { throw new Error('recordRun must not run for this objective'); };

// ---- race: no score/kills/wave — credits + track record only ----
const race = bind({ objectiveActive: () => 'race', gameCfg: {}, credits: 120, score: 0, runKills: 0,
  recordRun: boom, _ghostBest: { lapT: 42.53 }, _fmtRace: (t) => t.toFixed(2) + 's' })();
assert(!/SCORE/.test(race) && !/KILLS/.test(race) && !/wave/i.test(race), 'race screen carries no shooter stats');
assert(/◆120/.test(race), 'credits still shown (money is real in any mode)');
assert(/TRACK RECORD 42\.53s/.test(race), 'the persistent best lap appears instead');
// no stored record yet -> just the credits line, no empty best line
const raceFresh = bind({ objectiveActive: () => 'race', gameCfg: {}, credits: 5, score: 0, runKills: 0,
  recordRun: boom, _ghostBest: null, _fmtRace: (t) => '' })();
assert(!/bestLine/.test(raceFresh), 'no ghost lap recorded -> no best line at all');

// ---- puzzle: no kills/waves; score only when nonzero ----
const puz0 = bind({ objectiveActive: () => 'puzzle', gameCfg: {}, credits: 30, score: 0, runKills: 0, recordRun: boom })();
assert(!/SCORE/.test(puz0) && !/KILLS/.test(puz0) && !/BEST/.test(puz0), 'a scoreless puzzle shows just the credits');
const puz50 = bind({ objectiveActive: () => 'puzzle', gameCfg: {}, credits: 30, score: 50, runKills: 0, recordRun: boom })();
assert(/SCORE 50/.test(puz50) && !/KILLS/.test(puz50), 'puzzle shows score only when something scored — never kills');

// ---- combat objectives: the full block, exactly as before ----
const rr = () => ({ isBest: { score: true, wave: false, kills: false }, anyBest: true, best: { score: 900, wave: 7, kills: 60 } });
for (const ob of ['eliminate', 'survival', 'extraction', 'defend', 'destroy', 'escort']) {
  const html = bind({ objectiveActive: () => ob, gameCfg: {}, credits: 10, score: 900, runKills: 12, recordRun: rr })();
  assert(/SCORE 900 ★/.test(html) && /KILLS 12/.test(html) && /NEW BEST/.test(html), ob + ' keeps the full score/kills/best block');
}

// the branch keys off the LIVE objective helper, with a config fallback
assert(/const ob=\(typeof objectiveActive==='function'\) \? objectiveActive\(\) : \(\(gameCfg&&gameCfg\.objective\)\|\|'eliminate'\);/.test(src),
  'objective resolved via objectiveActive() (the same source of truth the HUD uses)');

done('build 888: end screens show only what fits the objective — races race, puzzles puzzle, shooters shoot');
