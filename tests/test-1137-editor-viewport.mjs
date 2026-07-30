// build 1137: the editor's viewport becomes a TOOL viewport.
//
// A visual critic's verdict, on the frames: "it opens on the player's first-person gameplay camera with
// the rifle viewmodel drawn across 11% of the authoring viewport and a live gameplay crosshair at screen
// centre, and that viewport carries not one tool affordance — no axis widget, no camera readout... The
// right-hand panel reports 'Prop 3 / 28' selected with nothing in the scene to show which prop that is.
// Everything a level editor is for happens in a 342px scrolling accordion beside a render of the game."
//
// Four things, all of them things every DCC tool has:
//   1. no weapon viewmodel in the authoring viewport
//   2. sessions open in the FLY camera, not the player's walking gameplay camera
//   3. F frames the selection, so moving the selection moves the view to it
//   4. an axis widget and a camera readout in the corner
import { gameSource, extractFunction, html, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. the rifle is not a tool
{
  // build 1140 moved these early-outs into _vmWanted(), which both the frame loop and the post chain ask.
  const fn = extractFunction('_vmWanted');
  assert(/if\(typeof editorOpen!=='undefined' && editorOpen\) return false;/.test(fn),
    'the viewmodel is skipped while the editor is open');
  // gun.visible must NOT be what does it — that flag is gameplay state and the editor's own gun/aim
  // tabs set it deliberately
  assert(/!gun\.visible\) return false;/.test(fn), 'the existing gun.visible early-out is untouched');
  const at = fn.indexOf('editorOpen) return false;'), vis = fn.indexOf('!gun.visible) return false;');
  assert(vis >= 0 && at > vis, 'the editor check is an additional early-out, not a replacement');
}

// ---------------------------------------------------------------- 2. sessions open in the fly camera
{
  assert(/let editorFreeFly = true;/.test(src), 'the initial value is the fly camera');
  // ...but that alone was not enough: every exit path sets it false, so re-opening landed back on the
  // walking camera. The OPEN path has to set it.
  const te = extractFunction('toggleEditor');
  assert(/editorFreeFly = true; editorTopView = false; flyInit = false;/.test(te),
    'opening the editor puts you in the fly camera');
  {
    const openBranch = te.indexOf('if(editorOpen){'), set = te.indexOf('editorFreeFly = true;');
    assert(openBranch >= 0 && set > openBranch, '...inside the OPEN branch, not on every toggle');
  }
  // the exits that reset it are still there — they belong to play, which must never start flying
  const resets = (src.match(/editorFreeFly=false; editorTopView=false;/g) || []).length;
  assert(resets >= 3, 'leaving the editor still returns the camera to the player (' + resets + ' exit paths)');
}

// ---------------------------------------------------------------- 3. Frame Selected
{
  const fn = extractFunction('_edFrameSelected');
  assert(/selectedSceneObject\(\)/.test(fn), 'it frames the current selection');
  assert(/o\.userData\.marker\) \? o\.userData\.marker : o/.test(fn),
    "a light's group has no renderable extent — it frames the marker the author can actually see");
  assert(/_frmBox\.setFromObject\(t, true\)/.test(fn), 'from the object\'s real world bounds');
  assert(/if\(!isFinite\(_frmBox\.min\.x\) \|\| _frmBox\.isEmpty\(\)\) return false;/.test(fn),
    'an empty or non-finite box bails instead of sending the camera to NaN');
  assert(/editorTopView = false; editorFreeFly = true; flyInit = true;/.test(fn), 'framing implies the fly camera');
  assert(/const dx = flyPos\.x - _frmCtr\.x, dz = flyPos\.z - _frmCtr\.z;/.test(fn),
    'it approaches from the side the camera is already on, so the view does not flip to the far side');
  // executable: the framing arithmetic
  {
    const camera = { near: 0.1, fov: 78 };
    const V3 = class { constructor(){ this.x=0; this.y=0; this.z=0; }
      set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
      length(){ return Math.hypot(this.x, this.y, this.z); } };
    const mkBox = (min, max) => ({ min, max, isEmpty: () => false,
      getCenter(v){ return v.set((min.x+max.x)/2, (min.y+max.y)/2, (min.z+max.z)/2); },
      getSize(v){ return v.set(max.x-min.x, max.y-min.y, max.z-min.z); } });
    let box = mkBox({x:-1,y:0,z:-1}, {x:1,y:2,z:1});
    const player = { yaw: 0, pitch: 0 };
    const flyPos = new V3(); flyPos.set(0, 5, 40);
    const run = (b, from) => {
      box = b; flyPos.set(from[0], from[1], from[2]);
      const fn2 = new Function('selectedSceneObject', '_frmBox', '_frmCtr', '_frmSz', 'camera', 'flyPos',
        'player', 'Math', 'isFinite', 'editorTopView', 'editorFreeFly', 'flyInit', 'renderEditorFields',
        extractFunction('_edFrameSelected') + '; return _edFrameSelected;'
      )(() => ({ userData: {} }), Object.assign({ setFromObject(){} }, box), new V3(), new V3(),
        camera, flyPos, player, Math, isFinite, false, false, false, () => {});
      return fn2();
    };
    assert(run(mkBox({x:-1,y:0,z:-1}, {x:1,y:2,z:1}), [0, 5, 40]) === true, 'framing a 2x2x2 box succeeds');
    // the camera ends up looking AT the centre: its forward must point from it to the centre
    const cx = 0, cy = 1, cz = 0;
    const fwd = [-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch)];
    const to = [cx - flyPos.x, cy - flyPos.y, cz - flyPos.z];
    const tl = Math.hypot(...to);
    for (let i = 0; i < 3; i++) near(fwd[i], to[i] / tl, 1e-6, 'the camera looks at the framed centre (axis ' + i + ')');
    // ...from the same side it started on
    assert(flyPos.z > 0, 'approached from +z, having started at +z (' + flyPos.z.toFixed(1) + ')');
    // a bigger object is framed from further away
    const d1 = (run(mkBox({x:-1,y:0,z:-1}, {x:1,y:2,z:1}), [0, 5, 40]), Math.hypot(flyPos.x, flyPos.y - 1, flyPos.z));
    const d2 = (run(mkBox({x:-10,y:0,z:-10}, {x:10,y:20,z:10}), [0, 5, 40]), Math.hypot(flyPos.x, flyPos.y - 10, flyPos.z));
    assert(d2 > d1 * 3, 'a 10x larger object is framed from much further out (' + d1.toFixed(1) + ' -> ' + d2.toFixed(1) + ')');
    // never inside the near plane
    run(mkBox({x:-0.01,y:0,z:-0.01}, {x:0.01,y:0.01,z:0.01}), [0, 1, 2]);
    assert(Math.hypot(flyPos.x, flyPos.y - 0.005, flyPos.z) > camera.near * 2, 'a tiny object is not framed inside the near plane');
  }
}
{
  // F frames; Shift+F keeps the free-fly toggle; with nothing selected F still toggles, so it is never dead
  assert(/if\(e\.code==='KeyF' && !e\.shiftKey && typeof _edFrameSelected==='function' && _edFrameSelected\(\)\)\{ keys\['KeyF'\]=false; \}/.test(src),
    'F frames the selection when there is one');
  assert(/else if\(e\.code==='KeyF'\)\{ editorFreeFly=!editorFreeFly;/.test(src),
    '...and falls through to the free-fly toggle when there is not');
  assert(/tag!=='INPUT' && tag!=='TEXTAREA'/.test(src), 'and typing F in a text field still does neither');
}

// ---------------------------------------------------------------- 4. the readout
{
  assert(/<div id="edViewInfo">/.test(html), 'the viewport has a readout');
  assert(/#edViewInfo \{[^}]*pointer-events:none/.test(html),
    'it is pointer-transparent — it can never eat a click meant for the scene');
  assert(/#edViewInfo \{[^}]*display:none/.test(html) && /#edViewInfo\.on \{ display:flex; \}/.test(html),
    'and it is editor-only');
  // the axis widget: three axes in the conventional colours
  assert(/#edAxis #axX \{ stroke:#ff6b6b; \}/.test(html), 'X is red');
  assert(/#edAxis #axZ \{ stroke:#5aa9ff; \}/.test(html), 'Z is blue');
  assert(/#edAxis #axY \{ stroke:#5ce6a8; \}/.test(html), 'Y is green');
  const fn = extractFunction('updateEditorViewInfo');
  assert(/_edViewT = now \+ 160;/.test(fn), 'throttled to ~6 Hz — it is text, and re-laying it out every frame is waste');
  assert(/editorTopView \? 'TOP' : \(editorFreeFly \? 'FLY' : 'WALK'\)/.test(fn), 'it names the camera mode');
  assert(/editorTopView \? \{ x:topPanX, y:topZoom, z:topPanZ \} : \(editorFreeFly \? flyPos : player\.pos\)/.test(fn),
    '...and reports the position of whichever camera that is');
  // the widget must rotate the RIGHT way: forward is (-sin yaw, -cos yaw), so screen-up is -Z at yaw 0
  assert(/const d = -player\.yaw \* 180 \/ Math\.PI;/.test(fn), 'the widget counter-rotates with the view');
  assert(/zt\.setAttribute\('transform', 'rotate\(' \+ \(-d\)/.test(fn), '...and the labels counter-rotate again so they stay readable');
  assert(/if\(el\.classList\.contains\('on'\) !== on\) el\.classList\.toggle\('on', on\);/.test(fn),
    'the class is only written when it changes');
}
assert(/if\(typeof updateEditorViewInfo==='function'\) updateEditorViewInfo\(_pnow\(\)\);   \/\/ build 1137/.test(src),
  'the readout runs from the frame loop');

// ---------------------------------------------------------------- the row that holds undo/redo still fits
{
  // build 1129 added a fourth button to a row2 and it wrapped onto two lines in the capture
  const m = src.match(/<button id="edUndo"[^>]*>[^<]*<\/button><button id="edRedo"[^>]*>/);
  assert(m, 'undo and redo sit together');
  assert(/id="edUndo"[^>]*width:32px;min-width:32px/.test(src) && /id="edRedo"[^>]*width:32px;min-width:32px/.test(src),
    'both are a tight fixed width, so Play level + undo + redo + Main menu stay on one line');
}

done('build 1137: the editor viewport has a fly camera, no rifle, Frame Selected, and a readout');
