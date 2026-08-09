// Does a shot at a prop show what it did?
//
// Every enemy damage site has spawned a floating number since build 625 — the shot, the swing, the mounted
// turret. `damageProp` never did, so the shooting-range plate that builds 1390/1391/1397/1421/1422 exist to
// make shootable, resettable and scoreable was the one target in the game with no readout.
//
// Driven through the REAL damageProp with the REAL spawnDamageNumber recorded, because build 1277's rule is
// that pinning the two ends of a wire proves nothing about the wire. Every row has a control.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(34) + JSON.stringify(v));

await withGame(async (P) => {
  say('settled', await P(`(function(){
    paused = true;
    /* record every number the engine spawns, without changing what it does */
    window.__nums = [];
    const _real = spawnDamageNumber;
    window.__spawnReal = _real;
    spawnDamageNumber = function(pos, amount, kill, head){
      window.__nums.push({ x:+pos.x.toFixed(2), y:+pos.y.toFixed(2), z:+pos.z.toFixed(2),
                           amount:+(+amount).toFixed(1), kill:!!kill, head:!!head });
      return _real.apply(this, arguments);
    };
    return { build: BUILD_VERSION, cfgOn: dmgNumCfg.on };
  })()`));

  /* Build fixtures away from the stock geometry — build 1323's rule, and the origin is where the stock
     level's own props live. */
  say('fixtures', await P(`(function(){
    window.__mk = function(name, x, ud){
      let made = null;
      spawnProp('box', [x, 0, 300, 0, 0, 0, 1, 2, 1], (o)=>{ if(o){ Object.assign(o.userData, ud); made = o; } });
      window['__' + name] = made;
      return made ? { name, hp: made.userData.hp, shootable: !!made.userData.shootable } : { name, none:true };
    };
    return [
      __mk('plate',  300, { shootable:true, breakable:true,  hp:100, maxHp:100 }),
      __mk('steel',  304, { shootable:true, breakable:false, hp:100, maxHp:100 }),   // build 1421: never breaks
      __mk('barrel', 308, { shootable:true, breakable:true,  hp:100, maxHp:100, explosive:true, fireFuse:2 }),
    ];
  })()`));

  const fire = (js) => `(function(){ window.__nums = []; ${js} return window.__nums; })()`;

  console.log('\n--- an aimed shot ------------------------------------------------------------------');
  say('breakable plate, 15 dmg', await P(fire(
    `damageProp(__plate, 15, {x:300,y:1.2,z:299.5}, {x:0,y:0,z:1}, 6, NET.myId, true);`)));
  say('...its hp now', await P(`(function(){ return __plate.userData.hp; })()`));

  say('CONTROL: a blast (no showNum)', await P(fire(
    `damageProp(__plate, 15, null, null, 6, NET.myId);`)));
  say('...but it still took the damage', await P(`(function(){ return __plate.userData.hp; })()`));

  console.log('\n--- the case the feature is for ----------------------------------------------------');
  say('UNBREAKABLE target, 15 dmg', await P(fire(
    `damageProp(__steel, 15, {x:304,y:1.2,z:299.5}, {x:0,y:0,z:1}, 6, NET.myId, true);`)));
  say('...hp never drops (build 1421)', await P(`(function(){ return __steel.userData.hp; })()`));

  console.log('\n--- the shot that only lights a fuse -----------------------------------------------');
  say('fused barrel, first shot', await P(fire(
    `damageProp(__barrel, 15, {x:308,y:1.2,z:299.5}, {x:0,y:0,z:1}, 6, NET.myId, true);`)));
  say('...ignited, hp untouched', await P(`(function(){ return { hp:__barrel.userData.hp, lit:!!__barrel.userData._fireIgnited }; })()`));
  say('second shot DOES show one', await P(fire(
    `damageProp(__barrel, 15, {x:308,y:1.2,z:299.5}, {x:0,y:0,z:1}, 6, NET.myId, true);`)));

  console.log('\n--- the killing blow ---------------------------------------------------------------');
  say('lethal shot on the plate', await P(fire(
    `damageProp(__plate, 999, {x:300,y:1.2,z:299.5}, {x:0,y:0,z:1}, 6, NET.myId, true);`)));

  console.log('\n--- where it appears when there is no contact point ---------------------------------');
  say('no point -> box centre', await P(fire(
    `const b = __steel.userData.box;
     _propDmgNumber(__steel, 7, null, false);
     window.__nums[0].boxMid = [ +((b.min.x+b.max.x)/2).toFixed(2), +((b.min.y+b.max.y)/2).toFixed(2) ];`)));

  console.log('\n--- and the creator control still owns it ------------------------------------------');
  /* The recorder wraps spawnDamageNumber and logs BEFORE delegating, so with the setting off it logs a
     call that the real function then declines — the probe measuring itself. Read the EFFECT instead: how
     many sprites are actually live. */
  say('dmgNumCfg.on = false', await P(`(function(){
    for(const f of dmgNumbers.slice()) { scene.remove(f.sp); f.sp.visible = false; }
    dmgNumbers.length = 0;
    dmgNumCfg.on = false;
    damageProp(__steel, 15, {x:304,y:1.2,z:299.5}, {x:0,y:0,z:1}, 6, NET.myId, true);
    const off = dmgNumbers.length;
    dmgNumCfg.on = true;
    damageProp(__steel, 15, {x:304,y:1.2,z:299.5}, {x:0,y:0,z:1}, 6, NET.myId, true);
    const on = dmgNumbers.length - off;
    return { spritesWhenOff: off, spritesWhenOn: on };
  })()`));
}, { settleMs: 5000 });

console.log('');
