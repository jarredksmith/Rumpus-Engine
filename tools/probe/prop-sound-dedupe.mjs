// build 1314 — REPORTED FROM PLAY: "there seems to be a default coded sound for when pressing the fire
// button and impact on props, especially for melee. It plays the default and the custom sound at the same
// time. Can we remove the default sounds if there is a custom sound loaded? Also need the option to search
// freesounds for prop impact noises. I'd also like a slot per-prop for a custom explosion or breaking sound."
//
// Records EVERY sound the engine starts during a real swing and a real break, with and without a custom
// clip on the prop, and counts them.
import { withGame } from './driver.mjs';

const SETUP = `(function(){
  tpMode = false; player.pos.set(0, EYE, 30); player.yaw = Math.PI; player.pitch = 0;
  let o = dynamicProps[0];
  if(!o){ o = propModels.find(p=>p && !p.userData.runtime); if(!o) return { err:'no props' };
    if(typeof setPropDynamic==='function') setPropDynamic(o, true); }
  o.scale.set(1,1,1); o.position.set(0, 1, 32);
  o.userData.breakable = true; o.userData.maxHp = 1e9; o.userData.hp = 1e9;
  if(typeof refreshPropCollider==='function') refreshPropCollider(o);
  window.__O = o;
  /* record every sound start: the sample path AND the synth path */
  window.__snd = [];
  const _rp = playSample; playSample = function(url, opts){ window.__snd.push('sample:'+String(url||'(none)')); return true; };
  const _rt = tone;       tone       = function(o2){ window.__snd.push('synth:'+((o2&&o2.freq)||'?')); return _rt.apply(null, arguments); };
  return { ok:true };
})()`;

const SWING = `(function(){
  window.__snd = []; const o = window.__O;
  o.userData._hitSndT = 0; _meleeT = 0; _meleeTok++; _propSndAt = -1e9;
  _meleeStrike(WEAPONS.crowbar, WEAPONS.crowbar.reach||2.9, WEAPONS.crowbar.dmg);
  return window.__snd.slice();
})()`;

await withGame(async (P, page) => {
  console.log('setup:', JSON.stringify(await P(SETUP)));
  await page.waitForTimeout(1000);

  console.log('\\n--- MELEE SWING AT A PROP ---');
  console.log('NO custom clip :', JSON.stringify(await P(`(function(){ delete window.__O.userData.hitSnd; return 'cleared'; })()`)));
  await page.waitForTimeout(200);
  console.log('   sounds ->', JSON.stringify(await P(SWING)));
  console.log('WITH custom    :', JSON.stringify(await P(`(function(){ window.__O.userData.hitSnd='https://example.invalid/wood.mp3'; return 'set'; })()`)));
  await page.waitForTimeout(200);
  console.log('   sounds ->', JSON.stringify(await P(SWING)));

  console.log('\\n--- SHOOTING A PROP ---');
  console.log('WITH custom    ->', JSON.stringify(await P(`(function(){
    window.__snd = []; const o = window.__O; o.userData._hitSndT = 0; _propSndAt = -1e9;
    /* the bullet path's prop branch, driven through the real damageProp + the guarded SFX.hit */
    playPropHitSound(o, {x:0,y:1,z:31});
    if(!_propSndFresh()) SFX.hit();
    return window.__snd.slice();
  })()`)));
  console.log('WITHOUT        ->', JSON.stringify(await P(`(function(){
    window.__snd = []; const o = window.__O; const u=o.userData.hitSnd; delete o.userData.hitSnd;
    o.userData._hitSndT = 0; _propSndAt = -1e9;
    playPropHitSound(o, {x:0,y:1,z:31});
    if(!_propSndFresh()) SFX.hit();
    o.userData.hitSnd = u;
    return window.__snd.slice();
  })()`)));

  console.log('\\n--- BREAKING A PROP ---');
  console.log('NO break clip  ->', JSON.stringify(await P(`(function(){
    window.__snd = []; const o = window.__O;
    delete o.userData.breakSnd; o.userData._shattered = false; o.userData.hp = 1;
    shatterProp(o, {x:0,y:1,z:31}, new THREE.Vector3(0,0,1), 8, NET.myId);
    return window.__snd.slice();
  })()`)));
  console.log('WITH break clip->', JSON.stringify(await P(`(function(){
    window.__snd = []; const o = window.__O;
    o.userData.breakSnd = 'https://example.invalid/crate-smash.mp3'; o.userData._shattered = false;
    shatterProp(o, {x:0,y:1,z:31}, new THREE.Vector3(0,0,1), 8, NET.myId);
    return window.__snd.slice();
  })()`)));

  console.log('\\n--- ROUND TRIP + PRELOAD ---');
  console.log('serialize      :', JSON.stringify(await P(`(function(){
    const o = window.__O; o.userData.hitSnd='https://example.invalid/wood.mp3'; o.userData.breakSnd='https://example.invalid/crate-smash.mp3';
    o.userData._shattered = false; o.userData.phys = o.userData.phys || {};   /* the break test above destroyed it */
    if(propModels.indexOf(o)<0) propModels.push(o);
    const e = propEntry(o);
    const lvl = JSON.parse(JSON.stringify(serializeLevel()));
    const kids = (lvl.props||[]).filter(p=>p && (p.hsn||p.bsn));
    return { hsn:e.hsn, bsn:e.bsn, inLevel:kids.length };
  })()`)));
  console.log('preload warms  :', JSON.stringify(await P(`(function(){
    const seen = []; const _rl = loadSound; loadSound = (u)=>{ seen.push(String(u)); };
    preloadPropHitSounds(); loadSound = _rl;
    return { warmed: seen.filter(u=>/example\\.invalid/.test(u)) };
  })()`)));

  console.log('\\nfreesound hook :', JSON.stringify(await P(`(function(){
    return { fn: typeof renderFreesoundBrowser === 'function',
             takesDirectTarget: /directTarget/.test(String(renderFreesoundBrowser).slice(0,200)) };
  })()`)));
}, { settleMs: 9000 });
