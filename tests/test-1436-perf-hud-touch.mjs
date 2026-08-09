// build 1436 — the performance meter has a door a touchscreen can open.
//
// ASKED FROM USE: "Can there be a way to open the dev hud on a touch device? I want to see FPS but I can't
// click a backtick on a phone." Verified: the meter had exactly ONE door, `e.code==='Backquote'`, so on a
// phone or a tablet it did not exist at all.
//
// A checkbox alone is only half an answer, and the measurement says so. `#perfHud` is pinned bottom-left
// with `white-space:nowrap` — bottom-left on a phone is where the movement stick sits, and six lines of
// profiler is 170px of overlay across the play view of a 390px screen.
//
// Measured at 390x844 with the engine's own touch layout, counting only elements that actually DRAW
// (a full-screen transparent input layer is not an obstruction to a pointer-events:none readout — counting
// those painted the whole screen occupied and was the first run's mistake):
//
//   rows 0-1  ######   the HUD cluster (minimap, ammo, wave, score, pause)
//   rows 2-7  ......   free
//   rows 8-11 ##.###   the touch controls
//
//   placed:  {x:8, y:148, w:154, h:47}   on screen, no clipping, overlaps: NONE
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

/* ---- EXECUTED: one writer for the overlay -------------------------------------------------------- */
const mkDoc = (opts = {}) => {
  const el = { cls: { hidden: true }, classList: { toggle: (n, f) => { el.cls[n] = !!f; } } };
  const cb = { checked: false };
  return { el, cb, doc: { getElementById: (id) =>
    id === 'perfHud' ? (opts.noEl ? null : el) : id === 'perfHudCb' ? (opts.noCb ? null : cb) : null } };
};
const mk = (opts) => {
  const { el, cb, doc } = mkDoc(opts);
  const api = new Function('document', `
    let perfOn = false;
    ${extractFunction('setPerfHud', src)}
    return { setPerfHud, get: () => perfOn };
  `)(doc);
  return { ...api, el, cb };
};

{
  const t = mk();
  eq(t.setPerfHud(true), true, 'turning it on reports on');
  eq(t.get(), true, '...sets the flag that gates the per-frame profiling');
  eq(t.el.cls.hidden, false, '...and unhides the readout');
  eq(t.cb.checked, true, '...and syncs the menu checkbox, which may be open');
  eq(t.setPerfHud(false), false, 'and off reports off');
  eq(t.get(), false, '...flag');
  eq(t.el.cls.hidden, true, '...hidden');
  eq(t.cb.checked, false, '...checkbox');
  t.setPerfHud('yes'); eq(t.get(), true, 'a truthy value is coerced — the flag is never a string');
}
{ const t = mk({ noEl: true }); eq(t.setPerfHud(true), true, 'no element: still sets the flag'); }
{ const t = mk({ noCb: true }); t.setPerfHud(true); eq(t.el.cls.hidden, false, 'no checkbox: still shows'); }

/* ---- the key routes through it, and keeps its controller-debug half ------------------------------ */
const kd = src.slice(src.indexOf("if(e.code==='Backquote')"));
const keyLine = kd.slice(0, kd.indexOf('return; }') + 9);
assert(/setPerfHud\(el \? show : !perfOn\)/.test(keyLine), 'the key sets the meter through the one writer');
assert(!/perfOn\s*=/.test(keyLine), '...and no longer assigns the flag itself');
assert(!/perfHud'\)\s*;?\s*if\(ph\)/.test(keyLine), '...nor toggles the element by hand');
assert(/padDebug/.test(keyLine), 'while its controller-diagnostic half is untouched');
// two assignments in the whole engine: the declaration, and the writer.
eq((src.match(/perfOn\s*=[^=]/g) || []).length, 2,
  'exactly one writer besides the declaration — a second is a second chance to disagree');

/* ---- the door itself ----------------------------------------------------------------------------- */
const game = html.slice(html.indexOf('data-ppanel="game"'), html.indexOf('data-ppanel="controls"'));
assert(/id="perfHudCb"/.test(game), 'the checkbox is in the pause menu’s Game panel');
assert(/Performance overlay/.test(game) && /FPS/.test(game), '...and says what it shows');
assert(/press <b>`<\/b>/.test(game), '...and names the key, so the two doors are one feature');

const bind = extractFunction('bindPauseMenu', src);
assert(/const phc=document\.getElementById\('perfHudCb'\)/.test(bind), 'bound where its two neighbours are');
assert(/setPerfHud\(perfOn\)/.test(bind),
  'and SYNCED FROM THE FLAG — which unhides a restored session, shows the true state after the ` key, ' +
  'and is idempotent across the boot call and every open');
assert(/localStorage\.setItem\('breach_perfhud'/.test(bind), 'the choice persists, like the toggles beside it');
assert(/setPerfHud\(phc\.checked\)/.test(bind), 'and a tap goes through the one writer too');

/* ---- restored at boot, without being able to break it -------------------------------------------- */
const decl = src.slice(src.indexOf('let perfOn='), src.indexOf('let perfOn=') + 220);
assert(/try\{[^}]*localStorage\.getItem\('breach_perfhud'\)==='on'[^}]*\}catch\(e\)\{ return false; \}/.test(decl),
  'restored at the declaration, and a storage that throws cannot take the boot down');
const iDecl = src.indexOf('let perfOn='), iBind = src.lastIndexOf('bindPauseMenu();');
assert(iDecl > 0 && iBind > iDecl,
  'and the flag is declared above the boot-time bindPauseMenu() that reads it (build 1127/1331 ordering)');

/* ---- the readout a phone gets -------------------------------------------------------------------- */
const upd = extractFunction('updatePerfHud', src);
const iCompact = upd.indexOf("classList.contains('touch')"), iFull = upd.indexOf("+ 'render '");
assert(iCompact > 0 && iFull > iCompact, 'the compact branch is decided before the profiler dump is built');
assert(/return;\s*\n\s*\}/.test(upd.slice(iCompact, iFull)), '...and returns, so a phone never builds it');
const compact = upd.slice(iCompact, iFull);
assert(/FPS '\+fps/.test(compact) && /draws '\+_perfCalls/.test(compact) && /tris '/.test(compact),
  'a phone still gets the numbers that matter: frame rate, draw calls, triangles');
assert(!/_aaReport|idleWhy|_prof\./.test(compact), '...without the desktop profiler breakdown');
assert(/_aaReport\(\)/.test(upd), 'which the desktop readout still carries');

/* ---- and it is placed where a phone has room ----------------------------------------------------- */
const css = html.slice(html.indexOf('body.touch #perfHud'), html.indexOf('body.touch #perfHud') + 260);
assert(/bottom:auto/.test(css), 'on touch it leaves bottom-left, which is where the movement stick is');
assert(/top:calc\(148px \+ env\(safe-area-inset-top,0px\)\)/.test(css),
  '...for the measured free band under the HUD cluster, inside the safe area');
assert(/white-space:normal/.test(css), '...and is allowed to wrap rather than run off the screen');
assert(/#perfHud \{[^}]*white-space:nowrap/.test(html), 'while the desktop readout keeps its single lines');
assert(/#perfHud \{[^}]*pointer-events:none/.test(html),
  'and it never takes a tap — which is why only what DRAWS counts as being in its way');

done('build 1436: the performance meter opens from the pause menu, so a touch device can see the frame ' +
     'rate at all — with one writer shared with the ` key, and a compact readout placed in the measured ' +
     'free band rather than under the thumbstick');
