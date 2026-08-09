// build 1401 — the KIT a level ships, applied by BOTH loaders.
//
// Build 1400 swept the `game` block's fields against its loaders. This is the same sweep one tier up: every
// TOP-LEVEL section of a serialized level, against `restoreLevel` AND `loadLevelFromNet` instead of against
// itself. Of the 62 sections, thirteen were wrong. Ten are one cluster — the KIT a level ships:
//
//   gun, aim, aimWep, invItems, station, stationEnabled, chest, coin   restored by the editor path,
//                                                                      read by NOTHING in the client path
//   mountWep, attModels                                                read at BOOT and by neither loader,
//                                                                      so they leaked between levels always
//
// So a co-op joiner played the level with the engine's defaults: the wrong gun in their hands, the engine's
// ADS pose, an ammo station the host did not have (or none where the host had one), an inventory catalog
// that did not contain the key the host had just given them, and default chest and coin meshes.
//
// The WEAPONS block is the other half, and it is why this is one build rather than two: setting the gun url
// on a client buys nothing while the client never drops its cached per-weapon meshes. The two copies of that
// block had drifted FOUR ways with a hole in each direction — including build 1240's authored weapon NAMES,
// which only the CLIENT applied, so a renamed weapon reverted to its factory name the moment you saved and
// reopened your own level.
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------------------- one applier, two callers ----
{
  eq((src.match(/function _applyLevelKit\(/g) || []).length, 1, 'the applier is written once');
  eq((src.match(/_applyLevelKit\(level\);/g) || []).length, 2,
    'and BOTH runtime loaders call it — which is the whole defect: for ten sections there was only ever one');

  const net = extractFunction('loadLevelFromNet'), res = extractFunction('restoreLevel');
  assert(/_applyLevelKit\(level\);/.test(net), 'the multiplayer loader calls it');
  assert(/_applyLevelKit\(level\);/.test(res), '...and so does the editor / share-link / undo loader');

  // the scattered copies are GONE from restoreLevel — a second copy is how a fix lands on one path only
  for (const [needle, what] of [
    [/if\(level\.gun\)\{/,        'the gun block'],
    [/if\(level\.aimWep\)\{/,     'the ADS poses'],
    [/setStationEnabled\(!\(level\.stationEnabled/, 'the station'],
    [/if\(level\.invItems/,       'the inventory catalog'],
    [/if\(level\.chest\)\{/,      'the chest'],
    [/if\(level\.coin\)\{/,       'the coin'],
    [/if\(level\.weapons/,        'the per-weapon block'],
  ]) assert(!needle.test(res), what + ' no longer has its own copy in restoreLevel');

  // ...and neither loader has its own weapons block any more
  assert(!/if\(level\.weapons/.test(net), 'nor does the multiplayer loader');
  eq((src.match(/if\(level\.weapons && typeof level\.weapons==='object'\)\{/g) || []).length, 1,
    'the per-weapon block exists exactly once — in the applier');

  // restoreLevel's own aim call stays where it has ALWAYS been, after the per-weapon block. That is what
  // makes this build's editor-path behaviour provably identical to before it, rather than merely similar.
  const kit = res.indexOf('_applyLevelKit(level);'), aim = res.indexOf('applyWeaponAim(curWep);');
  assert(kit >= 0 && aim > kit, 'the historic applyWeaponAim call still runs after the kit');
}

// --------------------------------------------------------- the applier, EXECUTED ----
// Driven in a constructed scope with the REAL sanitizers concatenated in, so what is tested is the shipped
// code rather than a description of it.
const KIT = extractFunction('_applyLevelKit');
const SAN = 'const SAN_KEY_MAX = ' + /SAN_KEY_MAX = (\d+)/.exec(src)[1] + ';\n' +
            extractFunction('_sanStr') + '\n' + extractFunction('_sanNum') + '\n' +
            extractFunction('_sanMountWep') + '\n' + extractFunction('_sanAttModels') + '\n';

function runKit(level, opts) {
  opts = opts || {};
  const log = [];
  const body = `
    ${SAN}
    let gunModelUrl='ENGINE_GUN', mountByWep={stale:{optic:{x:-9}}}, attModels={optic:'STALE'},
        invCatalog={staleKey:1}, stationModelUrl='ENGINE_STATION', stationEnabled=true,
        station=${opts.stationLive ? '{}' : 'null'},
        chestModelUrl='ENGINE_CHEST', chestModelScale=1, randomLootOn=true, curWep='rifle';
    const coinCfg={url:'ENGINE_COIN', scale:1, on:true};
    const AIM_DEFAULT={px:0,py:0,pz:0,fov:1};
    const aimByWep={rifle:{px:-9}};
    const GUN_BASE_DMG={rifle:12, shotgun:20};
    const WEAPONS={rifle:{name:'Rifle', model:'STALE_RIFLE', view:1, clips:{a:1}, noMuzzle:true},
                   shotgun:{name:'Shotgun', model:'STALE_SHOTGUN', view:1, clips:{a:1}, noMuzzle:true}};
    const gunModelByWep={rifle:'MESH'}, _gunLoading={rifle:true};
    const gun={ remove:(m)=>log.push('gun.remove:'+m) };
    const editorTargets={ gun:{state:{}, apply:()=>log.push('gun.apply'), syncFromWeapon:()=>log.push('gun.sync')},
                          aim:{state:{}, syncFromWeapon:()=>log.push('aim.sync')},
                          station:{state:{}, apply:()=>log.push('station.apply')} };
    const swapGunModel=(u)=>{ log.push('swapGun:'+u); gunModelUrl=u; };
    const swapStationModel=(u)=>{ log.push('swapStation:'+u); stationModelUrl=u; };
    const setStationEnabled=(on)=>{ log.push('setStation:'+on); stationEnabled=!!on; if(!on) station=null; };
    const _sanInvItems=(o)=>Object.assign({sanitized:1}, o);
    const _wepClipBlank=()=>({blank:1});
    const _wepApplyStats=(k,st)=>log.push('stats:'+k+':'+JSON.stringify(st||null));
    const _wepApplyName=(k,nm)=>{ log.push('name:'+k+':'+(nm==null?'null':nm)); WEAPONS[k].name = nm || ('FACTORY_'+k); };
    const showWeaponModel=(k)=>log.push('show:'+k);
    const applyWeaponAim=(k)=>log.push('aim:'+k);
    ${KIT}
    _applyLevelKit(L);
    return { gunModelUrl, mountByWep, attModels, invCatalog, stationModelUrl, stationEnabled, station,
             chestModelUrl, chestModelScale, randomLootOn, coin:Object.assign({},coinCfg),
             aimRifle:Object.assign({}, aimByWep.rifle||{}), gunState:Object.assign({}, editorTargets.gun.state),
             stationState:Object.assign({}, editorTargets.station.state),
             weapons:JSON.parse(JSON.stringify(WEAPONS)), cachedRifle:gunModelByWep.rifle,
             loading:_gunLoading.rifle };`;
  const out = new Function('L', 'log', body)(level, log);
  out.log = log;
  return out;
}

// ---- the ten sections that reached the client for the first time ----
{
  const r = runKit({
    gun: { url: 'LVL_GUN', state: { px: 0.77 } },
    aim: { state: { px: 0.5 } },
    aimWep: { rifle: { px: 0.123 } },
    mountWep: { rifle: { optic: { x: 0.11, s: 1.5 } } },
    attModels: { optic: 'LVL_SCOPE' },
    invItems: { kitKey: { name: 'Kit Key' } },
    station: { url: 'LVL_STATION', state: { s: 3.25 } },
    stationEnabled: false,
    chest: { url: 'LVL_CHEST', scale: 2.5, randomOff: true },
    coin: { url: 'LVL_COIN', scale: 4.5, on: false },
  });
  eq(r.gunModelUrl, 'LVL_GUN', 'the viewmodel gun arrives');
  eq(r.gunState.px, 0.77, '...with its framing');
  eq(r.aimRifle.px, 0.123, 'the per-weapon ADS pose arrives');
  eq(r.aimRifle.fov, 1, '...merged over AIM_DEFAULT, so a partial pose is still complete');
  eq(r.mountByWep.rifle.optic.x, 0.11, 'the attachment mounts arrive...');
  eq(r.mountByWep.stale, undefined, '...REPLACING the previous level\'s, which is the leak closing');
  eq(r.attModels.optic, 'LVL_SCOPE', 'the attachment models arrive...');
  eq(Object.keys(r.attModels).join(','), 'optic', '...and replace, for the same reason');
  eq(r.invCatalog.kitKey.name, 'Kit Key', 'the inventory catalog arrives');
  eq(r.invCatalog.staleKey, undefined, '...replacing the previous level\'s, or a host\'s `give` of a ' +
    'level-defined item lands on a client that has never heard of it');
  eq(r.stationEnabled, false, 'the station enable flag arrives');
  eq(r.chestModelUrl, 'LVL_CHEST', 'the chest model arrives');
  eq(r.chestModelScale, 2.5); eq(r.randomLootOn, false);
  eq(r.coin.url, 'LVL_COIN', 'the coin model arrives'); eq(r.coin.scale, 4.5); eq(r.coin.on, false);
  assert(r.log.includes('aim:rifle'), 'and the poses are made live before it returns');
}

// ---- the station config is DATA, live object or not ----
{
  // A level that ships a custom station DISABLED: `setStationEnabled(false)` tears the object down, and the
  // old line then required `station` to be live — so it silently kept the PREVIOUS level's model url, and
  // re-enabling it in the editor built the previous level's station. Measured on the editor path, which was
  // otherwise correct.
  const off = runKit({ station: { url: 'LVL_STATION', state: { s: 3.25 } }, stationEnabled: false });
  eq(off.stationModelUrl, 'LVL_STATION', 'the url lands even with no station object to load it into');
  eq(off.stationState.s, 3.25, '...and so does the framing');
  assert(!off.log.some(l => l.startsWith('swapStation')), '...without trying to load into nothing');

  const on = runKit({ station: { url: 'LVL_STATION' }, stationEnabled: true }, { stationLive: true });
  eq(on.stationModelUrl, 'LVL_STATION', 'a live station swaps its model...');
  assert(on.log.includes('swapStation:LVL_STATION'), '...through the real loader');
  assert(on.log.includes('station.apply'), '...and re-frames');

  // and the enable flag defaults ON, exactly as build 654 wrote it
  eq(runKit({}).stationEnabled, true, 'a level that says nothing keeps the station');
  eq(runKit({ stationEnabled: false }).stationEnabled, false, 'only an explicit false tears it down');
}

// ---- the weapons block: the union of two blocks that had drifted four ways ----
{
  const r = runKit({ weapons: { rifle: { model: 'LVL_RIFLE', view: 2, dmg: 15, nm: 'Kit Rifle' } } });
  eq(r.weapons.rifle.model, 'LVL_RIFLE', 'a mentioned weapon takes the level\'s model');
  eq(r.weapons.rifle.name, 'Kit Rifle',
    'and build 1240\'s authored NAME — which only the CLIENT applied, so a renamed weapon reverted to its ' +
    'factory name the moment you saved and reopened your own level');
  eq(r.weapons.shotgun.model, '',
    'a weapon the level does NOT mention resets — which only the editor path did, so a joiner kept the ' +
    'previous level\'s weapon models');
  eq(r.weapons.shotgun.view, null); eq(r.weapons.shotgun.clips, undefined);
  eq(r.weapons.shotgun.noMuzzle, false);
  eq(r.weapons.shotgun.name, 'FACTORY_shotgun', '...including its name');
  eq(r.weapons.shotgun.dmg, 20, '...and its factory damage');
  eq(r.cachedRifle, null,
    'the cached per-weapon MESH is dropped, or the url change buys nothing — which is exactly why the ' +
    'gun half of this build is incomplete without the weapon half');
  eq(r.loading, false, '...and its in-flight flag cleared, or the reload never fires');
  assert(r.log.includes('gun.sync') && r.log.includes('show:rifle'),
    'and the weapon is re-framed and re-shown, which a joiner never was');
  eq(r.weapons.rifle.clips, undefined, 'clips reset when the entry omits them (the editor path\'s rule — ' +
    'the client\'s only assigned them when present, so they leaked)');

  // a level with no weapons block at all changes nothing about them
  const none = runKit({});
  eq(none.weapons.rifle.model, 'STALE_RIFLE', 'no weapons block is a no-op, not a wipe');
  eq(none.cachedRifle, 'MESH', '...and the cache survives');
}

// ---- a null / empty level is a clean no-op ----
{
  eq(runKit(null).gunModelUrl, 'ENGINE_GUN', 'no level does nothing');
  const e = runKit({});
  eq(e.gunModelUrl, 'ENGINE_GUN'); eq(e.chestModelUrl, 'ENGINE_CHEST'); eq(e.coin.url, 'ENGINE_COIN');
  eq(Object.keys(e.mountByWep).length, 0,
    'the two sections with no prior reader ALWAYS assign, so an empty level RESETS them rather than ' +
    'inheriting — that is what stops their leak (build 1400\'s rule, applied where there is no history ' +
    'to preserve)');
  eq(Object.keys(e.attModels).length, 0);
}

// ------------------------------------------- the two new sanitizers, executed ----
// A level file is untrusted input (build 1325), and these two dictionaries reach a transform and a URL
// loader. They had no sanitizer at all — the boot line assigned the raw object straight through, which was
// only ever safe because no peer's level could reach them.
{
  const S = new Function(SAN + '\nreturn { m:_sanMountWep, a:_sanAttModels };')();
  const KEY_MAX = +/SAN_KEY_MAX = (\d+)/.exec(src)[1];

  eq(JSON.stringify(S.m(null)), '{}', 'a missing mount map is empty, never null');
  eq(JSON.stringify(S.m('nope')), '{}', '...and so is a non-object');
  const m = S.m({ rifle: { optic: { x: 1e9, y: 'x', z: -1e9, rx: 99999, s: 0 } } });
  eq(m.rifle.optic.x, 99, 'an absurd offset clamps');
  eq(m.rifle.optic.y, 0, 'a non-number is 0, never NaN (build 1169)');
  eq(m.rifle.optic.z, -99); eq(m.rifle.optic.rx, 360);
  eq(m.rifle.optic.s, 0.01, 'a zero scale clamps off zero — a 0-scale attachment is an invisible one');
  eq(S.m({ rifle: 'not-an-object' }).rifle, undefined,
    'a weapon whose slot map is junk is dropped rather than throwing — `getMount` fills a missing slot ' +
    'from _MOUNT_DEFAULT, so an absent entry is the safe answer and an empty one would be identical');
  {
    const big = {}; for (let i = 0; i < KEY_MAX + 40; i++) big['w' + i] = { optic: { x: 1 } };
    eq(Object.keys(S.m(big)).length, KEY_MAX, 'the weapon count is capped');
  }
  eq(Object.keys(S.m({ ['w'.repeat(200)]: { optic: {} } }))[0].length, 40, 'and key names are truncated');

  eq(JSON.stringify(S.a(null)), '{}', 'a missing attachment-model map is empty');
  eq(S.a({ optic: 'https://x/scope.glb' }).optic, 'https://x/scope.glb', 'a url survives');
  eq(S.a({ optic: '' }).optic, undefined, 'a blank url is dropped rather than stored as nothing');
  eq(S.a({ optic: 'u'.repeat(500) }).optic.length, 300, 'and a url is bounded');
  {
    const big = {}; for (let i = 0; i < KEY_MAX + 40; i++) big['a' + i] = 'u';
    eq(Object.keys(S.a(big)).length, KEY_MAX, 'the attachment count is capped');
  }
}

// ------------------------------------------- and the last three the sweep found ----
// With those in, the sweep finishes at ZERO: all 62 sections of a serialized level are read by both runtime
// loaders. These three are outside the kit because they are not weapon/economy config, but they are the same
// defect and were found by the same pass.
{
  const net = extractFunction('loadLevelFromNet'), res = extractFunction('restoreLevel');

  // the title screen and the lobby backdrop: the client read `level.homepage` ONLY to derive the persist
  // namespace (build 1215) and never applied it, so a joiner returning to the menu got the engine's.
  for (const [t, who] of [[net, 'the multiplayer loader'], [res, 'the editor loader']]) {
    assert(/homepageCfg = _sanitizeHomepage\(level\.homepage\);/.test(t), who + ' applies the title screen');
    assert(/lobbyBgUrl = \(typeof _sanitizeLobbyBg==='function'\)/.test(t), '...and the lobby backdrop');
  }
  // build 1454: this moved into _applyLevelSections, which both loaders reach — so what this always meant
  // ("the namespace derives from the level being loaded") is now true on both paths by construction.
  assert(/_persistLoad\(_persistNSFrom\(level\.homepage\)\)/.test(extractFunction('_applyLevelSections')),
    'build 1215\'s per-game persist namespace still derives from the level being loaded');

  // build 1165's format check: it never ran on the multiplayer path — the ONE path where a stale cached
  // client meets a newer level most often, since the host picks the build.
  eq((src.match(/!_levelFormatCheck\(level\)\.ok\) return;/g) || []).length, 2, 'both loaders check the format');
  const fi = net.indexOf('_levelFormatCheck'), ti = net.indexOf('removeProp(i)');
  assert(fi >= 0 && ti > fi,
    'and the client checks BEFORE its teardown — build 1165\'s own rule, that a refusal must cost nothing');
}

// Probed live (tools/probe/level-kit.mjs) through the REAL loaders, with the control that makes it mean
// something: every value is RESET to a distinctive "the joiner was in a different level" state first, so a
// value that arrives was applied and a value that still reads the reset was not. `keyNames` and `hudCfg` ride
// along as POSITIVE controls — sections the client loader demonstrably does read.
//
//   BEFORE, loadLevelFromNet   16 of 16 values still read the reset; both controls ARRIVED
//   AFTER,  loadLevelFromNet   16 of 16 ARRIVED
//   AFTER,  restoreLevel       16 of 16 ARRIVED (mountWep/attModels/station url were missing there too)
//   weapons                    name OLD -> Kit, an unmentioned weapon's model OLD -> '', the stale cached
//                              mesh dropped — identically on both paths
//
// Build 1400's first probe restored the same level and read the values back; everything came back and it
// proved nothing, because nothing had cleared them. The reset IS the measurement.
done('build 1401: thirteen level sections a co-op joiner never received, and one weapons block instead of two');
