// Does a level survive being saved and reopened?
//
// The strongest form of that question needs no knowledge of what any field means: serialize the level,
// restore it, serialize it AGAIN, and compare. `serialize -> restore -> serialize` must be idempotent. Any
// key that differs is data the creator authored and the engine quietly dropped or mangled on load.
//
// This repo has found exactly that three times by accident rather than by asking:
//   1162  duplicate spawned only src/transform/dynamic/material — signals, tags, locks, dialogue all lost
//   1280  a 1,326-character apply block existed in THREE loaders and could silently drift
//   1325  keyNames and pickupModels serialized but restoreLevel had no line for either, so the second
//         level you opened kept the first one's key names
//
// So: author a level that uses as much of the engine as one level can, and check the round trip. The
// CONTROL is a second restore of the same bytes — if S2 != S3 the level is not even stable under repeat,
// and any S1 != S2 finding would be noise rather than loss.
import { withGame } from './driver.mjs';

const out = [];
const P = (ok, what, detail) => { out.push({ ok, what, detail }); };

// A deep diff that reports PATHS, because "the level changed" is not actionable and "game.wavesText" is.
function diff(a, b, path = '', acc = [], depth = 0) {
  if (acc.length > 60 || depth > 12) return acc;
  if (a === b) return acc;
  const ta = a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a;
  const tb = b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b;
  if (ta !== tb) { acc.push(path + ': ' + ta + ' -> ' + tb); return acc; }
  if (ta === 'array') {
    if (a.length !== b.length) { acc.push(path + '.length: ' + a.length + ' -> ' + b.length); return acc; }
    for (let i = 0; i < a.length; i++) diff(a[i], b[i], path + '[' + i + ']', acc, depth + 1);
    return acc;
  }
  if (ta === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) { acc.push(path + '.' + k + ': MISSING BEFORE'); continue; }
      if (!(k in b)) { acc.push(path + '.' + k + ': DROPPED (' + JSON.stringify(a[k]).slice(0, 60) + ')'); continue; }
      diff(a[k], b[k], path + '.' + k, acc, depth + 1);
    }
    return acc;
  }
  if (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6) return acc;
  acc.push(path + ': ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b));
  return acc;
}

await withGame(async (probe, page) => {
  const settle = async (max = 60) => {
    for (let i = 0; i < max; i++) { if (!(await probe('_levelLoaderActive'))) return true; await page.waitForTimeout(400); }
    return false;
  };

  // ---- author a level that uses as much of the engine as one level can --------------------------------
  console.log('authoring: ' + JSON.stringify(await probe(`(function(){
    const R = {};
    /* props: tagged, signalled, materialled, physics, interactable, locked, foldered, named */
    let crate = null, door = null, sign = null;
    spawnProp('box',[20,0,20, 0,0.5,0, 2,2,2],(o)=>{crate=o;});
    spawnProp('box',[24,0,20, 0,0,0, 1,3,0.3],(o)=>{door=o;});
    spawnProp('sign',[28,0,20, 0,0,0, 4,2,1],(o)=>{sign=o;});
    crate.userData.tag='crate'; crate.userData.nm='Blue crate'; crate.userData.interact=1;
    crate.userData.hp=40; crate.userData.breakStyle='shatter'; crate.userData.explosive=1;
    crate.userData.phys=1; crate.userData.mass=8; crate.userData.bounce=0.4;
    crate.userData.hitSnd='https://example.org/wood.mp3';
    crate.userData.brkSnd='https://example.org/smash.mp3';
    crate.userData.signals=[{ when:'destroyed', do:'open', target:'door', once:1 }];
    door.userData.tag='door'; door.userData.xa={ kind:'slide', axis:'y', amt:3, dur:1.2 };
    door.userData.lock={ key:'redKey', n:1 };
    Object.assign(sign.userData.sign, { text:'BOOTH ONE\\nScore {score}', align:'center' });
    _signRender(sign);
    crate.userData.par = null;

    /* a shadow-casting point light (builds 1414/1417) */
    buildLight({ type:'point', color:0xffddaa, intensity:7, distance:18, shadow:true, tag:'lamp', t:[20,4,24] });

    /* Every zone type the editor offers. The live arrays are NOT named after the serialized keys
       (ZONE_TYPES says 'triggers'; the array is triggerZones), so these are read out of the source
       rather than guessed — the first draft guessed and died on a not-defined reference. */
    deathZones.push(_migrateDeathZone({ x:40, z:40, r:5, y:0, h:6 }));
    jumpPads.push(_migrateJumpPad({ x:42, z:40, r:3, y:0, power:14 }));
    fireZones.push(_migrateFireZone({ x:44, z:40, r:4, y:0, h:4, dps:6 }));
    waterZones.push(_migrateWaterZone({ x:46, z:40, r:6, y:0, h:3 }));
    fxZones.push(_migrateFxZone({ x:48, z:40, r:4, y:0, h:4, kind:'heal', amount:5, who:'players' }));
    ladders.push(_migrateLadder({ x:52, z:40, r:1.5, y:0, h:6 }));
    audioZones.push({ x:54, z:40, r:12, url:'https://example.org/hum.mp3', vol:0.6, loop:true });
    triggerZones.push(_migrateTrigger({ x:50, z:40, r:4, y:0, h:5, ev:'boothOne', who:'player', once:1 }));

    /* spawns, pickups, factions */
    buildSpawnMarker({ t:[60,60], mode:'patrol', radius:10, detect:18, face:1.2,
                       type:'gunner', wave:2, y:0, fac:2 });
    pickupSpots.push({ x:62, z:60, kind:'weapon', item:'shotgun', y:0.5, rx:0, ry:0.7, rz:0, scale:1.2, interact:1 });

    /* the graph: a node of several kinds, a list, variables, persistence */
    logicGraph.nodes = [
      { id:'n1', type:'event', x:0,   y:0,  p:{ ev:'boothOne' } },
      { id:'n2', type:'math',  x:200, y:0,  p:{ dst:'score', a:'score', op:'+', b:'10' } },
      { id:'n3', type:'list',  x:400, y:0,  p:{ list:'deck', op:'fill', n:'12' } },
      { id:'n4', type:'do',    x:600, y:0,  p:{ verb:'marker', mkmode:'show', at:'door', text:'THIS WAY' } },
      { id:'n5', type:'goto',  x:800, y:0,  p:{ n:'2', keep:1, at:'door' } }
    ];
    logicGraph.wires = [ { from:'n1', fo:'out', to:'n2', ti:'in' }, { from:'n2', fo:'out', to:'n3', ti:'in' } ];
    persistVars = ['score']; persistSave = true; persistInv = true; persistCp = true;

    /* HUD, weapons, enemies, waves, rules */
    hudWidgets = [
      { kind:'text', label:'Score {score}', ax:'tl', ox:12, oy:12, size:18, col:'#38f5b5' },
      { kind:'button', label:'BUY', ev:'buy', ax:'br', ox:20, oy:20, size:16, img:'https://example.org/card.png', iw:120, ih:80 }
    ];
    WEAPONS.rifle.name = 'Marksman'; WEAPONS.rifle.dmg = 15; WEAPONS.rifle.adsMs = 200;
    WEAPONS.smg.melee = true; WEAPONS.smg.reach = 3.2; WEAPONS.smg.name = 'Sword';
    gameCfg.enemyMods = { grunt:{ hp:120, dmg:9, spd:1.2 } };
    gameCfg.wavesText = '3x grunt, 2x runner @door\\n-\\n5x brute';
    gameCfg.waves = parseWaveManifest(gameCfg.wavesText);
    gameCfg.objective='puzzle'; gameCfg.goalText='Clear every booth'; gameCfg.view='chase';
    gameCfg.startWeapon='shotgun'; gameCfg.flashlight=true;
    keyNames = { redKey:'Red keycard' };
    pickupModels = { health:'https://example.org/medkit.glb' };
    animCuts = { 'https://example.org/char.glb': [ { name:'Swing', a:10, b:40 }, { name:'Rest', a:5, hold:1 } ] };
    worldCfg.skyCloud = 0.6; worldCfg.skyCloudScale = 1.8; worldCfg.ssr = 0.5; worldCfg.lodPx = 2;
    worldCfg.baked = true; worldCfg.dofAuto = true;

    /* a cutscene with an event on its shot (build 1196) */
    cineCfg.cutscenes = [ { name:'Intro', shots:[ { path:[[0,3,0],[10,3,0]], dur:3, ev:'boothOne', ease:'inout' } ] } ];

    R.props = propModels.length; R.lights = lightModels.length;
    R.nodes = logicGraph.nodes.length; R.widgets = hudWidgets.length;
    return R;
  })()`)));

  // ---- serialize -> restore -> serialize ---------------------------------------------------------------
  const S1 = JSON.parse(await probe('JSON.stringify(serializeLevel())'));
  await probe('(function(){ window.__S1 = JSON.parse(JSON.stringify(serializeLevel())); restoreLevel(window.__S1); return 1; })()');
  await settle();
  const S2 = JSON.parse(await probe('JSON.stringify(serializeLevel())'));

  // THE CONTROL: restore the SAME bytes again. If S2 != S3 the level is not stable under repeat and any
  // S1/S2 difference below would be noise rather than loss.
  await probe('(function(){ restoreLevel(JSON.parse(JSON.stringify(window.__S1))); return 1; })()');
  await settle();
  const S3 = JSON.parse(await probe('JSON.stringify(serializeLevel())'));

  const ctrl = diff(S2, S3);
  console.log('\n  CONTROL (restore the same bytes twice): ' + (ctrl.length ? ctrl.length + ' differences' : 'identical'));
  for (const d of ctrl.slice(0, 8)) console.log('      ' + d);
  P(ctrl.length === 0,
    'THE CONTROL: restoring the same level twice produces the same level — so a difference below is loss, ' +
    'not instability', ctrl.slice(0, 3).join(' | '));

  const lost = diff(S1, S2);
  console.log('\n  ROUND TRIP (author -> save -> load -> save): ' +
              (lost.length ? lost.length + ' differences' : 'identical'));
  for (const d of lost.slice(0, 40)) console.log('      ' + d);
  console.log('');

  P(lost.length === 0,
    'a level survives being saved and reopened byte for byte — every tag, signal, lock, zone, node, widget, ' +
    'weapon stat and world setting the creator authored comes back',
    lost.length ? lost.length + ' differences, first: ' + lost[0] : 'clean');

  // and the top-level shape is all there, so an empty S1 cannot pass vacuously
  const keys = Object.keys(S1).sort();
  console.log('  top-level keys serialized: ' + keys.length + '\n');
  P(keys.length > 20 && S1.props && S1.props.length >= 3,
    'and the fixture really is a full level, so the comparison is not vacuous',
    keys.length + ' keys, ' + (S1.props ? S1.props.length : 0) + ' props');

  // ---- and the real question: does any of it ACCUMULATE? ----------------------------------------------
  //
  // A one-time normalisation (true -> 1) is untidy and harmless. A value that moves a little further on
  // every save is a level that DEGRADES each time the creator presses Save — and this engine autosaves
  // every 20 seconds. The two are indistinguishable from a single round trip, which is why the diff above
  // cannot answer it and this loop can.
  const track = [];
  for (let i = 0; i < 8; i++) {
    await probe('(function(){ restoreLevel(JSON.parse(JSON.stringify(serializeLevel()))); return 1; })()');
    await settle();
    track.push(await probe(`(function(){
      const L = serializeLevel();
      /* the DOOR, not the crate: the crate is a dynamic physics body, so its rotation legitimately
         settles between serializes and reads exactly like format drift. The first run of this probe
         reported 3 control differences for that reason — the fixture was alive. */
      const p = (L.props || []).filter(function(x){ return x.tg === 'door'; })[0] || {};
      return { lightCol: (L.lights && L.lights[0]) ? L.lights[0].color : null,
               rx: p.t ? p.t[3] : null, ry: p.t ? p.t[4] : null, rz: p.t ? p.t[5] : null,
               sky: L.world ? L.world.skyCloud : null,
               floor: L.world ? L.world.floorColor : null };
    })()`));
  }
  console.log('  eight more save/load cycles:');
  for (let i = 0; i < track.length; i++) {
    const t = track[i];
    console.log('      ' + (i + 1) + '  light 0x' + (t.lightCol == null ? '?' : t.lightCol.toString(16)) +
                '   floor 0x' + (t.floor == null ? '?' : (+t.floor).toString(16)) +
                '   crate rot ' + [t.rx, t.ry, t.rz].map(v => (v == null ? '?' : (+v).toFixed(6))).join(' '));
  }
  console.log('');

  const first = track[0], last = track[track.length - 1];
  P(first.lightCol === last.lightCol,
    'a light\'s COLOUR does not move across eight more save/load cycles — a value that drifts a little each ' +
    'time is a level that degrades every time the creator presses Save, and this engine autosaves every 20s',
    '0x' + (first.lightCol || 0).toString(16) + ' -> 0x' + (last.lightCol || 0).toString(16));
  P(first.floor === last.floor, '...and neither does the world\'s floor colour',
    first.floor + ' -> ' + last.floor);
  const rotMoved = Math.max(Math.abs(last.rx - first.rx), Math.abs(last.ry - first.ry), Math.abs(last.rz - first.rz));
  P(rotMoved < 1e-6,
    '...and a prop\'s ROTATION holds, so a wall does not slowly turn across a build session',
    'worst axis moved ' + rotMoved.toExponential(2) + ' rad');

  // ---- and the path a creator hits before any of that: Alt-drag a light --------------------------------
  // `_lightOpts` -> `buildLight` is the same hex round trip the file makes, so a duplicated light took the
  // same one-way transform. This is the symptom that shows up in seconds rather than over a session.
  const dup = await probe(`(function(){
    const seq = [];
    let g = buildLight({ type:'point', color:0xffddaa, intensity:6, distance:16, t:[300,3,300] });
    seq.push(g.userData.light.color.getHexString());
    for(let i=0;i<5;i++){ g = buildLight(_lightOpts(g)); seq.push(g.userData.light.color.getHexString()); }
    for(const x of lightModels.slice()){ if(Math.abs(x.position.x-300)<1){ const i=lightModels.indexOf(x);
      if(i>=0) lightModels.splice(i,1); scene.remove(x); } }
    return seq;
  })()`);
  console.log('  five duplications of one lamp: ' + dup.join(' -> ') + '\n');
  P(dup.every(h => h === dup[0]),
    'and duplicating a light five times leaves its colour exactly where it was — the same round trip the ' +
    'file makes, hit in seconds rather than over a session',
    dup.join(' -> '));
}, { settleMs: 3000 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
