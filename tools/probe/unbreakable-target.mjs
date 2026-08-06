// build 1421 — an UNBREAKABLE target could not report a hit.
//
// Reported from play, one message after the range loop finally worked: "if you don't also have Breakable
// toggled on, it doesn't work." Verified at the line — `damageProp` opens
//
//     if(obj.userData.breakable===false) return false;
//
// so unticking Breakable does not stop the plate SHATTERING, it stops the plate REGISTERING: no HP change,
// no flash, no hit sound, and no `damaged` signal. Which is the exact configuration a shooting range wants
// (score every hit, the plate never disappears), and the checkbox beside it says "shatters when shot".
//
// The control is the SAME plate with Breakable ticked. A run where neither scores is the instrument;
// a run where only the unbreakable one fails to score is the defect.
import { withGame } from './driver.mjs';

const out = [];
const P_ = (ok, what, detail) => out.push({ ok, what, detail });

await withGame(async (P) => {
  // Two plates, identical but for the one flag, wired to the same graph a creator would build:
  //   prop signal `On hit` -> `-> Logic event` -> `On event` -> `Change variable score +1`
  console.log('setup:', JSON.stringify(await P(`(function(){
    paused = false;
    const cands = propModels.filter(p => p && p.userData && !p.userData.runtime && !p.userData.phys);
    const mk = (role, brk, z) => {
      const o = cands.shift();
      o.userData._role = role;
      o.scale.set(1,1,1); o.position.set(0, 1, z);
      o.userData.shootable = true;
      o.userData.breakable = brk;                 // the ONE difference
      o.userData.maxHp = 100; o.userData.hp = 100;
      o.userData.hitSnd = 'hit.wav';              // so the sound gate is exercised too
      o.userData.signals = [{ when:'damaged', do:'emit', text: role + 'Hit' }];
      delete o.userData._shattered; delete o.userData._destroyed;
      if(typeof refreshPropCollider==='function') refreshPropCollider(o);
      return o;
    };
    const un = mk('unbrk', false, 32);
    const br = mk('brk',   true,  36);

    logicGraph.nodes = [
      { id:'e1', type:'event', x:0,   y:0,   p:{ name:'unbrkHit' } },
      { id:'m1', type:'math',  x:200, y:0,   p:{ name:'unbrkScore', a:'unbrkScore', op:'+', b:'1' } },
      { id:'e2', type:'event', x:0,   y:200, p:{ name:'brkHit' } },
      { id:'m2', type:'math',  x:200, y:200, p:{ name:'brkScore',   a:'brkScore',   op:'+', b:'1' } },
    ];
    logicGraph.wires = [ { a:'e1', o:0, b:'m1', i:'in' }, { a:'e2', o:0, b:'m2', i:'in' } ];
    logicVars = {};
    return { damageable: damageableProps().length,
             unbrkIn: damageableProps().indexOf(un) >= 0, brkIn: damageableProps().indexOf(br) >= 0 };
  })()`)));

  const read = () => P(`(function(){
    const g = r => propModels.find(o=>o&&o.userData&&o.userData._role===r) || { userData:{} };
    const st = o => ({ hp:o.userData.hp, flash: !!o.userData._flash, gone: !!o.userData._shattered });
    return { unbrk: st(g('unbrk')), brk: st(g('brk')),
             unbrkScore: logicVars.unbrkScore||0, brkScore: logicVars.brkScore||0 };
  })()`);

  // Hit each plate the same number of times, through the real damageProp — the one chokepoint a bullet,
  // a swing, a blast and a client's relayed propHit all pass through.
  const hit = (n, dmg) => P(`(function(){
    for(const r of ['unbrk','brk']){
      const o = propModels.find(x=>x&&x.userData&&x.userData._role===r);
      for(let i=0;i<${n};i++){ _lgBudget = 0; o.userData._hitSndT = 0; _propSndAt = -1e9;
        damageProp(o, ${dmg}, o.position.clone(), new THREE.Vector3(0,0,-1), 1, null); }
    }
    return 1;
  })()`);

  console.log('\nfresh            ', JSON.stringify(await read()));
  await hit(3, 10);
  const three = await read();
  console.log('3 hits x10       ', JSON.stringify(three));

  P_(three.brkScore === 3, 'CONTROL: the breakable plate scored all three hits', three.brkScore);
  P_(three.brk.hp === 70, '...and lost the health', three.brk.hp);
  P_(three.unbrkScore === 3, 'the UNBREAKABLE plate scored all three hits too', three.unbrkScore);
  P_(three.unbrk.flash === true, '...and showed the impact flash', three.unbrk.flash);

  // ...and the whole point of unticking it: it must never break, however long you shoot it.
  await hit(30, 50);
  const lots = await read();
  console.log('+30 hits x50     ', JSON.stringify(lots));

  P_(lots.unbrk.gone === false, 'the unbreakable plate is STILL STANDING after 1500 damage', lots.unbrk.gone);
  P_(lots.unbrk.hp === 100, '...at full health — an invulnerable target, not a dying one', lots.unbrk.hp);
  P_(lots.unbrkScore === 33, '...and it scored every one of those hits', lots.unbrkScore);
  P_(lots.brk.gone === true, 'CONTROL: the breakable one shattered, as it should', lots.brk.gone);

  // a blast must reach it too (build 1405's static sweep)
  const blast = await P(`(function(){
    const o = propModels.find(x=>x&&x.userData&&x.userData._role==='unbrk');
    const before = logicVars.unbrkScore||0;
    _lgBudget = 0; o.userData._hitSndT = 0;
    explodeAt(new THREE.Vector3(o.position.x + 2, o.position.y, o.position.z), 8, 60, null);
    return { scored: (logicVars.unbrkScore||0) - before, gone: !!o.userData._shattered, hp: o.userData.hp };
  })()`);
  console.log('a grenade beside it', JSON.stringify(blast));
  P_(blast.scored === 1, 'an explosion registers on the unbreakable plate', blast.scored);
  P_(blast.gone === false, '...without destroying it', blast.gone);
}, { settleMs: 4000 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
