// build 1486 — does the prompt name the thing you are pointing at, and does proximity still win?
//
// One element with one writer is the whole design, so the probe reads the REAL `#prompt` after the REAL
// `checkProximity` — never `_clkHoverLabel` in isolation, which would prove the text and nothing about the
// wire. The control is an interactable prop the player is STANDING AT: if proximity did not outrank the
// hover, that row would read the click label.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);

  const settle = await P(`(function(){ __drive(240);
    return { gameOn, locked: !!document.pointerLockElement }; })()`);
  console.log('settled   ', JSON.stringify(settle));

  // a NAMED clickable prop ahead, in a column measured clear of the stock level
  const build = await P(`(function(){
    spawnProp('box', [0,0,0, 0,0,0, 3,3,3]);
    const o = propModels[propModels.length-1];
    o.position.set(60, 0, -55); o.updateMatrixWorld(true); refreshPropCollider(o);
    o.userData.name = 'Vault Door';
    o.userData.signals = [{ when:'clicked', do:'toast', text:'hi' }];
    window.__box = o;
    player.pos.set(60, 1.9, -65); player.vel.set(0,0,0); player.yaw = Math.PI; player.pitch = 0;
    __gate(); __drive(30);
    return { resolves: !!_clkResolve(0,0), name:o.userData.name };
  })()`);
  console.log('the prop  ', JSON.stringify(build), ' <- resolves FALSE and every row below measures that');

  const READ = `(function(){ const p = document.getElementById('prompt');
    return { shown: p.style.display !== 'none', text: p.innerHTML, hoverFlag: p.dataset.hover || '' }; })()`;

  console.log('pointing AT   :', JSON.stringify(await P(`(function(){ __drive(40); return ${READ}; })()`)));
  console.log('pointing away :', JSON.stringify(await P(`(function(){ player.yaw = 0; __drive(40); return ${READ}; })()`)));

  // an UNNAMED prop still says something rather than "undefined"
  console.log('unnamed       :', JSON.stringify(await P(`(function(){
    delete window.__box.userData.name; player.yaw = Math.PI; __drive(40); return ${READ}; })()`)));

  // a name a level authored is ESCAPED on the way to the DOM
  console.log('hostile name  :', JSON.stringify(await P(`(function(){
    window.__box.userData.name = '<img src=x onerror=1>';
    __drive(40); const r = ${READ};
    return Object.assign(r, { imgNodes: document.getElementById('prompt').querySelectorAll('img').length });
  })()`)), ' <- imgNodes MUST be 0');

  /* THE CONTROL: proximity must outrank the hover. The prop is made interactable and the player walks up to
     it, so both answers are available at once and only one may be on screen. */
  const near = await P(`(function(){
    window.__box.userData.name = 'Vault Door';
    window.__box.userData.interact = true;
    player.pos.set(60, 1.9, -57.2); player.yaw = Math.PI; __drive(40);
    return Object.assign(${READ}, { stillPointingAtIt: !!_clkResolve(0,0) });
  })()`);
  console.log('STANDING at it:', JSON.stringify(near), ' <- proximity wins: an E prompt, not the click label');

  const back = await P(`(function(){
    delete window.__box.userData.interact;
    player.pos.set(60, 1.9, -65); __drive(40); return ${READ}; })()`);
  console.log('  ...stepped back:', JSON.stringify(back), ' <- and the hover label returns');

  await P(`(function(){ removeProp(propModels.indexOf(window.__box)); __release(); return 1; })()`);
}, { headless: true });
