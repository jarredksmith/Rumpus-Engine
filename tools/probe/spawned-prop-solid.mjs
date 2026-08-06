// Is a prop the GRAPH spawns mid-match solid?
//
// Found by the movement booth: the player walked straight through a ramp while `groundHeightAt` reported
// its surface climbing under them. The player's ground support comes from Rapier, and `finalizeProp` only
// schedules a physics body when the prop had a `gltf` — build 643's fix was written for a late-loading
// MODEL and a primitive has no gltf, so it never qualified.
//
// That matters because build 1216's `spawnprop` verb is exactly this path: "a tycoon's buy -> building
// appears, a wave-defense buildable turret". This drives the REAL verb through the REAL graph and then
// tries to stand on what it made.
import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

const R = [];
const chk = (name, ok, detail) => R.push({ name, ok: !!ok, detail });
const safe = async (P, code) => {
  try { return await P(code); }
  catch (e) { return { __threw: String(e.message || e).split('\n')[0].replace('page.evaluate: ', '') }; }
};

await withGame(async (P, page) => {
  await safe(P, `(function(){
    paused = false; gameOn = true; window.__B = 40;
    ${DRIVE_RIG}
    window.__allKeysOff = function(){ for(const k of Object.keys(keys)) delete keys[k]; };
    window.__stand = function(x, z, y){ __allKeysOff();
      player.pos.set(x, (y==null?1.7:y), z); player.vel.set(0,0,0);
      player.yaw = Math.PI; player.pitch = 0; player.onGround = true;
      sliding = false; slideT = 0; _ledge = null;
      camera.position.copy(player.pos); camera.updateMatrixWorld(true); };
    window.__feet = function(){ return +(player.pos.y - EYE).toFixed(2); };
    __wavesOff(); __clearEnemies();
    return 1;
  })()`);

  // ---------------------------------------------------------------- the control
  // A prop that was in the level when physics was built IS solid. Without this the null below could just
  // mean "the player never stands on anything in this probe".
  {
    const r = await safe(P, `(function(){
      let o = null; spawnProp('box',[__B, 0, __B, 0,0,0, 8,3,8],(b)=>{o=b;});
      if(o && typeof refreshPropCollider==='function') refreshPropCollider(o);
      if(typeof buildPhysWorld==='function') buildPhysWorld();      /* what DEPLOY does */
      __stand(__B, __B, 3 + EYE);
      __drive(45);
      const out = { body: !!(o && o.userData._physStatic), feet: __feet(), onGround: player.onGround };
      try{ removeProp(o); }catch(e){}
      if(typeof buildPhysWorld==='function') buildPhysWorld();
      return out;
    })()`);
    chk('control: a prop that was there at deploy holds the player up', r.body && r.feet > 2.5, r);
  }

  // ---------------------------------------------------------------- the real verb
  {
    const r = await safe(P, `(function(){
      /* a one-prop prefab: an 8x3x8 slab, exactly the control's shape */
      const slab = { src:'box', t:[0,0,0, 0,0,0, 8,3,8] };
      prefabLib['platform'] = { name:'platform', props:[slab] };

      /* a place to spawn it at */
      let pad = null; spawnProp('box',[__B, 0, __B, 0,0,0, 1,0.1,1],(b)=>{pad=b;});
      if(pad) pad.userData.tag = 'spot';
      if(typeof buildPhysWorld==='function') buildPhysWorld();

      const before = propModels.length;
      logicGraph.nodes = (logicGraph.nodes||[]).filter(n => n.id !== 'sp1');
      logicGraph.nodes.push({ id:'sp1', type:'do', x:0, y:0,
                              p:{ verb:'spawnprop', prefab:'platform', at:'spot' } });
      _lgBudget = 0; _lgPulse('sp1');
      const made = propModels.slice(before);

      const out = { spawned: made.length,
                    bodyAtSpawn: made.length ? !!made[0].userData._physStatic : null,
                    inColliders: made.length ? colliders.indexOf(made[0]) >= 0 : null };

      /* the debounce is a setTimeout, which real time drives — a synchronous frame drive never reaches
         it. This is the one place the probe must wait on the WALL clock rather than on frames. */
      out.bodyAfterFrames = null;

      logicGraph.nodes = logicGraph.nodes.filter(n => n.id !== 'sp1');
      window.__made = made; window.__pad = pad;   /* the wall-clock wait happens outside this call */
      return out;
    })()`);
    chk('the graph spawned the prefab at all (build 1216)', r.spawned === 1 && r.inColliders, r);

    /* THE DEBOUNCE RUNS ON THE WALL CLOCK — a synchronous frame drive never reaches it, which is why the
       first draft read "the body never arrives" after 180 driven frames with no time having passed at all.
       And this sandbox is the pathological case build 1409 bounded: its model loads never settle, so
       _glbPending sits at 4 and the tick takes the capped path (20 x 300 ms) rather than the 60 ms one a
       real browser with nothing loading would take. Measured landing at ~7 s here. */
    await page.waitForTimeout(8000);
    const after = await safe(P, `(function(){
      const made = (window.__made||[]);
      const out = { body: made.length ? !!made[0].userData._physStatic : null };
      __stand(__B, __B, 3 + EYE);
      __drive(45);
      out.feet = __feet();
      out.stoodOnIt = out.feet > 2.5;
      for(const o of made) try{ removeProp(o); }catch(e){}
      window.__made = [];
      try{ removeProp(window.__pad); }catch(e){}
      delete prefabLib['platform'];
      if(typeof buildPhysWorld==='function') buildPhysWorld();
      return out;
    })()`);
    chk('...and it has a physics body once the debounce fires', after.body === true, after);
    chk('...so the player can stand on the platform the graph just built', after.stoodOnIt, after);
  }

  await safe(P, `(function(){ __allKeysOff(); __clearEnemies(); __wavesOn(); __stand(0,0); __release(); return 1; })()`);

  const w = Math.max(...R.map(x => x.name.length));
  console.log('\n  A PROP SPAWNED MID-MATCH\n  ' + '='.repeat(w + 8));
  for (const x of R) {
    console.log('    ' + (x.ok ? 'ok  ' : 'FAIL') + '  ' + x.name.padEnd(w));
    if (!x.ok) console.log('           ' + JSON.stringify(x.detail));
  }
  const bad = R.filter(x => !x.ok).length;
  console.log('\n  ' + (R.length - bad) + '/' + R.length + ' verified' + (bad ? '   <-- ' + bad + ' NOT WORKING' : ''));
}, { settleMs: 9000 });
