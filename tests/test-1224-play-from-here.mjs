// build 1224: play-from-here + start-at-wave — the editor-UX critic's iteration-speed gap. A creator
// tuning wave 12 replayed waves 1-11 on every test run, and testing a rooftop meant walking there from
// the player start every time. The editor's play row gains "▶ From camera" and a wave field; both write
// _testStart, which startGame consumes EXACTLY ONCE, applies only in solo, and never serializes — a test
// convenience, not level data.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the pose capture, executed per camera mode
{
  const fn = extractFunction('_edTestPose');
  const run = (mode) => {
    const body =
      'const terrainHeightAt = (x,z)=> 3;\n' +
      'const EYE = 1.7;\n' +
      'const editorTopView = ' + (mode==='top') + ', editorFreeFly = ' + (mode==='fly') + ';\n' +
      'const topPanX = 10, topPanZ = -20;\n' +
      'const flyPos = { x: 5, y: 40, z: 8 };\n' +
      'const player = { pos:{ x: 1, y: 4.7, z: 2 }, yaw: 0.7, pitch: -0.3 };\n' +
      fn + '\nreturn _edTestPose();';
    return new Function(body)();
  };
  { const p = run('top');
    eq(p.pos.x, 10, 'top view: the pan point X');
    eq(p.pos.z, -20, '...and Z');
    eq(p.pos.y, 3 + 1.7, '...standing ON the ground there (terrain + EYE), never hundreds of metres up at the top camera');
    eq(p.pitch, 0, '...looking level, not straight down'); }
  { const p = run('fly');
    eq(p.pos.y, 40, 'fly mode: the fly camera itself, altitude included');
    eq(p.yaw, 0.7, '...with the look yaw (fly look reuses player.yaw)');
    eq(p.pitch, -0.3, '...and pitch'); }
  { const p = run('walk');
    eq(p.pos.x, 1, 'walk mode: where the avatar stands');
    eq(p.yaw, 0.7, '...facing where the creator faces'); }
}

// ---------------------------------------------------------------- startGame: consume-once, solo-only, ordered right
{
  const sg = extractFunction('startGame');
  assert(/const _ts = \(typeof _testStart!=='undefined' && _testStart && \(typeof NET==='undefined' \|\| NET\.mode==='off'\)\) \? _testStart : null; _testStart = null;/.test(sg),
    'startGame consumes _testStart exactly once, guarded to solo — and nulls it even when the guard fails, so a solo test pose can never leak into a later multiplayer deploy');
  assert(/if\(_ts && _ts\.wave > 1 && !pvpMode\(\)\) wave = Math\.min\(50, _ts\.wave\|0\);/.test(sg),
    'the wave override clamps to 50 (the manifest cap), skips pvp (no waves there)');
  // ORDER is the correctness: wave override BEFORE startWave() queues the first wave; pose override
  // AFTER both branches, because the pvp branch also writes player.pos and would silently discard it.
  const iWave = sg.indexOf('_ts.wave > 1'), iSW = sg.indexOf('startWave();'), iPos = sg.indexOf('if(_ts && _ts.pos)'), iHud = sg.indexOf('updateHUD(); updateBuffs(0);');
  assert(iWave > 0 && iSW > 0 && iPos > 0 && iHud > 0, 'all four landmarks present');
  assert(iWave < iSW, 'the wave override lands BEFORE startWave() queues the wave');
  assert(iPos > iSW && iPos < iHud, 'the pose override lands AFTER the branch that also writes player.pos, before the HUD refresh');
  assert(/player\.pos\.set\(_ts\.pos\.x, Math\.max\(_ts\.pos\.y, _gy \+ 0\.4\), _ts\.pos\.z\);/.test(sg),
    'the pose clamps above the terrain — a top-view pose can never spawn underground');
  assert(/player\.onGround = false; player\.vel\.set\(0,0,0\);/.test(sg),
    '...arriving airborne with zero velocity (a fly pose falls in cleanly)');
  assert(/const _introWillPlay = !_ts && \(typeof cineCfg/.test(sg),
    'a test run skips the authored intro flythrough — the creator is iterating, not watching');
}

// ---------------------------------------------------------------- the UI and its wiring
{
  assert(/<button id="edPlayHere"/.test(src) && /<input id="edPlayWave" type="number" min="1" max="50"/.test(src),
    'the editor panel carries the From-camera button and the 1..50 wave field');
  assert(/const _edTestWave = \(\)=>\{ const el=p\.querySelector\('#edPlayWave'\); return el \? Math\.max\(1, Math\.min\(50, \(\+el\.value\|0\)\|\|1\)\) : 1; \};/.test(src),
    'the wave field is clamped 1..50 at read time (a hostile/typo value cannot reach the game)');
  assert(/#edPlay'\)\.onclick = \(\)=>\{[^\n]*const _w=_edTestWave\(\); if\(_w>1\) _testStart=\{ wave:_w \};/.test(src),
    'the ordinary Play button honours the wave field too (wave 1 sets nothing — byte-identical old behaviour)');
  assert(/#edPlayHere'\)\.onclick = \(\)=>\{[^\n]*_testStart = _edTestPose\(\); _testStart\.wave = _edTestWave\(\);/.test(src),
    'From camera captures the pose at click time and carries the wave beside it');
  assert(/A\('Play from camera','test run here spawn from camera'/.test(src),
    'the command palette knows it');
}

// ---------------------------------------------------------------- never level data
{
  const ser = extractFunction('serializeLevel');
  assert(!/_testStart/.test(ser), 'serializeLevel never mentions the override — a test pose cannot enter a share code');
}

done('build 1224: play-from-here + start-at-wave — _edTestPose executed across all three editor camera modes (top view lands ON the ground at the pan point, fly keeps altitude and look, walk is the avatar), startGame consumes the override exactly once solo-only with the wave set before startWave and the pose after the pvp branch, the intro cine is skipped on test runs, the UI clamps 1..50, and none of it can serialize');
