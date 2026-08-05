// build 1401 — the sweep that build 1400 started, one tier up: every TOP-LEVEL section of a serialized
// level, checked against BOTH runtime loaders instead of against itself.
//
// Eight of them are restored by `restoreLevel` and by NOTHING in `loadLevelFromNet`, so a co-op joiner
// plays the level with the engine's defaults; two more (`mountWep`, `attModels`) are read at BOOT and by
// neither loader, so they leak between levels on every path.
//
// THE CONTROL IS THE WHOLE MEASUREMENT. Build 1400's first probe restored the same level and read the
// values back — everything came back, and it proved nothing, because nothing had cleared them. So this
// probe RESETS every value to a distinctive "previous level" state before running the loader: a value that
// arrives was applied, a value that still reads the reset was not. And `hudCfg`/`keyNames` ride along as
// POSITIVE controls — sections the net loader demonstrably does read, which must arrive in both runs.
import { withGame } from './driver.mjs';

const AUTHOR = `(function(){
  /* author a level with values nothing else in the engine would produce */
  gunModelUrl = 'https://example.test/kit-gun.glb';
  editorTargets.gun.state.px = 0.777;
  aimByWep.rifle = Object.assign({}, AIM_DEFAULT, { px: 0.123, py: 0.456 });
  editorTargets.aim.state.px = 0.321;
  mountByWep.rifle = { optic: { x: 0.11, y: 0.22, z: 0.33, s: 1.5 } };
  attModels.optic = 'https://example.test/kit-scope.glb';
  invCatalog.kitKey = { name: 'Kit Key', type: 'key', desc: 'authored by the level' };
  stationEnabled = false;
  stationModelUrl = 'https://example.test/kit-station.glb';
  editorTargets.station.state.s = 3.25;
  chestModelUrl = 'https://example.test/kit-chest.glb'; chestModelScale = 2.5; randomLootOn = false;
  coinCfg.url = 'https://example.test/kit-coin.glb'; coinCfg.scale = 4.5; coinCfg.on = false;
  /* the positive controls — sections the net loader already reads */
  keyNames.red = 'Authored Red';
  hudCfg.health = '#abcdef';
  return 'authored';
})()`;

// the "joiner was already in a DIFFERENT level" state — every one of these must be overwritten by the load
const RESET = `(function(){
  gunModelUrl = 'https://example.test/OLD-gun.glb';
  editorTargets.gun.state.px = -9;
  aimByWep.rifle = Object.assign({}, AIM_DEFAULT, { px: -9, py: -9 });
  editorTargets.aim.state.px = -9;
  mountByWep = { rifle: { optic: { x: -9, y: -9, z: -9, s: -9 } } };
  attModels = { optic: 'https://example.test/OLD-scope.glb' };
  invCatalog = { oldKey: { name: 'Old Key', type: 'key' } };
  stationEnabled = true;
  stationModelUrl = 'https://example.test/OLD-station.glb';
  editorTargets.station.state.s = -9;
  chestModelUrl = 'https://example.test/OLD-chest.glb'; chestModelScale = -9; randomLootOn = true;
  coinCfg.url = 'https://example.test/OLD-coin.glb'; coinCfg.scale = -9; coinCfg.on = true;
  keyNames.red = 'OLD Red';
  hudCfg.health = '#000000';
  return 'reset';
})()`;

const READ = `(function(){
  return {
    gunUrl:     gunModelUrl,
    gunPx:      editorTargets.gun.state.px,
    aimPx:      (aimByWep.rifle||{}).px,
    aimStatePx: editorTargets.aim.state.px,
    mountX:     ((mountByWep.rifle||{}).optic||{}).x,
    attOptic:   attModels.optic,
    invKeys:    Object.keys(invCatalog||{}).join(','),
    stationOn:  stationEnabled,
    stationUrl: stationModelUrl,
    stationS:   editorTargets.station.state.s,
    chestUrl:   chestModelUrl, chestScale: chestModelScale, randomLoot: randomLootOn,
    coinUrl:    coinCfg.url, coinScale: coinCfg.scale, coinOn: coinCfg.on,
    CONTROL_keyRed: keyNames.red,
    CONTROL_hud:    hudCfg.health
  };
})()`;

await withGame(async (P, page) => {
  console.log('author:', await P(AUTHOR));

  // serialize the authored level, then wipe every one of those values back to a "previous level" state
  console.log('serialize + reset:', await P(`(function(){
    window.__kitLevel = JSON.parse(JSON.stringify(serializeLevel()));
    return { hasGun: !!__kitLevel.gun, hasMount: !!__kitLevel.mountWep, hasAtt: !!__kitLevel.attModels,
             hasInv: !!__kitLevel.invItems, hasStation: !!__kitLevel.station,
             stationEnabled: __kitLevel.stationEnabled, hasChest: !!__kitLevel.chest, hasCoin: !!__kitLevel.coin };
  })()`));
  await P(RESET);

  console.log('\nafter RESET (the joiner\'s previous level):');
  const before = await P(READ);
  for (const k of Object.keys(before)) console.log('   ' + k.padEnd(16), JSON.stringify(before[k]));

  // ---- THE CLIENT PATH ----------------------------------------------------------------------------
  console.log('\nrun loadLevelFromNet — the joiner receiving the host\'s level:');
  console.log('  ', await P(`(function(){ loadLevelFromNet(__kitLevel); return 'loaded'; })()`));
  await page.waitForTimeout(1500);
  const after = await P(READ);
  for (const k of Object.keys(after)) {
    const moved = JSON.stringify(before[k]) !== JSON.stringify(after[k]);
    console.log('   ' + k.padEnd(16), (moved ? 'ARRIVED  ' : 'not read ') + JSON.stringify(after[k]));
  }

  // ---- and the editor path, which had eight of the ten, as the second control ---------------------
  console.log('\nreset again, then restoreLevel — the path that already read most of this:');
  await P(RESET);
  await P(`(function(){ restoreLevel(JSON.parse(JSON.stringify(__kitLevel))); return 'restored'; })()`);
  await page.waitForTimeout(1500);
  const res = await P(READ);
  for (const k of Object.keys(res)) {
    const moved = JSON.stringify(before[k]) !== JSON.stringify(res[k]);
    console.log('   ' + k.padEnd(16), (moved ? 'ARRIVED  ' : 'not read ') + JSON.stringify(res[k]));
  }

  // ================================================================================================
  // The WEAPONS block, which had drifted four ways between the two loaders with a hole in each
  // direction. Each row names the loader that used to be wrong.
  console.log('\nweapons — the four drifts:');
  console.log('  ', await P(`(function(){
    /* author: a renamed rifle with a custom model, and a shotgun the NEXT level will not mention */
    _wepApplyName('rifle', 'Kit Rifle');
    WEAPONS.rifle.model = 'https://example.test/kit-rifle.glb';
    WEAPONS.shotgun.model = 'https://example.test/kit-shotgun.glb';
    const lv = JSON.parse(JSON.stringify(serializeLevel()));
    delete lv.weapons.shotgun;                       /* the level does not mention it */
    /* pretend a previous level had left a cached mesh and different names behind */
    const stale = new THREE.Object3D(); gun.add(stale); gunModelByWep.rifle = stale;
    _wepApplyName('rifle', 'OLD Rifle'); WEAPONS.shotgun.model = 'https://example.test/OLD-shotgun.glb';
    const seen = () => ({ rifleName: WEAPONS.rifle.name, rifleModel: WEAPONS.rifle.model,
                          shotgunModel: WEAPONS.shotgun.model,
                          cachedRifleMesh: gunModelByWep.rifle === stale });
    const beforeW = seen();
    loadLevelFromNet(lv);
    const netW = seen();
    /* and the editor path, from the same stale state */
    gun.add(stale); gunModelByWep.rifle = stale;
    _wepApplyName('rifle', 'OLD Rifle'); WEAPONS.shotgun.model = 'https://example.test/OLD-shotgun.glb';
    restoreLevel(JSON.parse(JSON.stringify(lv)));
    const resW = seen();
    return { stale: beforeW, afterNet: netW, afterRestore: resW };
  })()`));

  // ================================================================================================
  // The last three the sweep found, which finish it at zero: the title screen, the lobby backdrop and
  // build 1165's format check, none of which the client path ran.
  console.log('\ntitle screen + lobby backdrop + the format check, on the CLIENT path:');
  console.log('  ', await P(`(function(){
    homepageCfg = { on:true, title:'Kit Game' }; lobbyBgUrl = 'https://example.test/kit-lobby.jpg';
    const lv = JSON.parse(JSON.stringify(serializeLevel()));
    homepageCfg = { on:true, title:'OLD Game' }; lobbyBgUrl = 'https://example.test/OLD-lobby.jpg';
    const before = { title: homepageCfg.title, bg: lobbyBgUrl };
    loadLevelFromNet(lv);
    const after = { title: homepageCfg.title, bg: lobbyBgUrl };
    /* and a level from a NEWER engine must be refused rather than half-applied */
    const tooNew = JSON.parse(JSON.stringify(lv)); tooNew.minV = LEVEL_FORMAT_V + 5;
    const propsBefore = propModels.length;
    loadLevelFromNet(tooNew);
    return { before, after, refusedNewer: propModels.length === propsBefore, propsBefore };
  })()`));
}, { settleMs: 9000 });
