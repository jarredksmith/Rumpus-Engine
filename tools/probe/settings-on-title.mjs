// build 1456 — every setting is reachable from the title screen, without starting a match.
//
// The unit test drives openSettings/closeSettings against a fake DOM. That proves the state machine.
// It cannot prove the thing the audit actually asked for: that with the overlay up and NO match
// started, every control RESOLVES, is ON SCREEN, and its handler is bound. So this drives the real
// button in the real page and measures rects.
//
// The driver clicks Deploy to boot, so the probe returns to the menu first — which is also the realistic
// path (a player finishes a run, comes back, and wants to turn the shake down).
import { withGame } from './driver.mjs';

const P = (s) => `(function(){ ${s} })()`;

const GAME_PANEL    = ['pauseCamMode','pauseSprintMode','pauseCrouchMode','pauseCredits','postFxCb','adaptResCb','perfHudCb'];
// The gamepad block (#pauseCtl and its five sliders) is display:none until a pad has been SEEN —
// build 909's own behaviour, unchanged here, and correct: pad sliders shown to someone with no pad are
// noise. My first run listed them as failures, which was the instrument being wrong about the engine.
// They get their own conditional check below instead.
const CONTROL_PANEL = ['pauseKeys','msSensRng','msAimMatchCb'];
const PAD_GATED     = ['padSensRng','padAdsRng','padDeadRng','padInvCb','padAimRng'];
const AUDIO_PANEL   = ['muteCb','volMaster','volMusic','volSfx'];
const COMFORT_PANEL = ['a11yShake','a11ySway','a11yBlur','a11yFlash','a11yHitstop','a11yRumble',
                       'a11yUiScale','a11yReduce','a11yRestore','a11yCbMode','a11yCbStr','a11yPhotoWarn','a11yThirdParty'];
const HIDDEN_IN_SETTINGS = ['pauseExit','pauseEditHud','pauseLoadout'];

await withGame(async (probe) => {
  const say = (k, v) => console.log(String(k).padEnd(30), JSON.stringify(v));

  // ---- back to the title screen ----
  say('to the menu', await probe(P(`
    if(typeof exitToMenu==='function') exitToMenu();
    return { gameOn: !!gameOn, paused: !!paused,
             overlayUp: !document.getElementById('overlay').classList.contains('hidden'),
             settingsBtn: !!document.getElementById('settingsBtn') };
  `)));

  // ---- click the real button ----
  const opened = await probe(P(`
    document.getElementById('settingsBtn').click();
    var pm = document.getElementById('pauseMenu');
    var r = pm.getBoundingClientRect();
    return { shown: !pm.classList.contains('hidden'), setOnly: pm.classList.contains('setOnly'),
             title: document.getElementById('pauseTitle').textContent,
             closeLabel: document.getElementById('pauseResume').textContent,
             onScreen: r.width > 0 && r.height > 0,
             gameOn: !!gameOn, paused: !!paused };
  `));
  say('clicked Settings', opened);

  // ---- every control, per panel: resolves, on screen, and has a handler ----
  const check = (panel, ids) => probe(P(`
    _pauseTabShow(${JSON.stringify(panel)});
    var ids = ${JSON.stringify(ids)}, missing = [], offscreen = [], unbound = [];
    for(var i=0;i<ids.length;i++){
      var el = document.getElementById(ids[i]);
      if(!el){ missing.push(ids[i]); continue; }
      var r = el.getBoundingClientRect();
      if(!(r.width > 0 && r.height > 0)) offscreen.push(ids[i]);
      if(!(el.onclick || el.oninput || el.onchange)) unbound.push(ids[i]);
    }
    return { n: ids.length, missing: missing, offscreen: offscreen, unbound: unbound };
  `));

  const g = await check('game', GAME_PANEL);       say('GAME panel', g);
  const c = await check('controls', CONTROL_PANEL); say('CONTROLS panel', c);
  const a = await check('audio', AUDIO_PANEL);      say('AUDIO panel', a);
  const f = await check('comfort', COMFORT_PANEL);  say('COMFORT panel', f);

  // ---- the pad block: hidden with no pad, and REVEALED when one appears, both from the title screen ----
  const pad = await probe(P(`
    _pauseTabShow('controls');
    var box = document.getElementById('pauseCtl');
    var hiddenNow = box.getBoundingClientRect().height === 0;
    var seenBefore = !!padSeen;
    padSeen = true; bindPauseMenu();                       /* what plugging a pad in does */
    var shownAfter = box.getBoundingClientRect().height > 0;
    var ids = ${JSON.stringify(PAD_GATED)}, off = [], unbound = [];
    for(var i=0;i<ids.length;i++){
      var el = document.getElementById(ids[i]);
      var r = el.getBoundingClientRect();
      if(!(r.width > 0 && r.height > 0)) off.push(ids[i]);
      if(!(el.onclick || el.oninput || el.onchange)) unbound.push(ids[i]);
    }
    padSeen = seenBefore; bindPauseMenu();
    return { seenBefore: seenBefore, hiddenWithNoPad: hiddenNow, shownWithPad: shownAfter, offscreen: off, unbound: unbound };
  `));
  say('gamepad block (build 909)', pad);

  // ---- the three match-only controls are hidden, and only those ----
  const hid = await probe(P(`
    _pauseTabShow('game');
    var out = {};
    var ids = ${JSON.stringify(HIDDEN_IN_SETTINGS)};
    for(var i=0;i<ids.length;i++){
      var el = document.getElementById(ids[i]);
      var r = el ? el.getBoundingClientRect() : null;
      out[ids[i]] = el ? (r.width === 0 && r.height === 0) : 'absent';
    }
    return out;
  `));
  say('match-only hidden', hid);

  // ---- a slider actually WORKS from here, which is the whole point ----
  const live = await probe(P(`
    _pauseTabShow('comfort');
    var before = a11y.shake;
    var el = document.getElementById('a11yShake');
    el.value = 30; el.oninput();
    var after = a11y.shake;
    el.value = Math.round(before*100); el.oninput();
    return { before: before, after: after, restored: a11y.shake, label: document.getElementById('a11yShakeV').textContent };
  `));
  say('comfort slider is live', live);

  // ---- Escape closes it, and nothing was paused ----
  const closed = await probe(P(`
    document.dispatchEvent(new KeyboardEvent('keydown', { code:'Escape', bubbles:true }));
    var pm = document.getElementById('pauseMenu');
    return { shown: !pm.classList.contains('hidden'), setOnly: pm.classList.contains('setOnly'),
             title: document.getElementById('pauseTitle').textContent,
             resumeLabel: document.getElementById('pauseResume').textContent,
             paused: !!paused, gameOn: !!gameOn };
  `));
  say('Escape closed it', closed);

  const panels = [g, c, a, f];
  const ok = opened.shown && opened.setOnly && opened.onScreen && opened.title === 'SETTINGS'
          && !opened.gameOn && !opened.paused
          && panels.every(p => p.missing.length === 0 && p.offscreen.length === 0 && p.unbound.length === 0)
          && pad.hiddenWithNoPad && pad.shownWithPad && pad.offscreen.length === 0 && pad.unbound.length === 0
          && HIDDEN_IN_SETTINGS.every(id => hid[id] === true)
          && live.after === 0.3 && live.restored === live.before
          && !closed.shown && !closed.setOnly && closed.title === 'PAUSED' && closed.resumeLabel === 'Resume'
          && !closed.paused;
  const total = panels.reduce((n, p) => n + p.n, 0) + PAD_GATED.length;
  console.log('\n' + total + ' controls checked across four panels');
  console.log((ok ? 'PASS' : 'FAIL') + ' — every setting is reachable from the title screen with no match started');
  if (!ok) process.exitCode = 1;
}, { settleMs: 3000 });
