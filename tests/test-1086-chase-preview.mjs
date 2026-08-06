import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1086: tuning the third-person framing meant drag a slider, press play, look, pause, drag again —
// the Player tab's viewport is a free ORBIT for inspecting the model and deliberately ignores Side,
// Distance and Height, so the sliders had no visible effect anywhere in the editor. Now the corner preview
// window shows the real chase framing, live.

// ---------------------------------------------------------------- one implementation of the framing
const frame = extractFunction('_tpFrame');
const pivot = extractFunction('_tpPivot');
const tcp = extractFunction('tpCameraPushback');
assert(frame && pivot, 'the framing and the pivot are their own functions');
assert(/const _f=_tpFrame\(_p, _camYaw, _camPitch, _b\);/.test(tcp),   // build 1103: the freezable pose
  'the LIVE chase camera frames through _tpFrame — one implementation, so the preview cannot lie');
assert(/const _p=_tpPivot\(_ownAvatar, player\.pos, _camYaw, player\.pos\.y-EYE\);/.test(tcp),
  '...and pivots through _tpPivot');
assert(/_tpFrame\(p, yaw, pitch, _tpPvAds\)/.test(extractFunction('_tpPosePreview')),
  'and so does the editor preview, with its own hip/aim ramp in place of adsBlend');
// the two LIVE-only behaviours stay behind in tpCameraPushback: a preview that damped or ducked behind a
// wall would misreport the framing you are authoring.
assert(/_tpCamCur/.test(tcp) && !/_tpCamCur/.test(frame), 'damping is live-only');
assert(/_cameraCollide\(/.test(tcp) && !/_cameraCollide\(/.test(frame), 'wall collision is live-only');
assert(!/_cameraCollide\(|_tpCamCur/.test(extractFunction('_tpPosePreview')), '...and neither reaches the preview');

// ---------------------------------------------------------------- run the real framing maths
const run = (vars, pivotPt, yaw, pitch, blend) => {
  const fn = new Function('tpSide','tpDist','tpHeight','tpAimSide','tpAimDist','tpAimHeight',
    `const _TPF={x:0,y:0,z:0,fx:0,fy:0,fz:0,px:0,py:0,pz:0};\n${frame}\nreturn _tpFrame;`
  )(vars.side, vars.dist, vars.height, vars.aimSide, vars.aimDist, vars.aimHeight);
  return fn(pivotPt, yaw, pitch, blend);
};
const HIP = { side: 0, dist: 4.2, height: 0, aimSide: 0.9, aimDist: 2.6, aimHeight: 0 };
const P0 = { x: 0, y: 1.4, z: 0 };

{ // dead behind at yaw 0: straight back along +Z
  const f = run(HIP, P0, 0, 0, 0);
  near(f.x, 0, 1e-9, 'centred framing sits dead behind the pivot');
  near(f.y, 1.4, 1e-9, '...level with it');
  near(f.z, 4.2, 1e-9, '...at the hip distance');
}
{ // Side moves the BODY off-centre — the camera shifts along view-right, it does not orbit
  const c = run({ ...HIP, side: 1.5 }, P0, 0, 0, 0);
  near(c.x, 1.5, 1e-9, 'Side slides the camera along view-right...');
  near(c.z, 4.2, 1e-9, '...without changing how far back it is');
  near(Math.hypot(c.x, c.z) > 4.2 ? 1 : 0, 1, 1e-9, '...so the distance from the pivot grows: an offset, not an orbit');
}
{ // ...and view-right follows the yaw
  const c = run({ ...HIP, side: 1.5 }, P0, Math.PI / 2, 0, 0);
  near(c.z, -1.5, 1e-9, 'at 90 degrees of yaw the same Side pushes along -Z');
  near(c.x, 4.2, 1e-9, '...and the pull-back is now along +X');
}
{ // Height is a pure vertical nudge of the camera, NOT of the aim
  const c = run({ ...HIP, height: 0.8 }, P0, 0, 0, 0);
  near(c.y - 1.4, 0.8, 1e-9, 'Height lifts the camera by exactly that much');
  near(c.z, 4.2, 1e-9, '...leaving the distance alone');
}
{ // Distance
  const c = run({ ...HIP, dist: 8 }, P0, 0, 0, 0);
  near(c.z, 8, 1e-9, 'Distance is the pull-back along view-forward');
}
{ // pitch tips the orbit: looking down puts the camera overhead
  const c = run(HIP, P0, 0, -0.6, 0);
  assert(c.y > 1.4, 'pitching down lifts the camera above the pivot (' + c.y.toFixed(2) + ')');
  assert(c.z < 4.2, '...and pulls it in over them');
  near(Math.hypot(c.x, c.y - 1.4, c.z), 4.2, 1e-9, '...at a constant distance — it orbits');
}
{ // the hip -> aim ramp, per axis
  const mid = run(HIP, P0, 0, 0, 0.5);
  near(mid.x, (0 + 0.9) / 2, 1e-9, 'halfway through the aim ramp, Side is halfway');
  near(mid.z, (4.2 + 2.6) / 2, 1e-9, '...and so is Distance');
  const aim = run(HIP, P0, 0, 0, 1);
  near(aim.x, 0.9, 1e-9, 'fully aiming uses the aim Side');
  near(aim.z, 2.6, 1e-9, '...and the aim Distance');
  const hip = run(HIP, P0, 0, 0, 0);
  near(hip.x, 0, 1e-9, 'and 0 is exactly the hip set');
  near(run(HIP, P0, 0, 0, undefined).x, hip.x, 1e-9, '...as is an absent ramp');
}

// ---------------------------------------------------------------- the pivot
/* build 1413 bounded the pivot's HEIGHT by the player's own body, so the rig needs those two constants —
   lifted from source rather than restated, or this would keep passing against a stale pair. They share one
   `const` statement, which extractConst cannot read, so the whole declaration comes out by regex. Both of
   the heights this file exercises (0.95 and 1.0) sit inside the band, so every assertion is unchanged. */
const PIVOT_BOUNDS = (/const TP_PIVOT_MIN = [^;]+;/.exec(src) || [''])[0];
assert(PIVOT_BOUNDS, 'the pivot bounds are where this test thinks they are');
const pv = (obj, base, yaw, fb) => new Function('EYE',
  `const _TPP={x:0,y:0,z:0};\n${PIVOT_BOUNDS}\n${pivot}\nreturn _tpPivot;`)(1.7)(obj, base, yaw, fb);
{
  const c = pv({ userData: { centerLocal: { x: 0, y: 0.95, z: 0 }, footY: 3 } }, { x: 2, y: 9, z: -1 }, 0, 0);
  near(c.y, 3 + 0.95, 1e-9, 'the pivot sits at the model centre above its FEET, not above the body origin');
  near(c.x, 2, 1e-9, '...over the model on X');
}
{ // an off-centre model centre rotates with the body, so the camera never slides as it turns
  const c = pv({ userData: { centerLocal: { x: 0.5, y: 1, z: 0 }, footY: 0 } }, { x: 0, y: 0, z: 0 }, Math.PI / 2, 0);
  near(c.x, 0, 1e-9, 'a sideways model centre swings round with the yaw');
  near(c.z, -0.5, 1e-9, '...onto the other axis');
}
{ // no centre yet (model still loading): the old upper-chest fallback
  const c = pv(null, { x: 0, y: 1.7, z: 0 }, 0, 0);
  near(c.y, 1.7 - 0.3, 1e-9, 'with no model centre it falls back to the upper chest');
}
{ // the foot fallback differs by caller: the live player origin is EYE above their feet, the editor's
  // stand-in avatar group sits ON the ground.
  const live = pv({ userData: { centerLocal: { x: 0, y: 1, z: 0 } } }, { x: 0, y: 1.7, z: 0 }, 0, 1.7 - 1.7);
  near(live.y, 0 + 1, 1e-9, 'live: feet are EYE below the player origin');
  assert(/av\.position\.y\)/.test(extractFunction('_tpPosePreview')),
    'preview: the stand-in avatar group already stands on the ground, so its own y is the foot height');
}

// ---------------------------------------------------------------- the preview camera
const tpp = extractFunction('_tpPosePreview');
// (build 1101: rotation.x subtracts the tilt, which is zero unless authored — still parallel by default)
assert(/cam\.rotation\.order='YXZ'; cam\.rotation\.y=yaw; cam\.rotation\.x=pitch - pvTilt; cam\.rotation\.z=0;/.test(tpp),
  'the preview looks PARALLEL to forward, exactly as play does — that is what makes a nonzero Side read as off-centre');
assert(/cam\.rotation\.order='YXZ'/.test(tpp) && /camera\.rotation\.order='YXZ'/.test(src),
  '...in the same Euler order as the live camera (build 1085 got bitten by that difference)');
assert(/player\.yaw/.test(tpp) && /player\.pitch/.test(tpp),
  'it uses the tab\'s own orbit angle, so dragging the viewport turns the preview with it');
assert(/worldCfg\.fov/.test(tpp), '...at the level FOV');

// ---------------------------------------------------------------- one window, two cameras
const kind = extractFunction('_pvKind');
// Found in a browser: editorMode is which TAB is open, editorActive is which object is selected -- and
// editorActive STAYS 'player' on every tab that owns no targets (Gameplay, World, HUD, Save, Settings,
// see MODE_TARGETS). Keying on editorActive left the chase preview stuck over the Gameplay tab and made
// the play-camera preview unreachable once you had visited Player.
assert(/editorMode!=='undefined' && editorMode==='player' && typeof previewAvatar!=='undefined' && previewAvatar/.test(kind),
  'the Player TAB gets the chase preview');
assert(!/editorActive==='player'/.test(kind), '...keyed on the open tab, not on the selected object');
assert(/rules:   \[\]/.test(src), 'sanity: the Gameplay tab really does own no targets, so editorActive would not clear');
assert(/return _tpPvOn \? 'chase' : '';/.test(kind), '...when it is switched on');
assert(/return \(_vcamPvOn && _vcamMode\(\)\) \? 'play' : '';/.test(kind),
  'and everywhere else it is still the top-down / side-scroller play camera');
assert(/if\(!\(typeof editorOpen!=='undefined' && editorOpen\)\) return '';/.test(kind), 'neither shows outside the editor');
assert(/_cineActive\) return '';/.test(kind), '...or over a cutscene');
const pvw = extractFunction('_renderVcamPvWindow');
assert(/if\(kind==='chase'\) _tpPosePreview\(_vcamPvCam, Wr\/Hr\); else _vcamPose\(_vcamPvCam, Wr\/Hr\);/.test(pvw),
  'the one window poses whichever camera applies, at the panel aspect');
assert(/Third-person camera \\u2014 '\+\(_tpPvAds\?'aiming':'hip'\)/.test(pvw), 'and says which it is showing');
// the two previews have separate on/off state, or closing one on the Player tab would silently kill the other
assert(/localStorage\.getItem\('breach_tppv'\)==='off'/.test(src), 'the chase preview remembers its own on/off');
assert(/if\(_pvKind\(\)==='chase'\)\{ _tpPvOn=false;/.test(src) && /else \{ _vcamPvOn=false;/.test(src),
  'the close button switches off whichever preview is actually up');
// the guard that runs before the frame loop's early-outs has to cover both now
assert(/if\(_vcamPvPanel && !\(typeof _pvKind==='function' && _pvKind\(\)\)\) _vcamPvPanel\.style\.display='none';/.test(src),
  'and the pre-early-out guard asks _pvKind, so neither preview can linger on the menu');

// ---------------------------------------------------------------- hip / aim switch
assert(/ad\.onclick=\(\)=>\{ _tpPvAds=_tpPvAds\?0:1; \}/.test(src), 'the header switches between hip and aim framing');
assert(/_vcamPvAdsBtn\.style\.display=\(kind==='chase'\)\?'':'none'/.test(pvw),
  '...and that switch only appears for the chase preview, where it means something');

// ---------------------------------------------------------------- wiring
assert(/Live third-person preview/.test(src), 'the toggle sits with the sliders it explains');
assert(/pvb\.onclick=\(\)=>\{ _tpPvOn=!_tpPvOn;/.test(src), '...and toggles the preview');
assert(src.indexOf("mkSlider('Height', ()=>tpHeight") < src.indexOf('Live third-person preview'),
  '...directly under the Third-person camera sliders');

done('build 1086: a live third-person preview while you place the player model and tune the chase framing');
