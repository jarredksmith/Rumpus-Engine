// Does a real jolt in the running game reach a pad?
//
// There is no gamepad in a headless Chromium, so the pad is STUBBED — but everything upstream of it is the
// real engine: a real weapon fire, a real explosion, a real hit taken, through the real `addShake`. That is
// the half that can be wrong (a chokepoint that some event bypasses), and it is the half this measures.
//
// The control is the slider at 0: the same events must produce nothing at all.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(30) + JSON.stringify(v));

await withGame(async (P) => {
  say('settled', await P(`(function(){
    return { build: BUILD_VERSION, gameOn, rumblePref: a11y.rumble, shakePref: a11y.shake };
  })()`));

  // Install the stub pad INSIDE the game closure, so `navigator` resolves to the patched global.
  say('stub pad installed', await P(`(function(){
    window.__RUMBLE = [];
    /* buttons/axes are not decoration: the engine polls getGamepads every frame and maps over them, so a
       bare stub throws once per frame into build 1330's overlay. Read the consumer before faking its input. */
    const pad = { index: 0, connected: true, mapping: 'standard', buttons: [], axes: [0,0,0,0],
      vibrationActuator: { playEffect: (kind, o) => {
        window.__RUMBLE.push({ kind, dur: o.duration, strong: +o.strongMagnitude.toFixed(4),
                               weak: +o.weakMagnitude.toFixed(4) });
        return Promise.resolve();
      } } };
    navigator.getGamepads = () => [pad];
    return { pads: navigator.getGamepads().length };
  })()`));

  const fire = (label, body) => P(`(function(){
    window.__RUMBLE.length = 0;
    ${body}
    return { label:'${label}', n: window.__RUMBLE.length, first: window.__RUMBLE[0] || null };
  })()`);

  console.log('\n--- real events, through the real chokepoint ------------------------------------------');
  say('one rifle round', await fire('shot', `
    curWep = 'rifle'; WEAPONS.rifle.mag = 30; lastShot = -1e9; reloading = false;
    shoot();
  `));
  // a gap past RUMBLE_GAP so the next event is never coalesced away
  await P(`new Promise(r => setTimeout(r, 200))`);
  say('a grenade at the feet', await fire('blast', `
    explodeAt(new THREE.Vector3(player.pos.x, player.pos.y - 1, player.pos.z), 6, 40, -1);
  `));
  await P(`new Promise(r => setTimeout(r, 200))`);
  // the player-damage entry point is `applyEnemyDamageToSelf`, not a `hurtPlayer` — read the engine's own
  // name before authoring against it, for the seventh time this session
  say('taking damage', await fire('hurt', `
    const hp0 = player.hp; applyEnemyDamageToSelf(18, player.pos.x + 4, player.pos.z);
    player.hp = hp0;
  `));

  console.log('\n--- the amplitude actually varies with the event --------------------------------------');
  await P(`new Promise(r => setTimeout(r, 200))`);
  const big = await fire('big', `addShake(0.6);`);
  await P(`new Promise(r => setTimeout(r, 200))`);
  const small = await fire('small', `addShake(0.05);`);
  say('addShake(0.6)', big.first);
  say('addShake(0.05)', small.first);
  say('ordered', { strength: big.first && small.first ? big.first.strong > small.first.strong : null,
                   duration: big.first && small.first ? big.first.dur > small.first.dur : null });

  console.log('\n--- CONTROL: the slider at 0 --------------------------------------------------------');
  await P(`new Promise(r => setTimeout(r, 200))`);
  say('rumble 0, same events', await P(`(function(){
    const was = a11y.rumble; a11y.rumble = 0;
    window.__RUMBLE.length = 0;
    curWep = 'rifle'; WEAPONS.rifle.mag = 30; lastShot = -1e9; reloading = false; shoot();
    explodeAt(new THREE.Vector3(player.pos.x, player.pos.y - 1, player.pos.z), 6, 40, -1);
    addShake(0.9);
    const n = window.__RUMBLE.length;
    a11y.rumble = was;
    return { rumbles: n, cameraStillShakes: +shake.toFixed(3) };
  })()`));

  console.log('\n--- and it returns ------------------------------------------------------------------');
  await P(`new Promise(r => setTimeout(r, 200))`);
  say('rumble back at 1', await fire('return', `addShake(0.6);`));

  console.log('\n--- camera shake at 0 must NOT silence the pad (two senses) ---------------------------');
  await P(`new Promise(r => setTimeout(r, 200))`);
  say('a11y.shake = 0', await P(`(function(){
    const was = a11y.shake; a11y.shake = 0; shake = 0;
    window.__RUMBLE.length = 0;
    addShake(0.6);
    const out = { rumbles: window.__RUMBLE.length, strong: (window.__RUMBLE[0]||{}).strong,
                  camera: +shake.toFixed(4) };
    a11y.shake = was;
    return out;
  })()`));

  console.log('\n--- the slider is on screen and wired ------------------------------------------------');
  say('pause menu row', await P(`(function(){
    if(!paused) openPause();
    _pauseTabShow('comfort');   /* build 1375: only the active panel is displayed, so switch first */
    const el = document.getElementById('a11yRumble');
    if(!el) return { err: 'no slider' };
    const r = el.getBoundingClientRect();
    const before = a11y.rumble;
    el.value = '35'; el.oninput();
    const after = { pref: a11y.rumble, label: (document.getElementById('a11yRumbleV')||{}).textContent };
    el.value = String(Math.round(before*100)); el.oninput();
    const p = el.closest('.pPanel');
    return { onScreen: r.width > 0 && r.height > 0, panel: p ? p.dataset.ppanel : '(none)',
             after, restored: a11y.rumble };
  })()`));
}, { settleMs: 6000 });

console.log('');
