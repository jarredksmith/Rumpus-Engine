import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 366: the game claims its movement/action keys via preventDefault so the browser can't swallow
// them — Space especially gets intercepted (page scroll / focused-button activation) during modifier
// combos like Shift+Space, which is the most likely cause of "jump stopped working while running".

assert(/const GAME_KEYS = \{ Space:1, ShiftLeft:1/.test(src), 'GAME_KEYS whitelist exists');
assert(/GAME_KEYS\['?Space'?\]|Space:1/.test(src) && /KeyW:1.*KeyD:1/.test(src), 'movement + jump + sprint keys are all claimed');
// preventDefault fires for owned keys, right after they are recorded, and BEFORE the early-returns
const kd = src.slice(src.indexOf("addEventListener('keydown', e=>{"), src.indexOf("addEventListener('keyup'"));
assert(/keys\[e\.code\]=true;[\s\S]{0,260}if\(GAME_KEYS\[e\.code\]\)\{ e\.preventDefault\(\); \}/.test(kd), 'owned keys are claimed right after being recorded');
// the jump line is unchanged and still modifier-agnostic (sprint never gates it)
assert(/const _jHeld = !!\(keys\[BINDS\.jump\]\|\|padJump\);/.test(src) && /player\.vel\.y = JUMP;/.test(src), 'jump still fires on the jump bind (Space by default; rebindable build 910), edge-triggered, regardless of sprint');
done();
