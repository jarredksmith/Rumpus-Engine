// (build 1356) A MATCH IN PROGRESS STAYS IN THE DIRECTORY.
//
// Joining one has worked end to end for a long time: the welcome carries `phase`, a client that connects
// mid-match calls startGame() straight away, and build 1197 forces a keyframe whenever the connection count
// changes so a late joiner is never applying deltas against a baseline it never saw. What did not work was
// FINDING one — `startMatch` deleted the lobby entry and the heartbeat refused to run outside the lobby
// phase, so the public list only ever showed rooms where nobody was playing yet. For a game with a handful
// of concurrent players that reads as "nobody is online" at exactly the moment somebody is.
//
// Verified live (tools/probe/join-live.mjs), every lobby PUT captured and read back:
//   lobby   -> {live:0, players:3, max:8}          kickoff -> {live:1, players:3, max:8}
//   duel    -> {max:2}                              left the room -> zero PUTs
//   list: COOP 3/8 Join · COOP 5/8 in progress Join · COOP 8/8 FULL (disabled)
//         and against a lobbies.php that has NOT been updated: DUEL 2/2 FULL · COOP 4/8 Join
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();
const php = (await import('node:fs')).readFileSync(
  new URL('../server/api/lobbies.php', import.meta.url), 'utf8');

// ---- the cap is ONE derivation ----
{
  const f = new Function('NET', 'return ' + extractFunction('_maxPlayersFor', src).replace(/^function _maxPlayersFor/, 'function') + ';')({ gameMode: 'coop' });
  eq(f('duel'), 2, 'a duel is strictly 1v1');
  eq(f('coop'), 8, 'everything else seats 8');
  eq(f(), 8, 'and with no argument it still reads the live mode — every existing call site is unchanged');
  const f2 = new Function('NET', 'return ' + extractFunction('_maxPlayersFor', src).replace(/^function _maxPlayersFor/, 'function') + ';')({ gameMode: 'duel' });
  eq(f2(), 2, '...including the door’s own call inside _hostOnConnection');
  assert(/_maxPlayersFor\(r\.mode\|\|'coop'\)/.test(src),
    'and the BROWSER computes the same cap from a listing it has never connected to. Two copies of this ' +
    'number would be a list offering a seat the host is about to refuse');
}

// ---- the announcement survives kickoff ----
{
  const f = extractFunction('announceRoom', src);
  assert(/NET\.phase!=='lobby' && NET\.phase!=='playing'/.test(f),
    'the heartbeat runs through the match, not only the lobby');
  assert(/live:\(NET\.phase==='playing'\?1:0\)/.test(f) && /max:_maxPlayersFor\(\)/.test(f),
    '...carrying whether it has started and how many it seats');
  assert(!/NET\.phase!=='lobby'\) return;/.test(f), 'the lobby-only gate is gone, not merely widened around');
  assert(/announceRoom\(\);   \/\* build 1356: re-announce as LIVE/.test(src),
    'and startMatch RE-ANNOUNCES instead of deleting the entry');
  // unannounce still runs on every way OUT — leaving, the leave button, and unload
  const un = extractFunction('unannounceRoom', src);
  assert(/method:'DELETE'/.test(un) && /keepalive:true/.test(un),
    'leaving still closes the entry, and keepalive survives unload');
  eq((src.match(/unannounceRoom\(\)/g) || []).length, 4,
    'exactly four call sites remain — its own definition and the three ways out (leave, the leave button, ' +
    'beforeunload). Kickoff is no longer one of them');
}

// ---- the browser is honest about a room it cannot enter ----
{
  const f = extractFunction('renderGamesList', src);
  assert(/const cap=\(r\.max>0\?\(r\.max\|0\):_maxPlayersFor\(r\.mode\|\|'coop'\)\)/.test(f),
    'a server-supplied cap wins; otherwise it is DERIVED from the mode — which is what makes this work ' +
    'against a lobbies.php that has not been deployed yet');
  assert(/j\.textContent=full\?'Full':'Join'/.test(f) && /j\.disabled=true/.test(f),
    'a full room is listed and NOT clickable — a dead click is the "nothing happened" build 1147 removed');
  assert(/if\(full\)\{[\s\S]{0,200}?\}\s*\n?\s*else \{[\s\S]{0,200}?j\.onclick=\(\)=>joinByCode/.test(f),
    'and the handler is only attached when there is a seat, rather than attached and then refused');
  assert(/r\.live\?' \\u00b7 in progress':''/.test(f), 'a running match says so');
  assert(/you will drop straight in/.test(f),
    '...and the tooltip says what joining one does, because "in progress" reads as "too late" everywhere else');
}

// ---- the thing that made it joinable in the first place, pinned so it cannot regress ----
{
  assert(/phase:NET\.phase\}\)/.test(src), 'the welcome tells the joiner which phase the room is in');
  assert(/if\(msg\.phase==='lobby'\)\{ showClientLobby\(\); _lobbyDlWatch\(\); \} else \{ startGame\(\); \}/.test(src),
    'and a mid-match joiner starts the game directly instead of waiting in a lobby that is over');
  assert(/_snapN = 0/.test(src),
    'build 1197 forces a keyframe when the connection count changes, so a late joiner never applies ' +
    'deltas against a baseline it never saw — without that this listing would be advertising a broken join');
}

// ---- the server half, optional and clamped like everything else ----
{
  assert(/'max'\s*=> isset\(\$r\['max'\]\) \? \(int\)\$r\['max'\] : 8/.test(php), 'GET returns the cap');
  assert(/'live'\s*=> !empty\(\$r\['live'\]\) \? 1 : 0/.test(php), '...and the live flag');
  assert(/if \(\$max < 1\) \$max = 1; if \(\$max > 32\) \$max = 32;/.test(php),
    'PUT clamps the cap exactly as it clamps the player count — a lobby record is untrusted input');
  assert(/\$live = !empty\(\$b\['live'\]\) \? 1 : 0;/.test(php), 'and the flag is a boolean, whatever arrives');
  assert(/isset\(\$b\['max'\]\) \? \(int\)\$b\['max'\] : 8/.test(php),
    'both default when absent, so an OLDER client that never sends them lists exactly as it did before');
}

done('build 1356: a match in progress stays findable, and a full room says so');
