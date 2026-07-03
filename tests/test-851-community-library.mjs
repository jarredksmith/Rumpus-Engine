// (build 851) COMMUNITY LEVEL LIBRARY — player-built levels, hosted beside the game:
//  - community/index.json + community/levels/*.json seed the gallery (three real levels captured from a
//    live headless boot of the game itself, so they're byte-faithful serializeLevel() output);
//  - the in-game gallery (home menu → Community levels) fetches the index SAME-ORIGIN and loads entries
//    through restoreLevel, with Play and Open-in-editor paths;
//  - Save tab → "Submit to community library" copies the level JSON + opens the GitHub issue form;
//  - .github/workflows/publish-level.yml publishes a submission when the maintainer labels it `approved`,
//    via .github/scripts/publish-level.mjs (parse + validate run EXECUTABLY below);
//  - bonus bug fixed en route: the help-example builders called applyPropColor(o) with no hex, which
//    wiped userData.col and painted the tinted props black.
import { gameSource, html, assert, eq, done } from './harness.mjs';
import { readFileSync, existsSync } from 'fs';
import { parseIssue, validateSubmission } from '../.github/scripts/publish-level.mjs';
const src = gameSource();
const root = new URL('..', import.meta.url);

// ---- the seed library is real and loadable ----
const idx = JSON.parse(readFileSync(new URL('community/index.json', root), 'utf8'));
assert(Array.isArray(idx.levels) && idx.levels.length >= 3, 'index lists the three seed levels');
for(const e of idx.levels){
  assert(e.file && e.name && e.author && e.objective, `index entry "${e.name}" carries file/name/author/objective`);
  const lvl = JSON.parse(readFileSync(new URL('community/levels/' + e.file, root), 'utf8'));
  assert(lvl.props && lvl.world && lvl.game, `${e.file} is a real serialized level`);
  eq(lvl.game.objective, e.objective, `${e.file}: index objective matches the level`);
}
const race = JSON.parse(readFileSync(new URL('community/levels/stadium-circuit.json', root), 'utf8'));
eq(race.props.filter(p=>p.trk).length, 7, 'the race seed keeps barrier walls on all 7 track pieces');
assert(race.props.some(p=>p.veh && p.veh.maxSpeed===36), '...and the tuned car');
assert(race.props.find(p=>p.veh).mat && race.props.find(p=>p.veh).mat.col === 0xff4757, '...with its red tint (the applyPropColor(o) no-hex bug is fixed)');
const vault = JSON.parse(readFileSync(new URL('community/levels/the-curators-vault.json', root), 'utf8'));
assert(vault.props.some(p=>p.lk==='gold') && vault.props.some(p=>p.sg) && vault.pickups.some(p=>p.kind==='key_gold'), 'the puzzle seed keeps lock + signals + key pickup');

// ---- the gallery in the game ----
assert(/id="communityModal"/.test(html) && /COMMUNITY LEVELS/.test(html), 'the gallery modal exists');
assert(/<button id="commBtn"/.test(html), 'home-menu button');
assert(/const cmb=document\.getElementById\('commBtn'\); if\(cmb\) cmb\.onclick=openCommunity;/.test(src), '...wired to openCommunity');
assert(/const COMM_INDEX_URL = 'community\/index\.json';/.test(src), 'the index is fetched RELATIVE (same origin, any fork)');
assert(/fetch\(COMM_INDEX_URL, \{ cache:'no-cache' \}\)/.test(src), 'index fetch skips the HTTP cache so new approvals appear');
assert(/fetch\('community\/levels\/'\+file, \{ cache:'no-cache' \}\)/.test(src), 'level fetch is relative too');
assert(/\(!level\.props && !level\.world\)/.test(src.match(/async function _commLoad[\s\S]{0,900}/)[0]), 'loaded JSON is validated like an import');
assert(/pushUndoSnapshot\(\)/.test(src.match(/async function _commLoad[\s\S]{0,900}/)[0]), 'loading a community level is undoable');

// ---- the submit path ----
assert(/id="edSubmitComm"/.test(src), 'Save tab has the submit button');
assert(/navigator\.clipboard\.writeText\(str\)/.test(src.match(/#edSubmitComm[\s\S]{0,900}/)[0]), 'it copies the level JSON');
assert(/template=submit-level\.yml/.test(src), '...and opens the issue form');

// ---- the publish pipeline (executable) ----
const FIX = '### Level name\n\nCanyon  Sprint\n\n### Your name (shown in the gallery)\n\nSpeedy\n\n### Description\n\nA twisty one.\n\n### Level JSON\n\n```json\n' +
  JSON.stringify({ world:{ arena:80 }, props:[{src:'box',t:[0,0,0,0,0,0,1,1,1]}], game:{ objective:'race' } }) + '\n```\n\n### Rights\n\n- [X] I built this level\n';
const p = parseIssue(FIX);
eq(p.name, 'Canyon  Sprint', 'parseIssue: name extracted');
eq(p.author, 'Speedy', 'parseIssue: author extracted');
assert(p.json.startsWith('{') && JSON.parse(p.json).game.objective==='race', 'parseIssue: JSON unfenced intact');
const v = validateSubmission(p, 42);
assert(v.ok, 'a valid submission passes');
eq(v.entry.file, 'canyon-sprint-42.json', 'slug = name + issue number');
eq(v.entry.name, 'Canyon Sprint', 'name is sanitized (collapsed whitespace)');
eq(v.entry.objective, 'race', 'objective read from the level');
assert(!validateSubmission(parseIssue(FIX.replace(/```json[\s\S]*?```/, '```json\nnot json\n```')), 7).ok, 'garbage JSON is rejected');
assert(!validateSubmission(parseIssue(FIX.replace('Canyon  Sprint','')), 7).ok, 'missing name is rejected');
assert(!validateSubmission({ name:'x', author:'y', desc:'', json: JSON.stringify({foo:1}) }, 7).ok, 'non-level JSON is rejected');

// ---- workflow wiring ----
const wf = readFileSync(new URL('.github/workflows/publish-level.yml', root), 'utf8');
assert(/github\.event\.label\.name == 'approved'/.test(wf), 'publishes only on the approved label');
assert(/startsWith\(github\.event\.issue\.title, '\[Level\]'\)/.test(wf), '...and only for [Level] form submissions (title gate — template labels are dropped unless they pre-exist)');
assert(/contents: write/.test(wf) && /issues: write/.test(wf), 'scoped permissions');
assert(existsSync(new URL('.github/ISSUE_TEMPLATE/submit-level.yml', root)), 'the issue form ships');

// ---- the applyPropColor call-site fix in the example builders ----
eq((src.match(/applyPropColor\(o, (0x[0-9a-f]+|c)\)/g)||[]).length >= 2, true, 'example builders now pass the hex to applyPropColor');
assert(!/applyPropColor\(o\);/.test(src), 'no argless applyPropColor(o) call remains');

done('build 851: community level library — seeded gallery, undoable loads, clipboard submit, label-gated publish pipeline');
