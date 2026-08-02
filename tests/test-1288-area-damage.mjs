import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1288: the feature audit found TOWER DEFENCE structurally unbuildable, and this was the whole
// reason. `_lgEnemyTargets` offered 'enemies' (every enemy in the level) and 'nearest' (measured from
// player.pos — nearest to the PLAYER, never to a tower), and nothing else in the engine damaged by
// position: the only autonomous positional damage was an author-time fx zone no verb could create, move
// or toggle. So "hurt what is close to THIS turret" was unsayable.

const targets = new Function('enemies', 'player', extractFunction('_lgEnemyTargets') + '; return _lgEnemyTargets;');
const en = (x, z, hp = 10) => ({ hp, maxHp: 10, mesh: { position: { x, y: 0, z } } });

{ // the new audience
  const list = [en(0, 0), en(5, 0), en(0, 12), en(30, 30)];
  const f = targets(list, { pos: { x: 0, y: 0, z: 0 } });
  eq(f('near', { x: 0, z: 0 }, 6).length, 2, 'enemies within R of a PLACE — the turret case');
  eq(f('near', { x: 0, z: 0 }, 13).length, 3, 'a wider radius reaches further');
  eq(f('near', { x: 30, z: 30 }, 2).length, 1, '...and it is measured from the place, not the player');
  eq(f('near', { x: 100, z: 100 }, 5).length, 0, 'an empty area affects nothing');
}
{ // the boundary and the degenerate cases
  const f = targets([en(3, 4)], { pos: { x: 0, z: 0 } });   // exactly 5 away
  eq(f('near', { x: 0, z: 0 }, 5).length, 1, 'an enemy exactly at the radius is inside it');
  eq(f('near', { x: 0, z: 0 }, 4.99).length, 0, '...and just outside is outside');
  eq(f('near', { x: 0, z: 0 }, 0).length, 0, 'RADIUS 0 IS NOWHERE, never everywhere — the dangerous default');
  eq(f('near', { x: 0, z: 0 }, -5).length, 0, '...and so is a negative one');
  eq(f('near', null, 10).length, 0, 'a place that does not exist affects nothing rather than everything');
  eq(f('near', undefined, 10).length, 0);
  eq(f('near', { x: 0, z: 0 }, NaN).length, 0, 'a NaN radius is nowhere, not everywhere');
}
{ // measured in XZ, deliberately — a turret should hit the enemy at the foot of its own tower
  const high = en(1, 1); high.mesh.position.y = 40;
  const f = targets([high], { pos: { x: 0, z: 0 } });
  eq(f('near', { x: 0, z: 0 }, 3).length, 1, 'height is ignored, like every other range check the AI does');
}
{ // the dead are never targets, whatever the audience
  const f = targets([en(0, 0, 0), en(1, 1, 5), { hp: 5, mesh: null }], { pos: { x: 0, z: 0 } });
  eq(f('near', { x: 0, z: 0 }, 9).length, 1, 'a corpse and a meshless enemy are skipped');
  eq(f('enemies').length, 1, '...for the old audiences too, unchanged');
}
{ // THE EXISTING ANSWERS ARE BYTE-IDENTICAL — this must add a case, not change one
  const list = [en(0, 0), en(5, 0), en(20, 0)];
  const f = targets(list, { pos: { x: 19, y: 0, z: 0 } });
  eq(f('enemies').length, 3, '"all enemies" is still every live enemy');
  eq(f().length, 3, '...including with no argument at all');
  const n = f('nearest');
  eq(n.length, 1, '"nearest" still returns one');
  eq(n[0].mesh.position.x, 20, '...and still measures from the PLAYER, not from any place');
  eq(f('near', { x: 0, z: 0 }, 1).length, 1, 'while "near" measures from the place — the distinction that matters');
}

// --- wiring -------------------------------------------------------------------------------------------
{
  assert(/s\.who==='near'\)\?s\.who:'player'/.test(src) || /\|\|s\.who==='near'\)/.test(src),
    "'near' is an accepted audience");
  const wa = extractFunction('_applyWorldAction');
  assert(/const _area = \(who==='near'\) \? _lgPlaceAt\(s\.at\) : null;/.test(wa),
    'it reuses the same `at` place the spawn and teleport verbs already take');
  assert(/const _rad  = \(who==='near'\) \? Math\.max\(0, Math\.min\(200, \+s\.r\|\|0\)\) : 0;/.test(wa),
    '...and the radius is clamped, because a level file is untrusted input');
  assert(/_lgEnemyTargets\(who, _area, _rad\)/.test(wa), '...and both reach the resolver');
  // damage / heal / kill all share that branch, so all three gain the area
  assert(/if\(s\.do==='damage' \|\| s\.do==='heal' \|\| s\.do==='kill'\)\{/.test(wa),
    'damage, heal and kill share the branch — a healing pad is the same feature as a mine');
}
{ // TELEPORT is guarded, because for that verb `at` is the DESTINATION and there is no source area.
  // A silently-empty verb is the exact class of bug this session has spent five builds removing.
  const wa = extractFunction('_applyWorldAction');
  const tp = wa.slice(wa.indexOf("if(s.do==='teleport')"));
  assert(/if\(who==='near'\)\{/.test(tp), 'teleport refuses the option rather than resolving to nothing');
  assert(/_noteLogicFailure\(/.test(tp), '...and says so in the Level Check panel');
  assert(/there is no area to pick them from/.test(tp), '...explaining why, and what to use instead');
  assert(tp.indexOf("who==='near'") < tp.indexOf('_lgEnemyTargets'),
    '...before it would have reached the resolver');
}
{ // the editor offers it, with the fields it needs
  const defs = new Function('return ' + extractConst('LG_DEFS', src) + ';')();
  const p = defs.do.params;
  const who = p.find(x => x.k === 'who');
  assert(who.sel.some(o => o[0] === 'near'), 'the audience dropdown offers it');
  const r = p.find(x => x.k === 'r');
  assert(r, 'there is a radius field');
  eq(r.ifv2[0], 'who', '...shown only when the audience is an area');
  eq(r.ifv2[1], 'near');
  const at = p.find(x => x.k === 'at');
  for (const v of ['damage', 'heal', 'kill'])
    assert(at.ifv[1].includes(v), 'the place field is offered for ' + v + ', or "near" would have nowhere to point');
}

done('build 1288: damage, heal and kill can target an AREA — every enemy within R of a named place, which unblocks tower defence, traps, mines and healing pads (the audit found the genre structurally unbuildable because "nearest" measured from the player, never from a turret); radius 0 and a missing place are NOWHERE rather than everywhere, the existing audiences are byte-identical, and teleport refuses the option in the Level Check panel instead of silently resolving to nothing');
