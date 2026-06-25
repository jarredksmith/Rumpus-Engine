import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 692: authorable objective/goal text. A per-level goalText is shown as a centre banner at the start and is
// recallable with J; a signal action do:'objective' updates it mid-run (the storytelling hook for puzzle/adventure).

// --- per-level config + persistence ---
assert(/goalText: \(savedLevel && savedLevel\.game && typeof savedLevel\.game\.goalText==='string'\) \? savedLevel\.game\.goalText\.slice\(0,160\) : ''/.test(src), 'gameCfg.goalText seeded from the save');
assert(/goalText: \(gameCfg\.goalText\|\|''\)\.slice\(0,160\)/.test(src), 'goalText serialized with the level');
assert((src.match(/gameCfg\.goalText = \(typeof level\.game\.goalText==="string"\) \? level\.game\.goalText\.slice\(0,160\) : ""/g)||[]).length===2, 'goalText restored in both load paths');

// --- the banner + recall ---
assert(/function showGoalBanner\(text\)\{/.test(src) && /function tickGoalBanner\(dt\)\{/.test(src), 'banner show + fade helpers');
assert(/text=_creditEsc\?|_creditEsc\(text\)/.test(src), 'the banner escapes author text');
const so = extractFunction('startObjective');
assert(/_curGoal = \(gameCfg\.goalText\|\|''\)\.slice\(0,160\);/.test(so) && /if\(_curGoal\) showGoalBanner\(_curGoal\);/.test(so), 'the goal shows at the start of the run');
assert(/if\(e\.code==='KeyJ' && !e\.repeat && _curGoal\) showGoalBanner\(_curGoal\);/.test(src), 'J recalls the objective');
assert(/tickGoalBanner\(dt\)/.test(src), 'the banner fades in the main loop');

// --- puzzle HUD shows the goal ---
const oh = extractFunction('objectiveHUD');
assert(/objectiveActive\(\)==='puzzle'\)\{ wn\.textContent = _curGoal \? _curGoal\.slice\(0,48\) : 'EXPLORE'; \}/.test(oh), 'puzzle HUD shows the goal (or EXPLORE)');

// --- a signal can change it (no target needed) ---
assert(/\['objective','Set objective'\]/.test(src), 'the do dropdown offers Set objective');
assert(/if\(s\.do==='objective'\)\{ if\(typeof setGoal==='function'\) setGoal\(s\.text\|\|''\); return; \}/.test(src), 'the objective action updates the live goal');
assert(/function setGoal\(text\)\{/.test(src), 'setGoal updates _curGoal + banner + HUD');
// the signal text round-trips
assert(/if\(s\.text\) x\.tx=s\.text;/.test(src) && (src.match(/if\(s\.tx\) x\.text=s\.tx;/g)||[]).length===3, 'signal objective text serialized + restored');

// --- the editor exposes the field ---
const panel = extractFunction('renderEditorFields');
assert(/<b>Objective text<\/b>/.test(panel) && /gameCfg\.goalText=gi\.value\.slice\(0,160\)/.test(panel), 'a goal-text field in the Gameplay panel');

done('build 692: authorable objective text + banner + signal update');
