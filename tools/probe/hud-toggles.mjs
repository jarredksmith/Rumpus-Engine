// build 1465 — HUD element visibility, asked for from play: "I want HUD control over the reload loading
// bar, not every creator will want that."
//
// The machinery was already right — HUD_TOGGLES is the one place a toggle is declared and the sanitizer,
// the class applier and the editor's checkbox list all iterate it. What was wrong was the SET, and one
// entry in particular: the reload bar was welded to the CROSSHAIR's toggle, so "keep the crosshair, lose
// the bar" could not be said.
//
// A CSS rule can be written and reach nothing, so this measures the RENDERED element: every toggle is
// driven through the real applyHudCfg and the element's computed display is read back, with the toggle
// OFF as the control at every step.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const map = await P(`(function(){
    /* every toggle, and the element the creator expects it to govern */
    return { toggles: HUD_TOGGLES.slice(), labels: HUD_TOGGLE_LABEL };
  })()`);

  const IDS = {
    minimap:'minimap', score:'score', wave:'wavePanel', ammo:'ammoPanel', health:'stats',
    crosshair:'crosshair', reload:'reloadBar', hitmark:'hitmarker', killfeed:'killFeed',
    buffs:'buffs', boss:'bossBar', marker:'objMarkers', prompt:'prompt', grab:'grabHint',
    goal:'goalBanner', dlg:'dialogue',
  };

  const sweep = await P(`(function(){
    const IDS = ${JSON.stringify(IDS)};
    /* three of these hosts are built LAZILY, so a run that never triggered them measured "NO ELEMENT"
       and proved nothing about the rule. Trigger each through its own real path. */
    try{ _applyMarker('show', 'me', 'X', '#fff'); }catch(e){ out0 = String(e); }
    try{ setGoal('test objective'); }catch(e){}
    try{ openDialogue({ name:'X', lines:['hello'] }); }catch(e){}
    let out0 = null;
    const out = {};
    /* Several of these are hidden AT REST — the reload bar only shows during a reload, the boss bar only
       for a boss, the prompt only near something. Measuring the rest state cannot tell "the toggle works"
       from "it was already hidden", which is what the first run reported for four of them. So each element
       is forced visible with a PLAIN inline display: the hide rule carries an important flag and beats
       it, so a computed value of none means the toggle bit, and anything else means it did not. */
    const disp = (id) => {
      const el = document.getElementById(id); if(!el) return 'NO ELEMENT';
      /* .hidden is display:none with an important flag, so it beats a plain inline display and would make
         every at-rest element read as none whatever the toggle did — which is what the run before this
         reported for the reload bar and the boss bar. Strip it for the measurement, put it back after. */
      const wasHidden = el.classList.contains('hidden');
      if(wasHidden) el.classList.remove('hidden');
      /* the objective banner carries a 0.4 s opacity transition, and getComputedStyle during a transition
         returns the INTERPOLATED value — read 0 ms after setting the class it reports the old one, which
         is why the run before this said the goal toggle did nothing while the body carried its class. */
      const hadT = el.style.transition; el.style.transition = 'none';
      const had = el.style.display; el.style.display = 'block';
      const d = getComputedStyle(el).display;
      /* the objective banner is deliberately opacity-driven, not display (build 701: it must never
         reflow), so display is the wrong measurand for it and opacity is the right one */
      const op = getComputedStyle(el).opacity;
      el.style.display = had; el.style.transition = hadT;
      if(wasHidden) el.classList.add('hidden');
      return (id === 'goalBanner') ? ('op' + op) : d;
    };

    for(const k of HUD_TOGGLES){
      const id = IDS[k];
      hudCfg.hide = {};                 /* everything ON */
      applyHudCfg();
      const on = disp(id);
      hudCfg.hide = {}; hudCfg.hide[k] = true;
      applyHudCfg();
      const off = disp(id);
      hudCfg.hide = {};
      applyHudCfg();
      const back = disp(id);
      const gone = (v) => v === 'none' || v === 'op0';
      out[k] = { id, on, off, back, works: (on !== 'NO ELEMENT') && !gone(on) && gone(off) && back === on };
      if(!out[k].works && on !== 'NO ELEMENT'){
        hudCfg.hide = {}; hudCfg.hide[k] = true; applyHudCfg();
        out[k].bodyHasClass = document.body.classList.contains('hud-hide-' + k);
        hudCfg.hide = {}; applyHudCfg();
      }
    }
    out.__err = out0;
    return out;
  })()`);

  // the specific ask: crosshair ON, reload bar OFF — the pairing that was unsayable
  const split = await P(`(function(){
    /* the same .hidden-stripping discriminator the sweep uses — without it the reload bar reads none in
       every condition, which is exactly the null this run is here to rule out */
    const d = (id) => { const el = document.getElementById(id); if(!el) return 'NO ELEMENT';
      const wasHidden = el.classList.contains('hidden');
      if(wasHidden) el.classList.remove('hidden');
      const had = el.style.display; el.style.display = 'block';
      const v = getComputedStyle(el).display;
      el.style.display = had; if(wasHidden) el.classList.add('hidden');
      return v; };
    const out = {};
    hudCfg.hide = {}; applyHudCfg();
    out.both      = { crosshair: d('crosshair'), reloadBar: d('reloadBar') };
    hudCfg.hide = { reload:true }; applyHudCfg();
    out.barOffOnly= { crosshair: d('crosshair'), reloadBar: d('reloadBar') };
    hudCfg.hide = { crosshair:true }; applyHudCfg();
    out.xhOffOnly = { crosshair: d('crosshair'), reloadBar: d('reloadBar') };
    hudCfg.hide = {}; applyHudCfg();
    out.back      = { crosshair: d('crosshair'), reloadBar: d('reloadBar') };
    return out;
  })()`);

  // it must survive a save, through the real serializer and the real loader
  const trip = await P(`(function(){
    hudCfg.hide = { reload:true, hitmark:true, boss:true };
    applyHudCfg();
    const lvl = serializeLevel();
    hudCfg.hide = {}; applyHudCfg();
    restoreLevel(JSON.parse(JSON.stringify(lvl)));
    const kept = Object.keys(hudCfg.hide || {}).filter(k => hudCfg.hide[k]).sort();
    const cls = [...document.body.classList].filter(c => c.indexOf('hud-hide-') === 0).sort();
    hudCfg.hide = {}; applyHudCfg();
    return { written: !!(lvl.hud && lvl.hud.hide), kept, cls };
  })()`);

  console.log(JSON.stringify({ toggles: map.toggles, sweep, split, trip }, null, 1));
});
