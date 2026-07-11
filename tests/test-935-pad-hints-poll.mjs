// (build 935) CONTROLLER HINTS NEVER SHOWED — build 934's pad texts were gated on padSeen, which
// is set ONLY by the gamepadconnected EVENT (never fires on some browsers/devices), and on any
// touch-capable device the hint's isTouch branch beat the pad branch anyway. Reproduced headless:
// with a pad actively driving the game and no connect event, the hint stayed "[G / MMB] Grab"
// (desktop) / "Hold USE to grab" (touch). Now pollGamepad itself detects real input (buttons or
// sticks) and stamps _padLastActive; padRecent() = pad input in the last 6s; the device IN USE
// wins every hint: the grab/carry hint, the nearTarget prompts (Y / USE / E), and the dialogue
// advance hint.
// Verified live in BOTH desktop and touch configs with no forced padSeen: after stick input the
// hint read "[Y] Grab", then "[Y] Drop · [RT] Throw" while carrying; grab/drop/throw all worked.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// detection comes from the poll, not just the event
const poll = extractFunction('pollGamepad', src);
assert(/if\(bt\.some\(b=>b && \(b\.pressed \|\| b\.value>0\.3\)\) \|\| ax\.some\(a=>Math\.abs\(a\)>0\.25\)\)\{ padSeen=true; _padLastActive=performance\.now\(\); \}/.test(poll),
  'pollGamepad sets padSeen + stamps _padLastActive on real input (the connect event is unreliable)');
assert(/function padRecent\(\)\{ return padSeen && \(performance\.now\(\) - _padLastActive\) < 6000; \}/.test(src),
  'padRecent(): the pad gave input in the last few seconds');

// the grab hint: pad beats touch beats keyboard — run it for real
const ugh = extractFunction('updateGrabHint', src);
const run = (padRec, touch, held, avail) => {
  const el = { style:{}, textContent:'' };
  const fn = new Function('document','padRecent','isTouch','heldProp','_grabAvail','_grabLabel',
    ugh + '\nupdateGrabHint();');
  fn({ getElementById: () => el }, () => padRec, touch, held ? { userData:{} } : null, avail, '');
  return el.textContent;
};
assert(run(true, true, false, true) === '[Y] Grab', 'pad in use on a TOUCH device still shows [Y] Grab');
assert(run(true, false, true, false) === '[Y] Drop · [RT] Throw', 'carrying with a pad shows [Y] Drop · [RT] Throw');
assert(run(false, true, false, true) === 'Hold USE to grab', 'no recent pad input on touch keeps the touch text');
assert(run(false, false, false, true) === '[G / MMB] Grab', 'keyboard text survives when no pad is in use');

// nearTarget prompts + dialogue name the key on the device in use
assert(/const _uk = \(typeof padRecent==='function' && padRecent\(\)\) \? 'Y' : \(isTouch \? 'USE' : 'E'\);/.test(src),
  'the interact prompts pick Y / USE / E by device');
assert(/<b>\$\{_uk\}<\/b> Drive/.test(src) && /<b>\$\{_uk\}<\/b> Talk/.test(src) && /<b>\$\{_uk\}<\/b> Pick up/.test(src),
  'the prompt templates use the picked key');
assert(/const _ukd=\(typeof padRecent==='function' && padRecent\(\)\) \? 'Y' : 'E';/.test(src),
  'the dialogue advance hint follows too');

done('build 935: hints follow the device in use — pad input detected from the poll, [Y] texts win over touch/keyboard');
