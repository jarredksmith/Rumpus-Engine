// build 1490 — a control that ENABLES another must repaint the one it enables
//
// Reported from play: "the move to mouse click option was finnicky in the gameplay tab — sometimes I could
// click it and sometimes I couldn't." Click-to-move (build 1481) is disabled until Free mouse cursor is on,
// and Free mouse cursor's handler did not re-render, so the box below stayed dead until an unrelated edit
// happened to repaint the panel. Switching tabs and back fixed it, which is the shape of the report.
//
// The pins here are on the WIRE, not on either end: the parent's handler must call renderEditorFields, and
// the child's disabled state must be derived from the parent's flag at render time.

import { gameSource, assert, eq, done } from './harness.mjs';

const src = gameSource();

/* ---------- the block, sliced between two anchors that are both asserted found ---------- */
const a = src.indexOf("const fcRow=document.createElement('label');");
const b = src.indexOf("build 1084: the camera is derived, not placed");
assert(a > 0, 'the free-cursor row is in the source');
assert(b > a, 'the block ends at the live-camera-preview row that follows it');
const blk = src.slice(a, b);

/* ---------- 1. the fix: the parent repaints ---------- */
const fcOn = blk.match(/fcCb\.onchange\s*=\s*\(\)\s*=>\{[^}]*\};/);
assert(fcOn, 'the free-cursor handler is one statement');
assert(/gameCfg\.freeCursor\s*=\s*fcCb\.checked/.test(fcOn[0]), 'it writes the flag');
assert(/renderEditorFields\(\)/.test(fcOn[0]),
  'and it RE-RENDERS — without this the child it enables stays dead (the reported bug)');
assert(/pushUndoSnapshot\(\)/.test(fcOn[0]), 'undo still covers the toggle');

/* the child's own handler must NOT re-render: it enables nothing below it, and a repaint mid-click would
   throw away the row the creator is looking at for no gain. Asserted so a future sweep does not add one. */
const cmOn = blk.match(/cmCb\.onchange\s*=\s*\(\)\s*=>\{[^}]*\};/);
assert(cmOn, 'the click-to-move handler is one statement');
assert(/gameCfg\.clickMove\s*=\s*cmCb\.checked/.test(cmOn[0]), 'it writes its own flag');
assert(!/renderEditorFields/.test(cmOn[0]), 'and it does not repaint — it enables nothing');

/* ---------- 2. the derivation, so the two can never disagree ---------- */
assert(/cmCb\.disabled\s*=\s*!gameCfg\.freeCursor;/.test(blk),
  'disabled is DERIVED from the parent flag at render time, not latched');
assert(blk.indexOf('cmCb.disabled=') < blk.indexOf('cmSp.innerHTML'),
  'derived before the label reads it, or the label describes the previous state');

/* ---------- 3. it says WHY, both ways (1338/1348) ---------- */
assert(/if\(cmCb\.disabled\)\{[^}]*cmRow\.title=/.test(blk),
  'a disabled row carries a tooltip naming the control that unlocks it');
assert(/cmRow\.style\.opacity='0\.55'/.test(blk), 'and reads as unavailable');
const lbl = blk.match(/cmSp\.innerHTML\s*=\s*[^;]+;/);
assert(lbl, 'the label is one expression');
assert(/cmCb\.disabled\s*\?/.test(lbl[0]), 'whose text BRANCHES on the disabled state');
assert(/tick <b>Free mouse cursor<\/b> first/.test(lbl[0]),
  'disabled: it names the switch to tick');
assert(/walk to where you click/.test(lbl[0]),
  'enabled: it says what the control does');

/* ---------- 4. the view gate, and the hint that covers its absence ---------- */
const GATE = "_curView==='top' || _curView==='side' || (_curView==='chase' && gameCfg.chaseCursorAim)";
assert(src.split(GATE).length - 1 >= 2,
  'the gate is written once as a condition and once as its negation — same terms, so they cannot drift');
const neg = src.indexOf('if(!(' + GATE + '))');
const pos = src.indexOf('if(' + GATE + '){');
assert(neg > 0, 'the NEGATED gate exists — the case where the controls are absent');
assert(pos > neg, 'and the hint explaining where they went comes BEFORE the block it explains');
const hintTxt = src.slice(neg, pos);
assert(/is offered in Top-down and Side-scroll/.test(hintTxt), 'the hint names the views that do offer it');
assert(/Aim at cursor/.test(hintTxt), 'and the third-person switch that turns it on');
assert(/On click<\/i> prop signals work in every view/.test(hintTxt),
  'and does not leave a first-person creator thinking On-click is unavailable to them');

/* ---------- 5. the pair is INSIDE the gate, so neither can appear without the other ---------- */
const tail = src.slice(pos);
const fcAt = tail.indexOf('const fcRow=document.createElement');
const cmAt = tail.indexOf('const cmRow=document.createElement');
assert(fcAt > 0 && cmAt > fcAt, 'free cursor, then click-to-move indented under it');
assert(cmAt - fcAt < 3000, 'and adjacent — nothing has drifted between the parent and its child');

/* ---------- 6. executed: the render decision, driven both ways ---------- */
/* The three lines that decide the child's state are lifted from source rather than restated, so a retune
   fails here instead of passing against a stale copy. */
const decide = new Function('gameCfg', `
  const cmCb = { disabled:false }, cmRow = { style:{}, title:'' }, cmSp = { innerHTML:'' };
  ${blk.match(/cmCb\.disabled\s*=\s*!gameCfg\.freeCursor;/)[0]}
  ${blk.match(/if\(cmCb\.disabled\)\{[^}]*\}/)[0]}
  ${lbl[0]}
  return { disabled: cmCb.disabled, opacity: cmRow.style.opacity || '', title: cmRow.title, label: cmSp.innerHTML };
`);

const off = decide({ freeCursor: false });
eq(off.disabled, true, 'free cursor OFF → the child is disabled');
eq(off.opacity, '0.55', 'and dimmed');
assert(off.title.length > 20, 'and carries the reason');
assert(/tick <b>Free mouse cursor<\/b> first/.test(off.label), 'and the label says what to do');

const on = decide({ freeCursor: true });
eq(on.disabled, false, 'free cursor ON → the child is live');
eq(on.opacity, '', 'not dimmed');
eq(on.title, '', 'and no "you cannot use this" tooltip left behind');
assert(/walk to where you click/.test(on.label), 'and the label describes the feature');

/* the control that makes the executed rows mean something: an undefined flag reads as off, not as on */
eq(decide({}).disabled, true, 'an absent flag is OFF — a level authored before free cursor is unchanged');

done('build 1490 — ticking Free mouse cursor brings Click to move to life on the same frame, and a ' +
     'disabled row says which switch unlocks it');
