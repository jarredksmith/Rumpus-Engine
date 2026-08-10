// build 1469 — the level's theme reaches the inventory and the item inspector.
//
// The Node harness executes the derivation. What it cannot do is tell you what the browser PAINTS: a var
// that resolves to nothing renders transparent, and a panel that reads one variable it was never stamped
// with is a hole in the middle of a menu. So this reads getComputedStyle off the REAL card.
//
// The CONTROL is the engine's own default theme, applied through the same path, at every step — and it must
// come back byte-identical to build 1468's hardcoded hexes, because that is the compatibility claim.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const setup = await P(`(function(){
    if(editorOpen && typeof toggleEditor === 'function') toggleEditor();
    giveItem('probeItem', 3);
    defineItem('probeItem', { name:'Brass Key', desc:'A heavy brass key.', type:'item', useType:'heal', useAmount:25 });
    return { gameOn, items: inventory.length };
  })()`);

  const theme = (h) => P(`(function(){
    hudCfg = _sanitizeHud(${JSON.stringify(h)});
    applyHudCfg();
    return { bg: hudCfg.menuBg, edge: hudCfg.menuEdge, shape: hudCfg.shape, accent: hudCfg.accent };
  })()`);

  // read what the browser actually resolved, off the real elements
  const readInv = (label) => P(`(function(){
    if(!invOpen) openInventory();
    const root = document.getElementById('inventory');
    const card = root && root.firstChild;
    /* NOT querySelector('div div'): the descendant combinator matches an ancestor ANYWHERE in the
       document, and the card is itself a div inside #inventory — so that selector returns the header ROW,
       which inherits the body colour and reads exactly like the title colour failing to apply. The header
       is the card's first child; the title is its first child. */
    const hdr = card && card.firstElementChild;
    const title = hdr && hdr.firstElementChild;
    const cell = card && card.querySelector('button:not([data-close])');
    const cs = (el) => el ? getComputedStyle(el) : null;
    const c1 = cs(card), c2 = cs(title), c3 = cs(cell), c0 = cs(root);
    return { label:${JSON.stringify(label)},
      scrim: c0 && c0.backgroundColor,
      card: c1 && { bg:c1.backgroundColor, border:c1.borderTopColor, radius:c1.borderTopLeftRadius, color:c1.color, font:c1.fontFamily },
      title: c2 && { color:c2.color, font:c2.fontFamily },
      cell: c3 && { bg:c3.backgroundColor, border:c3.borderTopColor, radius:c3.borderTopLeftRadius },
      /* an UNRESOLVED custom property paints transparent — the failure this probe exists to catch */
      anyTransparent: [c1&&c1.backgroundColor, c1&&c1.borderTopColor, c3&&c3.backgroundColor, c0&&c0.backgroundColor]
        .filter(v => v === 'rgba(0, 0, 0, 0)').length };
  })()`);

  const readInspect = (label) => P(`(function(){
    if(!invOpen) openInventory();
    openInspect('probeItem');
    const root = document.getElementById('inspect');
    const card = document.getElementById('inspectCard');
    const btn = card && card.querySelector('button:not([data-close])');
    const cs = (el) => el ? getComputedStyle(el) : null;
    const c0 = cs(root), c1 = cs(card), c2 = cs(btn);
    const out = { label:${JSON.stringify(label)},
      scrim: c0 && c0.backgroundColor,
      card: c1 && { bg:c1.backgroundColor, border:c1.borderTopColor, radius:c1.borderTopLeftRadius },
      useBtn: c2 && { bg:c2.backgroundColor, color:c2.color, border:c2.borderTopColor },
      anyTransparent: [c1&&c1.backgroundColor, c1&&c1.borderTopColor, c0&&c0.backgroundColor]
        .filter(v => v === 'rgba(0, 0, 0, 0)').length };
    closeInspect();
    return out;
  })()`);

  // the live re-theme: change the colours with the panel ALREADY OPEN
  const live = await P(`(function(){
    if(!invOpen) openInventory();
    const card = () => getComputedStyle(document.getElementById('inventory').firstChild).backgroundColor;
    const before = card();
    hudCfg = _sanitizeHud({ menuBg:'#2b0d0d', menuEdge:'#8a2b2b', menuText:'#ffdede', menuDim:'#c98a8a' });
    applyHudCfg();
    return { before, after: card(), changed: before !== card() };
  })()`);

  await theme(null);
  const defInv = await readInv('DEFAULT theme — the control, and it must equal the pre-1469 hardcoded hexes');
  const defIns = await readInspect('DEFAULT theme, inspector');

  await theme({ menuBg:'#1a1206', menuEdge:'#6b4f16', menuText:'#f4e3b8', menuDim:'#9c8a5e',
                accent:'#ffcc33', score:'#ffe680', shape:'rounded' });
  const goldInv = await readInv('GOLD theme');
  const goldIns = await readInspect('GOLD theme, inspector');

  await theme({ menuBg:'#f2efe6', menuEdge:'#c4bda8', menuText:'#2b2a24', menuDim:'#6d6a5c',
                accent:'#0a7f6b', score:'#8a6a10', shape:'square' });
  const lightInv = await readInv('LIGHT theme — the scrim must dim to LIGHT, not to the engine near-black');

  await theme(null);
  const backInv = await readInv('back to DEFAULT — the control returns');

  await P(`(function(){ closeInventory(); return 1; })()`);

  console.log(JSON.stringify({ setup, defInv, defIns, goldInv, goldIns, lightInv, backInv, live }, null, 1));
});
