// build 1229: the editor onboarding pill — the panel critic's "first-hour editor onboarding is a
// manual, not the do-to-advance pill 938 already proved". Four steps (fly, add, move, play), each
// completing when the creator actually performs it; deliberately NO auto-advance timeout (a creator
// reads at their own pace, nothing blocks, the X is the exit); once per browser; deploying ends the
// tour complete. It shares #tutHint with the play coach via dataset.owner so neither clobbers the
// other when a brand-new user triggers both in one session.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the state machine, executed
const CORE = extractFunction('startEditorTutorial') + '\n' + extractFunction('endEditorTutorial') + '\n' +
  extractFunction('updateEditorTutorial');
const drive = (script) => {
  const body =
    'const _mem = {}; const localStorage = { getItem: k => _mem[k] || null, setItem: (k, v) => { _mem[k] = v; } };\n' +
    'const el = { style: {}, dataset: {}, q: { "#tutStep": { textContent: "" }, "#tutTxt": { dataset: {}, innerHTML: "" } }, querySelector(s){ return this.q[s]; } };\n' +
    'const document = { getElementById: () => el };\n' +
    'const _tutEl = () => el;\n' +
    'const EDTUT_STEPS = [ { id: "fly", kb: "f", touch: "f" }, { id: "add", kb: "a", touch: "a" }, { id: "move", kb: "m", touch: "m" }, { id: "play", kb: "p", touch: "p" } ];\n' +
    'const EDTUT_KEY = "k"; let EDTUT = null;\n' +
    'function _edTutRender(){ if(!EDTUT || EDTUT.i >= EDTUT_STEPS.length) return; el.dataset.owner = "ed"; el.style.display = "flex"; }\n' +
    'const isTouch = false; const SFX = { coin(){} };\n' +
    'let editorOpen = true, editorTopView = false, editorFreeFly = true;\n' +
    'let topPanX = 0, topPanZ = 0; const flyPos = { x: 0, y: 10, z: 0 };\n' +
    'const player = { pos: { x: 0, y: 0, z: 0 } };\n' +
    'let propModels = []; let selProps = [];\n' +
    'let toasts = 0, lastToast = ""; const flashToast = (m) => { toasts++; lastToast = m; };\n' +
    CORE + '\n' + script;
  return new Function(body)();
};
{
  const r = drive(
    'startEditorTutorial();\n' +
    'const s0 = EDTUT.i;\n' +
    'updateEditorTutorial(1/60);\n' +                                       // standing still: nothing advances
    'const still = EDTUT.i;\n' +
    'for(let f = 0; f < 20; f++){ flyPos.x += 0.5; updateEditorTutorial(1/60); }\n' +   // fly 10 units in strokes
    'const afterFly = EDTUT.i;\n' +
    'const prop = { position: { x: 3, y: 0, z: 0 } };\n' +
    'propModels.push(prop); selProps = [prop];\n' +                          // the + button: adds AND selects
    'updateEditorTutorial(1/60);\n' +
    'const afterAdd = EDTUT.i;\n' +
    'updateEditorTutorial(1/60);\n' +                                        // baseline frame for the move step
    'prop.position.x += 2;\n' +                                              // drag the gizmo
    'updateEditorTutorial(1/60);\n' +
    'const afterMove = EDTUT.i;\n' +
    'return { s0, still, afterFly, afterAdd, afterMove, on: !!EDTUT };');
  eq(r.s0, 0, 'the tour starts on step 1');
  eq(r.still, 0, 'standing still advances NOTHING — no auto-advance timeout, by design');
  eq(r.afterFly, 1, 'flying ~10 units (accumulated strokes) completes the fly step');
  eq(r.afterAdd, 2, 'adding a shape completes the add step');
  eq(r.afterMove, 3, 'dragging the selected prop half a unit completes the move step');
  assert(r.on, '...and the tour sits on the play step, which only deploying can finish');
}
{ // once per browser + dismiss
  const r = drive(
    'startEditorTutorial();\nendEditorTutorial(true);\n' +
    'const dismissedToast = lastToast;\n' +
    'startEditorTutorial();\n' +                                             // must not come back
    'return { back: !!EDTUT, dismissedToast };');
  eq(r.back, false, 'dismissed once = gone for this browser forever');
  assert(/Field manual/.test(r.dismissedToast), '...and the goodbye names where the manual lives');
}
{ // re-baselining: selecting a DIFFERENT prop re-anchors the move test
  const r = drive(
    'startEditorTutorial(); EDTUT.i = 2;\n' +
    'const a = { position: { x: 0, y: 0, z: 0 } }, b = { position: { x: 50, y: 0, z: 0 } };\n' +
    'propModels.push(a, b); selProps = [a];\n' +
    'updateEditorTutorial(1/60);\n' +                                        // baseline on a
    'selProps = [b];\n' +
    'updateEditorTutorial(1/60);\n' +                                        // switching selection must re-baseline, not read b vs a\'s anchor
    'const jumped = EDTUT.i;\n' +
    'b.position.x += 1;\nupdateEditorTutorial(1/60);\n' +
    'return { jumped, moved: EDTUT ? EDTUT.i : 99 };');
  eq(r.jumped, 2, 'switching selection does NOT false-complete the move step (b is 50 away from a\'s anchor)');
  eq(r.moved, 3, '...but actually dragging the new selection does');
}
{ // the pill hides outside the editor WITHOUT clobbering the play coach's pill
  const r = drive(
    'startEditorTutorial();\nupdateEditorTutorial(1/60);\n' +
    'editorOpen = false;\n' +
    'el.dataset.owner = "play"; el.style.display = "flex";\n' +               // the play coach owns the pill now
    'updateEditorTutorial(1/60);\n' +
    'return el.style.display;');
  eq(r, 'flex', 'outside the editor this coach hides the pill ONLY if it owns it — the play coach\'s pill survives');
}

// ---------------------------------------------------------------- wiring pins
{
  assert(/if\(typeof startEditorTutorial==='function'\) startEditorTutorial\(\);/.test(src),
    'opening the editor starts the tour (a no-op ever after)');
  assert(/if\(typeof EDTUT!=='undefined' && EDTUT\) endEditorTutorial\(false\);/.test(src),
    'deploying ends the tour COMPLETE — playing your level is the tour\'s whole point');
  assert(/updateEditorTutorial\(dt\);\s+\/\/ build 1229: editor coach — runs second/.test(src),
    'the loop drives it AFTER the play coach, so in the editor it wins the shared pill');
  assert(/el\.dataset\.owner='play';/.test(src) && /el\.dataset\.owner='ed';/.test(src),
    'both coaches stamp ownership on the shared element');
  assert(/EDTUT && el\.dataset\.owner==='ed'\) endEditorTutorial\(true\); else endTutorial\(true\);/.test(src),
    'the X dismisses whichever coach owns the pill right now');
  const steps = extractFunction('updateEditorTutorial');
  assert(!/EDTUT\.t\s*>\s*15/.test(steps) && !/\|\| EDTUT\.t>/.test(steps),
    'NO auto-advance timeout — unlike play\'s 15s, a creator reads at their own pace and the X is the exit');
}

done('build 1229: the editor onboarding pill — the real state machine executed through the full tour (fly by accumulated strokes, add, move with selection re-baselining so switching props cannot false-complete, play only by deploying), no auto-advance timeout by design, once per browser, dismissed-forever honoured, and the shared pill element is owner-stamped so the play coach and the editor coach can never clobber each other');
