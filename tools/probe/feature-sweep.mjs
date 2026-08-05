// Does the gameplay feature surface actually WORK, end to end, in the running game?
//
// Build 1277 found SIX logic verbs that had shipped and never once worked — show/hide/move/destroy/push/
// spawn a prop — because the node dropdown offered them and the handler implemented them and NOTHING
// proved the wire between. Every source pin passed the whole time. That is the failure mode this exists
// to catch, and the rule it enforces is build 1277's: a test that pins the two ends of a wire proves
// nothing about the wire.
//
// So every check here DRIVES THE REAL PATH from its real entry point and reads a REAL OBSERVABLE — a
// prop's world position, a collider's presence in the list, a variable's value, health, ammo, inventory —
// never a flag the feature sets about itself. It builds its own test content, so it does not care what
// the shipped level happens to contain.
import { withGame } from './driver.mjs';

const R = [];
const chk = (group, name, ok, detail) => R.push({ group, name, ok: !!ok, detail });

// A sweep that dies on the first unknown identifier is not a sweep. Every probe call is isolated, and a
// throw is reported as a FAILED CHECK with its message rather than taking the other 20 down with it.
const safe = async (P, code) => {
  try { return await P(code); }
  catch (e) { return { __threw: String(e.message || e).split('\n')[0].replace('page.evaluate: ', '') }; }
};

// Build a graph: one `event` node wired to one node under test. Returns the id of the node under test.
const GRAPH = (type, p) => `(function(){
  logicGraph.nodes = [ { id:'ev', type:'event', x:0, y:0, p:{ name:'T' } },
                       { id:'n1', type:${JSON.stringify(type)}, x:100, y:0, p:${JSON.stringify(p)} } ];
  logicGraph.wires = [ { a:'ev', o:0, b:'n1', i:'in' } ];
  logicVars = {};
  return logicGraph.nodes.length + '/' + logicGraph.wires.length;
})()`;

const FIRE = `(function(){ _lgFireEvents('event','T'); return 1; })()`;

await withGame(async (P) => {
  // one tagged static prop and one dynamic prop to act on, made HERE so the sweep owns its fixtures
  const setup = await P(`(function(){
    paused = false;
    window.__mk = function(tag, x, z, dyn){
      let o = null;
      spawnProp('box', [x, 0, z, 0, 0, 0, 2, 2, 2], (obj) => { o = obj; });
      if(!o) return null;
      o.userData.tag = tag;
      if(dyn){ o.userData.phys = true; o.userData.breakable = true; o.userData.hp = 50; o.userData.maxHp = 50; }
      return o;
    };
    window.__byTag = function(t){ return propModels.find(o => o && o.userData && o.userData.tag === t); };
    const a = window.__mk('tgt', 40, 40, false);
    return { made: !!a, props: propModels.length, gameOn: gameOn };
  })()`);
  chk('rig', 'a test prop can be spawned', setup.made, setup);

  // ---------------------------------------------------------------- LOGIC: prop verbs (build 1277's class)
  for (const [verb, p, read, want] of [
    ['hideprop', { verb: 'hideprop', target: 'tgt' }, 'o.visible === false', 'the prop is invisible'],
    ['showprop', { verb: 'showprop', target: 'tgt' }, 'o.visible === true', 'the prop is visible again'],
    ['moveprop', { verb: 'moveprop', target: 'tgt', place: 'start' }, 'Math.hypot(o.position.x-40,o.position.z-40) > 5', 'the prop moved off its spawn'],
  ]) {
    const r = await safe(P, `(function(){
      const o = window.__byTag('tgt'); if(!o) return { err:'no prop' };
      o.visible = true; o.position.set(40, o.position.y, 40);
      ${GRAPH('do', p).replace(/^\(function\(\)\{|return[^;]*;\s*\}\)\(\)$/g, '')}
      _lgFireEvents('event','T');
      return { ok: (${read}), pos: [+o.position.x.toFixed(1), +o.position.z.toFixed(1)], vis: o.visible,
               inColliders: colliders.indexOf(o) >= 0 };
    })()`);
    chk('logic verbs', verb + ' \u2014 ' + want, !r.__threw && (r.ok && !r.__threw), r);
  }
  // hide must also make it INTANGIBLE, which is the half that makes an invisible wall
  {
    const r = await safe(P, `(function(){
      const o = window.__byTag('tgt'); if(!o) return { err:'no prop' };
      o.visible = true; if(colliders.indexOf(o) < 0) colliders.push(o);
      ${GRAPH('do', { verb: 'hideprop', target: 'tgt' }).replace(/^\(function\(\)\{|return[^;]*;\s*\}\)\(\)$/g, '')}
      _lgFireEvents('event','T');
      const hidden = colliders.indexOf(o) < 0;
      ${GRAPH('do', { verb: 'showprop', target: 'tgt' }).replace(/^\(function\(\)\{|return[^;]*;\s*\}\)\(\)$/g, '')}
      _lgFireEvents('event','T');
      return { hiddenIntangible: hidden, shownTangible: colliders.indexOf(o) >= 0 };
    })()`);
    chk('logic verbs', 'hideprop also removes the collider (an invisible wall is worse than no verb)',
        r.hiddenIntangible && r.shownTangible, r);
  }
  // destroy
  {
    const r = await safe(P, `(function(){
      const o = window.__mk('doomed', 44, 44, false); if(!o) return { err:'no prop' };
      ${GRAPH('do', { verb: 'delprop', target: 'doomed' }).replace(/^\(function\(\)\{|return[^;]*;\s*\}\)\(\)$/g, '')}
      _lgFireEvents('event','T');
      return { shattered: !!o.userData._shattered, gone: !o.parent, stillInLevel: propModels.indexOf(o) >= 0 };
    })()`);
    chk('logic verbs', 'delprop destroys it but keeps it in the level for the next deploy',
        r.shattered && r.gone && r.stillInLevel, r);
  }

  // ---------------------------------------------------------------- LOGIC: state + arithmetic
  {
    const r = await safe(P, `(function(){
      ${GRAPH('setvar', { name: 'score', value: 7 }).replace(/^\(function\(\)\{|return[^;]*;\s*\}\)\(\)$/g, '')}
      _lgFireEvents('event','T'); const a = logicVars.score;
      ${GRAPH('math', { name: 'score', a: 'score', op: '\u00d7', b: 6 }).replace(/^\(function\(\)\{|return[^;]*;\s*\}\)\(\)$/g, '')}
      logicVars.score = a;
      _lgFireEvents('event','T');
      return { set: a, afterMath: logicVars.score };
    })()`);
    chk('logic state', 'setvar writes and math reads it back', !r.__threw && (r.set === 7 && r.afterMath === 42), r);
  }
  {
    const r = await safe(P, `(function(){
      ${GRAPH('list', { name: 'deck', op: 'fill', value: 5, var: 'n' }).replace(/^\(function\(\)\{|return[^;]*;\s*\}\)\(\)$/g, '')}
      _lgFireEvents('event','T');
      const filled = (logicLists && logicLists['deck@0']) ? logicLists['deck@0'].length : (logicLists && logicLists.deck ? logicLists.deck.length : -1);
      return { lists: typeof logicLists, keys: logicLists ? Object.keys(logicLists) : null, filled: filled };
    })()`);
    chk('logic state', 'list fill 1..N builds an ordered collection (build 1269)', !r.__threw && (r.filled === 5), r);
  }
  {
    const r = await safe(P, `(function(){
      ${GRAPH('read', { stat: 'hp', name: 'h' }).replace(/^\(function\(\)\{|return[^;]*;\s*\}\)\(\)$/g, '')}
      _lgFireEvents('event','T');
      return { hp: player.hp, read: logicVars.h };
    })()`);
    chk('logic state', 'read game stat pulls real world state into a variable', !r.__threw && (r.read === r.hp && r.hp > 0), r);
  }

  // ---------------------------------------------------------------- INVENTORY + PICKUPS
  {
    const r = await safe(P, `(function(){
      inventory.length = 0;
      defineItem({ id:'key', name:'Key', type:'key' });
      giveItem('key', 2);
      const after = invCount('key');
      takeItem('key', 1);
      return { after: after, left: invCount('key'), stacks: inventory.length };
    })()`);
    chk('inventory', 'define / give / take move real counts', !r.__threw && (r.after === 2 && r.left === 1), r);
  }
  {
    const r = await safe(P, `(function(){
      inventory.length = 0; defineItem({ id:'coinz', name:'Coin', type:'item' }); giveItem('coinz', 3);
      ${GRAPH('read', { stat: 'item', item: 'coinz', name: 'c' }).replace(/^\(function\(\)\{|return[^;]*;\s*\}\)\(\)$/g, '')}
      _lgFireEvents('event','T');
      return { held: invCount('coinz'), graphSees: logicVars.c };
    })()`);
    chk('inventory', 'the graph can READ the inventory (build 1259)', !r.__threw && (r.graphSees === 3), r);
  }

  // ---------------------------------------------------------------- ZONES
  {
    const r = await safe(P, `(function(){
      const px = 120, pz = 120;
      triggerZones.length = 0;
      triggerZones.push(_migrateTrigger({ x:px, z:pz, r:6, who:'player', ev:'ZONE', once:false }));
      logicGraph.nodes = [ { id:'ev', type:'event', x:0,y:0, p:{ name:'ZONE' } },
                           { id:'n1', type:'setvar', x:100,y:0, p:{ name:'entered', value:1 } } ];
      logicGraph.wires = [ { a:'ev', o:0, b:'n1', i:'in' } ];
      logicVars = {};
      player.pos.set(px, 1.7, pz);
      updateTriggerZones(0.1);
      const inside = logicVars.entered;
      player.pos.set(px + 60, 1.7, pz + 60);
      updateTriggerZones(0.1);
      return { firedOnEnter: inside === 1 };
    })()`);
    chk('zones', 'a trigger zone fires its event when the player walks in', !r.__threw && (r.firedOnEnter), r);
  }
  {
    const r = await safe(P, `(function(){
      fxZones.length = 0;
      fxZones.push(_migrateFxZone({ x:200, z:200, r:10, kind:'heal', amount:20, who:'players' }));
      player.pos.set(200, 1.7, 200); player.hp = 40;
      for(let i=0;i<12;i++) updateFxZones(0.1);
      const healed = player.hp;
      fxZones.length = 0;
      return { from: 40, to: healed };
    })()`);
    chk('zones', 'an effect zone heals over time (build 1193)', !r.__threw && (r.to > r.from), r);
  }
  {
    const r = await safe(P, `(function(){
      deathZones.length = 0;
      deathZones.push(_migrateDeathZone({ x:300, z:300, r:8 }));
      player.pos.set(300, 1.7, 300); const hp0 = player.hp = 100;
      for(let i=0;i<10;i++) updateDeathZones(0.1);
      const hp1 = player.hp;
      deathZones.length = 0; player.pos.set(0,1.7,0);
      player.hp = player.maxHp || 100;   /* RESTORE: a control row that mutates shared state and leaves it poisons every row after it */
      if(typeof duelDead !== 'undefined') duelDead = false;
      gameOn = true;
      return { hp0: hp0, hp1: hp1, restored: player.hp, gameOn: gameOn };
    })()`);
    chk('zones', 'a death zone actually hurts', !r.__threw && (r.hp1 < r.hp0), r);
  }

  // ---------------------------------------------------------------- WEAPONS
  {
    const r = await safe(P, `(function(){
      const out = {};
      for(const k of Object.keys(WEAPONS)){
        const w = WEAPONS[k];
        out[k] = { melee: !!w.melee, dmg: w.dmg, rate: w.fireRate, mag: w.magSize, reach: w.reach || 0, keys: Object.keys(w).join(',') };
      }
      return { n: Object.keys(WEAPONS).length, w: out };
    })()`);
    chk('weapons', 'every weapon is defined with damage and a fire rate',
        !r.__threw && r.n >= 7 && Object.values(r.w).every(w => w.dmg > 0 && w.rate > 0),
        { count: r.n, bad: r.w && Object.entries(r.w).filter(([, w]) => !(w.dmg > 0 && w.rate > 0)) });
  }
  {
    const r = await safe(P, `(function(){
      curWep = 'rifle'; const w = WEAPONS.rifle;
      w.mag = w.magSize; w.reserve = w.magSize * 2;
      lastShot = 0; shoot();
      const afterShot = w.mag;
      w.mag = 0; reloading = false; reload();
      return { magSize: w.magSize, afterShot: afterShot, reloadStarted: !!reloading };
    })()`);
    chk('weapons', 'firing spends a round and reload starts', !r.__threw && (r.afterShot === r.magSize - 1 && r.reloadStarted), r);
  }
  {
    const r = await safe(P, `(function(){
      const o = window.__mk('meleeTgt', 0, -3, false);
      if(!o) return { err:'no prop' };
      o.userData.hp = 100; o.userData.maxHp = 100; o.userData.phys = true; o.userData.breakable = true;
      player.pos.set(0, 1.7, 0); player.yaw = 0; player.pitch = 0;   /* forward is (-sin yaw, -cos yaw): yaw 0 faces -Z, where the prop is */
      camera.position.copy(player.pos); camera.rotation.set(0,0,0,'YXZ');
      camera.rotation.y = player.yaw; camera.updateMatrixWorld(true);
      curWep = 'crowbar'; const hp0 = o.userData.hp;
      /* _meleeStrike(wep, RANGE, DMG) takes its weapon and reach as ARGUMENTS (build 1303 split the
         swing from the contact); calling it bare lands no damage and looks exactly like a broken feature. */
      const w = WEAPONS.crowbar;
      _meleeStrike(w, w.reach, w.dmg);
      return { hp0: hp0, hp1: o.userData.hp, reach: WEAPONS.crowbar.reach };
    })()`);
    chk('weapons', 'a melee swing damages a prop in its arc (build 1311)', !r.__threw && (r.hp1 < r.hp0), r);
  }

  // ---------------------------------------------------------------- ENEMIES
  {
    const r = await safe(P, `(function(){
      const n0 = enemies.length;
      spawnEnemy({ x:10, z:10, type:'grunt' });
      const e = enemies[enemies.length-1];
      const hp0 = e.hp;
      enemyHurt(e, 5, null);
      const hurt = e.hp;
      const nAfterSpawn = enemies.length;
      killEnemy(e);
      return { spawned: nAfterSpawn > n0, hp0: hp0, hurt: hurt,
               dead: enemies.indexOf(e) < 0 };
    })()`);
    chk('enemies', 'spawn, take damage, and die', !r.__threw && (r.spawned && r.hurt < r.hp0 && r.dead), r);
  }
  {
    const r = await safe(P, `(function(){
      const types = (typeof ENEMY_TYPES !== 'undefined') ? Object.keys(ENEMY_TYPES) : [];
      const made = [];
      for(const t of types){ try { spawnEnemy({ x:60, z:60, type:t }); made.push(t); } catch(e){ made.push(t + ':THREW'); } }
      const alive = enemies.filter(e => e && e.hp > 0).length;
      for(const e of enemies.slice()) if(e && e.hp > 0) killEnemy(e);
      return { types: types, made: made, alive: alive };
    })()`);
    chk('enemies', 'every enemy type spawns without throwing',
        r.made.length === r.types.length && !r.made.some(m => /THREW/.test(m)), { types: r.types.length, made: r.made });
  }

  // ---------------------------------------------------------------- OBJECTIVES + CHECKPOINT
  {
    const r = await safe(P, `(function(){
      const o = window.__mk('obj1', 80, 80, false);
      o.userData.phys = true; o.userData.breakable = true; o.userData.objective = true;
      o.userData.hp = 10; o.userData.maxHp = 10;
      const before = propModels.filter(p => p && p.userData && p.userData.objective && !p.userData._destroyed).length;
      damageProp(o, 999, null, null, 4, null);
      const after = propModels.filter(p => p && p.userData && p.userData.objective && !p.userData._destroyed).length;
      return { before: before, after: after, shattered: !!o.userData._shattered };
    })()`);
    chk('objectives', 'an objective target can be destroyed', !r.__threw && (r.shattered && r.after < r.before), r);
  }
  {
    const r = await safe(P, `(function(){
      if(typeof setCheckpoint !== 'function') return { missing: true };
      player.pos.set(150, 1.7, 150);
      setCheckpoint();
      const cp = (typeof _checkpoint !== 'undefined') ? _checkpoint : null;
      return { set: !!cp, cp: cp ? [Math.round(cp.x), Math.round(cp.z)] : null };
    })()`);
    chk('progression', 'a checkpoint records where to respawn', !r.__threw && (r.set), r);
  }

  // ---------------------------------------------------------------- HUD widgets
  {
    const r = await safe(P, `(function(){
      if(typeof hudWidgets === 'undefined') return { missing: true };
      logicVars = { gold: 12 };
      hudWidgets.length = 0;
      hudWidgets.push({ kind:'text', label:'G {gold}', x:10, y:10 });
      /* updateHudWidgets is the RUNTIME renderer; renderHudPanel is the editor's authoring panel. */
      if(typeof updateHudWidgets === 'function') updateHudWidgets();
      const el = document.getElementById('hudWidgets');
      return { rendered: !!el, text: el ? el.textContent : null, fn: typeof updateHudWidgets };
    })()`);
    chk('hud', 'a HUD widget renders an interpolated variable', !r.__threw && (r.rendered && /12/.test(r.text || '')), r);
  }

  // ---------------------------------------------------------------- report
  const groups = [...new Set(R.map(r => r.group))];
  console.log('\n  FEATURE SWEEP — build ' + (await P('BUILD_VERSION')));
  console.log('  ' + '='.repeat(78));
  for (const g of groups) {
    console.log('  ' + g.toUpperCase());
    for (const r of R.filter(x => x.group === g))
      console.log('    ' + (r.ok ? 'ok  ' : 'FAIL') + '  ' + r.name +
        (r.ok ? '' : '\n           ' + JSON.stringify(r.detail)));
  }
  const bad = R.filter(r => !r.ok);
  console.log('\n  ' + (R.length - bad.length) + '/' + R.length + ' features verified end to end' +
    (bad.length ? '   <-- ' + bad.length + ' NOT WORKING' : ''));
  if (bad.length) process.exitCode = 1;
}, { settleMs: 12000 });
