// build 1456 — OPTIONS ON THE TITLE SCREEN.
//
// The main menu had ELEVEN buttons and none of them opened settings: Deploy, Build, Multiplayer,
// Community, two campaign entries, Instructions, Field manual, Help, Credits, and a controls-mode
// CYCLER (not a panel). Volumes, mute, all six comfort sliders, colour-vision correction with strength,
// interface size, mouse sensitivity, keybinds and the touch-layout editor lived ONLY in the pause card.
//
// So a photosensitive, motion-sick, colour-blind or low-vision player had to Deploy into live combat
// and then pause before they could protect themselves. Every console TRC and every engine template puts
// Options on the title screen.
//
// THE FIX OPENS THE SAME ELEMENT. `bindPauseMenu` reads every control by id, so lifting the markup into
// a second panel would mean duplicate ids or a second set of bindings — the defect this file records
// more than any other. One card, one binding, nothing to drift.
//
// And it routes its close through `resumeGame`, which is the ONE chokepoint every existing exit already
// uses (the Resume button, the pad's B, the pad's Start). No second list of call sites to keep in step,
// which is the mistake builds 1152 and 1158 had to fix twice.

import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the rig
// `let _settingsOpen` is module-level, so extractFunction cannot carry it. Lift the declaration from
// source rather than restating it — a rig that restates a declaration keeps passing against a stale copy.
const FLAG = (src.match(/let _settingsOpen = false;/) || [])[0];
assert(FLAG, 'the settings flag is declared at module level');

function mkRig({ gameOn = false, paused = false } = {}) {
  return new Function('GAME_ON', 'PAUSED', `
    const log = [];
    let gameOn = GAME_ON, paused = PAUSED, firing = true, ads = true;
    let boundTimes = 0, lockTries = 0;
    const isTouch = false;
    const els = {};
    const mkEl = (id) => (els[id] = {
      id, _cls: new Set(['hidden']), textContent: (id === 'pauseTitle' ? 'PAUSED' : (id === 'pauseResume' ? 'Resume' : '')),
      classList: {
        add(c){ els[id]._cls.add(c); }, remove(c){ els[id]._cls.delete(c); },
        contains(c){ return els[id]._cls.has(c); },
      },
    });
    mkEl('pauseMenu'); mkEl('pauseTitle'); mkEl('pauseResume');
    const document = { getElementById: (id) => els[id] || null };
    const bindPauseMenu = () => { boundTimes++; };
    const SFX = { uiOpen(){ log.push('uiOpen'); }, uiClose(){ log.push('uiClose'); } };
    const safeExitPointerLock = () => log.push('exitLock');
    const tryPointerLock = () => { lockTries++; };
    ${FLAG}
    ${extractFunction('openSettings')}
    ${extractFunction('closeSettings')}
    ${extractFunction('resumeGame')}
    return {
      open: () => { openSettings(); },
      close: () => { closeSettings(); },
      resume: () => { resumeGame(); },
      state: () => ({
        shown: !els.pauseMenu._cls.has('hidden'),
        setOnly: els.pauseMenu._cls.has('setOnly'),
        title: els.pauseTitle.textContent,
        resumeLabel: els.pauseResume.textContent,
        paused, boundTimes, lockTries, log: log.slice(),
      }),
    };`)(gameOn, paused);
}


// ---------------------------------------------------------------- 1. it opens, and says what it is
{
  const r = mkRig();
  eq(r.state().shown, false, 'the card starts hidden');
  r.open();
  const s = r.state();
  eq(s.shown, true, 'Settings shows the pause card');
  eq(s.setOnly, true, '...in settings-only mode');
  eq(s.title, 'SETTINGS', '...retitled, because it is not a pause');
  eq(s.resumeLabel, 'Close', '...with Resume relabelled Close, since there is nothing to resume');
  eq(s.boundTimes, 1, '...and every control re-synced from live state (build 907)');
  assert(s.log.includes('uiOpen'), '...with the UI voice (build 1363)');
}

// ---------------------------------------------------------------- 2. it NEVER touches `paused`
// There is no match to pause. Writing the flag would make the frame loop's gates disagree with the world.
{
  const r = mkRig();
  r.open();
  eq(r.state().paused, false, 'opening settings from the menu does not pause anything');
  r.close();
  eq(r.state().paused, false, '...and closing does not either');
  const fn = extractFunction('openSettings');
  assert(!/paused\s*=/.test(fn), 'openSettings contains no assignment to paused');
  assert(!/\bfiring\s*=/.test(fn) && !/\bads\s*=/.test(fn), '...nor to the firing/ads state a real pause clears');
}

// ---------------------------------------------------------------- 3. closing restores everything
{
  const r = mkRig();
  r.open(); r.close();
  const s = r.state();
  eq(s.shown, false, 'the card hides');
  eq(s.setOnly, false, '...and drops settings mode, or a later real pause would hide its own Exit button');
  eq(s.title, 'PAUSED', '...and the heading goes back, or the next pause would read SETTINGS');
  eq(s.resumeLabel, 'Resume', '...as does the button label');
  eq(s.lockTries, 0, 'and it does NOT grab the pointer — there is no game to look around in');
  assert(s.log.includes('uiClose'), 'with the close voice');
}

// ---------------------------------------------------------------- 4. resumeGame is the one chokepoint
// Every existing close path — the Resume button, the pad's B, the pad's Start — already calls it.
{
  const r = mkRig();
  r.open();
  r.resume();                       // exactly what the Resume button / pad B / pad Start do
  const s = r.state();
  eq(s.shown, false, 'resumeGame closes the settings card');
  eq(s.title, 'PAUSED', '...through closeSettings, so the restore happens');
  eq(s.lockTries, 0, '...without trying to lock the pointer');

  // and a REAL pause is byte-unchanged
  const p = mkRig({ gameOn: true, paused: true });
  eq(p.state().paused, true, 'a real pause');
  p.resume();
  eq(p.state().paused, false, '...still resumes');
  eq(p.state().lockTries, 1, '...and still re-locks the pointer');

  // the routing line must be FIRST, or `if(!paused) return` swallows it
  const rg = extractFunction('resumeGame');
  const iRoute = rg.indexOf('if(_settingsOpen){ closeSettings(); return; }');
  const iGuard = rg.indexOf('if(!paused) return;');
  assert(iRoute >= 0 && iGuard > iRoute,
    'the settings route sits BEFORE the !paused guard — after it, every close path would be swallowed');

  // all four close paths provably reach resumeGame
  eq((src.match(/resumeGame\(\)/g) || []).length >= 4, true, 'resumeGame has at least the four known callers');
  assert(/s2\.id==='pauseMenu'\){ if\(typeof resumeGame==='function'\) resumeGame\(\)/.test(src), 'the pad B path');
  assert(/sf\.id==='pauseMenu' && typeof resumeGame==='function'\) resumeGame\(\)/.test(src), 'the pad Start path');
}

// ---------------------------------------------------------------- 5. in a match, the pause menu is the door
{
  const inGame = mkRig({ gameOn: true });
  inGame.open();
  eq(inGame.state().shown, false, 'Settings refuses while a match is running — openPause owns that');
  eq(inGame.state().boundTimes, 0, '...and does not even re-bind');

  const whilePaused = mkRig({ paused: true });
  whilePaused.open();
  eq(whilePaused.state().shown, false, '...and refuses while already paused, so it cannot fight openPause');
}

// ---------------------------------------------------------------- 6. idempotent
{
  const r = mkRig();
  r.open(); r.open(); r.open();
  eq(r.state().boundTimes, 1, 'three opens re-bind once — a second open is a no-op, not a re-entry');
  r.close(); r.close();
  eq(r.state().shown, false, 'and a second close is harmless');
}

// ---------------------------------------------------------------- 7. ONE element, not a second copy
{
  eq((html.match(/id="pauseMenu"/g) || []).length, 1, 'there is exactly one pause card in the document');
  eq((html.match(/id="pauseTitle"/g) || []).length, 1, '...one heading');
  eq((html.match(/id="pauseFooter"/g) || []).length, 1, '...one footer');
  // every control the audit listed is present exactly once — a duplicate id is what a second panel costs
  for (const id of ['muteCb','volMaster','volMusic','volSfx','msSensRng','pauseKeys','pauseCtl',
                    'a11yShake','a11ySway','a11yBlur','a11yFlash','a11yHitstop','a11yRumble',
                    'a11yUiScale','a11yCbMode','a11yCbStr','a11yPhotoWarn','a11yReduce','a11yRestore'])
    eq((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1,
      id + ' exists exactly once — reachable from the menu without a second binding');
}

// ---------------------------------------------------------------- 8. the three match-only controls hide
// Not because they are dangerous, but because their consequence is absent: there is nothing to exit,
// no live HUD to lay out, and no owned weapons to choose between.
{
  const rule = html.match(/#pauseMenu\.setOnly #pauseExit,\s*\n\s*#pauseMenu\.setOnly #pauseEditHud,\s*\n\s*#pauseMenu\.setOnly #pauseLoadout \{ display:none !important; \}/);
  assert(rule, 'settings mode hides Exit, Edit HUD layout and Loadout');
  // and NOTHING else is hidden — every other control is a per-device preference and must be reachable
  const setOnlyRules = (html.match(/#pauseMenu\.setOnly [^{]*\{[^}]*\}/g) || []).join('');
  for (const id of ['muteCb','volMaster','a11yShake','a11yCbMode','msSensRng','pauseKeys','a11yUiScale'])
    assert(!setOnlyRules.includes(id), id + ' is NOT hidden — it is a device preference, which is the point of the build');
}

// ---------------------------------------------------------------- 9. the door, and the key
{
  assert(/<button id="settingsBtn" class="secBtn ghost">/.test(html), 'the title screen has a Settings button');
  assert(/>Settings<\/button>/.test(html), '...labelled Settings');
  assert(/const stb=document\.getElementById\('settingsBtn'\); if\(stb\) stb\.onclick=\(\)=>\{ if\(typeof openSettings==='function'\) openSettings\(\); \};/.test(src),
    '...wired beside its neighbours');
  assert(/if\(e\.code==='Escape' && _settingsOpen\)\{ e\.preventDefault\(\); e\.stopPropagation\(\); closeSettings\(\); \}/.test(src),
    'Escape closes it — on the title screen nothing else owns the key');
  // the Escape listener must only act when settings are open, or it would eat Escape everywhere else
  const esc = (src.match(/document\.addEventListener\('keydown', \(e\)=>\{ if\(e\.code==='Escape' && _settingsOpen\)[^\n]*/) || [])[0];
  assert(esc && esc.includes('&& _settingsOpen'), 'and it is gated on the flag, so it cannot swallow Escape in play or the editor');
}

done('build 1456 (UI audit CRITICAL): the main menu had ELEVEN buttons and none of them opened settings — volumes, mute, all six comfort sliders, colour-vision correction, interface size, mouse sensitivity, keybinds and the touch-layout editor lived ONLY in the pause card, so a photosensitive, motion-sick, colour-blind or low-vision player had to Deploy into live combat and then pause before they could protect themselves. Settings now opens the SAME element rather than a lifted copy: bindPauseMenu reads every control by id, so a second panel would mean duplicate ids or a second set of bindings, which is the defect this file records more than any other — asserted by every one of the nineteen control ids existing exactly once. It closes through `resumeGame`, the ONE chokepoint the Resume button and both pad paths already use, with the route proven to sit BEFORE the `!paused` guard that would otherwise swallow it; `paused` is never written (there is no match to pause, and the frame loop\'s gates would disagree with the world), the pointer is never grabbed, opening is idempotent, and it refuses outright while a match is running or already paused so it can never fight openPause. Three controls hide in settings mode — Exit, Edit HUD layout and Loadout — not because they are dangerous but because their consequence is absent, and the test asserts that NOTHING else is hidden, which is the whole point of the build');
