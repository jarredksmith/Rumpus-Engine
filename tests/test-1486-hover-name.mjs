// build 1486 — the hovered object has a NAME, through the one prompt that already names things
//
// 1480 and 1485 answer "is this clickable"; neither answers WHAT it is, which is the other half of a
// point-and-click affordance. The load-bearing property here is not the text: it is that `#prompt` keeps
// exactly ONE writer, and that proximity outranks the hover.

import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---------------------------------------------------------------- the label, EXECUTED
const mk = (over) => {
  const st = Object.assign({ hot:true, target:null }, over);
  const body = [
    'let _clkHot = st.hot, _clkTarget = st.target;',
    extractFunction('_clkHoverLabel', src),
    'return _clkHoverLabel;',
  ].join('\n');
  return new Function('st', '_creditEsc', body)(st, (t) => String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
};

eq(mk({ target:{ userData:{ name:'Lever' } } })(), '<b>CLICK</b> Lever',
   "an authored name is what the player is told — the outliner's own name, for free");
eq(mk({ target:{ userData:{} } })(), '<b>CLICK</b>',
   'an unnamed prop gets an honest generic, never the string "undefined"');
eq(mk({ target:{ userData:{ name:'   ' } } })(), '<b>CLICK</b>',
   'and neither does a name that is only whitespace');
eq(mk({ target:{ userData:{ name:'  Vault Door  ' } } })(), '<b>CLICK</b> Vault Door', 'trimmed');
eq(mk({ hot:false, target:{ userData:{ name:'Lever' } } })(), '',
   'not hot is no label, even with a remembered prop');
eq(mk({ hot:true, target:null })(), '', 'hot with no prop is no label');
eq(mk({ target:{} })(), '<b>CLICK</b>', 'a prop with no userData at all cannot throw mid-frame');
eq(mk({ target:{ userData:{ name:123 } } })(), '<b>CLICK</b>',
   'a non-string name is refused rather than coerced');

// a level file authors the name, so it is ESCAPED — the same rule builds 1277/1325 landed on
{
  const out = mk({ target:{ userData:{ name:'<img src=x onerror=alert(1)>' } } })();
  assert(!/<img/.test(out), 'markup in an authored name cannot reach the DOM as markup');
  assert(/&lt;img/.test(out), '...it arrives escaped');
  assert(/_creditEsc\(/.test(extractFunction('_clkHoverLabel', src)),
     'and it goes through the same escaper the neighbouring prompt branches use');
}

// ---------------------------------------------------------------- ONE writer of #prompt
{
  const cp = extractFunction('checkProximity', src);
  assert(/const _hl = _clkHoverLabel\(\);/.test(cp),
    'the hover label is produced INSIDE the proximity writer, not beside it');
  assert(/if\(_hl\)\{ prompt\.innerHTML = _hl; prompt\.style\.display='block'; prompt\.dataset\.hover = '1'; \}/.test(cp),
    '...in the branch that runs when proximity has nothing of its own');
  assert(/else \{ prompt\.style\.display='none'; prompt\.dataset\.hover = ''; \}/.test(cp),
    '...and nothing at all still hides it');

  // proximity outranks the hover: the label is in the ELSE of the nearTarget branch
  const near = cp.indexOf('if(nearTarget){');
  const els  = cp.indexOf('} else {', near);
  const lbl  = cp.indexOf('_clkHoverLabel()');
  assert(near > 0 && els > near && lbl > els,
    'PROXIMITY WINS — a live E prompt at arm\'s reach is the actionable verb, and the hover fills the gap');

  // and nothing else in the engine writes the element
  const writes = (src.match(/prompt\.innerHTML\s*=/g) || []).length;
  const el = (src.match(/\bprompt\.style\.display\s*=/g) || []).length;
  assert(writes > 0 && el > 0, 'the writer exists');
  /* the SYNTAX, never the bare word: my own comment in `_clkHoverTick` says "prompt" and defeated the first
     version of this pin — the trap this file records under builds 1411/1412/1421 and 1485, arriving again. */
  const tick = extractFunction('_clkHoverTick', src);
  assert(!/prompt\s*\.\s*\w+\s*=/.test(tick) && !/innerHTML/.test(tick),
    'the HOVER never writes the prompt — one element, one writer, so they cannot blink between two answers');
  assert(!/prompt\s*\.\s*\w+\s*=/.test(extractFunction('_clkHoverLabel', src)),
    '...and neither does the label: it RETURNS text and writes nothing');
}

// ---------------------------------------------------------------- the target comes from the same resolve
{
  const tick = extractFunction('_clkHoverTick', src);
  assert(/_clkTarget = _clkResolve\(_clkMx, _clkMy\);/.test(tick),
    'the prop is kept from the resolve that was already happening — never a second raycast to disagree with it');
  assert(/_clkSetHot\(!!_clkTarget, _locked\)/.test(tick), '...and the cue is derived from it');
  // every giving-up exit forgets the prop, or a label outlives its own hover
  const offs = tick.match(/_clkTarget = null; _clkSetHot\(false\); return;/g) || [];
  eq(offs.length, 3,
     'all three early exits clear the target — a remembered prop with the cue off is a label that will not go away');
  assert(!/_clkSetHot\(false\); return;/.test(tick.replace(/_clkTarget = null; _clkSetHot\(false\); return;/g, '')),
     '...and there is no fourth exit that forgot to');
}

// declared beside the other click state, above everything that reads it
{
  const decl = src.indexOf('let _clkTarget = null;');
  assert(decl > 0, 'declared');
  assert(decl < src.indexOf('function _clkHoverLabel'), 'above the label that reads it (no TDZ — 1127/1331)');
  assert(decl < src.indexOf('function checkProximity'), 'and above the writer');
}

// ---------------------------------------------------------------- the dead tap on touch
{
  assert(/pr\.addEventListener\('pointerdown', e=>\{ if\(isTouch && pr\.dataset\.hover !== '1'\)/.test(src),
    "touch's tap-the-prompt shortcut declines a HOVER label: `interact()` is the wrong verb for a click target, and a tap that does nothing is the failure this run of builds exists to remove");
  // and the flag is cleared on the proximity branch, or one hover would poison every later E prompt
  const cp = extractFunction('checkProximity', src);
  assert(/prompt\.style\.display='block'; prompt\.dataset\.hover = '';/.test(cp),
    'a real proximity prompt clears the flag, so a hover cannot disable the tap shortcut afterwards');
}

done();
