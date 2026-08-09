// Does the bar actually appear, fill, and go away?
//
// The test drives the fraction and the tick against fakes. This drives a REAL reload in the running game and
// reads the REAL element's computed geometry — the half a fake element cannot tell you: whether it is on
// screen, whether it overlaps the reticle, and whether it comes down on every path that ends a reload.
//
// The control is an idle session: the bar must be invisible with no style written at all.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(26) + JSON.stringify(v));

const READ = `(function(){
  const el = document.getElementById('reloadBar');
  if(!el) return { err: 'no element' };
  const r = el.getBoundingClientRect(), sp = el.firstElementChild;
  const cs = getComputedStyle(el);
  return { visible: r.width > 0 && r.height > 0 && cs.display !== 'none',
           fill: sp.style.transform || '(unset)',
           box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
           reloading: !!reloading, mag: W().mag };
})()`;

await withGame(async (P) => {
  say('settled', await P(`(function(){ return { build: BUILD_VERSION, gameOn, curWep, reloadMs: W().reloadMs }; })()`));

  console.log('\n--- CONTROL: idle -------------------------------------------------------------------');
  say('not reloading', await P(READ));

  /* A real reload is 700-1600 ms and this renderer runs ~1.5 fps, so sampling it between probe round trips
     reads a reload that has already finished — the first run did exactly that. So the FILL is measured on a
     held state (the same state a real reload produces, standing still long enough for the instrument), and
     the real reload below is measured for its TRANSITIONS, which is what it can honestly answer. */
  console.log('\n--- the fill, measured across a held window ------------------------------------------');
  const hold = (frac) => `(function(){
    /* set BOTH ends: shifting _rlT0 after _rlArm moves the start without moving the end, so the window
       widens to 10000*(1+frac) and every reading came out low — the first run read 0.5 at 100%. */
    reloading = true; const _n = performance.now();
    _rlT0 = _n - ${frac} * 10000; _rlT1 = _rlT0 + 10000;
    _rlPct = -1; _reloadBarTick();
    const el = document.getElementById('reloadBar'), r = el.getBoundingClientRect();
    return { fill: el.firstElementChild.style.transform,
             visible: r.width > 0 && r.height > 0 && !el.classList.contains('hidden'),
             box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
  })()`;
  for (const f of [0, 0.25, 0.5, 0.9, 1]) say('at ' + (f * 100) + '%', await P(hold(f)));

  console.log('\n--- geometry, while it is actually up -------------------------------------------------');
  say('vs the crosshair', await P(`(function(){
    const b = document.getElementById('reloadBar').getBoundingClientRect();
    const c = document.getElementById('crosshair').getBoundingClientRect();
    const overlaps = !(b.top >= c.bottom || b.bottom <= c.top || b.left >= c.right || b.right <= c.left);
    return { bar: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
             crosshair: [Math.round(c.left), Math.round(c.top), Math.round(c.width), Math.round(c.height)],
             overlapsReticle: overlaps, belowIt: b.top >= c.bottom,
             horizontallyCentred: Math.abs((b.left + b.width/2) - (c.left + c.width/2)) < 1 };
  })()`));
  say('hide-crosshair takes it too', await P(`(function(){
    const el = document.getElementById('reloadBar');
    const shown = getComputedStyle(el).display !== 'none';
    document.body.classList.add('hud-hide-crosshair');
    const gone = getComputedStyle(el).display === 'none';
    document.body.classList.remove('hud-hide-crosshair');
    const back = getComputedStyle(el).display !== 'none';
    return { shownBefore: shown, hiddenWithReticle: gone, backAfter: back };
  })()`));
  say('released', await P(`(function(){ reloading = false; _reloadBarTick(); const el=document.getElementById('reloadBar');
    return { hidden: el.classList.contains('hidden') }; })()`));

  console.log('\n--- a REAL reload: does it come up and go away --------------------------------------');
  say('real rifle reload', await P(`(async function(){
    curWep = 'rifle'; const w = W(); w.mag = 4; w.reserve = 90; reloading = false;
    const el = document.getElementById('reloadBar');
    reload();
    const seen = { up: false, filled: 0 };
    for(let i = 0; i < 30; i++){
      await new Promise(r => requestAnimationFrame(r));
      if(!el.classList.contains('hidden')) seen.up = true;
      const m = /scaleX\(([\d.]+)\)/.exec(el.firstElementChild.style.transform || '');
      if(m) seen.filled = Math.max(seen.filled, +m[1]);
      if(!reloading) break;
    }
    _reloadBarTick();
    return { cameUp: seen.up, reachedFill: seen.filled, magAfter: w.mag,
             downAfter: el.classList.contains('hidden') };
  })()`));

  console.log('\n--- it clears on a SWITCH mid-reload (build 1172) --------------------------------------');
  say('switched away', await P(`(function(){
    curWep = 'rifle'; const w = W(); w.mag = 2; w.reserve = 90; reloading = false;
    reload();
    const during = { reloading: !!reloading };
    if(!owned.includes('pistol')) owned.push('pistol');
    switchWeapon('pistol');
    _reloadBarTick();
    const el = document.getElementById('reloadBar');
    return { during, after: { reloading: !!reloading, hidden: el.classList.contains('hidden') } };
  })()`));

  console.log('\n--- and on a FIRE mid-reload, on a shell loader (build 1249) ---------------------------');
  say('shell reload', await P(`(async function(){
    curWep = 'shotgun'; const w = W(); w.mag = 0; w.reserve = 24; reloading = false; lastShot = -1e9;
    reload();
    const samples = [];
    for(let i = 0; i < 4; i++){
      await new Promise(r => setTimeout(r, 200));
      _reloadBarTick();
      const sp = document.getElementById('reloadBar').firstElementChild;
      samples.push({ mag: w.mag, fill: sp.style.transform });
    }
    return { samples, stillReloading: !!reloading };
  })()`));
  say('fire cancels it', await P(`(function(){
    const el = document.getElementById('reloadBar');
    lastShot = -1e9; shoot();
    _reloadBarTick();
    return { reloading: !!reloading, hidden: el.classList.contains('hidden') };
  })()`));

}, { settleMs: 6000 });

console.log('');
