// build 1101: third-person camera TILT — pitch the whole boom down at the character.
//
// A Tilt slider (-20°..70°) joins Side/Distance/Height in the editor's third-person camera
// panel: push it toward 70° with a long distance and the chase camera becomes an "almost
// top-down" action view. The tilt fades with the aim blend, so right-click ADS returns to the
// exact authored aim framing (and the crosshair stays true while aiming). Saved per browser,
// snapshotted into roster character views like the other framing values.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';

const src = gameSource();
const tf = extractFunction('_tpFrame');

// ---------------------------------------------------------------- executable: the boom math
{
  const run = (tilt, blend, pitch = 0) => {
    const fn = new Function('tpTilt',
      `const tpSide=0, tpDist=4, tpHeight=0, tpAimSide=0, tpAimDist=4, tpAimHeight=0; const _TPF={};\n${tf}\nreturn _tpFrame;`
    )(tilt);
    return fn({ x: 0, y: 2, z: 0 }, 0, pitch, blend);
  };
  const flat = run(0, 0);
  near(flat.y, 2, 0.001, 'no tilt: the camera sits level with the pivot');
  const tilted = run(45, 0);
  near(tilted.y, 2 + Math.sin(Math.PI / 4) * 4, 0.01, '45° tilt raises the camera by sin(45°)·dist');
  assert(tilted.fy < -0.7, '...and the view forward points down at the character');
  const aiming = run(45, 1);
  near(aiming.y, 2, 0.001, 'aiming blends the tilt out entirely — ADS framing is exact');
  const up = run(-20, 0);
  assert(up.y < 2, 'negative tilt drops the camera below the pivot (looking up)');
}

// ---------------------------------------------------------------- wiring pins
assert(/let tpTilt = 0;/.test(src) && /breach_tp_tilt/.test(src), 'tpTilt exists and persists per browser');
assert(/tpTilt=g\('breach_tp_tilt',-20,70,0\);/.test(src), 'the view loader restores it with the same clamps');
assert(/tpTilt:_viewClamp\(v\.tpTilt,-20,70,0\),/.test(src), 'roster views sanitize it');
assert(/tpTilt:tpTilt,/.test(src), 'roster views snapshot it');
assert(/tpTilt=s\.tpTilt;/.test(src), 'roster views apply it');
assert(/if\(side \|\| height \|\| _cc \|\| \(typeof tpTilt==='number' && tpTilt\)\)\{ _tpLookAt\.set/.test(src),
  'the live camera looks along the tilted forward, not the player pitch, whenever tilt is set');
assert(/const pvTilt=\(typeof tpTilt==='number' && tpTilt\) \? tpTilt\*\(Math\.PI\/180\)\*\(1-_tpPvAds\) : 0;/.test(src),
  'the editor preview window shows the tilt too');
assert(/mkSlider\('Tilt', \(\)=>tpTilt, v=>tpTilt=v, -20, 70, 1,/.test(src), 'the slider sits with Side/Distance/Height');

done('build 1101: tilt the chase camera — almost-top-down views without leaving third person');
