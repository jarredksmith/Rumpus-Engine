// Can an order reach the enemies at ONE booth?
//
// A gauntlet is rooms. "Hold position" fired at the AI booth froze every enemy in the level, including the
// ones down range at the shooting gallery, because the command verb resolved its audience as all-of-them or
// the-single-nearest-to-the-player and nothing else. This measures the fix on real enemies at real places,
// with the enemies at the OTHER booth as the control — a scoped order that reaches nobody and a scoped order
// that reaches everybody look identical without them.
import { withGame } from './driver.mjs';

const R = [];
const chk = (name, ok, detail) => R.push({ name, ok: !!ok, detail });

await withGame(async (P) => {
  await P(`(function(){
    paused = false; gameOn = true;
    gameCfg.objective = 'puzzle';                       /* build 685: the wave machine stands down */
    if(typeof spawnQueue!=='undefined') spawnQueue.length = 0;
    if(typeof toSpawn!=='undefined') toSpawn = 0;
    if(typeof choosingUpgrade!=='undefined') choosingUpgrade = false;
    window.__B = 44;
    player.pos.set(__B, 1.7, __B); camera.position.copy(player.pos); camera.updateMatrixWorld(true);

    /* removeProp takes an INDEX, not a prop — passing the object is a silent no-op that leaves the
       fixture in the world and in 'colliders' (see tools/probe/drive.mjs) */
    window.__kill = function(o){ if(!o) return false; const i = propModels.indexOf(o);
      if(i < 0) return false; removeProp(i); return true; };
    window.__node = function(p){
      logicGraph.nodes = (logicGraph.nodes||[]).filter(n => n.id !== 'probe1');
      logicGraph.nodes.push({ id:'probe1', type:'do', x:0, y:0, p:p });   /* the switch is on n.type */
      _lgBudget = 0; _lgPulse('probe1');
    };

    /* TWO BOOTHS, forty metres apart, three enemies each */
    window.__booth = function(tag, x, z){
      let pad = null;
      spawnProp('box',[x, 0, z, 0,0,0, 2,0.2,2],(b)=>{pad=b;});
      if(pad) pad.userData.tag = tag;
      const en = [];
      for(let i=0;i<3;i++){ spawnEnemy({ x: x + i*2, z: z + 1, type:'grunt' }); en.push(enemies[enemies.length-1]); }
      return { pad, en };
    };
    window.__reset = function(){
      for(let i=enemies.length-1;i>=0;i--){ try{ killEnemy(enemies[i]); }catch(e){} }
      enemies.length = 0;
      for(const o of propModels.slice()) if(o && o.userData && (o.userData.tag==='range'||o.userData.tag==='pit')) try{ __kill(o); }catch(e){}
    };
    return 1;
  })()`);

  const r = await P(`(function(){
    __reset();
    const A = __booth('range', __B - 30, __B - 30);      /* the shooting gallery */
    const Bo = __booth('pit',   __B + 20, __B + 20);     /* the physics pit, 70 m away */
    const mode = () => [A.en.map(e=>e.mode).join('/'), Bo.en.map(e=>e.mode).join('/')];

    /* every enemy starts hunting */
    __node({ verb:'command', ewho:'enemies', cmd:'hunt' });
    const start = mode();

    /* THE CONTROL: the audience that has always worked must still reach everybody */
    __node({ verb:'command', ewho:'enemies', cmd:'patrol' });
    const all = mode();
    __node({ verb:'command', ewho:'enemies', cmd:'hunt' });

    /* the order the gauntlet needs: hold the enemies at the range, and nobody else */
    __node({ verb:'command', ewho:'near', escope:'range', er:12, cmd:'hold' });
    const scoped = mode();

    /* a radius that reaches neither booth */
    __node({ verb:'command', ewho:'enemies', cmd:'hunt' });
    __node({ verb:'command', ewho:'near', escope:'range', er:0.5, cmd:'hold' });
    const tight = mode();

    /* a place nothing answers to must command NOBODY, and say so */
    __node({ verb:'command', ewho:'enemies', cmd:'hunt' });
    const notes0 = (typeof logicFailures!=='undefined' && logicFailures.size) || 0;
    __node({ verb:'command', ewho:'near', escope:'nosuchbooth', er:50, cmd:'hold' });
    const missing = mode();
    const notes1 = (typeof logicFailures!=='undefined' && logicFailures.size) || 0;

    /* and the destination stays its own field: post the range crew at the PIT */
    __node({ verb:'command', ewho:'near', escope:'range', er:12, cmd:'post', at:'pit' });
    const homes = [ A.en.map(e=>e.home?[Math.round(e.home.x),Math.round(e.home.z)].join(','):'-').join(' | '),
                    Bo.en.map(e=>e.home?[Math.round(e.home.x),Math.round(e.home.z)].join(','):'-').join(' | ') ];

    __reset();
    return { start, all, scoped, tight, missing, homes, notesGrew: notes1 > notes0,
             pit: [__B+20, __B+20] };
  })()`);

  chk('the control: "all enemies" still reaches both booths',
    r.all && r.all[0] === 'patrol/patrol/patrol' && r.all[1] === 'patrol/patrol/patrol', r);
  chk('"hold the enemies near the range" holds the range and nobody else',
    r.scoped && r.scoped[0] === 'hold/hold/hold' && r.scoped[1] === 'hunt/hunt/hunt', r);
  chk('a radius that reaches nothing commands nobody, rather than everybody',
    r.tight && r.tight[0] === 'hunt/hunt/hunt' && r.tight[1] === 'hunt/hunt/hunt', r);
  chk('a place nothing answers to commands nobody, and is reported (build 1214)',
    r.missing && r.missing[0] === 'hunt/hunt/hunt' && r.missing[1] === 'hunt/hunt/hunt' && r.notesGrew, r);
  chk('the scope and the destination stay separate: the range crew is posted at the PIT',
    r.homes && r.homes[0] === [r.pit[0], r.pit[1]].join(',') + ' | ' +
                              [r.pit[0], r.pit[1]].join(',') + ' | ' +
                              [r.pit[0], r.pit[1]].join(','), r);

  const w = Math.max(...R.map(x => x.name.length));
  console.log('\n  COMMAND SCOPE — two booths, 70 m apart\n  ' + '='.repeat(w + 8));
  for (const x of R) {
    console.log('    ' + (x.ok ? 'ok  ' : 'FAIL') + '  ' + x.name.padEnd(w));
    if (!x.ok) console.log('           ' + JSON.stringify(x.detail));
  }
  const bad = R.filter(x => !x.ok).length;
  console.log('\n  ' + (R.length - bad) + '/' + R.length + ' verified' + (bad ? '   <-- ' + bad + ' NOT WORKING' : ''));
}, { settleMs: 8000 });
