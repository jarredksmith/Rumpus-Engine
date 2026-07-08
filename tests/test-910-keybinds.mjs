// (build 910) CUSTOM KEY BINDINGS — a persisted BINDS map (breach_binds_v1) + a capture UI in the
// pause menu. Every movement/action read routes through BINDS; choosing a key another action holds
// SWAPS the two (no orphaned actions); reserved system keys (editor toggle P, weapon slots, Esc,
// debug) are refused. Verified live: reload rebound to X fires (R dead), movement walks on a
// rebound ArrowUp, swap + persistence across a reload, reserved keys rejected.
import { gameSource, html, extractFunction, evalIn, assert, eq, done } from './harness.mjs';

const src = gameSource();

// the map + persistence + GAME_KEYS follow the binds
assert(/const BIND_DEFAULTS = \{ fwd:'KeyW', back:'KeyS', left:'KeyA', right:'KeyD', jump:'Space', sprint:'ShiftLeft', crouch:'ControlLeft', slide:'KeyC',/.test(src),
  'BIND_DEFAULTS covers movement + actions');
assert(/localStorage\.getItem\('breach_binds_v1'\)/.test(src) && /function saveBinds/.test(src), 'binds persist under breach_binds_v1');
assert(/function _rebuildGameKeys/.test(src) && /GAME_KEYS\[c\]=1/.test(extractFunction('_rebuildGameKeys', src)),
  'preventDefault ownership follows the rebound keys');

// every gameplay read goes through BINDS (spot the load-bearing ones)
for(const pat of [
  /if\(keys\[BINDS\.fwd\]\) wish\.add\(forward\);/,                     // walk
  /const _jHeld = !!\(keys\[BINDS\.jump\]\|\|padJump\);/,               // jump
  /const _slideKey = \(keys\[BINDS\.slide\]\|\|padCrouch\);/,           // slide
  /keys\[BINDS\.fwd\]\) throttle\+=1;/,                                 // drive throttle
  /if\(keys\[BINDS\.left\]\) steer\+=1;/,                               // steering
  /if\(e\.code===BINDS\.reload\) reload\(\);/,                          // reload
  /if\(e\.code===BINDS\.interact\) interact\(\);/,                      // use
  /if\(e\.code===BINDS\.grenade\) throwGrenade\(\);/,                   // grenade
  /e\.code===BINDS\.radial\)\{ if\(!e\.repeat\) openRadial\(\);/,       // deploy menu
  /e\.code===BINDS\.map && !e\.repeat/,                                 // big map
]) assert(pat.test(src), 'BINDS-routed read present: '+pat.source.slice(0,44));
eq((src.match(/keys\['KeyW'\]/g)||[]).length, 1, 'exactly one raw KeyW read remains: the editor fly-cam (deliberately unbound)');

// crouch/sprint keep their right-side siblings only while on the default binding
assert(/keys\[BINDS\.crouch\]\|\|\(BINDS\.crouch==='ControlLeft'&&keys\['ControlRight'\]\)/.test(src), 'R-Ctrl stays a crouch alias on the default bind');
assert(/keys\[BINDS\.sprint\]\|\|\(BINDS\.sprint==='ShiftLeft'&&keys\['ShiftRight'\]\)/.test(src), 'R-Shift stays a sprint alias on the default bind');

// the capture UI: swap-on-conflict + reserved keys + reset
const kb = extractFunction('openKbBinds', src);
assert(/for\(const o in BINDS\)\{ if\(o!==a && BINDS\[o\]===e\.code\) BINDS\[o\]=old; \}/.test(kb), 'conflicts SWAP instead of orphaning');
assert(/RESERVED=\{ Escape:1, KeyP:1, Backquote:1, BracketRight:1, Digit1:1/.test(kb), 'system keys are refused (P = editor toggle trap found in verification)');
assert(/Object\.assign\(BINDS, BIND_DEFAULTS\); saveBinds\(\); _rebuildGameKeys\(\)/.test(kb), 'reset restores defaults everywhere');
assert(/id="pauseKeys"/.test(html), 'the pause menu carries the Keyboard bindings entry');

// key labels stay human
const lbl = evalIn('('+extractFunction('_keyLabel', src).replace('function _keyLabel','function ')+')');
eq(lbl('KeyW'), 'W', 'KeyW -> W');
eq(lbl('ControlLeft'), 'Ctrl', 'ControlLeft -> Ctrl');
eq(lbl('ArrowUp'), 'Up', 'ArrowUp -> Up');

// the editor gained an on-screen Undo (touch authors had no undo at all)
assert(/id="edUndo"/.test(src) && /performUndo==='function'\) performUndo\(\)/.test(src), 'editor top bar has an Undo button wired to performUndo');

done('build 910: keys are yours now — rebind, swap, reset, persist');
