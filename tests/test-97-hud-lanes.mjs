// (build 144) Top-centre HUD elements were stacking on top of each other (room badge, pickup toast,
// score banner, KOTH banner all near top:12-26). Separate them into distinct vertical lanes so they
// never overlap; in KOTH the cpHud is the objective banner so the (kill-count) wave panel is hidden.
import { gameSource, extractFunction, html, done, assert } from './harness.mjs';
const src = gameSource();

assert(/#roomBadge \{ display:none; position:fixed; top:8px;/.test(html), 'room badge lane (8px)');
assert(/top:36px;left:50%;transform:translateX\(-50%\);z-index:500;/.test(src), 'pickup toast lane (36px; build 1069: above the fullscreen editor/dialogs, pointer-events:none so it blocks nothing)');
assert(/#wavePanel \{ top: 70px;/.test(html), 'score banner lane (70px)');
assert(/#cpHud \{ position:fixed; top:70px;/.test(html), 'KOTH banner shares the banner lane');

const dh = extractFunction('duelHUD');
assert(/wp\.style\.display=\(NET\.gameMode==='cp'\)\?'none':''/.test(dh), 'KOTH hides the kill banner');
assert(/\$\('hud'\)\.classList\.remove\('hidden'\);\n  \{ const wp=\$\('wavePanel'\); if\(wp\) wp\.style\.display=''; \}/.test(src), 'banner restored on (re)start');
done('hud lanes');
