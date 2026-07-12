// (build 165) Mobile touch parity: the on-screen "E" prompt is tappable (interact); the editor is usable on
// touch (fly camera driven by the joystick + left-side drag-look, combat buttons hidden, never fires); the
// wave/score HUD is lifted toward the top and shrunk on mobile.
import { gameSource, html, done, assert } from './harness.mjs';
const src = gameSource();

// never fire while editing
assert(/\(firing \|\| padFiring \|\| touchFiring\) && !heldProp && !editorOpen && !_levelLoaderActive && !drivingCar && !\(typeof buildMode!=='undefined' && buildMode\)\)\{ if\(mountedTurret\) turretFire\(\); else shoot\(\); \}/.test(src), 'no firing in the editor');

// touch look + touch UI work in the editor
assert(/if\(isTouch && !shopOpen && !choosingUpgrade\)\{   \/\/ touch look/.test(src), 'touch look applies in the editor');
assert(/const d=\(gameOn && !shopOpen && !choosingUpgrade\)\?'block':'none';/.test(src), 'touch UI shows in the editor');
assert(/document\.body\.classList\.toggle\('editing', !!editorOpen\);/.test(src), 'editing body class drives mobile editor styling');

// joystick flies the editor camera
assert(/if\(isTouch\)\{ if\(touchMoveZ\) flyPos\.addScaledVector\(fwd, -touchMoveZ\*spd\*1\.5\);/.test(src), 'joystick moves the fly camera');
assert(/if\(isTouch\)\{ editorFreeFly=true; flyInit=false; \}/.test(src), 'editor opens in fly mode on touch');

// tappable prompt
assert(/pr\.addEventListener\('pointerdown', e=>\{ if\(isTouch\)\{ if\(typeof interact==='function'\) interact\(\);/.test(src), 'tapping the prompt calls interact');

// CSS: tappable prompt, hidden combat buttons + confined look while editing, lifted/shrunk HUD
assert(/body\.touch #prompt \{ pointer-events:auto; z-index:45; cursor:pointer;/.test(html), 'prompt is tappable on touch');
assert(/body\.editing #tFire, body\.editing #tAim,[^}]*display:none !important;/.test(html), 'combat buttons hide while editing');
assert(/body\.editing #tLook \{ left:0; right:330px; \}/.test(html), 'look-drag stays off the editor panel');
assert(/body\.touch #wavePanel \{ top: calc\(42px \+ env\(safe-area-inset-top\)\); transform: translateX\(-50%\) scale\(\.82\)/.test(html), 'wave HUD lifted + shrunk on mobile (42px since build 913 — it overlapped the room badge at 30)');
assert(/body\.touch #cpHud \{ top: calc\(30px \+ env\(safe-area-inset-top\)\); transform: translateX\(-50%\) scale\(\.82\)/.test(html), 'control-point HUD lifted + shrunk on mobile');
done('mobile touch parity');
