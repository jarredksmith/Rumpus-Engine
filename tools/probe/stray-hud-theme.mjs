// build 1470 — the authored FONTS reach the HUD elements that live outside #hud.
//
// THE FIRST RUN OF THIS PROBE DISPROVED MOST OF THE HYPOTHESIS, and the build shrank from a new mechanism
// to two lines because of it. The reasoning had been that the accent, the fonts and the panel opacity all
// fell through to the engine defaults on the four body-level HUD elements. Measured: the accent and the
// opacity already arrived, because build 701 mirrors those three onto <body> for exactly this reason. The
// two FONTS are what it left behind.
//
// So the pre-fix state is reproduced by stripping the mirror from <body> — the real pre-1470 condition —
// rather than from the elements. The CONTROL is the ammo panel, INSIDE #hud, read in the same breath: if
// it does not take the theme either, the measurement is the theme not applying rather than the scoping.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const setup = await P(`(function(){
    if(editorOpen && typeof toggleEditor === 'function') toggleEditor();
    /* build both lazily-created strays so there is something to measure */
    setGoal('REACH THE VAULT');
    _dlg.open = true; _dlg.script = [{ who:'Guard', text:'Halt.' }]; _dlg.i = 0; _dlg.name = 'Guard';
    const d = _ensureDialogueEl();
    d.innerHTML = '<div class="dlgName">GUARD</div><div class="dlgText">Halt.</div>';
    d.style.display = 'block';
    const hud = document.getElementById('hud');
    return { gameOn,
      dialogueInHud: hud ? hud.contains(d) : null,
      goalInHud: hud ? hud.contains(document.getElementById('goalBanner')) : null,
      grabInHud: hud ? hud.contains(document.getElementById('grabHint')) : null,
      ammoInHud: hud ? hud.contains(document.getElementById('ammoPanel')) : null };
  })()`);

  const theme = (h) => P(`(function(){ hudCfg = _sanitizeHud(${JSON.stringify(h)}); applyHudCfg(); return hudCfg.accent; })()`);

  const read = (label) => P(`(function(){
    const cs = (id) => { const e = document.getElementById(id); return e ? getComputedStyle(e) : null; };
    const d = cs('dialogue'), g = cs('goalBanner'), a = cs('ammoPanel');
    const nm = document.querySelector('#dialogue .dlgName');
    const nmcs = nm ? getComputedStyle(nm) : null;
    return { label:${JSON.stringify(label)},
      dialogueBorder: d && d.borderTopColor,
      dialogueFont: d && d.fontFamily.split(',')[0].replace(/["']/g, ''),
      dialogueBg: d && d.backgroundColor,
      speakerName: nmcs && nmcs.color,
      goalBorder: g && g.borderTopColor,
      /* THE CONTROL: a panel inside #hud, same theme, same breath */
      ammoPanelBorder: a && a.borderTopColor,
      ammoPanelFont: a && a.fontFamily.split(',')[0].replace(/["']/g, '') };
  })()`);

  await theme({ accent:'#ffcc33', score:'#ffe680', uiFont:'Orbitron', displayFont:'Teko', panelOp:0.35 });
  const goldAfter = await read('GOLD theme, after the fix');

  /* the pre-1470 state, in the same session: strip the two FONT mirrors from <body> and leave build 701's
     three exactly where they are. Everything else — the theme, the elements, the frame — is identical. */
  const preFix = await P(`(function(){
    document.body.style.removeProperty('--hud-font');
    document.body.style.removeProperty('--hud-display-font');
    return { stillHasAccent: !!document.body.style.getPropertyValue('--accent'),
             stillHasOpacity: !!document.body.style.getPropertyValue('--hud-panel-op') };
  })()`);
  const goldBefore = await read('GOLD theme, with only the two FONT mirrors removed (= build 1469)');

  await theme(null);
  const defaultAfter = await read('DEFAULT theme — the control returns');

  console.log(JSON.stringify({ setup, preFix, goldBefore, goldAfter, defaultAfter }, null, 1));
});
