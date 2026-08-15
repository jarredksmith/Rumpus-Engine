// build 1504 — the reported repro, driven on real computed styles: hide minimap + score + wave.
import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  await P(`(function(){ __drive(120); return 1; })()`);

  const CENSUS = `
    const disp = (id)=>{ const el=document.getElementById(id); return el ? getComputedStyle(el).display : 'missing'; };
    return { minimap: disp('minimap'), score: disp('score'), wave: disp('wavePanel'), ammo: disp('ammoPanel') };`;

  const before = await P('(function(){' + CENSUS + '})()');
  console.log('all shown', JSON.stringify(before), ' <- the control state');

  /* the report: toggle the three off */
  const off = await P(`(function(){
    hudCfg.hide.minimap = true; hudCfg.hide.score = true; hudCfg.hide.wave = true;
    applyHudCfg(hudCfg);
    ${CENSUS}
  })()`);
  console.log('3 hidden ', JSON.stringify(off), ' <- was: all three still visible, no matter what');

  /* the working sibling still works (positive control that the mechanism is shared) */
  const sib = await P(`(function(){
    hudCfg.hide.ammo = true; applyHudCfg(hudCfg);
    ${CENSUS}
  })()`);
  console.log('+ammo    ', JSON.stringify(sib));

  /* and back — the toggles are toggles, not one-way */
  const back = await P(`(function(){
    hudCfg.hide.minimap = hudCfg.hide.score = hudCfg.hide.wave = hudCfg.hide.ammo = false;
    applyHudCfg(hudCfg);
    ${CENSUS}
  })()`);
  console.log('restored ', JSON.stringify(back), ' <- the control returns');

  /* it is level data: the hide set survives the file */
  const rt = await P(`(function(){
    hudCfg.hide.minimap = true; applyHudCfg(hudCfg);
    const lv = serializeLevel();
    hudCfg.hide.minimap = false; applyHudCfg(hudCfg);
    restoreLevel(JSON.parse(JSON.stringify(lv)));
    const out = { hidden: !!hudCfg.hide.minimap, bodyClass: document.body.classList.contains('hud-hide-minimap') };
    hudCfg.hide.minimap = false; applyHudCfg(hudCfg);
    return out;
  })()`);
  console.log('the file ', JSON.stringify(rt), ' <- the off state round-trips and re-applies');

  await P(`(function(){ __release(); return 1; })()`);
}, { headless: true });
