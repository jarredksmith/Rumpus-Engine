// (build 86) Pause menu: a ❚❚ button + losing pointer lock (Esc) opens it; Resume re-locks, Exit returns
// to the main menu (reloads in a live net session for a clean teardown). Solo play freezes while paused.
import { html, gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();
// markup + wiring
assert(/id="pauseBtn"/.test(html) && /id="pauseMenu"/.test(html), 'pause button + overlay exist');
assert(/id="pauseResume"/.test(html) && /id="pauseExit"/.test(html), 'resume + exit buttons exist');
const bp = extractFunction('bindPauseMenu');
assert(/pauseBtn'\)[\s\S]*?onclick=openPause/.test(bp) && /pauseExit'\)[\s\S]*?onclick=exitToMenu/.test(bp), 'buttons are wired');
assert(/bindPauseMenu\(\);/.test(src), 'bindPauseMenu runs at startup');
// open/resume/exit behavior
const op = extractFunction('openPause');
assert(/if\(!gameOn \|\| gameOver \|\| paused \|\| shopOpen \|\| editorOpen \|\| choosingUpgrade\) return;/.test(op), 'openPause guards against non-play states');
assert(/paused = true;[\s\S]*?safeExitPointerLock\(\)/.test(op), 'opening pause releases the lock');
const rg = extractFunction('resumeGame');
assert(/paused = false;[\s\S]*?if\(!isTouch\) tryPointerLock\(\)/.test(rg), 'resume re-locks on desktop');
const ex = extractFunction('exitToMenu');
assert(/NET\.mode!=='off'\)\{ location\.reload\(\)/.test(ex), 'exit reloads in a live net session');
assert(/showMainMenu\(\);/.test(ex), 'solo exit returns to the main menu');
// loop integration
/* build 1467: the free cursor joined this condition, so quoting the whole line broke it with every part
   of what it meant still true. Asserted as membership of the guard instead. */
{
  const h = src.slice(src.indexOf("document.addEventListener('pointerlockchange'"),
                      src.indexOf("document.addEventListener('pointerlockchange'") + 1400);
  assert(/if\(!locked && was && !isTouch && gameOn/.test(h) && /openPause\(\)/.test(h),
    'losing the lock mid-play opens pause...');
  for(const g of ['chatOpen', 'mapOpen', 'invOpen', '_hwCursorFree', '_cursorFreeNow'])
    assert(h.includes(g), '...unless ' + g + ' released it on purpose (build 1255, build 1467)');
}
  // build 1478 added a sixth term to the frame loop's freeze gate and broke five harnesses at once, every
  // one of their assertions still TRUE — they had each quoted the WHOLE condition to assert one thing about
  // it. That is build 1468's own recorded trap one line over: a pin that quotes a whole condition is a pin
  // against the condition's NEIGHBOURS. They assert MEMBERSHIP now.
{ const gate = src.match(/if\(\(shopOpen \|\| choosingUpgrade[^\n]*?\) \{ pollGamepad/);
  assert(gate, 'the frame loop has a freeze gate');
  assert(/\(paused && NET\.mode==='off'\)/.test(gate[0]), 'solo play freezes while paused \u2014 and only solo'); }
done('pause menu + exit to main menu');
