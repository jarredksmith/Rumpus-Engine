// build 1370: baked AO ships ON, and the scene probe follows the player (rendering audit #1, the
// cheap 60%). Two halves:
// 1. DEFAULT_WORLD.baked flips to true — the per-vertex sky-visibility bake (1195, indirect-only since
//    1286) was the engine's ONE occlusion-aware indirect term and it shipped off. The legacy story is a
//    DECISION, executed here: a level with no baked key inherits true (bounded crease shading in the
//    indirect terms — the 1149 precedent), while every level saved since 1195 carries an explicit
//    boolean (applyWorldCfg forces it, serializeLevel writes worldCfg whole) and keeps its look.
// 2. The env probe was captured at the SPAWN only, so reflections and the image-based ambient were
//    wrong everywhere else. _spFollowDue re-shoots from the player eye past a 40 u ring centred on the
//    LAST CAPTURE POINT, one per 5 s, never during the deploy shots' own +1.2s/+9s window — through
//    the ONE existing buildSceneProbe (1186's ACES-inverse/PMREM/sky-scale pipeline), never a fork.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. baked:true + the legacy story, EXECUTED
assert(/lut:'', lutAmt:1, baked:true,/.test(src),
  'DEFAULT_WORLD ships baked:true — the one occlusion-aware indirect term no longer ships off');
{
  const dw = src.match(/const DEFAULT_WORLD = \{[^\n]*\};/);
  assert(dw, 'the DEFAULT_WORLD literal parses from the source');
  const wf = new Function(dw[0] + '\n' + extractFunction('_worldFrom') + '\nreturn _worldFrom;')();
  eq(wf(null).baked, true, 'a fresh level bakes');
  eq(wf({ sun: 1.2 }).baked, true,
    'a LEGACY level (no baked key) INHERITS true — the documented decision: since 1286 the bake is indirect-only crease darkening, so this is the 1149 precedent, not a re-grade');
  eq(wf({ baked: false }).baked, false,
    'an explicit false is honoured — every level saved since 1195 carries the boolean and keeps its look byte-exactly');
  eq(wf({ baked: true }).baked, true, 'an explicit true is honoured');
  // the mechanism that BOUNDS the inheriting population to pre-1195 levels:
  assert(/worldCfg\.baked = !!worldCfg\.baked;/.test(src),
    'applyWorldCfg forces the boolean, so every save since 1195 wrote an explicit baked...');
  assert(/world:   Object\.assign\(\{\}, worldCfg\),/.test(src),
    '...because serializeLevel writes the whole worldCfg');
}

// ---------------------------------------------------------------- 2. the follow decision, on a fake clock
{
  const constsLine = src.match(/const SP_FOLLOW_DIST = [^\n]*;/);
  assert(constsLine, 'the follow constants are declared (beside the probe state, above every use)');
  const mk = (o) => new Function(
    constsLine[0] +
    '\nlet _spQueue=' + JSON.stringify(o.queue || []) +
    ', _spRT=' + (o.rt === false ? 'null' : '{}') +
    ', _spPos=' + (o.pos === null ? 'null' : JSON.stringify(o.pos || { x: 0, y: 1.7, z: 0 })) +
    ', _spAt=' + (o.at != null ? o.at : 0) + ';\n' +
    extractFunction('_spFollowDue') + '\nreturn _spFollowDue;')();
  const due = mk({});
  eq(due(30, 1.7, 0, 60000), false, '30 u from the capture point: no re-shoot');
  eq(due(39.9, 1.7, 0, 60000), false, '39.9 u: still inside the ring');
  eq(due(41, 1.7, 0, 60000), true, '41 u out: fires');
  eq(due(30, 31.7, 30, 60000), true, 'the distance is 3D — a player far ABOVE the capture point also re-shoots');
  eq(mk({ at: 56000 })(200, 1.7, 0, 60000), false, '4 s after the last capture: throttled — at most one re-shoot per 5 s window...');
  eq(mk({ at: 54999 })(200, 1.7, 0, 60000), true, '...and past the window it fires');
  eq(mk({ queue: [1200, 9000] })(200, 1.7, 0, 60000), false, "NEVER during the deploy probes' own +1.2s/+9s window — the queued shots own the capture");
  eq(mk({ rt: false })(200, 1.7, 0, 60000), false, 'no capture yet: the deploy shots own the first one');
  eq(mk({ pos: null })(200, 1.7, 0, 60000), false, 'no recorded capture point: nothing to measure from');
  eq(mk({ pos: { x: 100, y: 1.7, z: 0 } })(110, 1.7, 0, 60000), false,
    'the ring is centred on the LAST CAPTURE POINT, not on spawn — 10 u from a followed probe is quiet');
  eq(mk({ pos: { x: 100, y: 1.7, z: 0 } })(0, 1.7, 0, 60000), true,
    '...and walking the 100 u back toward spawn re-shoots from there');
}

// ---------------------------------------------------------------- 3. the wiring: _spTick drives the REAL pipeline
{
  const mk = (o) => { const calls = [];
    const tick = new Function('IS_COARSE', 'worldCfg', '_skyHdriUrl', 'performance', 'buildSceneProbe', 'player',
      src.match(/const SP_FOLLOW_DIST = [^\n]*;/)[0] +
      '\nlet _spQueue=' + JSON.stringify(o.queue || []) + ', _spRT=' + (o.rt === false ? 'null' : '{}') +
      ', _spPos=' + JSON.stringify(o.pos || { x: 0, y: 1.7, z: 0 }) +
      ', _skyKey=' + JSON.stringify(o.skyKey || 'a') + ', _spSkyKey=' + JSON.stringify(o.spKey || 'a') +
      ', _spAt=' + (o.at != null ? o.at : 0) + ';\n' +
      extractFunction('_spFollowDue') + '\n' + extractFunction('_spTick') + '\nreturn _spTick;'
    )(o.coarse || false, o.cfg || { skyMode: 'sky' }, o.hdri || null, { now: () => o.now }, (...a) => calls.push(a), o.player);
    return { tick, calls };
  };
  { const t = mk({ now: 60000, player: { pos: { x: 50, y: 1.7, z: 0 } } }); t.tick();
    eq(t.calls.length, 1, 'a player 50 u from the capture point re-shoots');
    eq(t.calls[0][0], 50, '...from the player x');
    near(t.calls[0][1], 1.7, 1e-9, '...at the player EYE (player.pos.y IS the eye — build 1251)');
    eq(t.calls[0][2], 0, '...and the player z'); }
  { const t = mk({ now: 60000, player: { pos: { x: 5, y: 1.7, z: 0 } } }); t.tick();
    eq(t.calls.length, 0, 'a player near the capture point costs nothing'); }
  { const t = mk({ now: 500, queue: [1200, 9000], player: { pos: { x: 500, y: 1.7, z: 0 } } }); t.tick();
    eq(t.calls.length, 0, 'during the deploy window nothing follow-fires — not even 500 u out'); }
  { const t = mk({ now: 60000, coarse: true, player: { pos: { x: 500, y: 1.7, z: 0 } } }); t.tick();
    eq(t.calls.length, 0, 'phones never follow — the IS_COARSE gate is intact'); }
  { const t = mk({ now: 60000, skyKey: 'b', spKey: 'a', player: { pos: { x: 500, y: 1.7, z: 0 } } }); t.tick();
    eq(t.calls.length, 1, 'a moved sky takes the rebuild branch...');
    eq(t.calls[0].length, 0, '...with NO explicit position — buildSceneProbe falls back to _spPos, re-capturing IN PLACE — and RETURNS, so one tick never fires two captures'); }
}

// ---------------------------------------------------------------- 4. one pipeline, no fork
{
  eq((src.match(/function buildSceneProbe\(/g) || []).length, 1,
    'exactly ONE buildSceneProbe — the follow trigger reuses the 1186 pipeline wholesale');
  eq((src.match(/const mat3 outInv/g) || []).length, 1, 'the ACES inverse exists once (no forked probe pass)');
  eq((src.match(/_spPM\.fromCubemap/g) || []).length, 1, 'one PMREM path');
  const bsp = src.slice(src.indexOf('function buildSceneProbe('), src.indexOf('function requestSceneProbe'));
  assert(/if\(px != null\)\{ _spCam\.position\.set\(\+px, \+py, \+pz\); \}/.test(bsp), 'an explicit position wins');
  assert(/else if\(_spPos\)\{ _spCam\.position\.set\(_spPos\.x, _spPos\.y, _spPos\.z\); \}/.test(bsp),
    'no position = refresh IN PLACE at the probe home — the day-cycle rebuild must not snap a followed probe back to spawn (capture-point thrash at six renders + a PMREM each)');
  assert(/gy \+ \(playerSpawn\.y\|\|0\) \+ 1\.7, playerSpawn\.z\);/.test(bsp),
    'the spawn-eye fallback for a fresh deploy is intact');
  assert(/typeof IS_COARSE!=='undefined' && IS_COARSE\) return false;/.test(bsp),
    'phones keep the sky-only probe (the builder IS_COARSE gate is intact)');
  assert(/_spPos\.x = _spCam\.position\.x; _spPos\.y = _spCam\.position\.y; _spPos\.z = _spCam\.position\.z;/.test(bsp),
    'every successful capture records its point — the follow ring is centred on the truth, whatever trigger shot it');
  assert(/_spQueue = \[n\+1200, n\+9000\]; _spPos = null;/.test(src),
    'a fresh deploy clears the home, so the +1.2s/+9s shots capture from the spawn again');
  assert(/buildSceneProbe\(player\.pos\.x, player\.pos\.y, player\.pos\.z\);/.test(extractFunction('_spTick')),
    'the follow branch passes the player eye to the one real builder');
}

done('build 1370: baked AO ships ON (legacy inherits — documented and executed: indirect-only crease shading, explicit false honoured, the inheriting population bounded by the 1195 boolean), and the scene probe follows the player — a 40 u ring centred on the last capture point, one re-shoot per 5 s, never during the deploy window, always through the one existing buildSceneProbe pipeline');
