// (build 63) The weapon viewmodel renders in its own depth-cleared pass (own scene + camera + light),
// so it's always cleanly on top and never intersects / "cuts through" nearby enemies or walls.
import { gameSource, extractFunction, done, assert, eq } from './harness.mjs';
const src = gameSource();

assert(/const vmScene = new THREE\.Scene\(\)/.test(src), 'dedicated viewmodel scene');
assert(/const vmCam = new THREE\.PerspectiveCamera\(camera\.fov/.test(src), 'dedicated viewmodel camera');
assert(/vmScene\.add\(new THREE\.HemisphereLight/.test(src) && /vmScene\.add\(_vmKey\)/.test(src), 'viewmodel has its own lighting (never black)');
assert(/vmScene\.add\(gun\)/.test(src), 'gun lives in the viewmodel scene');
assert(!/camera\.add\(gun\)/.test(src), 'gun is no longer a child of the world camera');
assert(/vmMuzzle\.add\(flash\)/.test(src), 'muzzle flash rides on the gun barrel anchor');

// build 1140: split three ways — _vmWanted() answers "is there a weapon to draw", _drawViewmodel()
// draws it into WHATEVER TARGET IS BOUND, and renderViewmodel() is the frame loop's straight-to-canvas
// call. The split exists because the post chain now binds its own buffer and draws the weapon inside
// itself, so the weapon is graded with the frame instead of pasted onto the finished one.
const wanted = extractFunction('_vmWanted');
assert(/activeCam\(\) !== camera \|\| !gun\.visible\) return false/.test(wanted), 'skips top-down view + hidden weapon');
const rv = extractFunction('_drawViewmodel');
assert(/vmCam\.fov = camera\.fov; vmCam\.aspect = camera\.aspect/.test(rv), 'matches world fov/aspect each frame');
assert(/renderer\.autoClear = false/.test(rv) && /renderer\.clearDepth\(\)/.test(rv), 'clears depth, keeps color');
assert(/renderer\.render\(vmScene, vmCam\)/.test(rv), 'draws the viewmodel on top');
assert(/renderer\.autoClear = ac/.test(rv), 'restores autoClear');
assert(/_vmDone = true;/.test(rv), 'and records that this frame\'s weapon is drawn');

// called after the world render at every first-person site
eq((src.match(/renderViewmodel\(\)/g)||[]).length >= 4, true, 'invoked at the render sites (def + 3 calls)');
// the editor's camera-preview windows scissor-render between the two, but the viewmodel is still LAST —
// it clears depth, so anything drawn after it would be cut by the gun.
assert(/renderScene\(scene, activeCam\(\)\);\n(?:  if\(.*?_render\w*PvWindow==='function'\)[^\n]*\n)+  renderViewmodel\(\)/.test(src), 'runs after the main gameplay render');
// ...and is a no-op when the post chain already drew it, so the weapon can never be drawn twice —
// once graded inside the buffer and again ungraded over the top of it.
assert(/if\(_vmDone \|\| !_vmWanted\(\)\) return;/.test(extractFunction('renderViewmodel')), 'the trailing call stands down when the post chain got there first');
assert(/_vmDone = false;   \/\/ a new frame's worth of scene/.test(extractFunction('renderScene')), 'and the flag is cleared per scene render, not per frame loop');
assert(/vmMuzzle\.getWorldPosition\(muzzleWorld\)/.test(src), 'tracers source from the gun-anchored barrel, projected to align with the drawn weapon');
done('viewmodel depth-cleared pass (no world clipping / cutting)');
