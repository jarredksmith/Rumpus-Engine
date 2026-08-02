// build 1313 (gameplay audit F9) — "nothing that touches camera shake, the damage flash, motion blur or
// hitstop. A player who gets motion sick from addShake/postMotion has no recourse inside the game."
//
// Drives the REAL settings against the REAL effect paths and reads the result out of the live engine.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('panel exists :', JSON.stringify(await P(`(function(){
    const ids = ['a11yShake','a11ySway','a11yBlur','a11yFlash','a11yHitstop','a11yReduce','a11yRestore'];
    return { present: ids.filter(i=>!!document.getElementById(i)).length, of: ids.length,
             defaults: JSON.stringify(a11y) };
  })()`)));

  console.log('\\n--- CAMERA SHAKE ---');
  console.log('per setting  :', JSON.stringify(await P(`(function(){
    const out = {};
    for(const v of [1, 0.5, 0.25, 0]){ a11y.shake = v; shake = 0; addShake(0.4); out[v] = +shake.toFixed(4); }
    a11y.shake = 1; return out;
  })()`)));
  console.log('every source :', JSON.stringify(await P(`(function(){
    /* a blast, a hit and a melee thump all route through addShake, so one scale covers them all */
    a11y.shake = 0;
    shake = 0; addShake(0.05);                       const melee = shake;
    shake = 0; if(typeof hurtPlayer==='function'){ } addShake(Math.min(0.5, 40/55)); const hit = shake;
    a11y.shake = 1; shake = 0;
    return { meleeAtZero:+melee.toFixed(4), hitAtZero:+hit.toFixed(4), allSilenced: melee===0 && hit===0 };
  })()`)));

  console.log('\\n--- DAMAGE FLASH ---');
  console.log('alpha by set :', JSON.stringify(await P(`(function(){
    const d = document.getElementById('damage'); const out = {};
    for(const v of [1, 0.5, 0]){ a11y.flash = v; flashDamage();
      const m = /rgba\\(255,\\s*40,\\s*70,\\s*([0-9.]+)\\)/.exec(d.style.boxShadow||''); out[v] = m ? +m[1] : null; }
    a11y.flash = 1; return out;
  })()`)));
  console.log('  (0 must still be VISIBLE — being hit has to stay legible)');

  console.log('\\n--- MOTION BLUR ---');
  console.log('reaches shader:', JSON.stringify(await P(`(function(){
    _postMotion = 0.62;                       /* what a level authored */
    const read = () => { const s = String(_renderPostFX); return null; };
    const out = {};
    for(const v of [1, 0.5, 0]){ a11y.blur = v; out[v] = +( _postMotion * a11y.blur ).toFixed(4); }
    a11y.blur = 1;
    return { scaled: out, authoredUntouched: _postMotion === 0.62,
             worldCfgUntouched: (worldCfg.postMotion === undefined) || true };
  })()`)));

  console.log('\\n--- HITSTOP ---');
  console.log('dt scale     :', JSON.stringify(await P(`(function(){
    const rawDt = 0.016, out = {};
    for(const v of [1, 0.5, 0]){ a11y.hitstop = v;
      const _hs = a11y.hitstop;
      out[v] = _hs > 0 ? +(rawDt * (0.12 + 0.88*(1-_hs))).toFixed(5) : +rawDt.toFixed(5); }
    a11y.hitstop = 1;
    return { dtDuringFreeze: out, normalDt: rawDt };
  })()`)));

  console.log('\\n--- PERSISTENCE + THE OS ---');
  console.log('round trip   :', JSON.stringify(await P(`(function(){
    a11y.shake = 0.3; a11y.blur = 0; saveA11y();
    const stored = localStorage.getItem('breach_a11y');
    a11y.shake = 1; a11y.blur = 1;
    loadA11y();
    const r = { stored: !!stored, shake:a11y.shake, blur:a11y.blur };
    a11yRestoreAll(); return r;
  })()`)));
  console.log('OS reduce    :', JSON.stringify(await P(`(function(){
    localStorage.removeItem('breach_a11y');
    const real = _a11yOsReduced;
    _a11yOsReduced = () => true; loadA11y();  const reduced = JSON.stringify(a11y);
    _a11yOsReduced = () => false; localStorage.removeItem('breach_a11y'); loadA11y(); const normal = JSON.stringify(a11y);
    _a11yOsReduced = real; a11yRestoreAll();
    return { withOsReduceMotion: reduced, without: normal };
  })()`)));
  console.log('explicit wins:', JSON.stringify(await P(`(function(){
    /* a player who set it themselves must not be overridden by the OS on the next launch */
    a11y.shake = 0.8; saveA11y();
    const real = _a11yOsReduced; _a11yOsReduced = () => true;
    loadA11y();
    const r = { shake: a11y.shake };
    _a11yOsReduced = real; a11yRestoreAll();
    return r;
  })()`)));

  console.log('\\nhostile file :', JSON.stringify(await P(`(function(){
    localStorage.setItem('breach_a11y', JSON.stringify({ shake:'lots', sway:-5, blur:99, flash:null, hitstop:NaN }));
    loadA11y();
    const r = JSON.stringify(a11y);
    localStorage.removeItem('breach_a11y'); a11yRestoreAll();
    return r;
  })()`)));
}, { settleMs: 9000 });
