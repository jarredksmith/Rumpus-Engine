// SCOPING probe, before building anything (build 1459's rule: measure the proposal, do not argue it).
//
// A campaign lives only in localStorage and can be EXPORTED to a file. It cannot be SHARED — no link, no
// /game/ page, no community entry — so a creator who splits a gauntlet into five rooms cannot ship it.
//
// The obvious fix is a server change: teach publish.php a campaign payload. The server is deployed by
// hand to a cPanel host, so that is real friction. The cheap alternative is to publish the campaign as
// ONE level — its first room — CARRYING the rest in `level.campaign`. The server's own validator asks only
// for `props`/`world`, which the first room has, so it needs no change whatsoever.
//
// The question that decides it is SIZE: `COMM_LIMITS['json']` is 500,000 and `['code']` is 700,000.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const out = await P(`(async function(){
    const one = serializeLevel();
    const oneJson = JSON.stringify(one).length;
    const oneCode = (await encodeLevel(one)).length;

    const rows = [];
    for(const n of [1, 2, 3, 5, 8, 12, 20]){
      const rooms = [];
      for(let i = 0; i < n; i++){ const r = JSON.parse(JSON.stringify(one)); r.name = 'Room ' + (i+1); rooms.push(r); }
      /* the shape being costed: room 1 IS the level, and carries the whole list */
      const pub = Object.assign({}, rooms[0], { campaign: { levels: rooms } });
      const json = JSON.stringify(pub).length;
      const code = (await encodeLevel(pub)).length;
      rows.push({ n, json, code, ratio: +(json / code).toFixed(1) });
    }
    return { oneJson, oneCode, rows, props: one.props.length };
  })()`);

  console.log(JSON.stringify(out, null, 1));
});
