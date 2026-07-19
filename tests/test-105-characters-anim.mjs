// (build 154) Two fixes: (1) bots now drive their animation state from movement + an attack pose on fire;
// (2) per-player characters — each player owns + broadcasts their avatar config so avatars differ per
// player (instead of everyone adopting the host's model), and remote/bot avatars animate.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// --- bot animations ---
const ub = extractFunction('updateBots');
assert(/const mvx=b\.pos\.x-ox, mvz=b\.pos\.z-oz, md=Math\.hypot\(mvx,mvz\);/.test(ub) && /setEnemyAnimState\(b\.mesh, st\)/.test(ub), 'bots drive anim state from movement (directional, build 488)');
assert(/b\._fireAnimT && performance\.now\(\)<b\._fireAnimT/.test(ub) && /_fireSlot\(_bt\)\|\|'attack'/.test(ub), 'bots use an attack / move+fire pose while firing (build 518)');
assert(/b\._fireAnimT=performance\.now\(\)\+480;/.test(ub), 'firing flags the attack pose (longer hold, build 519)');

// --- per-player characters ---
assert(/charById:\{\},/.test(src), 'NET tracks a character per player');
assert(/function buildAvatarVisual\(g, cfg\)\{/.test(src) && /const mc = cfg \|\| playerModelCfg;/.test(src), 'avatar builds from a per-avatar config');
assert(/function myCharCfg\(\)/.test(src) && /function applyRemoteChar\(id, cfg\)/.test(src) && /function broadcastMyChar\(\)/.test(src), 'character helpers');
assert(/buildAvatarVisual\(rp\.mesh, rp\.modelCfg\)/.test(src), 'rebuild keeps each remote\\u2019s own character');
assert(/function makeRemotePlayer\(name, cfg\)/.test(src) && /buildAvatarVisual\(g, cfg\)/.test(src), 'remote avatar uses the owner config');
assert(/const cfg=\(NET\.charById&&NET\.charById\[id\]\)\|\|null; rp=\{ mesh:makeRemotePlayer\(name\|\|\('P'\+id\), cfg\)/.test(src), 'ensureRemotePlayer pulls the stored character');
assert(/conn\.send\(\{t:'name', n:NET\.name, char:myCharCfg\(\)\}\)/.test(src), 'client sends its character on join');
assert(/if\(msg\.char\)\{ applyRemoteChar\(id, msg\.char\);/.test(src), 'host applies + relays a joiner character');
assert(/char:myCharCfg\(\), chars:Object\.assign\(\{\}, NET\.charById\)/.test(src), 'welcome carries host + all known characters');
assert(/NET\.charById = Object\.assign\(\{\}, msg\.chars\|\|\{\}\); if\(msg\.char\) NET\.charById\[0\]=msg\.char;/.test(src), 'client stores everyone\\u2019s character from welcome');
assert(/else if\(msg\.t==='char'\)\{ applyRemoteChar\(id, msg\.cfg\);/.test(src), 'host handles a character change');
assert(/else if\(msg\.t==='char'\)\{ applyRemoteChar\(msg\.from, msg\.cfg\); if\(NET\.phase==='lobby' && NET\.lobbyRoster\) renderLobby\(NET\.lobbyRoster\); \}/.test(src), 'client applies a character change (and refreshes an open lobby, build 1008)');
assert(/the client keeps its own avatar; the host's character arrives via the welcome/.test(src), 'joining no longer overwrites the client character');
done('characters + bot anim');
