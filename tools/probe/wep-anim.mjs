// Build 1294: per-weapon attack animations. Two halves, and builds 1266/1268 are the reason both get
// driven through the REAL path: that pair shipped a fix whose call site sat in a camera branch no creator
// ever reaches, because the probe set editorOpen directly instead of going through toggleEditor.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  await P("toggleEditor(); 1;");
  await page.waitForTimeout(2000);
  await P("setEditorMode('player'); 1;");
  await page.waitForTimeout(3000);

  console.log('EDITOR ROWS  ', JSON.stringify(await P(`(function(){
    const out={ mode:editorMode, weapons:Object.keys(WEAPONS), slots:WEP_ANIM_SLOTS.slice(), found:{}, missing:[] };
    for(const b of WEP_ANIM_SLOTS) for(const w of Object.keys(WEAPONS)){
      const el=editorEl.querySelector('#edPlayerClipW_'+b+'_'+w);
      if(el) out.found[b]=(out.found[b]||0)+1; else out.missing.push(b+'@'+w);
    }
    const one=editorEl.querySelector('#edPlayerClipW_attack_pistol');
    out.sample = one ? { state:one.dataset.state, options:one.options.length, first:one.options[0]&&one.options[0].textContent } : null;
    return out;
  })()`)));

  console.log('RESOLUTION   ', JSON.stringify(await P(`(function(){
    // the real _stateActionKey against a real action map
    const acts={ idle:1, attack:1, 'attack@crowbar':1, aim:1 };
    return {
      swordUsesItsOwn: _stateActionKey(acts, 'attack@crowbar'),
      pistolFallsBack: _stateActionKey(acts, 'attack@pistol'),
      plainUnchanged:  _stateActionKey(acts, 'attack'),
      chainStillWalks: _stateActionKey({ idle:1, aim:1 }, 'attack@pistol'),
      noClipsAtAll:    _stateActionKey({ idle:1 }, 'attack@rifle'),
      helper:          _wepAnimSlot('attack','crowbar')
    };
  })()`)));

  // and the live animator: does the local avatar ASK for the weapon in hand?
  console.log('LIVE STATE   ', JSON.stringify(await P(`(function(){
    toggleEditor();                                   /* back to play — the avatar only animates there */
    const out={};
    try{ tpMode=true; }catch(e){}
    for(const w of ['pistol','crowbar','rifle']){
      curWep=w; lastShot=performance.now();
      const ff='walk';
      out[w]=_wepAnimSlot((0>=0.012 ? (_fireSlot(ff)||'attack') : 'attack'), curWep);
    }
    return out;
  })()`)));
}, { settleMs: 9000 });
