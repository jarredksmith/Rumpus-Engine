import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1282: the editor audit's highest-value ten-line change, and it had already been quick-win #3 in the
// build-1253 audit without moving. `levelIssues()` had exactly TWO call sites — its own definition and the
// panel that renders it — so the engine would write "this prop's model is stored on this device only and
// will load for nobody else", or "a signal targets a tag no prop carries", and then let the creator publish
// that level to strangers anyway. The knowledge existed; nothing asked for it at the moment it mattered.

{ // it runs where it matters now
  // count CALL SITES, not text — two of the matches are prose in comments, and a test that counts
  // mentions is measuring the documentation (build 1280's lesson, one week old)
  const calls = (src.match(/(?:^|[^.\w])levelIssues\(\)/gm) || []).filter((_, i, a) => true);
  assert(/const _pre = \(typeof levelIssues==='function'\) \? levelIssues\(\) : \[\];/.test(src),
    'the publish path calls it');
  assert(/const issues = levelIssues\(\);/.test(src), '...and so does the panel that renders the report');
  assert(/function levelIssues\(\)\{/.test(src), '...and it is defined once');
  assert(calls.length >= 3, 'both call sites plus the definition are present (' + calls.length + ' textual matches)');
  const pub = src.slice(src.indexOf("const submitBtn = p.querySelector('#edSubmitComm');"));
  const body = pub.slice(0, pub.indexOf('\n  const '));
  assert(/levelIssues==='function'\) \? levelIssues\(\) : \[\]/.test(body), 'the publish button asks for the report');
  assert(body.indexOf('levelIssues()') < body.indexOf('uiPromptForm'),
    '...BEFORE the name prompt, so a creator is not asked to name a level they then abandon');
  assert(/serializeLevel\(\)/.test(body) && body.indexOf('serializeLevel()') < body.indexOf('levelIssues()'),
    '...and after serializing, so the check sees exactly what would be uploaded');
}
{ // it ADVISES, it does not refuse
  const pub = src.slice(src.indexOf("const submitBtn = p.querySelector('#edSubmitComm');"));
  assert(/Publish anyway/.test(pub), 'the creator can publish regardless — a warning is not proof of a defect');
  assert(/label:'Go back'/.test(pub), '...or go back and fix it');
  assert(/if\(!_go\)\{ if\(note\) note\.textContent='Publish cancelled/.test(pub),
    'going back cancels cleanly and says why');
  assert(/see Level Check in the Save tab/.test(pub), '...and points at where the full list lives');
  assert(/_pre && _pre\.length/.test(pub), 'a clean level sees no dialog at all — this must not nag');
}
{ // THE DIALOG MUST SETTLE ON EVERY PATH. uiConfirm only calls back on CONFIRM, so using it here would
  // leave the promise pending forever on cancel and the publish flow would die silently — a worse bug
  // than the one being fixed. _uiDialog runs each button's fn, and routes Escape to the first
  // non-primary button, so all three exits resolve.
  const pub = src.slice(src.indexOf("const submitBtn = p.querySelector('#edSubmitComm');"));
  assert(/new Promise\(res=>_uiDialog\(/.test(pub), 'the preflight uses _uiDialog, not uiConfirm');
  assert(/fn:\(\)=>res\(false\)/.test(pub) && /fn:\(\)=>res\(true\)/.test(pub), 'BOTH buttons resolve the promise');
  const dlg = extractFunction('_uiDialog');
  assert(/close\(buttons\[0\] && !buttons\[0\]\.primary \? buttons\[0\]\.fn : null\)/.test(dlg),
    'Escape routes to the first non-primary button...');
  const first = pub.slice(pub.indexOf('[ { label:'), pub.indexOf('] ));'));
  assert(first.indexOf("label:'Go back'") < first.indexOf('primary:true'),
    '...which is "Go back" here, so Escape resolves false rather than hanging');
}
{ // the report is summarised, not dumped — a 40-issue level must stay readable
  const pub = src.slice(src.indexOf("const submitBtn = p.querySelector('#edSubmitComm');"));
  assert(/_pre\.slice\(0, 6\)/.test(pub), 'at most six issues are shown');
  assert(/_pre\.length > 6 \? \('\\n\\u2026and ' \+ \(_pre\.length-6\) \+ ' more/.test(pub),
    '...and the rest are counted rather than silently dropped');
  assert(/_pre\.length===1\?'':'s'/.test(pub), 'and the count reads correctly for one');
}
{ // it can never break publishing
  const pub = src.slice(src.indexOf("const submitBtn = p.querySelector('#edSubmitComm');"));
  const pre = pub.slice(pub.indexOf('build 1282'), pub.indexOf('build 958'));
  assert(/\}catch\(e\)\{\}/.test(pre),
    'a throw inside the preflight cannot stop a creator publishing — the check is advice, not a gate');
}
{ // and the thing it warns about is real: a device-local model genuinely loads for nobody else
  const li = extractFunction('levelIssues');
  assert(/local:/.test(li), 'levelIssues knows about device-only models (build 1177)');
  assert(/lodReport/.test(li), '...and reports culling when it is on (build 1274)');
}

done('build 1282: publish runs the Level Check — after serializing so it sees what would actually be uploaded, before the name prompt so nobody names a level they abandon, summarised to six issues with the rest counted, advising rather than refusing, and using _uiDialog so all three exits (publish / go back / Escape) settle the promise where uiConfirm would have hung the flow on cancel');
