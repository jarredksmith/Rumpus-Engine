import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1300 — editor audit finding 4.3, HIGH:
//
//   "renderLevelIssues: `d.textContent = msg`, no handler. 'A signal targets tag vaultDoor, but no prop
//    carries that tag' is a great message with nowhere to click. The outliner already searches by tag and
//    selectAssetInstances already knows how to select-and-frame — the two are three lines apart."
//
// Verified end to end in the real editor by authoring the audit's exact fault: the message appears, the row
// is clickable, and pressing it selects and frames the prop that carries the broken signal.

// ---------------------------------------------------------------- the locator rides BESIDE the message
{
  // levelIssues() returns strings, and TEN test harnesses plus the publish preflight consume it that way.
  // Turning it into objects to carry one extra field would have rewritten all of them for no gain.
  const li = extractFunction('levelIssues');
  assert(/const issues=\[\]; _issueFind\.clear\(\);/.test(li),
    'the locator map is cleared at the top of each check — a locator belongs to THIS run');
  assert(/return issues;/.test(li), 'and the function still returns a plain array of strings');
  assert(/The locator rides BESIDE the message rather than replacing it/.test(src),
    'why it was not turned into objects is recorded');
  const at = extractFunction('_issueAt');
  assert(/return msg;/.test(at), '_issueAt returns the message unchanged, so it wraps a push without altering it');
  // executed: it is a pass-through that records
  const rig = new Function('_issueFind', extractFunction('_issueAt') + '; return _issueAt;');
  const m = new Map(), f = rig(m);
  eq(f('hello', () => [1]), 'hello', 'the message comes straight back out');
  eq(m.size, 1, '...and the locator is filed under it');
  eq(f('nope', null), 'nope', 'a message with no locator is still returned');
  eq(m.size, 1, '...and files nothing');
  eq(f('', () => []), '', 'an empty message files nothing either');
  eq(m.size, 1);
}

// ---------------------------------------------------------------- resolving at CLICK time
const mkGo = (props, resolveTo) => {
  const st = { framed: 0, rendered: 0, highlighted: 0, toast: null, selProps: [], active: '' };
  const fn = new Function('propModels', 'flashToast', 'updateSelectionHighlight', '_edFrameSelected',
    'renderEditorFields', 'editorTargets', 'ST',
    'let selProps=[], editorActive="";\n' +
    extractFunction('_edGoToIssue') +
    '; return { go:_edGoToIssue, sel:()=>selProps, active:()=>editorActive };')(
    props, (m) => { st.toast = m; }, () => { st.highlighted++; }, () => { st.framed++; },
    () => { st.rendered++; }, { props: { idx: -1 } }, st);
  return { fn, st };
};
{
  const a = { n: 'a' }, b = { n: 'b' }, gone = { n: 'gone' };
  const { fn, st } = mkGo([a, b]);
  eq(fn.go(() => [b]), true, 'a resolvable prop is found');
  eq(fn.sel().length, 1, '...selected');
  eq(fn.sel()[0], b, '...and it is the right one');
  eq(fn.active(), 'props', 'the props tab is switched to, or the selection would be invisible');
  eq(st.framed, 1, 'and the view is FRAMED on it — a diagnostic that selects something off screen is the same "nothing happened" the click exists to fix');
  eq(st.highlighted, 1, 'the selection outline is refreshed');
  eq(st.rendered, 1, '...and so is the inspector');
  eq(fn.go(() => [a, b]), true, 'several props at once (every unattributed model, say)');
  eq(fn.sel().length, 2);
}
{ // A PROP CAN BE DELETED BETWEEN OPENING THE PANEL AND PRESSING THE ARROW
  const a = { n: 'a' }, gone = { n: 'gone' };
  const { fn, st } = mkGo([a]);
  eq(fn.go(() => [gone]), false, 'a stale prop is refused rather than selected');
  eq(fn.sel().length, 0, '...and the selection is left alone');
  assert(/no longer in the level/.test(st.toast || ''), '...with an answer, not a silent no-op');
  eq(fn.go(() => [gone, a]), true, 'a partly-stale list keeps what still exists');
  eq(fn.sel().length, 1);
  eq(fn.sel()[0], a);
}
{ // and nothing about it can throw out of a click handler
  const { fn, st } = mkGo([{ n: 'a' }]);
  eq(fn.go(() => { throw new Error('resolver blew up'); }), false, 'a throwing resolver is a refusal, not a crash');
  eq(fn.go(() => null), false, 'a resolver that answers nothing');
  eq(fn.go(() => [null, undefined]), false, 'holes are dropped and the result is empty');
  assert(st.toast, 'each of those still told the creator something');
}

// ---------------------------------------------------------------- which checks learned to point
{
  const li = extractFunction('levelIssues');
  // the four signal faults — the prop carrying the signal is the loop variable, right there
  assert(/_issueAt\("A signal targets tag '"\+s\.target\+"', but no prop carries that tag\.", \(\)=>\[o\]\)/.test(li),
    'THE AUDIT’S OWN EXAMPLE now points at the prop carrying the signal');
  assert(/_issueAt\('A signal has no target tag \(only Win level and Play cutscene work without one\)\.', \(\)=>\[o\]\)/.test(li),
    'a signal with no target at all');
  assert(/_issueAt\("A contact signal only triggers on objects tagged '"\+s\.from\+"'.*, \(\)=>\[o\]\)/.test(li),
    'a contact filter naming a tag nobody carries');
  assert(/_issueAt\("A signal plays cutscene '"\+s\.cs\+"', but no cutscene has that name\.", \(\)=>\[o\]\)/.test(li),
    'a signal playing a cutscene that does not exist');
  assert(/_issueAt\('A Signals-only mechanism can never move[\s\S]{0,140}, \(\)=>\[o\]\)/.test(li),
    'and a mechanism nothing targets');
  // the licensing one resolves a LIST, and re-resolves at click time rather than closing over a count
  assert(/const _bareOf=\(\)=>propModels\.filter\(o=>o && o\.userData && \/\^sketchfab:\/i\.test\(String\(o\.userData\.src\|\|''\)\) && !o\.userData\.attribution\);/.test(li),
    'the unattributed-model check resolves the actual props…');
  assert(/_issueAt\(bare\+' Sketchfab model'[\s\S]{0,180}, _bareOf\)\)/.test(li),
    '…and hands the panel the finder, not a snapshot of it');
  // build 1423 added the EIGHTH: a prop marked Objective target that cannot be destroyed, which has a
  // specific prop to go and fix. The intent is unchanged and is what the exact count guards — only the
  // checks with somewhere to send you are clickable; the level-wide ones (a light budget, a missing key
  // pad, a Destroy mission with no targets at all) stay plain rows, which is this build's own rule.
  eq((li.match(/_issueAt\(/g) || []).length, 8,
    'eight raise-sites point somewhere (both cutscene faults among them); the rest are level-wide — a light budget or a missing key pad has no single prop to blame');
}

// ---------------------------------------------------------------- the row
{
  const rli = extractFunction('renderLevelIssues');
  assert(/const _find=_issueFind\.get\(msg\);/.test(rli), 'the panel looks the message up');
  assert(/d\.onclick=\(\)=>\{ _edGoToIssue\(_find\); \};/.test(rli), '...and wires the row when there is somewhere to go');
  assert(/d\.style\.cursor='pointer'/.test(rli), 'a clickable row LOOKS clickable');
  assert(/arrow\.textContent=' \\u2192'/.test(rli), '...carries an arrow');
  assert(/d\.title='Click to select and frame the prop this is about'/.test(rli), '...and says what it will do');
  assert(/if\(_find\)\{/.test(rli),
    'and a level-wide issue with nowhere to go stays a plain row — a dead-looking click is worse than none');
  assert(rli.indexOf('d.textContent=msg;') < rli.indexOf('const _find'),
    'the message is still the row’s text; the affordance is added to it, not instead of it');
}

done('build 1300 (editor audit 4.3): the Level Check takes you to the problem — "a signal targets tag vaultDoor, but no prop carries that tag" was a message with nowhere to click. Six checks now register how to find what they are about, keyed by the message they produced, so levelIssues() still returns plain strings and the ten harnesses plus the publish preflight that consume it are untouched. The row selects AND frames, resolves at click time so a prop deleted since the panel opened answers "no longer in the level" instead of selecting a ghost, and a level-wide issue with nowhere to go stays a plain row');
