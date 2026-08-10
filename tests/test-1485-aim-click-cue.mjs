// build 1485 — the crosshair says what is clickable, for the view that has no cursor
//
// Builds 1479/1480 gave the world an On-click trigger and a hover cue, and gated the cue on a FREE pointer.
// So in first person — the engine's DEFAULT view — clicking a prop worked and nothing on screen ever said the
// prop was clickable. The interesting part is that `_clkResolve` already rayed through screen centre when
// locked, so the ANSWER existed the whole time: this build is a class and a ring, not a second resolver.

import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---------------------------------------------------------------- the tick no longer refuses a locked view
{
  const tick = extractFunction('_clkHoverTick', src);
  assert(!/document\.pointerLockElement\s*\|\|\s*_clkBlocked/.test(tick),
    'a captured pointer is no longer an early return — that gate WAS the bug');
  assert(/const _locked = !!document\.pointerLockElement;/.test(tick),
    '...it is read as a fact about WHERE the hit resolves instead');
  assert(/_clkSetHot\(!!_clkTarget, _locked\)/.test(tick),
    'and passed on, so the cue knows which cue it is');
  assert(/if\(!_locked && _clkMx < 0\)/.test(tick),
    'only a FREE pointer has to have been seen first — a locked one ignores the coordinates');
  // the throttles and the whole-level gate survive: this must stay free on a level with nothing clickable
  assert(/_clkAny = _clkAnyClickable\(\)/.test(tick), 'the level-wide scan survives');
  assert(/if\(!_clkAny\)\{ _clkTarget = null; _clkSetHot\(false\); return; \}/.test(tick),
    'a level with nothing clickable still costs one boolean and no raycast');
  assert(/CLK_HOVER_EVERY/.test(tick), 'and the hover raycast is still throttled');
  assert(/_clkBlocked\(\)/.test(tick), 'and every blocking UI still suppresses it');
}

// `_clkResolve` needed NO change — the answer was always there
{
  const res = extractFunction('_clkResolve', src);
  assert(/if\(!document\.pointerLockElement\)\{/.test(res),
    'locked still means screen centre, which is why this build adds no second resolver');
  assert(/x2\.when === 'clicked'/.test(res), 'and only a prop that answers a click is ever hot');
}

// ---------------------------------------------------------------- one writer, two classes, executed
{
  const fn = new Function('doc', `
    let _clkHot = false, _clkHotAim = false;
    const document = doc;
    ${extractFunction('_clkSetHot', src)}
    return { set:_clkSetHot, st:()=>({ hot:_clkHot, aim:_clkHotAim }) };
  `);
  const log = [];
  const cls = new Set();
  const doc = { body: { classList: {
    toggle(n, v){ log.push(n + '=' + (v ? 1 : 0)); if(v) cls.add(n); else cls.delete(n); } } } };
  const r = fn(doc);

  r.set(true, true);
  eq(cls.has('clickHot'), true, 'a locked hover sets the shared hot class');
  eq(cls.has('clickHotAim'), true, '...and the AIM class, which is what draws the reticle ring');

  const n = log.length;
  r.set(true, true);
  eq(log.length, n, 'an unchanged state writes NOTHING — this runs every frame of every session');

  r.set(true, false);
  eq(cls.has('clickHot'), true, 'a FREE-pointer hover is still hot (the cursor cue, build 1480)');
  eq(cls.has('clickHotAim'), false,
     '...but never the aim class: the hit resolved under the POINTER, so a ring at screen centre would point at the wrong thing');

  r.set(false, true);
  eq(cls.has('clickHot'), false, 'not hot means not hot...');
  eq(cls.has('clickHotAim'), false, '...and aim can never outlive it (a && guard, not two flags)');

  r.set(false);
  eq(r.st().aim, false, 'the old one-argument call still means "not aiming" — every pre-1485 call site is safe');

  // a throwing DOM cannot take the frame loop down
  const bad = fn({ get body(){ throw new Error('no'); } });
  bad.set(true, true);
  eq(bad.st().hot, true, 'a throwing classList still records the state rather than throwing mid-frame');
}

// the flag is declared beside the others, not somewhere below its use
{
  const decl = src.indexOf('_clkHotAim = false');
  const use = src.indexOf('function _clkSetHot');
  assert(decl > 0 && use > decl, 'declared above the function that writes it (no TDZ — 1127/1331)');
  eq((src.match(/_clkHotAim\s*=/g) || []).length, 2,
     'written in exactly one place beside its declaration: one writer, so the two classes cannot drift');
}

// ---------------------------------------------------------------- the ring is built with the reticle
{
  const ac = extractFunction('applyCrosshair', src);
  assert(/const hotRing = '<div class="xhHot"><\/div>';/.test(ac), 'the ring is one element');
  assert(/if\(cfg\.style==='none'\)\{ el\.innerHTML = hotRing; return; \}/.test(ac),
    "style 'none' gets the ring too — it is an affordance, not a reticle, and appears only over a clickable prop");
  assert(/el\.innerHTML = html \+ hotRing;/.test(ac), 'and every other style gets it on the end');
  eq((ac.match(/hotRing/g) || []).length, 3, 'declared once, emitted on both exits — no style can miss it');
  // it must not be rebuilt on a hover: nothing in the hover path touches innerHTML
  const tick = extractFunction('_clkHoverTick', src);
  assert(!/innerHTML/.test(tick) && !/applyCrosshair/.test(tick),
    'the hover NEVER rebuilds the reticle — a per-frame innerHTML at the moment of aiming is the thing this shape avoids');
  // and it carries no bloom term, so it holds still while the arms breathe (1219)
  assert(!/xhHot[^']*xh-bloom/.test(ac), 'the ring carries no --xh-bloom term');
  assert(/--xh-bloom/.test(ac), '...while the arms still do (build 1219 intact)');
}

// ---------------------------------------------------------------- the CSS (markup pin — use `html`)
{
  assert(/#crosshair \.xhHot \{/.test(html), 'the ring has a rule');
  const rule = html.slice(html.indexOf('#crosshair .xhHot {'), html.indexOf('#crosshair::before'));
  assert(/opacity:\s*0;/.test(rule), 'invisible at rest — a resting ring would be a second reticle');
  assert(/border-radius:\s*50%/.test(rule), 'a ring');
  assert(/var\(--accent\)/.test(rule), 'in the theme accent, so a recoloured HUD recolours it (1469)');
  assert(/pointer-events:\s*none/.test(rule), 'and never eats a click');
  assert(/transition:\s*opacity/.test(rule), 'it fades rather than popping');
  assert(!/transform:\s*scale/.test(rule),
    'a fade, not a motion — so it needs no reduced-motion gate at all (1313)');
  assert(/width:\s*150%/.test(rule) && /height:\s*150%/.test(rule),
    'sized as a PROPORTION of the authored reticle, so a creator who shrank theirs gets a ring to match');

  assert(/body\.clickHotAim #crosshair \.xhHot \{ opacity: \.95; \}/.test(html),
    'and it is shown by the AIM class alone');
  assert(!/body\.clickHot #crosshair \.xhHot/.test(html),
    'never by the shared hot class — that would draw a centre ring for a hit found under a free pointer');
  // 1480's cursor rule is untouched
  assert(/body\.clickHot canvas \{ cursor: pointer; \}/.test(html), "build 1480's cursor cue is unchanged");
}

done();
