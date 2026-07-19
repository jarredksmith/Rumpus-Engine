// (build 145) AI bots: host-simulated PvP opponents for duel/FFA/TDM/KOTH so the modes are playable
// solo. They roam, acquire the nearest enemy, fire (visible tracers via remoteFire), take damage, die,
// and respawn. Host owns all logic; clients see them as ordinary remote avatars via the world snapshot.
import { gameSource, extractFunction, html, done, assert } from './harness.mjs';
const src = gameSource();

assert(/let bots=\[\]; const BOT_ID_BASE=900;/.test(src), 'bots array + id base');
assert(/function makeBot\(team, name, cfg\)/.test(src) && /function spawnBots\(n\)/.test(src) && /function botDie\(b, sx, sz\)/.test(src) && /function updateBots\(dt\)/.test(src), 'bot lifecycle fns');

const sb = extractFunction('spawnBots');
assert(/team=\(c0<=c1\)\?0:1/.test(sb), 'bots fill the smaller team in team modes');
assert(/NET\.duelScore\[id\]=0/.test(sb) && /if\(teamMode\(\)\) broadcastTeams\(\)/.test(sb), 'bots registered on the scoreboard + teams broadcast');

const ub = extractFunction('updateBots');
assert(/if\(NET\.mode!=='host' \|\| !pvpMode\(\) \|\| !gameOn \|\| !bots\.length\) return;/.test(ub), 'updateBots is host + pvp only');
assert(/b\.respawnT-=dt;/.test(ub) && /if\(b\.respawnT<=0\)\{ const sp=randomSpawn\(\)/.test(ub), 'dead bots respawn on a timer');
assert(/remoteFire\(b\.id, o, d\)/.test(ub) && /_botDamage\(b, tgt/.test(ub), 'bots fire visible shots + deal damage');

const bd = extractFunction('_botDamage');
assert(/tgt\.kind==='host'\) applyPvpDamage\(dmg, b\.id\)/.test(bd), 'bot vs host routes through PvP death (not co-op endGame)');
assert(/tgt\.kind==='client'\) sendToPlayer\(tgt\.id, \{t:'pvpHit', d:dmg, from:b\.id\}\)/.test(bd), 'bot vs client credits the bot');
assert(/if\(botHurt\(o, dmg, b\.pos\.x, b\.pos\.z\)\) registerDuelKill\(b\.id, o\.id\)/.test(bd), 'bot vs bot scores + kills');

assert(/for\(const b of bots\)\{ if\(b\.dead && !b\._dying\) continue; P\.push\(\{ id:b\.id[\s\S]*?hd:b\._netHitDir\|\|0, hs:b\._netHitSeq\|\|0/.test(src), 'bots (incl. dead-but-dying) ride the world snapshot with hd/hs (build 502)');
assert(/if\(botId!=null && NET\.mode==='host'\)\{ const b=botById\(botId\)/.test(src), 'host shots damage bots directly');
assert(/NET\.conn\.send\(\{t:'botHit', id:pid, d:dmg, from:NET\.myId\}\)/.test(src), 'client shots on bots report to the host');
assert(/else if\(msg\.t==='botHit'\)\{ const b=botById\(msg\.id\)/.test(src), 'host applies client bot-hits');
assert(/for\(const b of bots\)\{ if\(b\.dead\) continue; const dx=b\.pos\.x-CP_POS\.x.*b\.team===1\?inB\+\+:inR\+\+/.test(src), 'bots count for KOTH capture');

assert(/const b=\(typeof botById==='function'\)\?botById\(id\):null; if\(b\) return b\.name;/.test(src), 'kill feed shows bot callsigns');
assert(/id="mpBots"/.test(html), 'lobby has a bot-count input');
assert(/NET\.botCount=\(NET\.gameMode==='duel'\)\?0:\(\(bn>=0&&bn<=7\)\?bn:0\);/.test(src), 'host reads the bot count (never in a duel)');
assert(/const botMeshes = bots\.map\(b=>b\.mesh\);.*rayTargets = \[\.\.\.playerMeshes, \.\.\.botMeshes,/s.test(src), 'bots are in the raycast targets so real players can hit them');
assert(/if\(NET\.mode==='host'\)\{ spawnBots\(NET\.botCount\|\|0\);/.test(src), 'host spawns bots on start');
assert(/if\(\(NET\.botCount\|\|0\)>0 && !NAV\.built && typeof navBuildBegin==='function'\) navBuildBegin\(\);/.test(src) && /matchWarmup=3; _warmupBroadcast=false;/.test(src), 'bot match kicks off the nav build + pre-match countdown');
assert(/updateBots\(dt\);/.test(src), 'loop ticks the bots');
done('bots');
