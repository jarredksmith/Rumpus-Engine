// build 1193: effect zones — heal / hurt / slow / haste / low-gravity volumes, one composable tool.
//
// The zone toolbox had one effect per tool (death kills, fire burns, water swims, pads launch); a healing
// fountain, a tar pit, a speed lane or a moon-gravity court was unauthorable. One tool now carries five
// effects with an audience (players / enemies / both), serialized like every zone, clamped on the way in
// so a hostile file cannot ship a 1e9-amount zone, damaging through fire's exact tick pattern.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the migrator, executed
{
  const mig = new Function('FX_KINDS', extractFunction('_migrateFxZone') + '\nreturn _migrateFxZone;')({ heal: 1, hurt: 1, slow: 1, haste: 1, lowgrav: 1 });
  { const z = mig({ x: 3, z: -4, r: 10, y: 1, h: 5, kind: 'haste', amt: 40, who: 'both' });
    eq(z.kind, 'haste', 'a valid zone round-trips'); eq(z.amt, 40, '...'); eq(z.who, 'both', '...'); }
  { const z = mig({ kind: 'nuke', amt: 1e9, r: 5000, h: -3, who: 'me' });
    eq(z.kind, 'heal', 'an unknown kind demotes to heal (the harmless default)');
    eq(z.amt, 200, 'amount clamps at 200');
    eq(z.r, 120, 'radius clamps'); eq(z.h, 0.5, 'height floors'); eq(z.who, 'players', 'an unknown audience defaults to players'); }
  { const z = mig(undefined); eq(z.kind, 'heal', 'a missing entry yields a sane zone, never a throw'); }
}

// ---------------------------------------------------------------- the field maths, executed
{
  const mk = (zones) => new Function('fxZones', extractFunction('_fxZoneAt') + '\nreturn _fxZoneAt;')(zones);
  const Z = (kind, amt, who, x = 0, z = 0, r = 10, y = 0, h = 4) => ({ x, z, r, y, h, kind, amt, who: who || 'players' });
  { const at = mk([Z('slow', 50), Z('haste', 30)]);
    const m = at(0, 1, 0, 'player');
    near(m.spd, 1.3, 1e-12, 'overlapping slow and haste: the STRONGEST of each side wins (haste 1.3 beats slow 0.5 upward) — max(min) composition, not multiplication into absurdity'); }
  { const at = mk([Z('slow', 200)]);
    near(at(0, 1, 0, 'player').spd, 0.15, 1e-12, 'slow floors at 0.15x — a zone can bog you down, never freeze you'); }
  { const at = mk([Z('heal', 8), Z('heal', 5), Z('hurt', 3)]);
    const m = at(0, 1, 0, 'player');
    eq(m.heal, 13, 'stacked heal rates SUM'); eq(m.hurt, 3, '...independently of hurt'); }
  { const at = mk([Z('lowgrav', 80)]);
    near(at(0, 1, 0, 'player').grav, 0.2, 1e-12, 'low gravity: amount is the percent removed'); }
  { const at = mk([Z('hurt', 10, 'enemies')]);
    eq(at(0, 1, 0, 'player').hurt, 0, 'an enemies-only zone never touches the player');
    eq(at(0, 1, 0, 'enemy').hurt, 10, '...and does touch an enemy'); }
  { const at = mk([Z('hurt', 10, 'both')]);
    eq(at(0, 1, 0, 'player').hurt, 10, '"both" touches players'); eq(at(0, 1, 0, 'enemy').hurt, 10, '...and enemies'); }
  { const at = mk([Z('haste', 50, 'players', 0, 0, 5)]);
    eq(at(20, 1, 0, 'player').spd, 1, 'outside the radius: nothing');
    eq(at(0, 30, 0, 'player').spd, 1, 'above the volume: nothing — a speed lane on a bridge does not reach the valley floor'); }
}

// ---------------------------------------------------------------- the wiring
{
  assert(/const sp = speedBase \* \(buffs\.speed>0\?1\.4:1\) \* moveScale \* run\.speedMul \* \(typeof _fxSpeedFor==='function' \? _fxSpeedFor\(player\.pos\.x, player\.pos\.y-EYE, player\.pos\.z, 'player'\) : 1\);/.test(src),
    'the player\'s speed target takes the multiplier — through 1171\'s acceleration model, so slow/haste have the same mass as everything else');
  eq((src.match(/_fxSpeedFor\(b\.pos\.x|_fxSpeedFor\(en\.mesh\.position\.x/g) || []).length, 2,
    'bots and enemies take it at their existing water-slow sites — one multiplier chain, three actors');
  assert(/if\(m\.grav<1\) player\.vel\.y \+= GRAV\*dt\*\(1-m\.grav\);/.test(src),
    'low gravity undoes part of THIS frame\'s gravity — the water-swim pattern, framerate-honest');
  assert(/if\(_fxHurtT>=0\.35\)\{ const dmg=_fxHurtAcc; _fxHurtAcc=0; _fxHurtT=0;/.test(src) &&
    /if\(typeof pvpMode==='function' && pvpMode\(\)\)\{ if\(!duelDead\) applyPvpDamage\(dmg, null\); \} else applyEnemyDamageToSelf\(dmg\);/.test(src),
    'hurt reuses fire\'s exact tick/accumulator and the same PvP/PvE damage split');
  assert(/if\(!\(typeof isClient!=='undefined' && isClient\) && typeof enemies!=='undefined'\)/.test(src),
    'enemy heal/hurt runs host-side only — enemies are host-simulated');
  assert(/fxZones: fxZones\.map\(z=>\(\{ x:\+z\.x, z:\+z\.z, r:\+z\.r, y:\+z\.y, h:\+z\.h, kind:z\.kind, amt:\+z\.amt, who:z\.who \}\)\),/.test(src),
    'the list serializes with the level');
  eq((src.match(/fxZones = Array\.isArray\(level\.fxZones\) \? level\.fxZones\.map\(_migrateFxZone\) : \[\];/g) || []).length, 2,
    'both loaders migrate it (and a level without the field gets an empty list, not a crash)');
  /* build 1320: the + menu's if/else chain of zone adders became ZONE_ADDERS, keyed by the same type
     string as ZONE_TYPES — the chain had drifted (triggers were missing from the menu entirely). Same
     assertion: the chip, the host and a reachable add-button. */
  assert(/\['fxzones','\\u2728','Effect'\]/.test(src) && /fxzones:'edFxZones'/.test(src) &&
    /fxzones:    \(\)=>\{ if\(typeof addFxZone==='function'\) addFxZone\(\); \},/.test(src),
    'the zones tab gains the Effect chip, host and add-button');
  assert(/if\(typeof updateFxZones==='function'\) updateFxZones\(dt\);/.test(src), 'the frame loop drives it');
  assert(/grp\.visible=!!\(typeof editorOpen!=='undefined' && editorOpen\)/.test(src), 'markers are editor-only cues, like death zones');
}

done('build 1193: effect zones — five composable effects on one zone tool (strongest-wins speed composition, summing heal/hurt rates, percent low-gravity), audience-scoped (players/enemies/both, each executed), clamped migration against hostile files, fire\'s damage tick, host-side enemy effects, full editor panel + serialization + both loaders');
