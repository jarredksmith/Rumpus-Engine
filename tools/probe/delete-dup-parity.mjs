// Does Delete act on the thing a creator has selected?
//
// It covered props, lights and spawns. Duplicate covered those plus turrets. Neither covered the eight zone
// types or the pickup spots — so a creator selected a trigger volume they had just tuned, pressed Delete,
// and nothing happened.
//
// Driven through the REAL editor: switch the target the way the editor does, select, then call the same
// functions the key and the buttons call. Every row is a before/after count with the list named.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(30) + JSON.stringify(v));

await withGame(async (P) => {
  say('settled', await P(`(function(){
    if(!editorOpen) toggleEditor();
    return { build: BUILD_VERSION, editorOpen };
  })()`));

  /* One row per zone type, driven generically off the engine's OWN table — so a ninth type added later is
     covered here without editing this probe, which is the whole point of the table. */
  console.log('\n--- every zone type: add, duplicate, delete ------------------------------------------');
  say('per type', await P(`(function(){
    const out = {};
    for(const type in ZONE_EDIT){
      const d = ZONE_EDIT[type], list = d.list();
      editorActive = type;
      /* Add one the way a CREATOR does. The first run pushed a hand-made {x,z,r} and renderFxZonesPanel
         threw on a missing field — build 1429's rule: call the engine's own constructor rather than
         rebuilding its argument object. ZONE_ADDERS is that constructor for every type, so a ninth type
         is covered here without editing this probe. */
      d.add();
      d.pick(list.length - 1);
      const afterAdd = list.length;
      duplicateSelected();
      const afterDup = list.length;
      const dupX = list.length ? list[list.length-1].x : null;
      deleteSelected();
      const afterDel1 = list.length;
      deleteSelected();
      const afterDel2 = list.length;
      out[type] = { add: afterAdd, dup: afterDup, dupOffsetX: dupX, del: afterDel1, del2: afterDel2 };
    }
    return out;
  })()`));

  console.log('\n--- pickup spots --------------------------------------------------------------------');
  say('add / duplicate / delete', await P(`(function(){
    editorActive = 'pickups';
    addPickupSpot('health');
    const added = pickupSpots.length, sel0 = selPickup;
    duplicateSelected();
    const dup = pickupSpots.length, offset = pickupSpots[pickupSpots.length-1].x - pickupSpots[sel0].x;
    deleteSelected(); deleteSelected();
    return { added, afterDup: dup, dupOffsetX: +offset.toFixed(2), afterTwoDeletes: pickupSpots.length };
  })()`));

  console.log('\n--- turrets: duplicable but not deletable before this build --------------------------');
  say('add / duplicate / delete', await P(`(function(){
    editorActive = 'turrets';
    const n0 = turretModels.length;
    addSceneTurret();
    const n1 = turretModels.length;
    duplicateSelected();
    const n2 = turretModels.length;
    deleteSelected(); deleteSelected();
    return { before: n0, added: n1, afterDup: n2, afterTwoDeletes: turretModels.length };
  })()`));

  console.log('\n--- CONTROL: the verbs must not reach across targets ---------------------------------');
  say('a zone target leaves props alone', await P(`(function(){
    const props0 = propModels.length;
    editorActive = 'triggers';
    triggerZones.push({ x:0, z:0, r:4 }); selTrigger = triggerZones.length - 1;
    deleteSelected();
    return { propsBefore: props0, propsAfter: propModels.length, zonesLeft: triggerZones.length };
  })()`));

  say('an unknown target does nothing', await P(`(function(){
    const p = propModels.length, t = turretModels.length, z = triggerZones.length;
    editorActive = 'nosuchtarget';
    deleteSelected(); duplicateSelected();
    editorActive = 'props';
    return { props: propModels.length === p, turrets: turretModels.length === t, zones: triggerZones.length === z };
  })()`));

  console.log('\n--- and the audio zone stops its audio when removed ----------------------------------');
  say('removeAudioZone', await P(`(function(){
    let stopped = 0; const real = stopAudioZones;
    stopAudioZones = function(){ stopped++; return real.apply(this, arguments); };
    audioZones.push({ x:0, z:0, r:6, url:'' }); selAudioZone = audioZones.length - 1;
    const n0 = audioZones.length;
    editorActive = 'audiozones'; deleteSelected();
    stopAudioZones = real;
    return { before: n0, after: audioZones.length, stopCalled: stopped };
  })()`));
}, { settleMs: 5000 });

console.log('');
