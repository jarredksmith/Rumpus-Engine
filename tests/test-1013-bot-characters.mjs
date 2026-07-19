// (build 1013) BOTS WEAR RANDOM CHARACTERS — every bot was the default capsule. Each bot now
// draws from _botCharPool at spawn: the level's character roster (sanitized cfgs, real models)
// when it has one, otherwise the color presets (tinted capsule + identity ring). The look is
// visible to everyone: the host writes NET.charById[botId] + relays {t:'char'} at spawn, live
// clients rebuild via applyRemoteChar, and late joiners get the whole map in the welcome's
// `chars` field. The snapshot also carries each bot's REAL weapon key now (was hardcoded rifle),
// so clients render the gun the bot actually holds.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- executable: the pool prefers roster models, falls back to tint presets ----
const pool = extractFunction('_botCharPool', src);
const run = new Function('charRoster', 'CHARACTERS', '_sanitizeCharCfg',
  pool + '\nreturn _botCharPool();');
const sanit = (c) => ({ url: c.url || '', scale: +c.scale || 1, name: c.name || 'Character' });
{
  const out = run([{ name: 'Scout', url: 'https://h/scout.glb' }, { name: 'Heavy', url: 'https://h/heavy.glb' }, { name: 'broken' }],
    [{ color: 0xff0000 }], sanit);
  eq(out.length, 2, 'roster models only (an entry with no url/thumb is skipped)');
  assert(out.every(c => c.url), 'roster picks are sanitized cfgs with models');
}
{
  const out = run([], [{ color: 0xff0000 }, { color: 0x00ff00 }, { color: 0x0000ff }], sanit);
  eq(out.length, 3, 'no roster -> one entry per color preset');
  assert(out.every(c => c.tint != null && !c.url), 'presets are tint-only (tinted capsule + ring)');
}

// ---- spawn: random pick, applied to the mesh AND synced ----
const sb = extractFunction('spawnBots', src);
assert(/const _pool=_botCharPool\(\);/.test(sb), 'the pool is built once per spawn wave');
assert(/const _cfg=_pool\.length\?_pool\[\(Math\.random\(\)\*_pool\.length\)\|0\]:null;/.test(sb), 'each bot rolls independently');
assert(/makeBot\(team, nm, _cfg\)/.test(sb), 'the pick drives the avatar build');
assert(/if\(_cfg\)\{ NET\.charById\[id\]=_cfg; for\(const cid in NET\.conns\)\{ try\{ NET\.conns\[cid\]\.send\(\{t:'char', from:id, cfg:_cfg\}\); \}catch\(e\)\{\} \} \}/.test(sb),
  'the choice is published: live clients get the relay, late joiners get it via the welcome chars map');
assert(/function makeBot\(team, name, cfg\)\{\n  const g=new THREE\.Group\(\); buildAvatarVisual\(g, cfg\|\|undefined\);/.test(src),
  'makeBot builds the chosen character (undefined -> old default path)');

// ---- lifecycle hygiene + client-side weapon ----
assert(/if\(NET\.charById\) delete NET\.charById\[b\.id\];/.test(extractFunction('clearBots', src)),
  'clearing bots clears their char entries (no stale looks bleeding into the next match)');
assert(/w:\(b\.wep\|\|'rifle'\)/.test(src), 'the snapshot sends each bot’s real weapon (clients render the right gun)');
// the welcome already ships the full char map — bots ride along for free
assert(/chars:Object\.assign\(\{\}, NET\.charById\)/.test(src), 'welcome carries charById (bots included) to late joiners');

done('build 1013: bots wear random characters — roster models first, tint presets otherwise, synced to all');
