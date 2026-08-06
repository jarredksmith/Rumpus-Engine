// Does a DUPLICATED prop carry what the original was?
//
// `_pfEntryOf` / `_pfSpawnEntry` are the pair that duplicate, Alt-drag, the clipboard (1176), array (1225)
// and prefabs (1030) all route through — build 1162 unified them precisely because each had been dropping
// a different subset. Build 1280 then kept the SPAWN side deliberately separate from `_applyPropEntry`,
// because a copy strips identity (a fresh gid, no nid) and that difference is the feature.
//
// Two functions that differ on purpose is the right design and also exactly where drift hides, so this asks
// the only question that matters: author a prop with every field the serializer can write, copy it through
// the real pair, and diff the copy's own serialized entry against the original's. Anything that differs and
// is not identity is a field a creator loses on Ctrl+D.
import { withGame } from './driver.mjs';

await withGame(async (P) => {
  const r = await P(`(function(){
    paused = false; gameOn = true;
    const B = 44;

    /* removeProp takes an INDEX, not a prop — passing the object is a silent no-op that leaves the
       fixture in the world and in 'colliders' (see tools/probe/drive.mjs) */
    window.__kill = function(o){ if(!o) return false; const i = propModels.indexOf(o);
      if(i < 0) return false; removeProp(i); return true; };
    /* one prop, configured the way a creator would configure a finished object */
    let src = null;
    spawnProp('box',[B, 0, B, 0,0,0, 2,2,2],(b)=>{src=b;});
    if(!src) return { err:'no prop' };
    const u = src.userData;
    u.tag = 'plate';  u.name = 'Pressure plate';  u.folder = 'Traps';
    u.interact = true; u.noCol = false;
    u.npcName = 'Guard';  u.dialogue = ['halt', 'who goes there'];
    u.lockId = 'red';  u.lockConsume = true;  u.sigNeed = 2;
    u.attribution = 'by Someone (CC-BY)';
    u.edHide = true;  u.edLock = true;
    u.hitSnd = 'https://example.org/clank.mp3';
    u.signals = [
      { when:'contact', do:'command', ewho:'nearest', cmd:'hold', at:'post1' },
      { when:'damaged', do:'emit',    text:'HIT' },
      { when:'used',    do:'view',    vmode:'fixed', vtag:'cam1', vtrack:1 },
      { when:'used',    do:'spawn',   etype:'brute', n:'3', at:'gate' },
    ];
    if(typeof setPropDynamic==='function') setPropDynamic(src, true);
    u.mass = 7;  u.breakable = true;  u.maxHp = 55;  u.hp = 55;
    u.breakStyle = 'puff';  u.explosive = true;  u.blastRadius = 9;  u.blastDmg = 80;
    u.noGrab = true;  u.onFire = true;  u.fireDps = 9;
    u.shootable = true;

    const before = JSON.parse(JSON.stringify(propEntry(src)));

    /* through the real pair, exactly as duplicate does */
    const pivot = { x: src.position.x, y: src.position.y, z: src.position.z };
    const entry = _pfEntryOf(src, pivot);
    let copy = null;
    _pfSpawnEntry(entry, { x: B + 8, y: 0, z: B }, null, 'gCopy', (o)=>{ copy = o; });
    if(!copy) return { err:'the copy never spawned' };

    const after = JSON.parse(JSON.stringify(propEntry(copy)));

    /* IDENTITY is supposed to differ — that is build 1280's stated divergence, not a defect */
    const IDENTITY = new Set(['nid','gid','pf','t']);
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const lost = [], changed = [];
    for(const k of keys){
      if(IDENTITY.has(k)) continue;
      const a = JSON.stringify(before[k]), b = JSON.stringify(after[k]);
      if(a === b) continue;
      if(after[k] === undefined) lost.push(k + ' = ' + a);
      else changed.push(k + ': ' + a + ' -> ' + b);
    }

    const out = { beforeKeys: Object.keys(before).length, afterKeys: Object.keys(after).length,
                  lost, changed,
                  identity: { nid: before.nid !== after.nid, gid: after.gid,
                              posMoved: JSON.stringify(before.t) !== JSON.stringify(after.t) } };
    try{ __kill(src); __kill(copy); }catch(e){}
    return out;
  })()`);

  if (r.err) { console.log('  ' + r.err); return; }
  console.log('\n  PREFAB / DUPLICATE ROUND TRIP\n  ' + '='.repeat(70));
  console.log('  original entry: ' + r.beforeKeys + ' fields    copy: ' + r.afterKeys);
  console.log('  identity stripped as designed: fresh nid ' + r.identity.nid +
              ', gid ' + JSON.stringify(r.identity.gid) + ', moved ' + r.identity.posMoved);
  if (r.lost.length) { console.log('\n  LOST ENTIRELY'); for (const x of r.lost) console.log('    ' + x); }
  if (r.changed.length) { console.log('\n  CHANGED'); for (const x of r.changed) console.log('    ' + x); }
  const bad = r.lost.length + r.changed.length;
  console.log('\n  ' + (bad ? bad + ' field(s) do NOT survive a copy' : 'every field survives a copy'));
}, { settleMs: 8000 });
