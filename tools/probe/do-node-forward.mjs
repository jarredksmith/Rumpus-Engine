// Does a Do node hand the handler what the creator typed into it?
//
// The do-node's dispatch builds a HAND-WRITTEN literal to forward to _applySignalAction. The node's own
// parameter table (LG_DEFS.do.params) is the list of fields a creator can fill in. Those are two lists,
// and build 1406 has just finished paying for the same shape one layer down — so the question is simply
// whether every field the node offers reaches the verb that reads it.
//
// The probe fires the REAL _lgPulse against a real graph node and reads a real observable: an enemy's HP,
// a spawned pickup's own flags. No source reading — what the handler received is what it did.
import { withGame } from './driver.mjs';

const R = [];
const chk = (name, ok, detail) => R.push({ name, ok: !!ok, detail });

await withGame(async (P) => {
  /* _lgPulse takes a node ID and looks it up, and the switch is on n.TYPE — passing it a node object, or
     one keyed `t`, does nothing at all, which reads exactly like the field being dropped. The node goes
     into the real graph, and every check below carries a positive control that must fire. */
  await P(`(function(){
    paused = false; gameOn = true;
    window.__B = 44;
    window.__node = function(p){
      logicGraph = logicGraph || { nodes:[], wires:[] };
      logicGraph.nodes = (logicGraph.nodes||[]).filter(n => n.id !== 'probe1');
      logicGraph.nodes.push({ id:'probe1', type:'do', x:0, y:0, p:p });
      _lgBudget = 0;
      _lgPulse('probe1');
    };
    /* fire a node and report the object the HANDLER received, rather than scanning the source for a
       literal — build 1407 replaced that literal with a derivation, and a probe that reads the code
       rather than the behaviour would have called the fix a regression. */
    window.__handed = function(p){
      const real = _applySignalAction; let got = null;
      _applySignalAction = function(s){ got = JSON.parse(JSON.stringify(s)); };
      try { __node(p); } finally { _applySignalAction = real; }
      return got;
    };
    return 1;
  })()`);

  {
    const rig = await P(`(function(){
      const params = (LG_DEFS.do.params||[]).map(p => p.k).filter(k => k !== 'verb');
      /* every field FILLED IN on the node must arrive; a field left blank must arrive as its default */
      const filled = {}; for(const k of params) filled[k] = (k==='vtrack') ? 1 : 'v_'+k;
      filled.verb = 'damage';
      const got = __handed(filled) || {};
      const blank = __handed({ verb:'damage' }) || {};
      return { params, missing: params.filter(k => !(k in got)),
               wrong: params.filter(k => k!=='vtrack' && String(got[k]) !== 'v_'+k),
               blankMissing: params.filter(k => !(k in blank)),
               vtrackDefault: blank.vtrack, whoDefault: blank.who, cmdDefault: blank.cmd };
    })()`);
    chk('every field the Do node offers reaches the handler', !rig.__threw &&
      rig.missing.length === 0 && rig.wrong.length === 0, rig);
    chk('...and a field left blank arrives as its default rather than not at all',
      rig.blankMissing.length === 0 && rig.whoDefault === 'player' && rig.cmdDefault === 'hunt' &&
      rig.vtrackDefault === true, rig);
  }

  // ------------------------------------------------ the radius, measured on an enemy's HP
  {
    const r = await P(`(function(){
      for(let i=enemies.length-1;i>=0;i--){ try{ killEnemy(enemies[i]); }catch(e){} } enemies.length = 0;
      gameCfg.objective = 'puzzle';
      if(typeof spawnQueue!=='undefined') spawnQueue.length = 0;
      if(typeof toSpawn!=='undefined') toSpawn = 0;
      player.pos.set(__B, 1.7, __B); camera.position.copy(player.pos); camera.updateMatrixWorld(true);

      /* a tagged prop to aim the area at, well clear of the player */
      let pad = null;
      spawnProp('box',[__B-30, 0, __B-30, 0,0,0, 2,0.2,2],(b)=>{pad=b;});
      if(!pad) return { err:'no pad' };
      pad.userData.tag = 'booth';

      spawnEnemy({ x: __B-30, z: __B-28, type:'grunt' });     /* 2 m from the pad */
      const near = enemies[enemies.length-1];
      spawnEnemy({ x: __B, z: __B - 4, type:'grunt' });        /* beside the player, far from the pad */
      const far = enemies[enemies.length-1];
      const n0 = near.hp, f0 = far.hp;

      /* THE CONTROL, first: the same verb with the audience that has always worked. If this does not
         damage both enemies, the instrument is broken and the null below means nothing. */
      __node({ verb:'damage', who:'enemies', amt:5 });
      const ctlHit = near.hp < n0 && far.hp < f0;
      const n1 = near.hp, f1 = far.hp;

      __node({ verb:'damage', who:'near', at:'booth', r:12, amt:20 });

      const out = { ctlHit, n0, n1, f0, f1, n2: near.hp, f2: far.hp,
                    hitTheOneNearThePad: near.hp < n1, sparedTheFarOne: far.hp === f1 };
      for(let i=enemies.length-1;i>=0;i--){ try{ killEnemy(enemies[i]); }catch(e){} } enemies.length = 0;
      try{ removeProp(pad); }catch(e){}
      return out;
    })()`);
    chk('the instrument works: a plain "damage all enemies" node lands', r.ctlHit, r);
    chk('"damage the enemies near a place" reaches the handler with its radius (build 1288)',
      r.hitTheOneNearThePad && r.sparedTheFarOne, r);
  }

  // ------------------------------------------------ what the handler was actually handed
  // The pickup verb wraps its whole body in try/catch, so reading the spawned pad is not a reliable
  // measurement here — intercept the call instead and report the object the node built.
  {
    const r = await P(`(function(){
      const got = __handed({ verb:'pickup', pk:'health', once:1, at:'me' });
      return { got, once: got ? got.once : null, keys: got ? Object.keys(got).length : 0 };
    })()`);
    chk('a graph-spawned pickup keeps its "once" flag (build 1399)', r.once === 1 || r.once === true, r);
  }

  const w = Math.max(...R.map(x => x.name.length));
  console.log('\n  DO NODE -> HANDLER\n  ' + '='.repeat(w + 8));
  for (const x of R) {
    console.log('    ' + (x.ok ? 'ok  ' : 'FAIL') + '  ' + x.name.padEnd(w));
    if (!x.ok) console.log('           ' + JSON.stringify(x.detail));
  }
  const bad = R.filter(x => !x.ok).length;
  console.log('\n  ' + (R.length - bad) + '/' + R.length + ' verified' + (bad ? '   <-- ' + bad + ' NOT WORKING' : ''));
}, { settleMs: 8000 });
