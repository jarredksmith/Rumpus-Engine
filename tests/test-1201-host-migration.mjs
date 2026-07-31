// build 1201: host migration — the match survives the host leaving.
//
// The multiplayer critic's remaining CRITICAL. The host vanishing mid-match used to reload every client's
// page 1.6s later; hundreds of waves of progress died with one flaky connection. Now: every peer computes
// the SAME deterministic rank from the roster it already has (no election round-trip exists to lose), the
// lowest live rank promotes itself FROM ITS OWN LAST SNAPSHOT (mirrors -> authoritative arrays; keyframes
// carry enemy type+hp for exactly this), and everyone else reconnects to a DERIVED peer id
// ('<code>-m<gen>') — deterministic everywhere, and immune to the dead host's id lingering at the broker.
// Rejoiners announce their old id in connection METADATA so scores, teams and prop prefixes survive.
// Honest limits (recorded, not hidden): logic-graph variables and PvP bots are host-local and do not
// migrate; a lobby-phase loss still takes the old road home.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the election, executed
{
  const rank = new Function(extractFunction('_migRank') + '\nreturn _migRank;')();
  eq(rank(3, ['0','3','5','9']), 0, 'the lowest-id survivor promotes (the dead host, id 0, is excluded)');
  eq(rank(5, ['0','3','5','9']), 1, '...the next waits one stagger');
  eq(rank(9, ['5','9','3','0']), 2, '...and the order is independent of roster iteration order — every peer computes the SAME ranks');
  eq(rank(7, ['0']), 0, 'a lone survivor is rank 0 — a co-op partner leaving promotes you instantly and the match simply continues');
  const pid = new Function(extractFunction('_migPid') + '\nreturn _migPid;')();
  eq(pid('ABQX', 1), 'breachfps-ABQX-m1', 'the migrated room id derives from code+generation — no coordination needed to agree on it');
  assert(pid('ABQX', 2) !== pid('ABQX', 1), '...and a second migration derives a fresh id');
}

// ---------------------------------------------------------------- the promotion, executed: mirrors become the world
{
  const enemies = [], coins = [], powerups = [], mixers = [], removed = [];
  let nid = 100;
  const ENEMY_TYPES = { grunt: { hp: 30 }, brute: { hp: 120 } };
  const env = {
    NET: {
      players: { 0: {}, 5: {} }, myId: 3, nextId: 2, _maxPid: 9,
      enemyMeshes: {
        11: { ty: 'brute', hp: 40, mesh: { position: { x: 4, y: 1.4, z: 5 }, userData: {} } },
        12: { ty: 'brute', hp: 999, mesh: { position: { x: 6, y: 1.4, z: 5 }, userData: {} } },
        13: { mesh: { position: { x: 8, y: 1.4, z: 5 }, userData: {} } },
      },
      coinMeshes: { 7: { position: { x: 1, y: 0.9, z: 1 } } },
      powerupMeshes: { 4: { position: { x: 2, y: 0, z: 2 }, visible: false, userData: { _puKind: 'shield' } } },
      deadChests: { 9: true },
    },
    spawnEnemy: (sp) => { const ty = ENEMY_TYPES[sp.type]; enemies.push({ id: nid++, type: sp.type, hp: ty.hp, maxHp: ty.hp, x: sp.x, z: sp.z }); },
    removeRemotePlayer: (id) => removed.push(id),
    scene: { remove() {} },
  };
  const run = new Function('NET', 'enemies', 'coins', 'powerups', 'mixers', 'scene', 'spawnEnemy', 'removeRemotePlayer', 'ENEMY_TYPES',
    'let nextCoinId=1, _puId=1;\n' + extractFunction('_migAdoptMirrors') +
    '\nconst r=_migAdoptMirrors(); return { r, nextCoinId, _puId };'
  )(env.NET, enemies, coins, powerups, mixers, env.scene, env.spawnEnemy, env.removeRemotePlayer, ENEMY_TYPES);

  eq(enemies.length, 3, 'every mirrored enemy becomes a real one');
  const brute = enemies.find(e => e.x === 4);
  eq(brute.type, 'brute', 'the keyframe type survives — a brute stays a brute, with its damage table');
  eq(brute.hp, 40, '...at its last-known hp, not full health');
  eq(enemies.find(e => e.x === 6).hp, 120, 'a stale hp claim clamps to the type\'s maxHp');
  eq(enemies.find(e => e.x === 8).type, 'grunt', 'a mirror that predates the ty field demotes to grunt rather than failing');
  eq(coins.length, 1, 'coins are adopted');
  eq(coins[0].id, 7, '...keeping their network id (clients already hold meshes under it)');
  eq(run.nextCoinId, 8, '...and the id fountain advances past them');
  eq(powerups[0].kind, 'shield', 'a powerup keeps its kind (the mirror remembers it for exactly this)');
  eq(powerups[0].ready, false, '...and its cooldown state (an unready pad stays unready)');
  eq(run._puId, 5, '...with its fountain advanced too');
  assert(removed.includes(0) && removed.includes(5), 'ALL remote-player entries drop — rejoiners re-appear on their first state message; the dead host and bots never do');
  eq(Object.keys(env.NET.enemyMeshes).length + Object.keys(env.NET.coinMeshes).length + Object.keys(env.NET.powerupMeshes).length, 0, 'the mirrors are emptied — nothing is double-owned');
  eq(env.NET.nextId, 10, 'the id fountain starts past every id ever seen in a snapshot (no rejoiner can collide with a fresh joiner)');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/if\(gameOn && NET\.roomCode && typeof netMigrateBegin==='function'\)\{ netMigrateBegin\(\); return; \}/.test(src),
    'a mid-match host loss migrates; netHostLost falls through to _migFail (the old reload) only outside a match');
  assert(/if\(full\)\{ o\.ty=e\.type; o\.hp=q2\(e\.hp\); \}/.test(src),
    'KEYFRAMES carry enemy type+hp (deltas do not — the key is unchanged, so 1197\'s bandwidth win survives)');
  assert(/if\(e\.ty!=null\)\{ em\.ty=e\.ty; em\.hp=e\.hp; \}/.test(src) && /m\.userData\._puKind=pu\.k;/.test(src),
    'the client mirrors remember type/hp/kind — the promoted host adopts them verbatim');
  const hoc = extractFunction('_hostOnConnection');
  assert(/conn\.metadata && conn\.metadata\.rejoin!=null/.test(hoc) &&
    /const _rejoinFree = \(_rj!=null && _rj>=1 && !NET\.conns\[_rj\]\);/.test(hoc) && /conn\._pid = _rejoinFree \? _rj : NET\.nextId\+\+;/.test(hoc),
    'a rejoiner keeps its OLD id when free (metadata arrives before open, so every score/team lookup is right from the first byte; the free-slot test is named _rejoinFree since 1207 so the connection cap can honour a rejoin past the ceiling)');
  assert(/if\(conn\._pid >= NET\.nextId\) NET\.nextId = conn\._pid\+1;/.test(hoc), '...and the fountain never falls behind an honoured rejoin id');
  assert(/if\(_rj==null\) try\{ level = serializeLevel\(\); \}catch\(e\)\{\}/.test(hoc), 'a rejoiner skips the level serialization — it is already standing in the level');
  eq((src.match(/NET\.peer\.on\('connection', _hostOnConnection\);/g) || []).length, 2,
    'the ORIGINAL host and a PROMOTED one attach the identical connection handler — one function, no drift');
  assert(/if\(NET\.joined\)\{ if\(msg\.mig && msg\.id!=null\) NET\.myId=msg\.id; return; \}/.test(src),
    'a rejoin welcome is inert (no re-startGame mid-match) except an id rebind when the old id was taken');
  assert(/\+msg\.to !== NET\.myId && \+msg\.to !== id/.test(src) && /const P=\[\{ id:NET\.myId,/.test(src),
    'the host identifies itself by its REAL id in the relay and the snapshot — 0 for an original host, the kept id for a promoted one');
  assert(/e\.type==='unavailable-id'/.test(src), 'losing the claim race demotes cleanly to client of whoever won');
  assert(/NET\._migStart \+ rank\*4000/.test(src), 'the cascade: rank r claims only after r staggers — a dead rank (a bot, a double-drop) delays, never deadlocks');
  assert(/performance\.now\(\)>NET\._migDeadline/.test(src) && /NET\.migGen=\(NET\.migGen\|0\)\+1;/.test(src),
    'a migration that cannot complete still ends at the old reload, and each observed loss bumps the generation exactly once');
}

done('build 1201: host migration — deterministic no-round-trip election executed (order-independent ranks, lone-survivor instant promote), the real _migAdoptMirrors driven through type/hp-clamp/legacy-mirror/coin/powerup/id-fountain cases, keyframes enriched with enemy type+hp, rejoiners keeping their ids via connection metadata, one shared connection handler, claim-race and cascade and deadline all pinned — a host closing their laptop no longer ends everyone\'s match');
