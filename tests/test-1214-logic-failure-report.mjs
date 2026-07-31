// build 1214: the logic graph stops swallowing its own failures.
//
// The editor-UX critic's CRITICAL #1: the graph's only actuator wrapped _applySignalAction in `try{}catch(e){}`
// — a misspelled tag, a bad clip, a wrong place field all did NOTHING, with no console line, no toast, no
// Level Check entry, so a creator's only debug tool was hand-authoring HUD widgets to print variables. Now
// a do-verb aimed at a tag no placed prop answers, or a verb that throws, is recorded (deduped, capped) and
// levelIssues() surfaces it the moment the creator returns to the editor — "what happened last run".
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the recorder, executed
{
  const api = new Function(
    'const logicFailures = new Map();\n const editorOpen = false;\n' +
    extractFunction('_noteLogicFailure') +
    '\nreturn { note:_noteLogicFailure, map:logicFailures };')();
  api.note('tag "gate" missing');
  api.note('tag "gate" missing');
  api.note('clip "swing" bad');
  eq(api.map.size, 2, 'distinct messages are separate entries');
  eq(api.map.get('tag "gate" missing').n, 2, '...and a repeat bumps the count, not the list');
  for (let i = 0; i < 50; i++) api.note('msg' + i);
  assert(api.map.size <= 20, 'the log is capped so a pathological graph cannot grow it unbounded (' + api.map.size + ')');
}

// ---------------------------------------------------------------- _lgTagExists, executed
{
  const exists = new Function('propModels',
    extractFunction('_lgTagExists') + '\nreturn _lgTagExists;');
  const props = [{ userData: { tag: 'gate' } }, { userData: { tag: 'lift' } }, { userData: {} }];
  assert(exists(props)('gate') === true, 'a placed tag resolves');
  assert(exists(props)('vault') === false, 'a tag nothing carries does NOT resolve — this is the miss that was silent');
}

// ---------------------------------------------------------------- the do-node reports the miss (and only for tag verbs)
{
  const tagVerbs = new Function(src.match(/const _LG_TAG_VERBS = new Set\(\[[^\]]*\]\);/)[0] + '\nreturn _LG_TAG_VERBS;')();
  assert(tagVerbs.has('moveprop') && tagVerbs.has('open') && tagVerbs.has('anim'), 'the tag-verb set covers the target-bearing verbs');
  assert(!tagVerbs.has('spawn') && !tagVerbs.has('teleport') && !tagVerbs.has('win'),
    '...and NOT the placeless world verbs (spawn/teleport act on a place or the run, so a "missing tag" would be a false alarm)');

  // drive the real 'do' branch of _lgPulse with stubs and confirm the note fires for a missing tag, not a present one
  const pulse = extractFunction('_lgPulse');
  const doBranch = pulse.match(/case 'do': \{[\s\S]*?_lgFollow\(id,0\); break; \}/)[0];
  const build = (props) => {
    const notes = [];
    const body =
      'const _LG_TAG_VERBS = new Set(["toggle","open","close","anim","unlock","showprop","hideprop","moveprop","delprop"]);\n' +
      'const propModels = props;\n' +
      extractFunction('_lgTagExists') + '\n' +
      'function _noteLogicFailure(m){ notes.push(m); }\n' +
      'function _applySignalAction(){}\n function _lgFollow(){}\n' +
      'function fire(p){ const id=0; switch("do"){ ' + doBranch + ' } }\n' +
      'return { fire, notes };';
    return new Function('props', 'notes', body)(props, notes);
  };
  { const h = build([{ userData: { tag: 'gate' } }]);
    h.fire({ verb: 'open', target: 'vault' });
    eq(h.notes.length, 1, 'opening a tag no prop has records exactly one failure');
    assert(/vault/.test(h.notes[0]) && /open/.test(h.notes[0]), '...naming the verb and the tag the creator typed'); }
  { const h = build([{ userData: { tag: 'gate' } }]);
    h.fire({ verb: 'open', target: 'gate' });
    eq(h.notes.length, 0, 'a tag that DOES resolve records nothing'); }
  { const h = build([]);
    h.fire({ verb: 'spawn', target: '' });
    eq(h.notes.length, 0, 'a placeless verb with no tag records nothing (no false alarm)'); }
}

// ---------------------------------------------------------------- levelIssues surfaces them, wipe clears them
{
  assert(/if\(typeof logicFailures!=='undefined'\) for\(const \[msg, e\] of logicFailures\) issues\.push\('Logic \(last run\): '\+msg\+\(e\.n>1\?' ×'\+e\.n:''\)\);/.test(src),
    'levelIssues() lists the logic failures from the last run');
  assert(/if\(typeof logicFailures!=='undefined'\) logicFailures\.clear\(\);            \/\/ build 1214: and a clean logic log/.test(src),
    'a scene wipe clears the log (a fresh scene starts clean)');
  assert(/if\(typeof logicFailures!=='undefined'\) logicFailures\.clear\(\);            \/\/ build 1214: stale logic failures too/.test(src),
    'restoreLevel clears it too — stale failures about a previous level are their own lie');
  assert(/renderLevelIssues==='function' && typeof editorOpen!=='undefined' && editorOpen\) renderLevelIssues\(\);/.test(extractFunction('_noteLogicFailure')),
    'a failure landing while the editor is open refreshes the panel live');
}

done('build 1214: the logic graph reports its failures — the recorder executed (dedup, count, cap), _lgTagExists proven, the real do-node branch driven to confirm it notes a missing tag (naming verb + tag) but not a resolved one nor a placeless verb, and levelIssues surfaces them / wipe + restore clear them / the panel refreshes live');
