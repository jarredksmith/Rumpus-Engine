// build 1500: the Ctrl+S confirmation is a toast, visible from any tab.
//
// Reported from play: "Can there be a small on-screen toast after saving via 'ctrl-s'? Right now it only
// shows if you have the Save tab open, and even then it's a little buried." Correct — Ctrl+S clicks
// #edSave from any tab (the panel HTML is static, so the button always exists), but the only confirmation
// was the #edCopied note, which renders only on the Save tab. The save WORKED everywhere; the feedback did
// not, which reads as the save not working.
import { gameSource, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---------------------------------------------------- slice the edSave handler between its anchors ----
const a = src.indexOf("p.querySelector('#edSave').onclick = ()=>{");
const b = src.indexOf("p.querySelector('#edShare').onclick", a);
assert(a > 0 && b > a, 'edSave handler anchors found, in order');
const h = src.slice(a, b);

// ONE message string, both consumers — the note and the toast can never disagree
assert(/const _msg = _ok \?/.test(h), 'the message is computed once');
assert(/note\.textContent = _msg;/.test(h), '...the Save-tab note shows it');
assert(/flashToast\(_msg\)/.test(h), '...and the toast shows the SAME string, from any tab');
assert(!/flashToast\('/.test(h), 'no second toast literal exists to drift from the note');
assert(h.indexOf("'Save failed") < h.indexOf('flashToast(_msg)'),
  'the failure message is part of _msg, so a FAILED save toasts too — a silent failure is worse');

// Ctrl+S still routes through the button, so keyboard and click saves are one path
{
  const k = src.indexOf("const b=document.getElementById('edSave'); if(b) b.click();");
  assert(k > 0, 'the Ctrl+S handler clicks #edSave — the toast covers the keyboard path by construction');
}

// -------------------------------------------------------------- execute the real handler body ----
const arrow = h.slice(h.indexOf('()=>{'));
function run({ ok, idx, toastFn }){
  const note = { textContent: '', _t: 0 };
  const toasts = [];
  const rig = new Function('saveLevel','editorEl','campaignEditIdx','campaign','flashToast','clearTimeout','setTimeout',
    'let _foreignLevel = true; const fn = ' + arrow + '; fn(); return { note: arguments[1].querySelector(), foreign: _foreignLevel };');
  const r = rig(() => ok, { querySelector: () => note }, idx, { levels: [{ name: 'Intro' }] },
    toastFn === undefined ? (m) => toasts.push(m) : toastFn, () => {}, () => 0);
  return { note, toasts, foreign: r.foreign };
}

{ // attached to a campaign level, save succeeds: both surfaces carry the dual-destination message
  const r = run({ ok: true, idx: 0 });
  assert(/campaign level “Intro” updated too/.test(r.note.textContent), 'note names the campaign level');
  eq(r.toasts.length, 1, 'exactly one toast');
  eq(r.toasts[0], r.note.textContent, 'toast === note, byte-identical');
  eq(r.foreign, false, 'a successful save still adopts a foreign level (build 1254 intact)');
}
{ // detached: the plain message
  const r = run({ ok: true, idx: -1 });
  assert(/Level saved/.test(r.toasts[0]), 'detached save toasts the plain confirmation');
}
{ // storage failure: the toast says so instead of staying silent
  const r = run({ ok: false, idx: -1 });
  assert(/Save failed/.test(r.toasts[0]), 'a failed save toasts the failure');
  eq(r.foreign, true, '...and does not adopt');
}
{ // no flashToast in scope (boot-order paranoia): the typeof guard keeps the save itself working
  const r = run({ ok: true, idx: -1, toastFn: null });
  assert(/Level saved/.test(r.note.textContent), 'the note still works with no toast function');
}

done('build 1500: saving from any tab toasts the same message the Save-tab note shows — success, ' +
  'campaign write-through and failure alike');
