// build 1411 — a sign a creator can read, and a scoreboard that updates.
//
// The engine could draw text in the world for damage numbers (build 1021-era) and player name tags, and
// nowhere else. A creator labelling a room, a booth or a door had to leave the engine, make an image,
// host it somewhere and import it as a textured plane — and could never show a NUMBER that changes.
//
// It is a PRIMITIVE, which is the whole reason this is small: the gizmo, snapping, duplication, the
// clipboard, prefabs, tags, serialization, undo, multiplayer prop sync, the outliner and the LOD all
// arrive for free. Build 1250 made exactly this argument for the ambient emitters.
//
// And it INTERPOLATES, which is the half no imported image can do.
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// --------------------------------------------------- the tables agree, in both directions ----
{
  assert(/\n  sign:buildSignProp \};/.test(src), 'the builder is in PRIMITIVE_BUILDERS');
  assert(/\['sign',\s*'Sign',/.test(src), '...and in PRIM_SHAPES, which is what feeds the + menu, the ' +
    'palette, the radial and the Object panel (build 1320 made those one table)');
  assert(/\n  sign:\s*_svgIcon\(/.test(src), '...and has an icon, which was the fifth copy 1320 unified');

  // The two tables it is deliberately NOT in. Each exclusion is a real behaviour, bought for nothing.
  const shapePrims = extractConst('SHAPE_PRIMS', src);
  assert(shapePrims && !/sign/.test(shapePrims),
    'a sign is NOT in SHAPE_PRIMS, so instancing excludes it with no code at all — every sign carries its ' +
    'own canvas texture and could never share a batch material (build 1139\'s _instKey lesson)');
  const matPrims = extractConst('MAT_PRIMS', src);
  assert(matPrims && !/sign/.test(matPrims),
    '...nor in MAT_PRIMS, so the colour/texture/glow panel does not fight the sign panel for the same ' +
    'material');
}

// ------------------------------------------------------------------ the sanitizer, executed ----
const DEF = JSON.parse(extractConst('SIGN_DEF', src).replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
const TEXT_MAX = +/const SIGN_TEXT_MAX = (\d+)/.exec(src)[1];
const LINES_MAX = +/SIGN_LINES_MAX = (\d+)/.exec(src)[1];

{
  const f = new Function(
    'const SIGN_DEF = ' + JSON.stringify(DEF) + ';\n' +
    'const SIGN_TEXT_MAX = ' + TEXT_MAX + ';\n' +
    "const SIGN_ALIGNS = ['left','center','right'];\n" +
    extractFunction('_signColor') + '\n' + extractFunction('_signCfgSan') + '\n' +
    'return { san:_signCfgSan, col:_signColor };')();

  // A level file is untrusted input (build 1325), and these two strings go into a canvas fillStyle.
  eq(f.col('#abc', '#fff'), '#abc', 'a short hex passes');
  eq(f.col('#AABBCC', '#fff'), '#AABBCC', '...and a long one');
  eq(f.col('red', '#fff'), '#fff',
    'a NAMED colour is refused — not because it would throw, but because canvas silently keeps the ' +
    'PREVIOUS fillStyle on a bad value, so one hostile string would paint the text in the board colour ' +
    'and the sign would read blank with nothing failing');
  eq(f.col('javascript:alert(1)', '#fff'), '#fff');
  eq(f.col('</style><script>', '#fff'), '#fff');
  eq(f.col('#12345', '#fff'), '#fff', 'and a five-digit hex is not a colour');
  eq(f.col(null, '#fff'), '#fff');
  eq(f.col({}, '#fff'), '#fff');

  const d = f.san({});
  eq(d.text, DEF.text, 'an empty config is the default sign');
  eq(d.align, 'center');

  const h = f.san({ text: 'x'.repeat(9999), size: 1e9, color: 'evil', bg: 'evil', bga: 99, align: 'evil' });
  eq(h.text.length, TEXT_MAX, 'a hostile text is capped');
  eq(h.size, 200, '...the size clamped');
  eq(h.color, DEF.color, '...both colours refused to the default');
  eq(h.bg, DEF.bg);
  eq(h.bga, 1, '...the board alpha clamped');
  eq(h.align, 'center', '...and an unknown alignment is not passed through to textAlign');

  eq(f.san({ size: -5 }).size, 8, 'a negative size floors rather than inverting the text');
  eq(f.san({ size: 'x' }).size, DEF.size, 'a non-numeric size falls back rather than becoming NaN');
  eq(f.san({ bga: 0 }).bga, 0,
    'and a board alpha of exactly 0 SURVIVES — it is "floating text with no board", a real thing to ' +
    'author, and the `||0` shape that would swallow it is build 1329\'s recorded trap');
  eq(f.san({ align: 'left' }).align, 'left');
  eq(f.san({ text: '' }).text, '', 'a deliberately blank sign stays blank rather than reverting to "Sign"');
}

// ------------------------------------------------------------ the canvas follows the SCALE ----
{
  const f = new Function(extractFunction('_signCanvasSize') + '\nreturn _signCanvasSize;')();
  const at = (sx, sy) => { const [W, H] = f({ scale: { x: sx, y: sy } }); return +(W / H).toFixed(2); };

  eq(at(2, 1), 2, 'a 2:1 board gets a 2:1 canvas, so the text is not stretched to fit it');
  eq(at(4, 2), 2, '...and the ratio is what matters, not the size');
  assert(at(1, 4) < 0.6, 'a tall banner gets a tall canvas');
  assert(at(8, 1) > 5, 'and a wide one a wide canvas');
  eq(at(-4, 2), 2, 'a mirrored prop reads its magnitude — a negative scale must not invert the canvas');
  eq(at(0, 0), f({ scale: { x: 1, y: 1 } })[0] / f({ scale: { x: 1, y: 1 } })[1],
    'a degenerate scale falls back rather than dividing by zero');

  // quantised, so nudging the gizmo does not reallocate a canvas every frame
  const a = f({ scale: { x: 2, y: 1 } }), b = f({ scale: { x: 2.005, y: 1 } });
  eq(a[1], b[1], 'the height is quantised to 64 px, so a sub-pixel gizmo nudge re-renders nothing');
  const wide = f({ scale: { x: 40, y: 1 } }), tall = f({ scale: { x: 1, y: 40 } });
  assert(wide[1] >= 128 && tall[1] <= 1536, 'and both extremes clamp to a canvas that can exist',
    wide[1] + ' / ' + tall[1]);
}

// -------------------------------------------------- interpolation is the HUD's, not the graph's ----
{
  // Build 1287 established that a HUD widget resolves `name@` through _hwVarKey (NET.myId) and NOT
  // through _lgVarKey (the event's pid), because it draws EVERY FRAME OUTSIDE ANY EVENT. A world sign
  // is the identical case — so it must be the identical function, or the HUD and the sign come to
  // different answers about the same text.
  const f = new Function('vars', 'myId',
    'const logicVars = vars;\n' +
    'const NET = { myId: myId };\n' +
    extractFunction('_hwVarKey') + '\n' + extractFunction('_hwInterp') + '\n' +
    'return _hwInterp;')({ score: 7, 'coins@3': 42, 'coins@9': 1, frac: 1.23456 }, 3);

  eq(f('Hits {score}'), 'Hits 7', 'a variable resolves');
  eq(f('{coins@}'), '42', 'and `name@` is THIS player\'s value (build 1231/1287), not the host\'s');
  eq(f('{frac}'), '1.23', '...rounded to 2 dp, exactly as the HUD rounds it');
  eq(f('{nothere}'), '0', 'an unset variable reads 0 rather than printing the literal braces');
  eq(f('plain text'), 'plain text', 'and text with no braces is returned untouched');
  eq(f(null), '', 'a null text is empty, never the string "null"');

  assert(/function _hwInterp\(/.test(src), '_hwInterp is a NAMED function...');
  const hw = extractFunction('_hwText');
  assert(/_hwInterp\(/.test(hw) && !/replace\(\/\\\{/.test(hw),
    '...and _hwText CALLS it rather than keeping its own copy of the regex — two implementations of one ' +
    'syntax is how the two drift (build 1402\'s rule, 1287\'s bug)');
  const rn = extractFunction('_signRender');
  assert(/_hwInterp\(/.test(rn), '...and so does the sign, so they can never disagree');
}

// ------------------------------------------------------------------- the render is idempotent ----
{
  const rn = extractFunction('_signRender');
  assert(/o\.userData\._signKey === /.test(rn) && /return;/.test(rn),
    'a render whose resolved text and geometry are unchanged returns immediately — which is what lets ' +
    'the tick below run over every sign in the level for nothing');
  assert(/o\.userData\._signKey = /.test(rn), '...and records the key it just drew');
  assert(/if\(!o\.material\.map\)\{/.test(rn),
    'the texture is created ONCE and then only marked dirty: a map->map swap on a live material would ' +
    'recompile nothing, but re-creating a CanvasTexture per repaint leaks one per frame');
  assert(/o\.material\.needsUpdate = true/.test(rn),
    '...with needsUpdate on the FIRST map only, so USE_MAP compiles once (the 1021 damage-number lesson)');
  assert(/dispose\(\)/.test(rn),
    'and a resized canvas disposes the texture it replaces — each sign owns its own, so nothing else ' +
    'can be holding it');
  assert(/x\.textAlign = c\.align/.test(rn) && !/x\.textAlign = ['"]/.test(rn),
    'the alignment comes from the sanitized value, never a literal');
}

// --------------------------------------------------------------------- the tick, executed ----
{
  const drawn = [];
  const f = new Function('props', 'drawn',
    'const propModels = props;\n' +
    'let _signTickN = 0;\n' +
    'function _signRender(o){ drawn.push(o.id); }\n' +
    extractFunction('_signTick') + '\n' +
    'return _signTick;')([
      { id: 'live', userData: { sign: { text: 'Hits {n}' } } },
      { id: 'static', userData: { sign: { text: 'RANGE' } } },
      { id: 'notasign', userData: {} },
      null,
      { id: 'live2', userData: { sign: { text: '{a} of {b}' } } },
    ], drawn);

  for (let i = 0; i < 14; i++) f();
  eq(drawn.length, 0, 'the tick is throttled — 14 frames of a 60 Hz loop do no work at all');
  f();
  eq(drawn.join(','), 'live,live2',
    'on the 15th it renders ONLY the signs whose text carries a brace: a static label is drawn once when ' +
    'it is authored and never touched again, however many of them a level has');
  for (let i = 0; i < 15; i++) f();
  eq(drawn.length, 4, '...and it keeps ticking at ~4 Hz, which is as exact as a sign needs to be');
  assert(!drawn.some(d => d === 'notasign'), 'a prop that is not a sign is never rendered');
}

// ------------------------------------------------------------------------- the round trip ----
{
  const ser = extractFunction('propEntry');
  assert(/if\(o\.userData\.sign\) e\.sgn=_signCfgSan\(o\.userData\.sign\);/.test(ser),
    'what a sign SAYS is the whole prop, so it serializes — sanitized on the way OUT as well as in, ' +
    'so nothing out of range can enter a share code (build 1336\'s rule)');

  // Build 1280 unified the three loaders into ONE apply site, and deliberately left _pfSpawnEntry as a
  // near-copy that strips identity. BOTH need the sign, or a duplicated board comes back blank — which
  // is build 1162's defect exactly.
  const app = extractFunction('_applyPropEntry');
  assert(/if\(p\.sgn && obj\.userData\.sign\)\{ obj\.userData\.sign=_signCfgSan\(p\.sgn\); if\(typeof _signRender==='function'\) _signRender\(obj\); \}/.test(app),
    'the ONE loader applies it and renders it immediately, so a loaded level never shows a blank board');
  const pf = extractFunction('_pfSpawnEntry');
  assert(/if\(p\.sgn && obj\.userData\.sign\)/.test(pf),
    '...and so does the prefab/duplicate/paste/array spawner, which build 1280 keeps separate on purpose');

  eq((src.match(/if\(p\.sgn && obj\.userData\.sign\)/g) || []).length, 2,
    'and exactly those two — a third copy of the apply is how this file\'s most repeated defect starts');
}

// --------------------------------------------------------------------------- the wiring ----
{
  assert(/if\(typeof _signTick==='function'\) _signTick\(\);/.test(src), 'the tick runs in the frame loop');
  const b = extractFunction('buildSignProp');
  assert(/geo\.translate\(0, 0\.5, 0\)/.test(b),
    'the board\'s BASE sits at the prop origin, like every primitive since build 871');
  assert(/MeshBasicMaterial/.test(b),
    'unlit: a label has to be readable in an unlit corner, and it also keeps the sign out of every shader ' +
    'patch (1139/1384/1388) that assumes a Standard material');
  assert(/side:THREE\.DoubleSide/.test(b),
    'and double-sided, so a sign can never be invisible from one side — the "nothing happened" failure');
  assert(/m\.userData\.noCol = true;/.test(b),
    'a LABEL does not stop bullets or make enemies path around it. Build 1324\'s flag is exactly this ' +
    'control, and a creator who wants a solid board unticks it');
  // A pin must not be DEFEATABLE by prose either: the builder's own comment explains that it leaves the
  // raycast alone, and a bare-name check matched that comment. Assert the absence of an ASSIGNMENT.
  // (Builds 164, 1393 and 1395 record the same trap from the other direction.)
  assert(!/\braycast\s*=/.test(b),
    '...and the builder does NOT stamp the raycast itself: refreshPropCollider owns that, so unticking ' +
    'the box gives the board its hits back from the same one writer');

  const panel = src.slice(src.indexOf('if(tagObj.userData.sign){'));
  assert(panel.indexOf('ta.oninput') > 0 && panel.indexOf('ta.oninput') < 4000,
    'the text field is `oninput`, not `onchange`: the panel is torn down and rebuilt constantly (1322) ' +
    'and a creator typing a sign wants to watch the board fill in');
  assert(/_selApply\(o=>\{ if\(o\.userData\.sign\)\{ o\.userData\.sign\.text=/.test(src),
    '...and it is GROUP-WIDE through _selApply (build 1299), because thirty booth signs reading the same ' +
    'thing is a real authoring move and the fold\'s banner says which rule it follows');
}

// ------------------------------------------- the boot path, which this build very nearly broke ----
// `loadHostedProps()` is called bare at module level and builds the SAVED LEVEL's props during boot
// (build 1331's whole subject). A saved sign is applied there, rendered there, and therefore resolves
// its variables there — through `_hwVarKey`, which reads `NET`. `const NET` is declared ~5,700 lines
// BELOW that call, and `typeof` does NOT guard a temporal dead zone: it THROWS for an uninitialised
// `const`. So a saved level containing one live sign stopped the game booting at all, and the whole
// Node suite passed (1149/1149) because none of it evaluates a saved level with a sign in it.
// Reproduced live in tools/probe/sign-boot-tdz.mjs, which is the durable version.
{
  const k = extractFunction('_hwVarKey');
  assert(/try\{/.test(k) && /catch\(e\)\{\}/.test(k),
    '_hwVarKey reads NET inside a try/catch, because a try/catch is what actually guards a temporal dead ' +
    'zone — `typeof` throws for an uninitialised const (builds 1127, 1331, 1350, 1383, and this one)');
  assert(/let id = 0;/.test(k), '...and it falls back to player 0, which is what a solo boot means anyway');

  // The ordering that makes it necessary, asserted so a future move of either end is visible.
  const iNet = src.indexOf('const NET = {'), iLoad = src.indexOf('\nloadHostedProps();');
  assert(iNet > 0 && iLoad > 0, 'both landmarks exist');
  assert(iNet > iLoad,
    'NET really is declared AFTER the boot-time loadHostedProps() call — this test is guarding a live ' +
    'ordering, not a hypothetical one');

  // Executed: the guard survives the TDZ that broke it.
  const f = new Function(
    "let out = null;\n" +
    "function go(){ " + extractFunction('_hwVarKey') + " out = _hwVarKey('coins@'); }\n" +
    "go();\n" +
    "const NET = { myId: 3 };\n" +
    "return out;")();
  eq(f, 'coins@0',
    'and driving it INSIDE the dead zone returns a usable key instead of throwing — the pre-fix form ' +
    'threw here, which is exactly what a saved level with a live sign did to the boot');
}

done('build 1411: a readable sign in the world, and a live scoreboard on it');
