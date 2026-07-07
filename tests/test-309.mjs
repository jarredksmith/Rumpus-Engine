import { html, assert, done } from './harness.mjs';
const src = html;   // this is page MARKUP + CSS, so read from the raw html
// build 416: the Multiplayer modal was one tall single-column scroll with "Join a room" buried at the bottom.
// Now it's a wider card using horizontal space, mode cards in a 2-column grid, and Join moved up to the top.

// wider card + two-pane layout (build 900: the six host sections became ONE pane with mode tabs)
assert(/#mpModal \.modalCard\{ max-width:880px; width:100%; \}/.test(src), 'MP modal card is wider (uses horizontal space)');
assert(/#mpModal \.mpTop\{ display:grid; grid-template-columns:1fr 1\.15fr;/.test(src), 'the top row (join | host) is a 2-column grid');

// Join a room sits beside the host pane, above everything else
const joinAt = src.indexOf('JOIN A ROOM');
const hostAt = src.indexOf('id="mpHostPane"');
const topAt = src.indexOf('class="mpTop"');
assert(joinAt>0 && topAt>0 && topAt < joinAt && joinAt < hostAt, 'Join a room sits in the top area, beside the host pane');

// every host mode lives behind the mode tabs in the single pane (build 900)
for(const m of ['coop','race','duel','ffa','tdm','koth']) assert(src.indexOf('data-pane="'+m+'"')>hostAt, m+' pane lives inside the host pane');

// every control ID the JS binds to is still present exactly once (layout-only change, no broken handlers)
for(const id of ['mpName','charBtn','mpHost','mpDuel','mpFFA','mpTDM','mpCP','mpKills','mpFFAKills','mpTDMKills','mpCPScore','mpBots','mpBotDiff','mpCode','mpJoin','mpRefresh','mpGames','mpGamesRow','mpStatus']){
  const re = new RegExp('id="'+id+'"','g');
  assert((src.match(re)||[]).length===1, id+' still present exactly once');
}
done();
