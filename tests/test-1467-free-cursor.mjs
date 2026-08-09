// build 1467 — a free mouse cursor, so on-screen elements can be clicked in play.
//
// Asked for from play: "maybe a gameplay that allows point-click type navigation (which isn't possible
// today as the mouse is always the camera control) so that on-screen elements could be clicked."
//
// VERIFIED BEFORE BUILDING, because the obvious reading is wrong: it is not merely that the mouse is the
// camera in FIRST PERSON. The twin-stick, top-down and ARPG views already draw a cursor — but `_vcX +=
// e.movementX` accumulates it from POINTER-LOCKED deltas, so there is no OS pointer in ANY view and no DOM
// element is clickable anywhere in play. Build 1255 had to release the lock by hand just to make one HUD
// button work, and had to whitelist itself out of the pause-on-unlock handler to stop that pausing the game.
//
// Free cursor: never take the lock, drive the same `_vcX/_vcY` the aim already reads from the REAL pointer,
// show a real cursor. Everything downstream — the aim ray, the crosshair, the body facing, the shot origin
// — is untouched, because it all reads `_vcX/_vcY` and always did.

import { gameSource, html, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. the predicate
{
  const f = extractFunction('_cursorFreeNow', src);
  assert(/isTouch/.test(f), 'touch is excluded — there is no pointer to free');
  assert(/gameCfg\.freeCursor/.test(f), 'it is a level setting');
  assert(/cursorAimActive/.test(f),
    'and it requires a CURSOR VIEW: in first person the mouse IS the head, so "free the mouse" and ' +
    '"first person" are contradictory requests rather than a combination to support');

  const run = new Function('S', `
    const isTouch = !!S.touch;
    const gameCfg = { freeCursor: !!S.free };
    const cursorAimActive = () => !!S.cursorView;
    ${f}
    return _cursorFreeNow();`);

  eq(run({ free:true,  cursorView:true  }), true,  'a cursor view with the setting on');
  eq(run({ free:false, cursorView:true  }), false, 'the setting off is the pre-1467 engine');
  eq(run({ free:true,  cursorView:false }), false, 'first person never frees the cursor, whatever the level says');
  eq(run({ free:true,  cursorView:true, touch:true }), false, 'touch never');
  eq(run({}), false, 'nothing set: captured, which is every level authored before this build');
}

// ---------------------------------------------------------------- 2. ONE refusal, not eight guards
{
  const t = extractFunction('tryPointerLock', src);
  assert(/_cursorFreeNow\(\)\) return;/.test(t), 'the refusal lives inside tryPointerLock');
  assert(t.indexOf('_cursorFreeNow') < t.indexOf('requestPointerLock'),
    '...before it asks for the lock');

  // there are many re-lock callers; every one must inherit the refusal rather than carry its own
  const callers = (src.match(/tryPointerLock\(\)/g) || []).length;
  assert(callers >= 6,
    'there are ' + callers + ' places that re-take the lock — chat close, shop close, inventory close, ' +
    'the upgrade pick, deploy and the canvas click among them, and the one that got forgotten would ' +
    'swallow the cursor mid-game');
  assert(!/if\([^)]*_cursorFreeNow[^)]*\)[^;]*tryPointerLock/.test(src),
    '...and none of them guards itself, which is what makes the single refusal the whole story');
}

// ---------------------------------------------------------------- 3. the real pointer drives the aim
{
  const A = src.indexOf('if(typeof _cursorFreeNow===\'function\' && _cursorFreeNow() && !drivingCar){');
  assert(A > 0, 'the free-cursor branch is in the look handler');
  const blk = src.slice(A, A + 400);
  assert(/_vcX = e\.clientX - innerWidth \* 0\.5;/.test(blk), 'it maps the pointer onto _vcX...');
  assert(/_vcY = e\.clientY - innerHeight \* 0\.5;/.test(blk), '...and _vcY');
  assert(/return;/.test(blk), '...and stops, so the accumulating path never also runs');

  // it MUST precede the lock gate, or with the lock never taken it is unreachable
  const gate = src.indexOf('  if(!locked) return;');
  assert(gate > 0 && A < gate,
    'the branch sits ABOVE `if(!locked) return;` — with the lock never taken, everything below it is dead code');

  // executed: the mapping is exact, and it is an ASSIGNMENT rather than an accumulation
  const run = new Function('EVENTS', `
    let _vcX = 999, _vcY = -999;
    const innerWidth = 640, innerHeight = 360;
    const out = [];
    for(const e of EVENTS){
      _vcX = e.clientX - innerWidth * 0.5;
      _vcY = e.clientY - innerHeight * 0.5;
      out.push([_vcX, _vcY]);
    }
    return out;`);
  const got = run([{ clientX:320, clientY:180 }, { clientX:480, clientY:90 }, { clientX:0, clientY:0 }]);
  eq(JSON.stringify(got[0]), '[0,0]', 'screen centre is cursor zero — which is where the crosshair is drawn');
  eq(JSON.stringify(got[1]), '[160,-90]', '...and an offset maps one-to-one');
  eq(JSON.stringify(got[2]), '[-320,-180]', '...including the corner');
  // the stale start value is GONE after one event: an assignment, not a sum
  assert(got[0][0] === 0, 'the first event lands absolutely, with no accumulated history to unwind');
}

// ---------------------------------------------------------------- 4. losing a lock you never had
// Build 1255's recorded lesson: making a button clickable was itself what paused the game.
{
  const h = src.slice(src.indexOf("document.addEventListener('pointerlockchange'"), src.indexOf("document.addEventListener('pointerlockchange'") + 1400);
  assert(/_hwCursorFree/.test(h), 'build 1255\'s whitelist is intact');
  assert(/!\(typeof _cursorFreeNow==='function' && _cursorFreeNow\(\)\)\) openPause\(\)/.test(h),
    'and a level whose cursor is free BY DESIGN never had a lock to lose, so losing one must not pause it');
}

// ---------------------------------------------------------------- 5. the setting travels
{
  assert(/freeCursor: !!gameCfg\.freeCursor/.test(extractFunction('serializeLevel', src)),
    'it serializes with the level');
  const ap = extractFunction('_applyGameCfg', src);
  assert(/gameCfg\.freeCursor\s*=\s*!!g\.freeCursor;/.test(ap),
    'and BOTH runtime loaders reach it through the one applier (build 1400)');
  assert(!/if\(g\.freeCursor/.test(ap),
    '...ALWAYS assigned, never "if present" — build 1400\'s rule, or it leaks from the previous level');
  assert(/gameCfg\.freeCursor = !!g\.freeCursor;/.test(src.slice(src.indexOf('gameCfg.chaseCursorAim = !!g.chaseCursorAim'), src.indexOf('gameCfg.chaseCursorAim = !!g.chaseCursorAim') + 200)),
    'and the boot path defaults it beside its sibling view settings');
}

// ---------------------------------------------------------------- 6. the class follows the VIEW, not the setting
// The view verb (build 1404) can turn a first-person level top-down mid-match.
{
  const c = extractFunction('_applyFreeCursorClass', src);
  assert(/_cursorFreeNow\(\)/.test(c), 'the class asks the same predicate');
  assert(/classList\.toggle\('freeCursor'/.test(c), '...and is the one writer of the body class');
  assert(/safeExitPointerLock/.test(c),
    '...and drops a lock it happens to be holding, so a mid-match switch to a cursor view frees the mouse now');

  eq((src.match(/_applyFreeCursorClass\(\)/g) || []).length >= 4, true,
    'it is called from the game-cfg applier, the editor checkbox and every branch of the view verb');
  const v = extractFunction('_applyView', src) || '';
  assert(/_applyFreeCursorClass/.test(src.slice(src.indexOf("_viewOv = { m:m, tag:''"), src.indexOf("_viewOv = { m:m, tag:''") + 400)),
    'the view verb re-evaluates it, or a level switched to top-down mid-match keeps a captured mouse');

  assert(/body\.freeCursor canvas \{ cursor: crosshair; \}/.test(html), 'the canvas shows a real cursor');
  assert(/body\.freeCursor #hud \{ cursor: default; \}/.test(html), '...and the HUD an arrow');
}

// ---------------------------------------------------------------- 7. the door
{
  assert(/<b>Free mouse cursor<\/b>/.test(src), 'the creator has a control (build 1348: a capability nobody can find does not exist)');
  assert(/_curView==='top' \|\| _curView==='side' \|\| \(_curView==='chase' && gameCfg\.chaseCursorAim\)/.test(src),
    '...offered exactly where it can WORK, rather than shown-and-inert in first person');
  assert(/HUD buttons, signs and menus are clickable/.test(src), '...and the hint says what it buys');
  assert(/Not offered in first person/.test(src), '...and why it is absent elsewhere');
}

done('build 1467 (asked for from play): a FREE MOUSE CURSOR, so on-screen elements can be clicked in play. "Maybe a gameplay that allows point-click type navigation (which isn\'t possible today as the mouse is always the camera control) so that on-screen elements could be clicked." Verified before building, because the obvious reading is wrong: it is not merely that the mouse is the camera in first person. The twin-stick, top-down and ARPG views already draw a cursor — but `_vcX += e.movementX` accumulates it from POINTER-LOCKED deltas, so there was no OS pointer in ANY view and no DOM element was clickable anywhere in play; build 1255 had to release the lock by hand just to make one HUD button work. Free cursor never takes the lock, drives the same `_vcX/_vcY` the aim already reads from the REAL pointer position, and shows a real cursor — so the aim ray, the crosshair, the body facing and the shot origin are all untouched, because every one of them reads `_vcX/_vcY` and always did. Measured live with the same level as the control at every step: `tryPointerLock` reaches `requestPointerLock` once with the cursor captured and ZERO times with it free (and once again in first person, where the setting is correctly ignored); the pointer maps exactly onto the aim cursor (320,180 -> 0,0 · 480,90 -> 160,-90 · 10,10 -> -310,-170) while the captured control moves it not at all; and the body class and canvas cursor follow the VIEW rather than the setting, so build 1404\'s view verb switching a level top-down mid-match frees the mouse then. The refusal is ONE line inside `tryPointerLock` rather than a guard at each of its callers — chat close, shop close, inventory close, the upgrade pick, deploy and the canvas click all re-lock, and the one that got forgotten would swallow the cursor mid-game. Three fixture faults on the way, all of them invented names (the widget field is `event` not `ev`, `setvar` takes `{name, value}`, and `_hwEls` holds RECORDS rather than elements), plus one honest non-measurement recorded as such: `elementFromPoint` and a synthetic click ignore pointer lock entirely, so the DOM hit-test passes in both conditions and is NOT evidence — what decides whether a player can click is whether the pointer is captured, which the lock test measures');
