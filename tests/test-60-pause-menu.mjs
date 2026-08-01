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
assert(/if\(!locked && was && !isTouch && gameOn && !gameOver && !shopOpen && !editorOpen && !choosingUpgrade && !paused && !chatOpen && !mapOpen && !invOpen && !\(typeof _hwCursorFree!=='undefined' && _hwCursorFree\)\) openPause\(\)/.test(src), 'losing the lock mid-play opens pause (unless chatting, or a HUD button deliberately freed the cursor — build 1255)');
assert(/\(paused && NET\.mode==='off'\) \|\| \(mapOpen && NET\.mode==='off'\) \|\| \(invOpen && NET\.mode==='off'\)\) && !\(duelDead && pvpMode\(\)\)\) \{ pollGamepad/.test(src), 'solo play freezes while paused');
done('pause menu + exit to main menu');
