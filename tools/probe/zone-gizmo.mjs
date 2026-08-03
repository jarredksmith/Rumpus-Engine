// build 1326 — reported: "For the player start, allow the gizmo y handle to move it for height placement.
// Make sure all placed zones are clickable and have gizmo handles to drag their x, y, z location."
//
// Drives the REAL applyGizmoDrag and the REAL click resolver.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('open editor:', JSON.stringify(await P(`(function(){ if(!editorOpen) toggleEditor(); return { editorOpen }; })()`)));
  await page.waitForTimeout(800);

  console.log('\n--- 1. PLAYER START: DOES THE Y HANDLE DO ANYTHING? ---');
  console.log(JSON.stringify(await P(`(function(){
    editorActive='pstart';
    playerSpawn.x=0; playerSpawn.z=0; playerSpawn.y=0;
    setSelPos(new THREE.Vector3(4, 6.5, -3));       /* the gizmo's own write-back */
    const m = playerSpawnMarker;
    return { x:playerSpawn.x, y:playerSpawn.y, z:playerSpawn.z,
             markerY: +m.position.y.toFixed(2),
             markerFollowed: Math.abs(m.position.y - 6.5) < 0.01 };
  })()`)));
  console.log('  (before this build the Y of the drag was discarded and the marker stayed on the floor)');
  console.log('clamped at the floor:', JSON.stringify(await P(`(function(){
    setSelPos(new THREE.Vector3(4, -50, -3));
    return { y: playerSpawn.y };
  })()`)));
  console.log('terrain-relative (build 1087 rule for enemy spawns):', JSON.stringify(await P(`(function(){
    const real = terrainHeightAt;
    try{ terrainHeightAt = ()=>10;
      setSelPos(new THREE.Vector3(0, 13, 0));
      return { storedY: playerSpawn.y, meaning: 'height ABOVE the ground, so it rides terrain edits' };
    } finally { terrainHeightAt = real; }
  })()`)));

  console.log('\n--- 2. EVERY ZONE TYPE: PLACED, CLICKABLE, DRAGGABLE IN X/Y/Z ---');
  console.log(JSON.stringify(await P(`(function(){
    const out = {};
    const add = { triggers:'addTriggerZone', audiozones:null, deathzones:'addDeathZone', jumppads:'addJumpPad',
                  ladders:'addLadder', firezones:'addFireZone', waterzones:'addWaterZone', fxzones:'addFxZone' };
    for(const type in ZONE_EDIT){
      const def = ZONE_EDIT[type];
      /* place one */
      if(type==='audiozones'){ audioZones.push({ x:0, z:0, r:14, url:'', vol:0.8, loop:true }); selAudioZone=audioZones.length-1; refreshAudioZoneMarkers(); }
      else { try{
        if(type==='triggers') addTriggerZone();
        else if(type==='deathzones') addDeathZone();
        else if(type==='jumppads') addJumpPad();
        else if(type==='ladders') addLadder();
        else if(type==='firezones') addFireZone();
        else if(type==='waterzones') addWaterZone();
        else if(type==='fxzones') addFxZone();
      }catch(e){ out[type]={ addFailed:String(e.message).slice(0,60) }; continue; } }
      const i = def.sel();
      const z = def.list()[i];
      /* CLICKABLE: does the real resolver find it from a marker's own child mesh? */
      const markers = def.markers() || [];
      const g = markers[i] || markers[markers.length-1];
      let hitFromChild = null;
      if(g){ const child = g.children[0] || g; const h = _zoneHitAt(child); hitFromChild = h ? h.type : null; }
      /* DRAGGABLE: drive the real write-back */
      editorActive = type; def.pick(i);
      setSelPos(new THREE.Vector3(7, 5, -9));
      out[type] = { placed: !!z, markerCount: markers.length,
                    clickResolvesTo: hitFromChild,
                    x: z ? z.x : null, y: z ? z.y : null, zz: z ? z.z : null };
    }
    return out;
  })()`), null, 1));
  console.log('  (clickResolvesTo must be the type itself — resolved from a CHILD mesh, which is what a');
  console.log('   raycast actually hits; x/y/zz must be 7 / 5 / -9 for every one of them)');

  console.log('\n--- 3. THE TABLE IS THE ONLY LIST ---');
  console.log(JSON.stringify(await P(`(function(){
    return { zoneEditTypes: Object.keys(ZONE_EDIT),
             pickerTypes: ZONE_TYPES.map(z=>z[0]),
             identical: JSON.stringify(Object.keys(ZONE_EDIT).sort()) === JSON.stringify(ZONE_TYPES.map(z=>z[0]).sort()) };
  })()`)));
}, { settleMs: 9000 });
