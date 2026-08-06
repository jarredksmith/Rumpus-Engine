// build 1404 — a trigger can change the camera, and change it back.
//
// Asked for from use: *"a player walks into a zone that triggers the camera to be from a single, security
// camera mounted POV, or switch to a top-down angle, and then go back to normal view with a different
// trigger."*
//
// `gameCfg.view` was authored once and was the only thing that decided the camera. A cinematic could move
// the camera, but a cinematic TAKES CONTROL — this is a view change you keep playing through, which is the
// fixed-camera idiom of every survival-horror game ever made.
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------------------- ONE gate, not four ----
// Four things read `gameCfg.view` to decide which camera was running. If the override reached three of
// them, the fourth would keep placing the old camera — which is this file's most-repeated defect.
{
  eq((src.match(/function _viewNow\(/g) || []).length, 1, 'the effective view is decided in one place');
  for (const [fn, what] of [
    ['activeViewMode', 'the mode gate'],
    ['chaseForced',    'the third-person gate'],
    ['chaseCursorOn',  'the cursor-aim gate'],
    ['_vcamMode',      'the orbit framing'],
  ]) assert(/_viewNow\(\)/.test(extractFunction(fn)), what + ' asks it');

  // the two survivors read the AUTHORED view ON PURPOSE
  eq((src.match(/gameCfg\.view==='chase'/g) || []).length, 2,
    'only the serializer and the editor\'s own view picker still read gameCfg.view directly');
  assert(/view: \(gameCfg\.view==='top'\|\|gameCfg\.view==='side'\|\|gameCfg\.view==='chase'\)\?gameCfg\.view:'fps'/.test(src),
    'the SERIALIZER writes the authored view — an override is play state and must never reach the file');
  assert(/const _curView=\(gameCfg\.view==='top'/.test(src),
    '...and the editor\'s picker shows the authored view, so a creator choosing the level camera is never ' +
    'shown the one the graph armed');
}

// ------------------------------------------------------------- the state, executed ----
const MODES = JSON.parse(/const VIEW_MODES = (\[[^\]]*\]);/.exec(src)[1].replace(/'/g, '"'));
function rig(opts) {
  opts = opts || {};
  const notes = [];
  const props = opts.props || [];
  return new Function('props', 'notes', 'ctx',
    'var _viewOv = null;\n' +
    'const VIEW_MODES = ' + JSON.stringify(MODES) + ';\n' +
    'const propModels = props;\n' +
    'let gameOn = ctx.gameOn, editorOpen = ctx.editorOpen;\n' +
    'const gameCfg = ctx.gameCfg;\n' +
    'function _noteLogicFailure(m){ notes.push(m); }\n' +
    extractFunction('_viewNow') + '\n' + extractFunction('_viewMountFor') + '\n' +
    extractFunction('_setViewOverride') + '\n' + extractFunction('_vcamMode') + '\n' +
    'return { set:_setViewOverride, now:_viewNow, vcam:_vcamMode, ov:()=>_viewOv, notes,' +
    '         setEditor:(b)=>{ editorOpen=b; }, setPlay:(b)=>{ gameOn=b; } };')(props, notes, opts.ctx || { gameOn: true, editorOpen: false, gameCfg: { view: 'fps' } });
}

{
  eq(MODES.join(','), 'fps,chase,top,side,fixed', 'the vocabulary is NAMED, so nothing can validate against a comment');

  const cam = { userData: { tag: 'seccam' } };
  const r = rig({ props: [{ userData: { tag: 'other' } }, cam, { userData: { tag: 'seccam' } }] });

  eq(r.now(), 'fps', 'with no override the level plays its own view');
  eq(r.set('top'), true, 'a trigger can arm one...');
  eq(r.now(), 'top', '...and it is what the engine now asks for');
  eq(r.vcam(), 'top', '...including the orbit framing');
  eq(r.set('normal'), true, 'and a second trigger puts it back');
  eq(r.now(), 'fps');
  eq(r.set(''), true, 'a blank mode is "back to normal" too, so an unset field cannot strand a camera');

  eq(r.set('fixed', 'seccam', true), true, 'a fixed camera arms on a tag');
  eq(r.ov().mount, cam, '...mounting on the FIRST prop carrying it — a camera is ONE place (build 1394)');
  eq(r.ov().track, true, '...tracking by default, because a security camera watches you');
  eq(r.now(), 'fixed');
  eq(r.vcam(), '', '...and the ORBIT framing declines it, so _viewFixedPose is the only thing placing it');
  eq(r.set('fixed', 'seccam', false).valueOf(), true);
  eq(r.ov().track, false, 'and it can be pinned to its own facing instead');

  // the failures — a camera pointed nowhere is the worst possible outcome for this verb, so a refusal
  // CHANGES NOTHING rather than dropping the player somewhere they did not ask for
  r.set('normal'); r.notes.length = 0;
  eq(r.set('fixed', 'nosuchcam', true), false, 'a tag nobody carries is refused...');
  eq(r.notes.length, 1, '...and REPORTED (build 1214\'s channel)');
  assert(/nosuchcam/.test(r.notes[0]), '...by name');
  eq(r.now(), 'fps', '...with the authored view left standing, never a camera nowhere');

  r.notes.length = 0;
  eq(r.set('sideways'), false, 'a view this engine does not have is refused...');
  eq(r.notes.length, 1, '...and reported');
  eq(r.now(), 'fps');

  // and a refusal while a camera IS armed leaves that camera running — the previous shot is a better
  // answer than snapping to a view nobody asked for mid-scene
  r.set('fixed', 'seccam', true); r.notes.length = 0;
  eq(r.set('fixed', 'gone', true), false, 'a refusal while a camera is armed is still refused...');
  eq(r.now(), 'fixed', '...and leaves that camera running');
  eq(r.ov().tag, 'seccam', '...on its own mount');
  r.set('normal');

  // the editor is shown the authored view
  r.set('top');
  eq(r.now(), 'top', 'armed in play...');
  r.setEditor(true);
  eq(r.now(), 'fps', '...and the EDITOR sees the level\'s own camera');
  eq(r.vcam(), '', '...so the framing preview cannot be looking through the graph\'s camera');
  r.setEditor(false); eq(r.now(), 'top', 'and it comes back on the way out');
  r.setPlay(false);
  eq(r.now(), 'fps', 'an override does nothing at the menu, where there is no play to change the camera of');
}

// a level that authors chase still gets chase, and an override to fps beats it
{
  const r = rig({ ctx: { gameOn: true, editorOpen: false, gameCfg: { view: 'chase' } } });
  eq(r.now(), 'chase', 'the authored view comes through untouched');
  r.set('fps'); eq(r.now(), 'fps', 'and a trigger can take a chase level to first person for one room');
  r.set('normal'); eq(r.now(), 'chase', '...and give it back');
}

// ------------------------------------------------------------- the fixed camera's pose ----
{
  const f = extractFunction('_viewFixedPose');
  assert(/m\.getWorldPosition\(_vfP\)/.test(f),
    'the mount is read in WORLD space, so a camera on a lift or a parented prop (build 1309) rides it');
  assert(/cam\.lookAt\(player\.pos\.x, player\.pos\.y - 0\.2, player\.pos\.z\)/.test(f), 'tracking looks at the player');
  assert(/m\.getWorldQuaternion\(_vfQ\); cam\.quaternion\.copy\(_vfQ\)/.test(f),
    'and an untracked mount takes the PROP\'s own orientation — both are -Z forward (build 1394), so it is ' +
    'the identity mapping rather than a conversion');
  assert(/if\(m && !m\.parent\) m = _viewOv\.mount = _viewMountFor\(_viewOv\.tag\)/.test(f),
    'a mount destroyed mid-round is re-resolved by tag rather than held as a dead object');
  assert(/if\(!m\)\{ _viewOv = null; return; \}/.test(f),
    '...and if the tag is gone entirely the override DROPS, so the player returns to the level\'s own ' +
    'camera instead of staring at wherever the last frame left them');
  // build 1168: this runs every frame
  assert(!/new THREE\./.test(f), 'it allocates nothing per frame');
  assert(/const _vfP = new THREE\.Vector3\(\), _vfQ = new THREE\.Quaternion\(\), _vfD = new THREE\.Vector3\(\);/.test(src),
    '...because the scratch is module-level');
}

// ------------------------------------------------------------- aim + movement follow it ----
{
  const aim = extractFunction('_updateViewAim');
  assert(/if\(vm!=='side'\)\{ const py=player\.pos\.y-0\.4/.test(aim),
    'the cursor aims on the chest plane for every mode but the side lane — a generalisation, since `top` ' +
    'and `side` were the only two values that reached here before this build');
  assert(/if\(vm!=='side' && !cc\) player\.pitch=0;/.test(aim), '...and the body stays level the same way');
  assert(/_sideLock=\(axis==='x'\) \? player\.pos\.z : player\.pos\.x/.test(aim),
    'and the side lane still captures its own plane, so nothing about the 2.5D view moved');

  assert(/if\(_vm874==='top' \|\| _vm874==='fixed'\)\{/.test(src), 'the movement basis covers a fixed camera');
  assert(/const _ya = \(_vm874==='fixed'\) \? _viewCamYaw\(\) : \(\(typeof _vcamYawRad==='function'\)\?_vcamYawRad\('top'\):0\);/.test(src),
    '...from where that CAMERA looks, not the authored top yaw and not the body — the body faces the ' +
    'cursor, so a body-relative WASD under a fixed camera steers differently every time the mouse moves');
  assert(/function _viewCamYaw\(\)\{ camera\.getWorldDirection\(_vfD\); return Math\.atan2\(-_vfD\.x, -_vfD\.z\); \}/.test(src),
    'and the camera yaw is read through the engine\'s own forward convention');
}

// ------------------------------------------------------------- the wiring ----
{
  const wa = extractFunction('_applyWorldAction');
  assert(/if\(s\.do==='view'\)\{/.test(wa), 'the verb is a WORLD verb — it acts on WHO, not on a tag list');
  assert(/if\(who==='actor'\)\{ if\(_wactToActor\(\{ vw:\[vm, vt, tr\?1:0\] \}\)\) return; \}/.test(wa),
    'and `who:actor` sends it to the player who tripped the trigger and nobody else, which is what a ' +
    'security camera in a co-op level means (build 1232)');
  assert(/_setViewOverride\(vm, vt, tr\); _wactSend\(\{ vw:\[vm, vt, tr\?1:0\] \}\);/.test(wa),
    '...while the default reaches everyone, like the other world verbs');
  assert(/if\(msg\.vw && typeof _setViewOverride==='function'\)/.test(src),
    'a client applies the identical payload through the identical function');
  assert(/\|\|s\.do==='resetprop'\|\|s\.do==='view'\)\{/.test(src),
    'the signal router forwards it to the world handler (build 1277: the wire, not the ends)');

  // it must not survive a deploy — an override is play state
  assert(/_viewOv=null;\s+\/\/ build 1404/.test(extractFunction('logicStart')),
    'a deploy clears it, so the level\'s own camera always comes back');

  // both authoring surfaces
  assert(/\['command','Command enemies'\],\['view','Camera view'\],\['showprop','Show props'\]/.test(src),
    'the Do node offers it');
  assert(/\['command','Command enemies'\],\['view','Camera view'\]\], s\.do, v=>\{ s\.do=v; \}\)\);/.test(src),
    '...and so does the prop-signal editor, so a camera prop can arm itself on contact');
  assert(/\{k:'vmode',l:'',w:130,ifv:\['verb','view'\]/.test(src), 'with a mode picker...');
  assert(/\{k:'vtag',l:'camera tag',w:86,ifv:\['verb','view'\],ifv2:\['vmode','fixed'\]/.test(src),
    '...a tag box that appears only for a fixed camera...');
  assert(/\{k:'vtrack',l:'follows the player',chk:1,ifv:\['verb','view'\],ifv2:\['vmode','fixed'\]\}/.test(src),
    '...and the tracking switch beside it');
  assert(/ifv:\['verb',\['damage','heal','kill','teleport','give','take','view'\]\]/.test(src),
    '...plus build 1232\'s who field');

  // build 1402's rule: the camera tag is a NAME
  const doCase = extractFunction('_lgPulse');
  assert(/vtag:_lgName\(p\.vtag\)/.test(doCase), 'the camera tag interpolates — `cam{n}` for a bank of them');
  assert(/vmode:p\.vmode\|\|'normal'/.test(doCase), '...while the mode is an enum and stays literal');
}

// Probed live (tools/probe/camera-view.mjs), driving the real dispatcher and reading the real camera:
//
//   16/16 verified — top-down arms and the live camera really is overhead; `gameCfg.view` stays 'fps'
//   throughout, so a save mid-play cannot bake it in; a fixed camera sits EXACTLY on its mount (delta
//   0.00 on all three axes) and looks straight at the player (dot 1.0000), keeps tracking as the player
//   walks 20 m without the camera moving (0.000), and an untracked mount looks along the prop's own
//   facing (dot 1.0000); 'normal' puts the camera back on the player's eye (0.00 m away); a tag nobody
//   carries and a view the engine does not have are each refused and reported once with the authored view
//   left standing; a deploy clears it; and the editor is shown 'fps' while the graph has 'top' armed.
done('build 1404: the camera can change during play — a security cam, a top-down room, and back');
