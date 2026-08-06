// build 1412 — an objective marker.
//
// A level made of separate places — a fair with five booths, a hub with four doors, an objective across
// the map — could TELL the player where to go (objective text, a toast, a sign at the door since build
// 1411) and could not POINT. The only marker in the engine was `mapWaypoint`, which a PLAYER drops on
// their own map; a creator had nothing.
//
// Two defects were found by the LIVE probe and could not have been found here, and both are pinned below:
// the signal router's verb list (build 1277's defect, committed again) and a null read that took the
// frame loop down on the second frame after a marked prop was destroyed.
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------------------------ it is REACHABLE ----
// Build 1277 found six verbs that shipped in the dropdown and never reached a handler, because the
// signal router gates on a hand-kept list. This build committed that defect and the probe caught it.
{
  assert(/\|\|s\.do==='view'\|\|s\.do==='marker'\)\{/.test(src),
    'the signal router forwards `marker` to the world handler — build 1277: the WIRE, not the ends. ' +
    'Without this the verb is in the dropdown, in the node, serialized, and completely inert');
  assert(/\['marker','Objective marker'\]/.test(src), 'the Do node offers it');
  const wa = extractFunction('_applyWorldAction');
  assert(/if\(s\.do==='marker'\)\{/.test(wa), '...and the world handler has a branch for it');
  assert(/} else if\(s\.do==='marker'\)\{/.test(src),
    '...and the signal editor has a ROW that configures it (build 1406: a verb offered with no row is ' +
    'a verb a creator cannot use)');
}

// ---------------------------------------------------------- one place, not a random one ----
{
  const f = extractFunction('_markerProp');
  assert(/o\.userData\.tag===tag\) return o;/.test(f),
    'a marker resolves the FIRST prop carrying the tag. _lgPlaceAt picks at RANDOM among tag hits so a ' +
    'spawned squad scatters (build 1394 recorded the distinction) — an arrow that points at a different ' +
    'crate every frame is not a marker');
  assert(/o\.parent &&/.test(f),
    '...and skips a destroyed prop, or the re-resolve below hands back the corpse it was called to replace');

  const s = extractFunction('_markerSet');
  assert(/const prop = _markerProp\(t\);/.test(s) && /_lgPlaceAt\(t\)/.test(s),
    'a tag holds the PROP (so the marker TRACKS a lift or a moved prop) and anything else — `me`, ' +
    '`start`, `#here` — resolves to a static point through the shared place vocabulary');
  assert(/_noteLogicFailure/.test(s),
    'and a place nothing answers to is REFUSED and reported (1214): an arrow pointing nowhere is worse ' +
    'than no arrow');
}

// ------------------------------------------------------------------ the set, executed ----
const MAX = +/const MARKER_MAX = (\d+)/.exec(src)[1];
{
  const props = [];
  const mk = (tag) => { const o = { parent: {}, userData: { tag } }; props.push(o); return o; };
  mk('a'); mk('b'); mk('c');
  for (let i = 0; i < MAX + 4; i++) mk('cap' + i);

  const notes = [];
  const rig = new Function('props', 'notes',
    'const propModels = props;\n' +
    'const MARKER_MAX = ' + MAX + ', MARKER_DEF_COL = ' + JSON.stringify(/MARKER_DEF_COL = '([^']+)'/.exec(src)[1]) + ';\n' +
    'let _markers = [];\n' +
    'function _lgPlaceAt(){ return null; }\n' +   // only tags resolve in this rig
    'function _noteLogicFailure(m){ notes.push(m); }\n' +
    extractFunction('_markerProp') + '\n' + extractFunction('_markerSet') + '\n' +
    extractFunction('_markerDrop') + '\n' + extractFunction('_markersClear') + '\n' +
    extractFunction('_applyMarker') + '\n' +
    'return { apply:_applyMarker, set:_markerSet, list:()=>_markers };')(props, notes);

  eq(rig.set('a', 'RANGE', '#38f5b5'), true, 'a tag with a prop behind it marks');
  eq(rig.list().length, 1);
  eq(rig.list()[0].text, 'RANGE');
  eq(rig.list()[0].color, '#38f5b5', 'the authored colour passes');

  eq(rig.set('a', 'RANGE 2'), true, 'the same tag again...');
  eq(rig.list().length, 1, '...is the SAME marker, so an interval that re-marks cannot fill the cap');
  eq(rig.list()[0].text, 'RANGE 2', '...updated in place');

  eq(rig.set('nosuchtag'), false, 'a tag nothing carries is refused');
  eq(rig.list().length, 1, '...and adds nothing');
  eq(notes.length, 1, '...and says so once');
  eq(rig.set(''), false, 'a blank place marks nothing rather than everything');
  eq(rig.set('   '), false, '...including whitespace');

  // the colour lands in a style, so it is validated exactly as build 1411's sign colours are
  rig.set('b', '', 'javascript:alert(1)');
  eq(rig.list()[1].color, /MARKER_DEF_COL = '([^']+)'/.exec(src)[1],
    'a hostile colour falls back rather than reaching a style attribute (1325/1411)');
  rig.set('b', '', '#abc');
  eq(rig.list()[1].color, '#abc', '...while a real short hex passes');

  // the cap
  for (let i = 0; i < MAX + 4; i++) rig.set('cap' + i);
  eq(rig.list().length, MAX, 'the set is capped', rig.list().length);
  assert(notes.length > 1, '...and the refusal is reported rather than silent');

  // hide / clear
  const before = rig.list().length;
  rig.apply('hide', 'cap0');
  eq(rig.list().length, before - 1, 'hide drops exactly one');
  rig.apply('clear');
  eq(rig.list().length, 0, 'and clear drops them all');
  rig.apply('hide', 'nothere');
  eq(rig.list().length, 0, '...while hiding something that is not up is a no-op, not a throw');

  eq(rig.set('a', 'x'.repeat(200)).valueOf(), true);
  assert(rig.list()[0].text.length <= 40, 'the label is capped — it is level data (1325)', rig.list()[0].text.length);
}

// ------------------------------------------------- the frame path, and what it must not do ----
{
  const t = extractFunction('_markerTick');

  assert(/if\(!_markers\.length\) return;/.test(t),
    'a level with no markers pays ONE length check per frame and nothing else');
  assert(/editorOpen[\s\S]{0,80}gameOn[\s\S]{0,200}return;/.test(t),
    'the editor hides them — a marker over the thing being edited is noise — and so does not-playing');

  // The crash the probe found: written INSIDE the re-resolve, the null guard covered the frame the prop
  // died on and not the NEXT one, when `m.prop` is already null and the static-point branch reads
  // `m.pt.x` off null. That takes the whole frame loop down.
  const iRes = t.indexOf('m.prop = _markerProp(m.tag)'), iGuard = t.indexOf('if(!m.prop && !m.pt)');
  assert(iRes > 0 && iGuard > iRes, 'the re-resolve happens, and then the guard');
  const between = t.slice(iRes, iGuard);
  assert(!/\{/.test(between.slice(between.indexOf('\n'))) || /^\s*[^{]*$/.test(between.split('\n')[0]),
    'and the guard is NOT nested inside the re-resolve');
  assert(/if\(m\.prop && !m\.prop\.parent\) m\.prop = _markerProp\(m\.tag\);\s*\n/.test(t),
    '...which is what this shape guarantees: the re-resolve is a bare statement, so the guard on the ' +
    'next line runs on EVERY frame, not only the one the prop died on');

  assert(/const behind = _mkV\.z > 1;/.test(t) && /sx = W - sx; sy = H - sy;/.test(t),
    'BEHIND the camera, project() mirrors x and y — so an unflipped marker draws on the wrong side of ' +
    'the screen and points the player exactly the wrong way. This is the one thing the maths cannot be ' +
    'trusted to do for you, and the probe measures it');

  // `!/innerHTML/` matched this build's own COMMENT saying it never uses innerHTML — the third time in
  // two builds that my prose defeated a pin (1411's raycast, 164/1393/1395 from the other direction).
  // Assert the PROPERTY ACCESS, never the bare word.
  assert(/\.textContent = /.test(t) && !/\.innerHTML\s*=/.test(t),
    'the label is textContent: it is level data and it interpolates a variable (1325/1411)');
  assert(/_hwInterp\(/.test(t),
    '...through the same interpolation a HUD widget and a sign use, so all three agree about `{coins@}`');
  assert(/new THREE\./.test(extractFunction('_markerTick')) === false,
    'and the tick allocates no vectors per frame (build 1168) — the scratch is module-level');
  assert(/const _mkV = new THREE\.Vector3\(\);/.test(src), '...declared once, above the tick');
}

// ---------------------------------------------------------------------- it is play state ----
{
  const ls = extractFunction('logicStart');
  assert(/_markersClear\(\)/.test(ls),
    'a deploy clears the markers, beside the camera override — both are play state and neither is ' +
    'allowed to survive into the next run (build 1404\'s rule)');
  assert(/if\(typeof _markerTick==='function'\) _markerTick\(\);/.test(src), 'and the tick runs in the frame loop');
}

// -------------------------------------------------------------------------- multiplayer ----
{
  const wa = extractFunction('_applyWorldAction');
  assert(/if\(who==='actor'\)\{ if\(_wactToActor\(pay\)\) return; \}/.test(wa),
    '`who:actor` marks the objective for the ONE player who tripped the trigger, which is what a co-op ' +
    'level with a split objective means (build 1232)');
  assert(/_applyMarker\(mm, at, tx, mc\); _wactSend\(pay\);/.test(wa),
    '...while the default reaches everyone, like the other world verbs');
  assert(/if\(msg\.mk && typeof _applyMarker==='function'\)/.test(src),
    'and a client applies the identical payload through the identical function — ONE applier, so the ' +
    'host and a client cannot come to different answers about it');
  eq((src.match(/function _applyMarker\(/g) || []).length, 1, '...and there is exactly one of it');
}

// ---------------------------------------------------------------------- it serializes ----
{
  const keys = extractConst('SIG_KEYS', src);
  assert(/mkmode:'mk'/.test(keys) && /mcol:'mo'/.test(keys),
    'the mode and the colour ride build 1406\'s one table, so a marker signal survives a save');
  assert(/at:'a'/.test(keys) && /text:'tx'/.test(keys),
    '...while the place and the label are the SHARED `at` and `text`, which the table already carried');
  assert(!/mkat:|mktext:|mkAt:/.test(keys),
    '...rather than a second copy under a marker-specific name — a field that means the same thing ' +
    'twice is how the two come to mean different things');
}

done('build 1412: the level can point at where to go');
