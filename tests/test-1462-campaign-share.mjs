// build 1462 — a campaign can be shared.
//
// A campaign lived only in localStorage. It could be EXPORTED to a file and nothing else — no share
// link, no /game/ page, no community entry — so a creator who split a gauntlet into five rooms (exactly
// what build 1394's doorway invites) could not ship it. Every publishing path serializes ONE level.
//
// The shape: a shared campaign IS one level — its first room — carrying the rest in `level.campaign`.
// The server's validator asks for `props`/`world`, which the first room has, so `publish.php` accepts it
// UNCHANGED. That is the whole reason this design was chosen over teaching the server a new payload:
// the server is deployed by hand to a cPanel host, so a server-side format strands every creator until
// that upload happens.

import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const src = gameSource();
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- 1. the cap is the SERVER's number
{
  const cap = +extractConst('CAMPAIGN_JSON_CAP', src);
  eq(cap, 500000, 'the client states the server\'s own cap');
  const php = fs.readFileSync(path.join(REPO, 'server/api/_community_lib.php'), 'utf8');
  const m = php.match(/'json'\s*=>\s*(\d+)/);
  assert(m, 'COMM_LIMITS names a json cap');
  eq(+m[1], cap,
    'and it is THE SAME NUMBER — a client that guessed low would refuse payloads the server would take, ' +
    'and one that guessed high would let the upload fail with the server\'s own wording');
}

// ---------------------------------------------------------------- 2. the payload, executed
{
  const run = new Function('ROOMS', `
    ${extractConst('CAMPAIGN_JSON_CAP', src) !== undefined ? 'const CAMPAIGN_JSON_CAP = ' + extractConst('CAMPAIGN_JSON_CAP', src) + ';' : ''}
    let campaign = { levels: ROOMS };
    ${extractFunction('_campaignShareLevel', src)}
    ${extractFunction('_campaignShareFits', src)}
    const pub = _campaignShareLevel();
    const out = { pub, fit: pub ? _campaignShareFits(pub) : null };
    campaign = { levels: [] };      out.empty = _campaignShareLevel();
    campaign = null;                out.noCamp = _campaignShareLevel();
    campaign = { levels: [ null ] }; out.badFirst = _campaignShareLevel();
    return out;`);

  const rooms = [
    { name:'Room 1', props:[1,2,3], world:{ sky:1 } },
    { name:'Room 2', props:[4],     world:{} },
    { name:'Room 3', props:[],      world:{} },
  ];
  const r = run(rooms);

  // the server's own acceptance test, restated here: props/world present at the TOP level
  assert(r.pub.props || r.pub.world,
    'the payload carries props/world at the top level — which is the exact condition the server validates');
  eq(r.pub.name, 'Room 1', 'the outer body IS room 1');
  eq(JSON.stringify(r.pub.props), '[1,2,3]', '...its props, so a pre-1462 client plays room 1 rather than failing');
  eq(r.pub.campaign.levels.length, 3, '...and it carries all three rooms');
  eq(r.pub.campaign.v, 1, '...stamped, so a later shape change can be told apart');
  eq(r.pub.campaign.levels[0].name, 'Room 1',
    'room 1 is in the file TWICE — that duplication IS the backward-compatibility story, not waste');
  assert(rooms[0].campaign === undefined,
    'the source room is not mutated — a creator\'s stored campaign must not grow a `campaign` key from being shared');

  assert(r.fit.ok && r.fit.bytes > 0, 'a small campaign fits, with a real byte count');
  eq(r.empty, null, 'an empty campaign shares nothing');
  eq(r.noCamp, null, '...and so does no campaign at all');
  eq(r.badFirst, null, '...and a malformed first room refuses rather than publishing `undefined`');

  // the cap, executed at the boundary
  const big = new Function(`
    const CAMPAIGN_JSON_CAP = ${extractConst('CAMPAIGN_JSON_CAP', src)};
    ${extractFunction('_campaignShareFits', src)}
    const pad = 'x'.repeat(60000); const lv = { props:[], world:{}, campaign:{ levels:[] } };
    for(let i = 0; i < 12; i++) lv.campaign.levels.push({ props:[], world:{}, pad });
    const over = _campaignShareFits(lv);
    const cyc = {}; cyc.self = cyc;
    return { over, circular: _campaignShareFits(cyc) };`)();
  assert(!big.over.ok && big.over.bytes > 500000, 'an oversized campaign is refused BY THE CLIENT, with its size');
  assert(!big.circular.ok, '...and an unserializable payload is refused rather than throwing mid-publish');
}

// ---------------------------------------------------------------- 3. adoption, and everything it refuses
{
  const run = new Function('LVL', 'MINE', `
    let campaign = { levels: MINE };
    let _foreignCampaign = false;
    let campaignEditIdx = 7;
    ${extractFunction('_adoptSharedCampaign', src)}
    const took = _adoptSharedCampaign(LVL);
    return { took, foreign: _foreignCampaign, editIdx: campaignEditIdx,
             names: campaign.levels.map(r => r && r.name) };`);

  const mine = [{ name:'MINE A', props:[], world:{} }];
  const good = { props:[9], world:{}, campaign:{ v:1, levels:[
    { name:'A', props:[], world:{} }, { name:'B', props:[], world:{} } ] } };

  const a = run(good, mine);
  assert(a.took, 'a real campaign payload is adopted');
  eq(JSON.stringify(a.names), '["A","B"]', '...replacing the in-memory campaign');
  assert(a.foreign, '...and marked FOREIGN');
  eq(a.editIdx, -1, '...with the editor\'s slot pointer cleared, or Save-changes writes into a room that moved');

  // every refusal, and each is a real hazard
  const refusals = [
    [{ props:[], world:{} },                                    'a plain level adopts NOTHING — the control'],
    [{ campaign:{ levels:[{ props:[], world:{} }] } },           'ONE room is a level, not a campaign'],
    [{ campaign:{ levels:[] } },                                 'an empty list'],
    [{ campaign:{} },                                            'a campaign with no list'],
    [{ campaign:{ levels:[1, 'x', null] } },                     'entries that are not levels'],
    [{ campaign:{ levels:[{ props:[], world:{} }, { nope:1 }] } }, '...and a list where only one entry is a level'],
    [null,                                                        'a null level'],
    [undefined,                                                   'no level at all'],
  ];
  for(const [lvl, why] of refusals){
    const r = run(lvl, mine);
    assert(!r.took && JSON.stringify(r.names) === '["MINE A"]', why + ' — and the visitor\'s own campaign is untouched');
    assert(!r.foreign, '...and the foreign flag is not raised: ' + why);
  }
}

// ---------------------------------------------------------------- 4. foreign never reaches disk
// Build 1254's rule one tier up. Nothing autosaves a campaign — every writer is an explicit gesture in
// the panel — so the guard lives in `saveCampaign` itself and no call site has to remember it.
{
  const sc = extractFunction('saveCampaign', src);
  assert(/_foreignCampaign/.test(sc) && /return false/.test(sc),
    'saveCampaign itself refuses while the campaign is foreign');
  assert(sc.indexOf('_foreignCampaign') < sc.indexOf('localStorage.setItem'),
    '...before it writes, not after');

  const run = new Function(`
    const store = {};
    const localStorage = { getItem:k=>(k in store ? store[k] : null), setItem:(k,v)=>{ store[k]=v; } };
    const CAMPAIGN_KEY = 'breach_campaign_v1';
    let campaign = { levels:[{ name:'LINK' }] };
    let _foreignCampaign = true;
    ${extractFunction('saveCampaign', src)}
    const refused = saveCampaign();
    const afterRefusal = store[CAMPAIGN_KEY] || null;
    _foreignCampaign = false;
    const kept = saveCampaign();
    return { refused, afterRefusal, kept, stored: JSON.parse(store[CAMPAIGN_KEY]).levels[0].name };`)();
  assert(run.refused === false, 'a foreign save REPORTS failure rather than lying');
  eq(run.afterRefusal, null, '...and writes nothing');
  assert(run.kept === true && run.stored === 'LINK', 'clearing the flag adopts it, in one act');
}

// ---------------------------------------------------------------- 5. all three arrival paths
// A campaign that adopts on one path and not another is worse than none, because the failure depends on
// which link the player happened to click.
{
  eq((src.match(/_adoptSharedCampaign\(/g) || []).length, 4,
    'the adopter has one definition and THREE call sites — the three arrival paths, and nothing else');

  const shareHash = src.slice(src.indexOf("markForeignLevel('a shared level')"), src.indexOf("markForeignLevel('a shared level')") + 500);
  assert(/_adoptSharedCampaign\(lvl\)/.test(shareHash), '#lvl= share links adopt');
  assert(shareHash.indexOf('_adoptSharedCampaign') < shareHash.indexOf('restoreLevel(lvl)'),
    '...BEFORE restoreLevel, so the toast can name the campaign it just installed');

  const gameUrl = src.slice(src.indexOf("markForeignLevel('\"'+slug+'\"')"), src.indexOf("markForeignLevel('\"'+slug+'\"')") + 700);
  assert(/_adoptSharedCampaign\(lvl\)/.test(gameUrl), '?game= pages adopt');

  const gallery = src.slice(src.indexOf('_adoptSharedCampaign(level)') - 400, src.indexOf('_adoptSharedCampaign(level)') + 400);
  assert(/markForeignLevel/.test(gallery), 'the community gallery adopts, beside its own foreign-level mark');

  // ...and the level file's own loader must NOT: restoreLevel runs per room during a campaign, so
  // adopting there would reinstall the campaign on every transition.
  assert(!/_adoptSharedCampaign/.test(extractFunction('restoreLevel', src)),
    'restoreLevel does NOT adopt — it runs per ROOM, so adopting there would reinstall on every transition');
  assert(!/_adoptSharedCampaign/.test(extractFunction('loadLevelFromNet', src)),
    '...and neither does the net loader, which _campaignLoad uses for every room');
}

// ---------------------------------------------------------------- 6. the two publishing surfaces
{
  const pub = src.slice(src.indexOf("q('#hpPublish').onclick"), src.indexOf("q('#hpPublish').onclick") + 2600);
  assert(/_campaignShareLevel\(\)/.test(pub), 'the game-page publish offers the campaign');
  assert(/campaign\.levels\.length > 1/.test(pub),
    '...only when there is more than one room — a one-room campaign IS a level');
  assert(/_campaignShareFits/.test(pub) && /CAMPAIGN_JSON_CAP/.test(pub),
    '...and says the size rather than letting the upload fail with the server\'s wording');
  assert(/_uiDialog\(/.test(pub) && !/uiConfirm\(/.test(pub),
    'it awaits an ANSWER, so it uses _uiDialog — uiConfirm\'s Cancel has no callback and would hang the flow forever');
  assert(/Just this level/.test(pub), '...and the decline is a real, labelled choice, not a cancel');

  const share = src.slice(src.indexOf("p.querySelector('#edShare').onclick"), src.indexOf("p.querySelector('#edShare').onclick") + 1400);
  assert(/_campaignShareLevel\(\)/.test(share), 'the share link carries a campaign too');
  assert(/_campaignShareFits\(_cl\)\.ok/.test(share),
    '...and silently falls back to the single level when it would not fit, because a link has no dialog');
  assert(/Campaign link copied/.test(share), '...and says which kind of link it copied');
}

// ---------------------------------------------------------------- 7. the panel says the campaign is not saved
{
  const panel = extractFunction('renderCampaignPanel', src);
  assert(/_foreignCampaign/.test(panel),
    'the panel names the foreign state — without it every button in it appears to do nothing');
  assert(/uiConfirm\(/.test(panel) && /_foreignCampaign=false/.test(panel),
    '...with an explicit adopt behind a confirm, because it replaces the visitor\'s own');
  assert(panel.indexOf('_foreignCampaign') < panel.indexOf("addB.textContent"),
    '...at the top, above the controls it is explaining');
  assert(!/innerHTML\s*=/.test(panel.slice(panel.indexOf('_foreignCampaign'), panel.indexOf('_foreignCampaign') + 900)),
    'the banner is built as text nodes — a level name is level data (build 1325)');
}

done('build 1462 (feature audit): a campaign could not be SHARED. It lived in localStorage, exported to a file, and had no share link, no /game/ page and no community entry — so a creator who split a gauntlet into five rooms, which is exactly what build 1394\'s doorway invites, could not ship it at all; every publishing path in the engine serializes ONE level. The obvious fix is a server change and it is the wrong one: `publish.php` is deployed by hand to a cPanel host, so a payload the server must learn about strands every creator until that upload happens. A shared campaign is therefore ONE LEVEL — its first room — CARRYING the rest in `level.campaign`, so the server\'s own validator (which asks for props/world) accepts it UNCHANGED and no upload is needed. Room 1 is in the file twice, and that duplication IS the compatibility story: a client predating this build finds an ordinary level and plays room 1 rather than a payload it cannot read, and gzip eats it almost entirely (20 stock rooms cost 8,299 code bytes against 4,669 for one). The server\'s 500,000-byte cap is stated ONCE and this test reads it back out of `_community_lib.php`, so the two cannot drift. Adoption is build 1254\'s rule one tier up: a linked campaign is FOREIGN until explicitly kept, and the guard lives inside `saveCampaign` itself so none of its ten callers has to remember — executed, a foreign save writes nothing and reports false. Every refusal is executed too, including the control: a plain level adopts nothing, and neither does a one-room list, an empty list, a junk list or a null. All three arrival paths adopt and `restoreLevel` deliberately does not, because it runs per ROOM and would reinstall the campaign on every transition');
