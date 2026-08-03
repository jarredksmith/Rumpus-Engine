// Reported from play: "in a multiplayer match, the joiner sees the pickups, but they flash. They don't
// flash on the host."
//
// Flashing that is per-frame and camera-dependent is almost always Z-FIGHTING — two coincident surfaces.
// So the question is not "what toggles visible" but "how many things are standing at that spot on a client
// that are not standing there on the host". This enumerates the scene rather than theorising.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('--- HOST: what exists at a pickup spot ---');
  console.log(JSON.stringify(await P(`(function(){
    NET.mode='off';
    pickupSpots.length = 0;
    pickupSpots.push({ x:12, z:8, kind:'health', y:1.5, ry:45, scale:1.4 });   /* an AUTHORED pickup */
    pickupsOn = true;
    refreshPickupMarkers();
    spawnPowerups();
    const at = [];
    scene.traverse(o=>{
      if(o===scene) return;
      const d = Math.hypot(o.position.x-12, o.position.z-8);
      if(d < 0.5 && o.parent===scene) at.push({ type:o.type, y:+o.position.y.toFixed(3), visible:o.visible,
        marker: !!(o.userData&&o.userData.pickupMarker), kids:o.children.length });
    });
    return { powerups: powerups.length, netMeshes: Object.keys(NET.powerupMeshes||{}).length, atTheSpot: at };
  })()`), null, 1));

  console.log('\n--- CLIENT: the same spot, after the host snapshot arrives ---');
  console.log(JSON.stringify(await P(`(function(){
    /* become a client the way a joiner does: local pads are NOT spawned, the snapshot supplies them */
    NET.mode='client'; NET.myId='2';
    spawnPowerups();                       /* returns early for a client, and CLEARS the local list */
    /* the host's snapshot for the same pad */
    /* the payload the host would now send for that authored pad */
    const msg = { dl:0, P:[], E:[], C:[], PU:[{ id:1, p:[12,8], k:'health', r:1, y:1.5, rr:[0,45,0], sc:1.4 }] };
    applyWorld(msg);
    const at = [];
    scene.traverse(o=>{
      if(o===scene) return;
      const d = Math.hypot(o.position.x-12, o.position.z-8);
      if(d < 0.5 && o.parent===scene) at.push({ type:o.type, y:+o.position.y.toFixed(3), visible:o.visible,
        marker: !!(o.userData&&o.userData.pickupMarker), kids:o.children.length });
    });
    return { powerups: powerups.length, netMeshes: Object.keys(NET.powerupMeshes||{}).length, atTheSpot: at };
  })()`), null, 1));

  console.log('\n--- THE ICON: does anything animate it on a client? ---');
  console.log(JSON.stringify(await P(`(function(){
    const m = NET.powerupMeshes[1];
    if(!m) return { noMesh:true };
    const ic = m.userData.icon;
    const y0 = ic ? +ic.position.y.toFixed(4) : null;
    const r0 = ic ? +ic.rotation.y.toFixed(4) : null;
    updatePowerups(0.016);                 /* the host's per-frame pickup update */
    const y1 = ic ? +ic.position.y.toFixed(4) : null;
    const r1 = ic ? +ic.rotation.y.toFixed(4) : null;
    return { hasIcon: !!ic, iconY: y0, iconYAfterUpdate: y1, spinBefore: r0, spinAfter: r1,
             moved: y0!==y1 || r0!==r1, localPowerupsDrivingIt: powerups.length };
  })()`)));
  console.log('  (on the host updatePowerups calls _animatePickup every frame; on a client the local');
  console.log('   powerups list is empty, so it early-returns and the snapshot meshes are never animated)');

  console.log('\n--- AND THE GROUND: where does each path put the group? ---');
  console.log(JSON.stringify(await P(`(function(){
    const real = terrainHeightAt;
    try{
      terrainHeightAt = (x,z)=> 3;              /* a raised plateau under the pad */
      NET.mode='off'; spawnPowerups();
      const hm = powerups[0].mesh;
      const hostPose = { y:+hm.position.y.toFixed(3), ry:+hm.rotation.y.toFixed(3), sc:+hm.scale.x.toFixed(3) };
      /* what the host would put on the wire for it */
      const sp = powerups[0].spot;
      const wire = { id:1, p:[12,8], k:'health', r:1 };
      if(sp.y) wire.y=sp.y;
      if(sp.rx||sp.ry||sp.rz) wire.rr=[sp.rx||0, sp.ry||0, sp.rz||0];
      if(sp.scale!=null && Math.abs(sp.scale-1)>1e-3) wire.sc=sp.scale;
      NET.mode='client'; spawnPowerups(); NET.powerupMeshes={};
      applyWorld({ dl:0, P:[], E:[], C:[], PU:[wire] });
      const cm = NET.powerupMeshes[1];
      const clientPose = { y:+cm.position.y.toFixed(3), ry:+cm.rotation.y.toFixed(3), sc:+cm.scale.x.toFixed(3) };
      return { terrain:3, wire, hostPose, clientPose,
               identical: JSON.stringify(hostPose)===JSON.stringify(clientPose) };
    } finally { terrainHeightAt = real; NET.mode='off'; }
  })()`)));
}, { settleMs: 9000 });
