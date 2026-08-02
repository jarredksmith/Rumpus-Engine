import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1289: REPORTED FROM PLAY — "ledge hang in third-person is still not working", together with the
// observation that the first-person camera sits much lower than the third-person one. One fault.
//
// Build 966 derived the hang's height from the DRAWN BODY's bounding box, and build 1239 tuned the sink
// against it. That measurement was gated on `_ownAvatar.visible`, which is FALSE in first person — so the
// same jump at the same box produced two different COLLIDER heights depending on which camera was showing.
// Measured live on the stock level's 2.2 m box: first person hung at eye 1.75 (0.45 under the lip — the
// framing 1239 tuned); third person at 1.58, which is exactly the "never feet-through-the-floor" clamp,
// i.e. the body standing at the wall base with its arms in the air, on every reachable ledge. The stock
// third-person body is a stylised capsule that boxes 2.2 m against a 1.9 m player, so the term overshot
// by half a metre and the clamp always won.
//
// After the fix, same probe, same box: 1.75 in BOTH views.

// ---------------------------------------------------------------- the reach is the PLAYER's, and unchanged
const K = new Function('EYE', 'LEDGE_HANG_SINK', 'return ' + (() => {
  const m = src.match(/const LEDGE_REACH = ([^;]+);/);
  assert(m, 'LEDGE_REACH is a named derivation');
  return m[1];
})() + ';');
{
  near(K(1.7, 0.42), 1.7 * 1.02 + 0.42, 1e-12,
    'the reach is exactly the expression first person already evaluated, so THAT view is byte-identical');
  near(K(1.7, 0.42), 2.154, 1e-9);
  // it must track both of its inputs — a hardcoded 2.154 would drift the moment either is retuned
  assert(K(2.0, 0.42) > K(1.7, 0.42), 'a taller player reaches higher');
  assert(K(1.7, 0.60) > K(1.7, 0.42), '...and a deeper sink hangs lower');
}
{ // THE FIX ITSELF: nothing in the grab block may ask about the drawn body
  const mv = src.slice(src.indexOf("// build 640/644: ledge grab"));
  const grab = mv.slice(0, mv.indexOf('// build 1160'));
  assert(/_hy=Math\.max\(_lt \+ EYE - LEDGE_REACH, _gy \+ EYE - 0\.12\)/.test(grab),
    'the hang height is the player reach against the floor clamp');
  assert(!/_ownAvatar/.test(grab), 'THE BUG: the grab no longer reads the avatar at all');
  assert(!/_avHBox|_avHCache/.test(grab), '...nor its measurement');
  assert(!/_vh/.test(grab), '...and the drawn-height term is gone from the collider entirely');
  assert(/lip:_lt, gy:_gy/.test(grab), 'the lip and the ground ride along, for the visual to place a body against');
}

// ---------------------------------------------------------------- the drawn body's own drop
const drop = new Function('EYE', 'LEDGE_HANG_SINK', 'performance', 'THREE', 'boxH', [
  'let _avHCache=EYE, _avHCacheT=-1e9;',
  'const _avHBox={ setFromObject:(o)=>({ min:{y:0}, max:{y:boxH(o)} }) };',
  extractFunction('_avatarHangDrop'),
  'return _avatarHangDrop;',
].join('\n'));
{
  const now = { now: () => 1e9 };
  const f = drop(1.7, 0.42, now, null, () => 2.2);
  near(f({}), 2.2 * 1.02 + 0.42, 1e-9, 'a 2.2 m body must drop its full reach to put its hands on the lip');
  eq(drop(1.7, 0.42, now, null, () => 1.8)({}), 1.8 * 1.02 + 0.42, 'and a 1.8 m one drops less');
  // THE FALLBACK IS THE PLAYER, not a literal: an unmeasurable body must hang exactly where the collider is
  near(drop(1.7, 0.42, now, null, () => 2.2)(null), 1.7 * 1.02 + 0.42, 1e-9,
    'no avatar -> the player reach, so the drawn body sits exactly on the collider');
  near(drop(1.7, 0.42, now, null, () => 0.4)({}), 1.7 * 1.02 + 0.42, 1e-9, 'an absurdly short measurement is rejected');
  near(drop(1.7, 0.42, now, null, () => 9)({}), 1.7 * 1.02 + 0.42, 1e-9, '...and an absurdly tall one');
  eq(drop(1.7, 0.42, now, null, () => 3.1)({}), 3.1 * 1.02 + 0.42,
    'the band reaches 3.2 — a tall character is legitimate content, not a bad measurement');
  // a throwing measurement never breaks the frame
  near(drop(1.7, 0.42, now, null, () => { throw new Error('boom'); })({}), 1.7 * 1.02 + 0.42, 1e-9,
    'an unmeasurable body falls back rather than throwing mid-frame');
}
{ // build 1168's budget: measured at most once a second, whatever the frame rate
  let calls = 0, t = 0;
  const f = drop(1.7, 0.42, { now: () => t }, null, () => { calls++; return 2.0; });
  t = 1e6; f({}); const first = calls;
  for (let i = 0; i < 50; i++) { t += 10; f({}); }
  eq(calls, first, '50 frames inside the same second cost one Box3 traversal');
  t += 1200; f({});
  eq(calls, first + 1, '...and it re-measures once the second is up');
}

// ---------------------------------------------------------------- the visual offset, lifted from the source
const uoa = extractFunction('updateOwnAvatar');
const OFF = (() => {
  const a = uoa.indexOf("if(typeof _ledge!=='undefined' && _ledge && _ledge.lip!=null){");
  const b = uoa.indexOf('a.position.set(player.pos.x, footY, player.pos.z);');
  assert(a > 0 && b > a, 'the offset block sits immediately before the body is placed');
  return uoa.slice(a, b);
})();
const place = new Function('_ledge', 'a', '_avatarHangDrop', 'LEDGE_PULL_DUR', 'footY',
  OFF + '\n return footY;');
const reach = (h) => h * 1.02 + 0.42;
{
  const LIP = 2.2, GY = 0;
  // the collider hangs at eye 1.75 -> its feet are at 0.05 (the number the live probe reported)
  const colliderFoot = 1.75 - 1.7;
  const led = (ph, t) => ({ ph, t, lip: LIP, gy: GY });

  // a 2.2 m stylised capsule: hands-on-lip wants feet at -0.42, the ground clamp holds it at 0
  const tall = place(led('hang', 1), {}, () => reach(2.2), 0.5, colliderFoot);
  near(tall, 0, 1e-9, 'the drawn body never sinks below the ground under it');
  assert(tall < colliderFoot, '...but it does come DOWN off the collider, so its top lands on the lip not over it');
  near(tall + 2.2, LIP, 1e-9, 'measured: the 2.2 m capsule’s top lands exactly on the 2.2 m lip');

  // a proportioned 1.8 m character on a taller lip actually hangs
  const led2 = { ph: 'hang', t: 1, lip: 3.0, gy: 0 };
  const mid = place(led2, {}, () => reach(1.8), 0.5, 1.3);
  near(mid, 3.0 - reach(1.8), 1e-9, 'a body that fits hangs free, feet clear of the ground');
  assert(mid > 0, '...above the ground, so no clamp applied');

  // AND THE POINT OF THE BUILD: neither of those moved the collider. The same _ledge drives both.
  assert(place(led('hang', 1), {}, () => reach(2.2), 0.5, colliderFoot)
      !== place(led('hang', 1), {}, () => reach(1.5), 0.5, colliderFoot),
    'two different bodies are DRAWN differently…');
}
{ // eased, not snapped — and faded back out across the pull-up
  const led = (ph, t) => ({ ph, t, lip: 2.2, gy: 0 });
  const F = (l) => place(l, {}, () => reach(2.2), 0.5, 0.05);
  eq(F(led('hang', 0)), 0.05, 'at t=0 the body is exactly on the collider — no snap on the grab frame');
  assert(F(led('hang', 0.09)) < 0.05 && F(led('hang', 0.09)) > F(led('hang', 0.18)),
    '...and eases down across the same 0.18 s the collider uses');
  near(F(led('hang', 0.18)), 0, 1e-9, 'settled by the end of the ease');
  near(F(led('hang', 9)), 0, 1e-9, '...and stays there for a long hang');
  // the pull-up fades the offset out so the body does not jump when it mounts the top
  eq(F(led('pull', 0)), 0, 'the pull begins where the hang ended');
  assert(F(led('pull', 0.25)) > F(led('pull', 0)), '...fades back toward the collider');
  eq(F(led('pull', 0.5)), 0.05, '...and is fully gone by the end of the pull');
  eq(F(led('pull', 99)), 0.05, 'never inverts past the end');
  eq(F(led('drop', 0.2)), 0, 'a drop keeps the hang framing while the body falls away');
}
{ // and it costs nothing when nothing is hanging
  eq(place(null, {}, () => { throw new Error('measured with no ledge'); }, 0.5, 1.23), 1.23,
    'no ledge -> the body is placed exactly where the collider is, with no measurement at all');
  eq(place({ ph: 'hang', t: 1 }, {}, () => { throw new Error('measured'); }, 0.5, 1.23), 1.23,
    'a ledge with no lip (an older record mid-flight) is skipped rather than throwing');
}

// ---------------------------------------------------------------- the reasoning is recorded
{
  assert(/gated on `_ownAvatar\.visible` — false in first person/.test(src),
    'why the two cameras disagreed is written down, not left to be rediscovered');
  assert(/first person hung at eye 1\.75/.test(src) && /third person at 1\.58/.test(src),
    '...with the measured numbers, so a future retune knows what it is moving');
  assert(/STYLISED capsule proxy that boxes 2\.2 m against a 1\.9 m player/.test(src),
    '...and why the drawn body is not the player, which is the fact that made it wrong');
}

done('build 1289: the ledge hang stopped asking which camera is active — build 966 derived its COLLIDER height from the drawn body’s bounding box, measured only when that body was visible, so third person hung half a metre lower than first and the floor clamp then won on every reachable ledge (the body stood at the wall base with its arms in the air). The hang is now the player’s own reach, identical in every view and byte-identical to the first-person value 1239 tuned; how tall the character is DRAWN moved to _avatarHangDrop, which places the visual body — of any height — with its hands on the lip and its feet never under the ground');
