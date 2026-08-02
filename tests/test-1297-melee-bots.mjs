import { gameSource, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1297: a bot holding a MELEE weapon shot bullets. Its engagement range came from the difficulty
// table (`D.range`) and its shot from `remoteFire`, which spawns a tracer and a hit for every peer — so a
// bot with a crowbar landed invisible shots from 20 m while holding a blunt object. Its standoff came from
// `prefRange` (6-15 m, a rifle's answer), so it never closed either.
//
// This has been reachable since the crowbar existed — the bot weapon pick falls through to it when a host
// allows nothing else — and build 1296 made ANY slot melee, so it is now one checkbox away in every level.

// ---------------------------------------------------------------- the bot closes
{
  assert(/prefRange:6\+Math\.random\(\)\*9 \}\);/.test(src), 'a gun bot still holds 6-15 m');
  assert(/if\(_bw && _bw\.melee\) _nb\.prefRange = Math\.max\(BOT_MELEE_MIN, \(_bw\.reach\|\|3\.4\)\*0\.7\);/.test(src),
    'a melee bot’s standoff is its own reach');
  // THE INEQUALITY IS THE POINT, and it is why the two constants are declared together: a bot holds
  // max(BOT_MELEE_MIN, 0.7r) and hits inside r. If the floor on reach ever dropped below the floor on the
  // stand-off, a creator could author a weapon whose bots close to a distance OUTSIDE their own reach and
  // swing forever. The first draft of this build had exactly that hole (reach floor 0.5, stand-off 1.2).
  const RMIN = +src.match(/BOT_MELEE_REACH_MIN = ([0-9.]+)/)[1];
  const SMIN = +src.match(/BOT_MELEE_MIN = ([0-9.]+)/)[1];
  eq(RMIN, 1.2, 'the shortest authorable reach');
  eq(SMIN, 1.0, 'and the closest a bot will stand');
  assert(SMIN < RMIN, 'the stand-off floor is BELOW the reach floor — the whole guarantee rests on this');
  const pref = new Function('SMIN', 'reach', 'return Math.max(SMIN, (reach||3.4)*0.7);');
  near(pref(SMIN, 3.4), 2.38, 1e-9, 'the crowbar closes to 2.38 m');
  near(pref(SMIN, 3.2), 2.24, 1e-9, 'a 3.2 m sword to 2.24');
  near(pref(SMIN, 12), 8.4, 1e-9, 'a long polearm keeps its distance, correctly');
  eq(pref(SMIN, 0), 2.38, 'a missing reach falls back to the crowbar’s, not to zero — which would mean "stand exactly on them"');
  // swept across the WHOLE authorable range, not three hand-picked values
  for (let r = RMIN; r <= 12.0001; r += 0.1)
    assert(pref(SMIN, r) < r, 'a bot presses INSIDE its reach at r=' + r.toFixed(1) + ', rather than hovering outside it swinging at air');
  assert(/if the floor on reach ever\n\/\/ dropped below the floor on the stand-off distance/.test(src),
    'and the dependency between the two constants is written where they are declared');
  // and the engage state actually uses it to move radially
  assert(/const radial = dist < b\.prefRange-1 \? -0\.5 : \(dist > b\.prefRange\+1 \? 0\.5 : 0\);/.test(src),
    'the engage state moves toward prefRange, so lowering it is what makes the bot advance');
  assert(/dist<Math\.max\(9,b\.prefRange\+3\)/.test(src),
    'and beyond that window it takes the direct-approach branch, so a melee bot still crosses the map');
}

// ---------------------------------------------------------------- the bot swings
{
  const blk = src.slice(src.indexOf('// build 1297: a melee bot SWINGS'));
  const body = blk.slice(0, blk.indexOf('// ---- build 1006: grenades'));
  assert(/const _bw = WEAPONS\[b\.wep\], _bMelee = !!\(_bw && _bw\.melee\);/.test(body), 'it asks what it is holding');
  assert(/const _bRange = _bMelee \? Math\.max\(1, \(_bw\.reach \|\| 3\.4\)\) : D\.range;/.test(body),
    'range is the weapon’s reach for melee and the difficulty table’s otherwise');
  assert(/if\(fdist<_bRange && hasLOS\)\{/.test(body), '...and that is what gates the attack');
  assert(!/if\(fdist<D\.range/.test(body), 'the unconditional D.range test is gone');
  // the melee branch fires NO projectile
  const mel = body.slice(body.indexOf('if(_bMelee){'), body.indexOf('} else {'));
  assert(!/remoteFire/.test(mel), 'a swing spawns no tracer');
  assert(!/t:'fire'/.test(mel), '...and sends no fire packet — there is no projectile to replicate');
  assert(/b\._fireAnimT=performance\.now\(\)\+480;/.test(mel), 'it does play the attack pose');
  assert(/build 1294 resolves it to `attack@<weapon>`/.test(mel),
    '...which build 1294 turns into the creator’s own swing clip, with no extra plumbing');
  assert(/if\(Math\.random\(\)<D\.hit\) _botDamage\(b, tgt, D\.dmgMin\+Math\.random\(\)\*D\.dmgRand\);/.test(mel),
    'and it deals damage');
}
{ // THE GUN PATH IS UNTOUCHED — every line of it still runs, just inside an else
  const blk = src.slice(src.indexOf('// build 1297: a melee bot SWINGS'));
  const gun = blk.slice(blk.indexOf('} else {'), blk.indexOf('// ---- build 1006: grenades'));
  for (const frag of ['const aim=_bv2.set(', 'const _moved=Math.hypot(b.pos.x-ox, b.pos.z-oz);',
                      'const _esp=D.spread*(0.5 + 1.8*(b._aimErr==null?0.4:b._aimErr))',
                      'remoteFire(b.id, o, d);', "t:'fire', from:b.id", '_botDamage(b, tgt, D.dmgMin'])
    assert(gun.includes(frag), 'the gun path still has: ' + frag);
  assert(/b\.fireCd = _bMelee \? Math\.max\(0\.25, \(_bw\.fireRate\|\|500\)\/1000\) : \(D\.cdMin\+Math\.random\(\)\*D\.cdRand\);/.test(blk),
    'and its cadence is still the difficulty table’s, while a swing paces on the weapon’s own interval');
  // executed: the swing cadence a creator authors
  const cd = new Function('rate', 'return Math.max(0.25, (rate||500)/1000);');
  eq(cd(500), 0.5, 'the crowbar swings twice a second');
  eq(cd(900), 0.9, 'a heavy axe is slower');
  eq(cd(420), 0.42, 'a light sword faster');
  eq(cd(30), 0.25, '...but never faster than the floor, whatever a hostile level file asks for');
  eq(cd(0), 0.5, 'and a missing rate falls back rather than swinging every frame');
}

// ---------------------------------------------------------------- damage stays on the difficulty table
{
  assert(/DAMAGE stays on the difficulty table, deliberately: a bot's damage has\n      \/\/ never come from its weapon/.test(src),
    'the decision not to use the weapon’s damage is recorded, with its reason');
  const blk = src.slice(src.indexOf('// build 1297: a melee bot SWINGS'));
  const body = blk.slice(0, blk.indexOf('// ---- build 1006: grenades'));
  assert(!/_bw\.dmg/.test(body), 'and no path reads the weapon’s damage — a sniper bot and a pistol bot already hit for the same');
  eq((body.match(/_botDamage\(b, tgt, D\.dmgMin\+Math\.random\(\)\*D\.dmgRand\)/g) || []).length, 2,
    'both branches deal the same difficulty-scaled damage');
}

// ---------------------------------------------------------------- why it was reachable before 1296
{
  assert(/\|\|'crowbar'\); \}\)\(\)/.test(src),
    'the bot weapon pick falls through to the crowbar when a host allows nothing else — which is how a melee bot existed before any of this');
  assert(/This has been reachable since the crowbar existed \(a melee-only match falls through to it\),/.test(src),
    'and that this predates build 1296 is stated, rather than blamed on it');
}

done('build 1297: a bot holding a melee weapon closes and swings — its engagement range came from the difficulty table and its shot from remoteFire, so a bot with a crowbar landed invisible tracer shots from 20 m while its standoff (6-15 m, a rifle\'s answer) kept it from ever closing. Now prefRange is its own reach × 0.7 so it presses inside it, the attack gate is the reach, and the swing spawns no projectile — just the attack pose, which build 1294 resolves to the creator\'s own swing clip. Damage deliberately stays on the difficulty table, because a bot\'s damage has never come from its weapon and making melee the exception would silently rebalance every match');
