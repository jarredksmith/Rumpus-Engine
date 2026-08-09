// build 1462 — a campaign survives a share link, in the running game.
//
// Two claims that only a live run can settle: the payload really does round-trip through the real codec,
// and the real `?game=`/`#lvl=` shape is what the engine adopts. The CONTROL is a plain single level,
// which must adopt NOTHING — a build where the adopter fired on any level would install a one-room
// campaign over the visitor's own.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const built = await P(`(async function(){
    /* three rooms, distinguishable by name and by prop count */
    const base = serializeLevel();
    const rooms = [];
    for(let i = 0; i < 3; i++){
      const r = JSON.parse(JSON.stringify(base));
      r.name = 'Room ' + (i + 1);
      r.props = r.props.slice(0, 10 + i * 5);
      rooms.push(r);
    }
    campaign = { levels: rooms };
    _foreignCampaign = false;
    const pub = _campaignShareLevel();
    const fit = _campaignShareFits(pub);
    const code = await encodeLevel(pub);
    return {
      rooms: rooms.length,
      outerIsRoom1: pub.name === 'Room 1' && pub.props.length === 10,
      carries: pub.campaign.levels.map(r => r.name),
      json: fit.bytes, ok: fit.ok, codeLen: code.length,
      code,
    };
  })()`);

  // the visitor: a DIFFERENT campaign of their own, then the link arrives
  const adopted = await P(`(async function(){
    campaign = { levels: [ { name:'MINE A', props:[], world:{} }, { name:'MINE B', props:[], world:{} } ] };
    _foreignCampaign = false;
    const mineBefore = campaign.levels.map(r => r.name);
    const stored = localStorage.getItem('breach_campaign_v1');

    const lvl = await decodeLevel(${JSON.stringify(built.code)});
    const took = _adoptSharedCampaign(lvl);
    const savedWhileForeign = saveCampaign();
    const storedAfter = localStorage.getItem('breach_campaign_v1');

    return {
      mineBefore, took, foreign: _foreignCampaign,
      names: campaign.levels.map(r => r.name),
      props: campaign.levels.map(r => r.props.length),
      savedWhileForeign,
      diskUntouched: stored === storedAfter,
    };
  })()`);

  const control = await P(`(async function(){
    campaign = { levels: [ { name:'MINE A', props:[], world:{} } ] };
    _foreignCampaign = false;
    const plain = serializeLevel();
    const took = _adoptSharedCampaign(plain);
    /* and the shapes that must be refused */
    return {
      plainLevel: took,
      names: campaign.levels.map(r => r.name),
      oneRoom:   _adoptSharedCampaign({ campaign:{ levels:[ { props:[], world:{} } ] } }),
      noLevels:  _adoptSharedCampaign({ campaign:{} }),
      junk:      _adoptSharedCampaign({ campaign:{ levels:[ 1, 'x', null ] } }),
      nullLvl:   _adoptSharedCampaign(null),
    };
  })()`);

  const adopt = await P(`(function(){
    campaign = { levels: [ { name:'FROM LINK 1', props:[], world:{} }, { name:'FROM LINK 2', props:[], world:{} } ] };
    _foreignCampaign = true;
    const refused = saveCampaign();
    _foreignCampaign = false;
    const kept = saveCampaign();
    const back = JSON.parse(localStorage.getItem('breach_campaign_v1') || 'null');
    return { refused, kept, stored: back && back.levels.map(r => r.name) };
  })()`);

  const cap = await P(`(function(){
    const big = { props:[], world:{}, campaign:{ levels:[] } };
    const pad = 'x'.repeat(60000);
    for(let i = 0; i < 12; i++) big.campaign.levels.push({ props:[], world:{}, pad });
    const f = _campaignShareFits(big);
    return { bytes: f.bytes, ok: f.ok, cap: CAMPAIGN_JSON_CAP };
  })()`);

  console.log(JSON.stringify({
    built: { ...built, code: built.code.length + ' chars' },
    adopted, control, adopt, cap,
  }, null, 1));
});
