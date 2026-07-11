// (build 938) FIRST-RUN TUTORIAL — a do-to-advance coach pill for new players. One instruction at a
// time (Move / Look / Fire / Jump / Sprint / Switch weapons / Build menu); each step completes when
// the player actually performs it, a 15s timeout advances it anyway (it can never block), the wording
// follows the device in use (keyboard / touch / pad via padRecent), it runs ONCE per browser
// (localStorage breach_tut_done), solo only, hides during pause/editor/cinematics/dialogue, and the
// 32px x dismisses it forever. Steps the player cannot perform are filtered at start: no fire/switch
// on a fists-only level, and no "switch weapons" while they own a single gun (a fresh run is
// rifle-only — that step used to be impossible).
// Verified live: fresh browser -> 6 steps each advanced by the real action (teleport, yaw spin,
// lastShot, real jump key, sprint key + travel, radial open) -> pill gone, flag set, second deploy
// silent; pad wording appeared the moment a pad was in use; the x dismissed and set the flag.
import { gameSource, html, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// device-aware wording — run it
const lblSrc = extractFunction('_tutLabel', src);
const lbl = new Function('padRecent','isTouch', lblSrc + "\nreturn _tutLabel({kb:'K',touch:'T',pad:'P'});");
assert(lbl(()=>true, true)==='P', 'a pad in use wins the wording');
assert(lbl(()=>false, true)==='T', 'touch wording without a pad');
assert(lbl(()=>false, false)==='K', 'keyboard wording otherwise');

// once per browser, solo only, performable steps only
const start = extractFunction('startTutorial', src);
assert(/if\(localStorage\.getItem\(TUT_KEY\)\) return;/.test(start), 'runs once per browser');
assert(/if\(NET\.mode!=='off'\) return;/.test(start), 'solo only');
assert(/!\(gameCfg\.unarmed && \(st\.id==='fire'\|\|st\.id==='wep'\)\) && !\(st\.id==='wep' && owned\.length<2\)/.test(start),
  'steps the player cannot perform are filtered (fists-only levels; single-gun runs)');

// do-to-advance with a never-blocks timeout; completion/dismiss set the flag
const upd = extractFunction('updateTutorial', src);
assert(/if\(done \|\| TUT\.t>15\)\{/.test(upd), 'each step advances on the action OR a 15s timeout — it can never block');
assert(/!gameOn \|\| editorOpen \|\| paused \|\| shopOpen \|\| \(typeof _cineActive!=='undefined' && _cineActive\)/.test(upd),
  'hides during pause / editor / shop / cinematics');
assert(/localStorage\.setItem\(TUT_KEY,'1'\)/.test(extractFunction('endTutorial', src)), 'completing or dismissing sets the flag');
assert(/endTutorial\(true\)/.test(src) && /aria-label="Dismiss the tutorial"/.test(src), 'the x dismisses it forever');

// wiring
assert(/if\(typeof startTutorial==='function'\) startTutorial\(\);   \/\/ build 938/.test(src), 'starts on deploy');
assert(/updateTutorial\(dt\);                    \/\/ build 938/.test(src), 'driven by the main loop');
assert(/#tutHint \{ position:fixed; left:50%; bottom:96px;/.test(html), 'the pill has its own themed style');
assert(/body\.editing #tutHint \{ display:none !important; \}/.test(html), 'and the editor hides it outright');

done('build 938: first-run tutorial — do-to-advance coach pill, device-aware wording, once per browser');
