import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1249: shotgun shell-by-shell reload (deferred from 1172). Shells load one at a time on the
// SAME cancel token; switching cancels; FIRING cancels the rest and keeps every loaded shell; the
// HUD counts up instead of hiding behind '--'. Executed here: the real reload() + _shellNext()
// under fake timers, through the full chain, both cancels, reserve exhaustion, and a partial start.

const reloadSrc = extractFunction('reload');
const shellSrc = extractFunction('_shellNext');

function rig(weapon) {
  const world = { q: [], sfx: 0, anim: 0, hud: 0 };
  const mk = new Function('W', 'SFX', 'triggerGunAnim', 'updateHUD', 'world', `
    let reloading = false, _reloadTok = 0;
    const setTimeout = (fn, ms) => { world.q.push({ fn, ms }); };
    ${shellSrc}
    ${reloadSrc}
    return {
      reload,
      get reloading(){ return reloading; },
      cancel(){ if(reloading){ reloading = false; _reloadTok++; } },   // what switchWeapon and the fire-interrupt both do
      step(){ const t = world.q.shift(); if(!t) return null; t.fn(); return t.ms; },
    };
  `);
  const w = weapon;
  return { r: mk(() => w, { reload: () => world.sfx++ }, () => world.anim++, () => world.hud++, world), w, world };
}
const SG = () => ({ magSize: 6, mag: 0, reserve: 24, shellReload: true, shellIntroMs: 260, shellMs: 420, reloadMs: 1300 });

{ // the full chain: empty mag -> 6 shells, one at a time, then done
  const { r, w, world } = rig(SG());
  r.reload();
  assert(r.reloading, 'reload starts');
  eq(world.q.length, 1, 'one pending timer at a time — a chain, not a burst');
  eq(r.step(), 260, 'the first shell waits the intro (pump open)');
  eq(w.mag, 1, 'one shell in');
  for (let i = 0; i < 5; i++) { eq(r.step(), 420, 'each further shell takes shellMs'); }
  eq(w.mag, 6, 'the tube fills');
  eq(w.reserve, 18, 'reserve debited exactly six');
  assert(!r.reloading, 'reload completes');
  eq(r.step(), null, 'no orphaned timer left behind');
  eq(world.sfx, 7, 'a click per shell plus the start');
}
{ // fire-interrupt mid-chain: every loaded shell is KEPT, the rest of the chain dies on the token
  const { r, w } = rig(SG());
  r.reload(); r.step(); r.step(); r.step();   // intro + 3 shells... (260, 420, 420)
  eq(w.mag, 3, 'three shells loaded');
  r.cancel();                                  // what firing does
  assert(!r.reloading, 'reload is over the instant the trigger wins');
  eq(r.step(), 420, 'the already-scheduled timer still fires...');
  eq(w.mag, 3, '...but the token check makes it a NO-OP: no shell appears');
  eq(w.reserve, 21, 'and none vanishes');
  eq(r.step(), null, 'the chain is dead');
}
{ // reserve exhaustion: 2 shells left for a 6-tube stops at 2 and ends cleanly
  const { r, w } = rig(Object.assign(SG(), { reserve: 2 }));
  r.reload();
  while (r.step() !== null) {}
  eq(w.mag, 2, 'loads what the reserve has');
  eq(w.reserve, 0, 'reserve empty');
  assert(!r.reloading, 'ends instead of waiting on shells that do not exist');
}
{ // partial reload: 4/6 with plenty of reserve needs exactly 2 shells
  const { r, w } = rig(Object.assign(SG(), { mag: 4 }));
  r.reload();
  let steps = 0; while (r.step() !== null) steps++;
  eq(w.mag, 6, 'topped off');
  eq(steps, 2, 'two shells, two timers — a near-full tube reloads FAST (the point of shell loading)');
}
{ // guards unchanged: full mag or dry reserve refuse to start
  const { r: r1 } = rig(Object.assign(SG(), { mag: 6 }));
  r1.reload(); assert(!r1.reloading, 'full tube: no-op');
  const { r: r2 } = rig(Object.assign(SG(), { reserve: 0 }));
  r2.reload(); assert(!r2.reloading, 'no reserve: no-op');
}
{ // a flat-reload weapon (no shellReload) still takes the 1172 path untouched
  const { r, w } = rig({ magSize: 30, mag: 10, reserve: 90, reloadMs: 900 });
  r.reload();
  eq(r.step(), 900, 'one flat timer at reloadMs');
  eq(w.mag, 30, 'mag filled in one step');
  assert(!r.reloading, 'done');
}

// --- wiring pins -------------------------------------------------------------------------------------
assert(/shellReload:true, shellIntroMs:260, shellMs:420,/.test(src), 'the shotgun ships as a shell loader');
assert(/if\(reloading && w\.shellReload && w\.mag > 0\)\{ reloading = false; _reloadTok\+\+; updateHUD\(\); \}/.test(src),
  'shoot() cancels a shell reload and fires with what is in the tube — but an EMPTY tube still waits for its first shell');
const shootFn = extractFunction('shoot');
assert(shootFn.indexOf('w.shellReload && w.mag > 0') < shootFn.indexOf('|| reloading) return;'),
  'the interrupt runs BEFORE the reloading gate, or it could never fire');
assert(/\(\(reloading && !w\.shellReload\) \? '--' : w\.mag\)/.test(src),
  'the HUD counts a shell reload UP; the flat path keeps its -- placeholder');

done('build 1249: shell-by-shell reload — the real chain executed (full, fire-cancelled, dry, partial, flat fallback), one timer at a time, every loaded shell kept on cancel, HUD counting up');
