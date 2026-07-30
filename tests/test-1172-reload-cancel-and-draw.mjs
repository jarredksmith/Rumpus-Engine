// build 1172: reload can be switch-cancelled, and each weapon draws at its own pace.
//
// The review panel's "reload jail", verified: reload() was a setTimeout that always completed, and
// switchWeapon() hard-returned `if(reloading)` — a 1.6s sniper reload locked you out of every response
// while a charger lunged. Cancel-by-switch has been baseline FPS grammar since Half-Life. The token is what
// makes it safe: the pending timeout completes only if its token is still current, so a cancelled reload
// leaves the mag EXACTLY as it was and the cost of cancelling is honest (two draw times). Draw itself is
// now per-weapon: a pistol whips up in 220ms, a rocket launcher shoulders in 450.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- executed: the token machine
{
  const build = () => {
    const env = { reloading: false, tok: 0, timeouts: [], hud: 0 };
    const w = { mag: 3, magSize: 10, reserve: 20, reloadMs: 1000 };
    const fns = new Function('W', 'SFX', 'triggerGunAnim', 'updateHUD', 'setTimeout',
      'let reloading=false, _reloadTok=0;\n' +
      extractFunction('reload') + '\n' +
      'return { reload, cancel:()=>{ if(reloading){ reloading=false; _reloadTok++; } }, isReloading:()=>reloading };'
    )(() => w, { reload(){} }, () => {}, () => env.hud++, (fn, ms) => env.timeouts.push(fn));
    return { ...fns, env, w };
  };

  { // a completed reload refills as before
    const t = build();
    t.reload();
    assert(t.isReloading(), 'reload starts');
    t.env.timeouts[0]();
    eq(t.w.mag, 10, 'the mag refills on completion');
    eq(t.w.reserve, 13, '...from reserve');
    assert(!t.isReloading(), '...and the state clears');
  }
  { // THE fix: cancel mid-reload — no rounds appear, none vanish
    const t = build();
    t.reload();
    t.cancel();                      // the switchWeapon path
    t.env.timeouts[0]();             // the old timeout fires anyway
    eq(t.w.mag, 3, 'a cancelled reload leaves the mag EXACTLY as it was');
    eq(t.w.reserve, 20, '...and touches no reserve');
    assert(!t.isReloading(), 'the jail is open — switching is instant');
  }
  { // cancel then re-reload: the stale timeout cannot double-fill
    const t = build();
    t.reload(); t.cancel(); t.reload();
    eq(t.env.timeouts.length, 2, 'two reload attempts, two timeouts');
    t.env.timeouts[0]();             // the STALE one fires first
    eq(t.w.mag, 3, 'the stale timeout is a no-op — its token is dead');
    t.env.timeouts[1]();             // the live one
    eq(t.w.mag, 10, 'the live reload completes normally');
    eq(t.w.reserve, 13, 'and reserve is debited exactly once');
  }
}

// ---------------------------------------------------------------- the switch site
{
  const sw = extractFunction('switchWeapon');
  assert(!/\|\| reloading\) return;/.test(sw), 'switchWeapon no longer refuses during a reload');
  assert(/if\(reloading\)\{ reloading = false; _reloadTok\+\+; updateHUD\(\); \}/.test(sw),
    '...it CANCELS the reload instead');
  assert(/if\(tok !== _reloadTok \|\| !reloading\) return;/.test(extractFunction('reload')),
    'and the pending timeout checks its token, so the cancelled fill never lands');
}

// ---------------------------------------------------------------- per-weapon draw
{
  assert(/_drawDur = WEAPONS\[key\]\.drawMs \|\| DRAW_MS; _drawUntil = performance\.now\(\) \+ _drawDur;/.test(src),
    'the switch uses the weapon\'s own draw time, falling back to the 300ms default');
  assert(/\(_drawUntil - performance\.now\(\)\) \/ \(_drawDur\|\|DRAW_MS\)/.test(src),
    'and the viewmodel dip animation divides by the SAME duration, so a slow draw dips long instead of popping');
  const d = {};
  for (const m of src.matchAll(/(\w+):\s*\{ name:'[A-Z]+',\s*(?:drawMs:(\d+), )?mag/g)) d[m[1]] = m[2] ? +m[2] : 300;
  assert(d.pistol < d.rifle, 'the sidearm draws faster than the rifle (' + d.pistol + ' vs ' + d.rifle + 'ms)');
  assert(d.launcher > d.rifle && d.sniper > d.rifle, 'the heavies shoulder slower (' + d.sniper + '/' + d.launcher + 'ms)');
  assert(d.hands <= 200, 'fists are the fastest — bare hands have nothing to raise');
  // the pistol-as-panic-swap loop the cancel enables must be net-positive but not free:
  // cancel sniper reload (420ms draw lost) -> pistol up in 220ms beats the 1600ms reload by over a second
  assert(d.pistol + d.sniper < 1600, 'cancelling a sniper reload into a pistol and back is faster than the reload — the grammar works');
}

done('build 1172: reload is switch-cancellable via a token (the stale timeout provably cannot fill the mag, cancel leaves rounds exactly as they were, reserve debits once) and draw time is per-weapon — pistol 220ms, sniper 420, launcher 450 — with the viewmodel dip tracking the same duration');
