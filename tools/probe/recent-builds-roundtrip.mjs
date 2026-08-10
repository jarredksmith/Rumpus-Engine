// Does everything shipped in builds 1461-1470 survive a SAVE? (probe pass, after build 1470)
//
// Ten builds landed in this stretch and every one of them added state: per-prop variables (1461), the
// campaign share guard (1462), the air dash (1463), zone selection (1464/1466), six new HUD toggles (1465),
// the free cursor (1467), the modal field on a widget (1468), four menu colours (1469) and the font mirror
// (1470). Not one of them has been through `serializeLevel -> restoreLevel`.
//
// That is the shape this repo keeps losing data to: 1398 (a shootable target saved and was never read
// back), 1400 (five game settings written and never loaded), 1401 (thirteen sections a joiner never
// received), 1406 (fourteen of seventeen signal verbs lost every parameter), 1427 (the fuse, lost since
// build 629). Every one was an in-memory feature that worked until you pressed Save.
//
// So: author every field at a NON-DEFAULT value — a field that happens to equal its default cannot tell a
// working loader from a missing one — serialize, reload through the REAL loader, and then PLAY the result.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const authored = await P(`(function(){
    if(editorOpen && typeof toggleEditor === 'function') toggleEditor();

    /* 1468 + 1465: a modal made of widgets, plus a plain HUD widget as the control */
    hudWidgets = [
      { id:'hudScore', kind:'text',   label:'SCORE {score}', anchor:'tl', size:16, modal:'' },
      { id:'shopTtl',  kind:'text',   label:'THE SHOP',      anchor:'tc', size:24, modal:'fairShop' },
      { id:'shopBuy',  kind:'button', label:'BUY',           anchor:'tc', dy:60, size:16, modal:'fairShop', event:'BUY' },
      { id:'soldOut',  kind:'text',   label:'SOLD OUT',      anchor:'tc', dy:120, size:16, modal:'fairShop', when:'sold' }
    ];

    /* 1465: six toggles that did not exist before that build */
    hudCfg = _sanitizeHud({
      accent:'#ffcc33', score:'#ffe680', health:'#e0554e',
      uiFont:'Orbitron', displayFont:'Teko', shape:'rounded', panelOp:0.42, border:false,
      menuBg:'#1a1206', menuEdge:'#6b4f16', menuText:'#f4e3b8', menuDim:'#9c8a5e',   /* 1469 */
      hide:{ reload:true, hitmark:true, buffs:true, boss:true, marker:true, minimap:true }
    });
    applyHudCfg();

    /* 1467 + 1463: game settings */
    gameCfg.view = 'top'; gameCfg.freeCursor = true;
    worldCfg.airDash = 9;

    /* 1461: a per-prop variable is MATCH state and must NOT serialize — the negative control */
    const tagged = propModels.find(o => o && o.userData);
    if(tagged){ tagged.userData.tag = 'plate'; _lgPropVarSet(tagged, 'hits', 7); }

    /* 1466: the three zone types a creator could not click before build 1464 */
    waterZones.push({ x:12, z:-8, r:9, y:1.5, h:3, flowDir:1.1, flowSpd:2.4, wave:1.7, op:0.55, col:'#2266aa' });
    fxZones.push({ x:-20, z:14, r:7, y:0, h:4, kind:'haste', amt:17, who:'both' });
    deathZones.push({ x:30, z:30, r:5, y:0, h:5 });

    return {
      widgets: hudWidgets.length,
      modalMembers: _modalWidgets('fairShop'),
      hides: Object.keys(hudCfg.hide).filter(k => hudCfg.hide[k]).sort().join(','),
      propVar: tagged ? _lgPropVarGet(tagged, 'hits') : null,
      zones: [waterZones.length, fxZones.length, deathZones.length]
    };
  })()`);

  const roundTrip = await P(`(function(){
    const json = serializeLevel();
    const txt = JSON.stringify(json);

    /* RESET every field to a distinctive "the loader never ran" state first. Build 1400's own first probe
       restored the same level and read the values back — everything came back and it proved nothing,
       because nothing had cleared them. */
    hudWidgets = [];
    hudCfg = _sanitizeHud(null);
    applyHudCfg();
    gameCfg.view = 'fps'; gameCfg.freeCursor = false;
    worldCfg.airDash = 0;
    waterZones.length = 0; fxZones.length = 0; deathZones.length = 0;
    const cleared = { widgets: hudWidgets.length, view: gameCfg.view, free: gameCfg.freeCursor,
                      dash: worldCfg.airDash, menuBg: hudCfg.menuBg, zones: [waterZones.length, fxZones.length, deathZones.length] };

    restoreLevel(JSON.parse(txt));

    const byId = {}; for(const w of hudWidgets) byId[w.id] = w;
    const tagged = propModels.find(o => o && o.userData && o.userData.tag === 'plate');
    return {
      cleared,
      /* 1468 */
      widgets: hudWidgets.length,
      modalOfEach: hudWidgets.map(w => w.id + ':' + (w.modal || '-')).join(' '),
      modalMembers: _modalWidgets('fairShop'),
      buttonEvent: byId.shopBuy && byId.shopBuy.event,
      innerWhen: byId.soldOut && byId.soldOut.when,
      /* 1465 */
      hides: Object.keys(hudCfg.hide).filter(k => hudCfg.hide[k]).sort().join(','),
      /* 1469 + 1470 */
      menu: [hudCfg.menuBg, hudCfg.menuEdge, hudCfg.menuText, hudCfg.menuDim].join(' '),
      fonts: hudCfg.uiFont + '/' + hudCfg.displayFont,
      shape: hudCfg.shape, panelOp: hudCfg.panelOp, border: hudCfg.border,
      bodyFont: document.body.style.getPropertyValue('--hud-font'),
      /* 1467 + 1463 */
      view: gameCfg.view, free: gameCfg.freeCursor, dash: worldCfg.airDash,
      /* 1466 */
      zones: [waterZones.length, fxZones.length, deathZones.length],
      waterFlow: waterZones[0] && [waterZones[0].flowDir, waterZones[0].flowSpd, waterZones[0].wave],
      fxKind: fxZones[0] && [fxZones[0].kind, fxZones[0].amt, fxZones[0].who],
      /* 1461: per-prop values are MATCH state — a fresh load must NOT carry them */
      propVarAfterLoad: tagged ? _lgPropVarGet(tagged, 'hits') : 'no-tagged-prop',
      propVarInFile: /"pv"|propVars/.test(txt)
    };
  })()`);

  // byte-stability: a level that differs from itself is one that degrades every autosave (build 1420)
  const stable = await P(`(function(){
    const a = JSON.stringify(serializeLevel());
    restoreLevel(JSON.parse(a));
    const b = JSON.stringify(serializeLevel());
    restoreLevel(JSON.parse(b));
    const c = JSON.stringify(serializeLevel());
    return { ab: a === b, bc: b === c, len: a.length };
  })()`);

  // ...and it PLAYS on the other side of the file
  const played = await P(`(function(){
    logicGraph.nodes = [
      { id:'e1', type:'event', x:0, y:0, p:{ name:'OPEN' } },
      { id:'d1', type:'do',    x:0, y:0, p:{ verb:'modal', mmode:'show', mid:'fairShop' } }
    ];
    logicGraph.wires = [{ a:'e1', o:0, b:'d1', i:0 }];
    logicStart();
    _hwRev++; _hwRebuild(); updateHudWidgets();
    const vis = () => { const o = {}; for(const r of _hwEls) if(r && r.el) o[r.w.id] = r.el.style.display !== 'none'; return o; };
    const before = vis();
    logicEvent('OPEN'); updateHudWidgets();
    const after = vis();
    const back = document.getElementById('modalBack');
    return { before, after, open:_modalOpen, backdrop: !!back,
             cursorFree: _hwCursorFree,
             /* 1465: the reload bar really is hidden by the reloaded toggle */
             reloadHidden: document.body.classList.contains('hud-hide-reload'),
             minimapHidden: document.body.classList.contains('hud-hide-minimap'),
             /* 1470: the reloaded font reached the body mirror */
             dialogueFontWouldBe: document.body.style.getPropertyValue('--hud-font') };
  })()`);

  console.log(JSON.stringify({ authored, roundTrip, stable, played }, null, 1));
});
