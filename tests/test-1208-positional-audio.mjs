// build 1208: positional audio — world sounds pan and attenuate by direction.
//
// The gameplay-feel critic's #1: there was NO positional audio anywhere — every sound routed flat into
// sfxBus, so enemy gunfire, an explosion to your left, a charger winding up behind you all arrived
// dead-centre and the ear did none of the threat detection it does in every commercial FPS. _spatialOut(at)
// now returns a StereoPanner (equal-power — no centre volume dip) feeding sfxBus, panned by the source's
// position along the CAMERA'S right axis (from matrixWorld, so it tracks pitch/vehicles/play-cameras) and
// attenuated by distance. No `at`, or no createStereoPanner, is sfxBus unchanged — UI/self sounds and old
// browsers stay byte-identical.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- _spatialOut, executed against a fake WebAudio
function mkCtx() {
  const mk = (tag) => { const n = { tag, connect: (d) => { n._to = d; return d; }, pan: { value: 0 }, gain: { value: 1 } }; return n; };
  return {
    createStereoPanner: () => mk('panner'),
    createGain: () => mk('gain'),
    destination: { tag: 'dest' },
  };
}
function run(camElems, at, opts = {}) {
  const ctx = opts.ctx || mkCtx();
  const camera = camElems ? { matrixWorld: { elements: camElems } } : undefined;
  const body =
    'const actx = ctx, sfxBus = { tag:"sfxBus" };\n' +
    (opts.noPanner ? 'delete actx.createStereoPanner;\n' : '') +
    'const camera = camObj;\n' +
    'const _SND_MAXDIST = 55;\n' +
    extractFunction('_spatialOut') + '\nreturn _spatialOut(at);';
  return new Function('ctx', 'camObj', 'at', body)(ctx, camera, at);
}

// identity camera at origin: right = +x (elements[0..2]=1,0,0), position = (0,0,0)
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

{ // a source to the RIGHT pans right (+1), to the LEFT pans left (-1)
  const right = run(IDENTITY, { x: 10, y: 0, z: 0 });
  assert(right && right.tag === 'panner', 'a positioned sound routes through a StereoPanner');
  near(right.pan.value, 1, 1e-6, 'a source straight to camera-right pans hard right (+1)');
  const left = run(IDENTITY, { x: -10, y: 0, z: 0 });
  near(left.pan.value, -1, 1e-6, 'a source to camera-left pans hard left (-1)');
  const ahead = run(IDENTITY, { x: 0, y: 0, z: -10 });
  near(ahead.pan.value, 0, 1e-6, 'a source dead ahead is centred (0)');
}
{ // distance attenuates, and past max range the helper returns null (caller skips entirely)
  const near1 = run(IDENTITY, { x: 3, y: 0, z: 0 });
  const far1 = run(IDENTITY, { x: 40, y: 0, z: 0 });
  const dg = (node) => node._to.gain.value;   // panner -> distance gain -> bus
  assert(dg(near1) > dg(far1), 'a nearer source is louder than a far one');
  const tooFar = run(IDENTITY, { x: 60, y: 0, z: 0 });
  eq(tooFar, null, 'past ~55m the helper returns null so the caller skips the sound entirely (no inaudible node churn)');
}
{ // the pan follows the CAMERA basis, not world axes: rotate the camera 90 deg and "world +x" is now behind
  // camera yawed +90: right axis becomes -z (elements[0..2] = 0,0,-1)
  const YAW90 = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];
  const srcRightOfCam = run(YAW90, { x: 0, y: 0, z: -10 });   // -z is now to the camera's right
  near(srcRightOfCam.pan.value, 1, 1e-6, 'the pan is along the CAMERA right axis (matrixWorld), so it tracks where you look');
}
{ // graceful degradation
  eq(run(IDENTITY, null).tag, 'sfxBus', 'no position -> plain sfxBus (UI/self sounds unchanged)');
  eq(run(null, { x: 10, y: 0, z: 0 }).tag, 'sfxBus', 'no camera yet -> plain sfxBus');
  eq(run(IDENTITY, { x: 10, y: 0, z: 0 }, { noPanner: true }).tag, 'sfxBus', 'a browser without createStereoPanner -> plain sfxBus, byte-identical to before');
}

// ---------------------------------------------------------------- the wiring: sounds take `at`, sites pass it
{
  assert(/function tone\(\{[^}]*at=null\}=\{\}\)\{\s*\n\s*if\(!actx\) return;\s*\n\s*const out = _spatialOut\(at\); if\(!out\) return;/.test(src),
    'tone routes through the spatial out and skips when it is out of range');
  assert(/function noise\(\{[^}]*at=null\}=\{\}\)\{[\s\S]{0,120}const out = _spatialOut\(at\); if\(!out\) return;/.test(src),
    'noise too');
  assert(/const out = _spatialOut\(opts&&opts\.at\);/.test(extractFunction('playSample')),
    'a custom sample clip pans + attenuates like the synth');
  assert(/enemyShot\(at\)\{ tone\(\{[^}]*at\}\); noise\(\{[^}]*at\}\); \}/.test(src), 'enemyShot forwards its position into both layers');
  assert(/SFX\.enemyShot\(from\)/.test(src), '...and enemy gunfire passes the bolt origin at both fire sites');
  assert(/SFX\.explode\(pos\)/.test(src), 'explosions pass the blast centre');
  assert(/SFX\.kill\(en\.type, en\.mesh\.position\)/.test(src), 'an enemy kill pans to the enemy');
  assert(/SFX\.shatter\(_shCtr\)/.test(src) && /SFX\.shatter\(ctr\)/.test(src), 'a shattered prop pans to where it broke (local and networked)');
  assert(/shootAt\(pos\)\{ if\(!actx\|\|!sfxBus\) return; const gain=_spatialOut\(pos\); if\(!gain\) return;/.test(src),
    'the pre-existing distance-only shootAt now uses the shared panner — a shot to your side reads to your side');
}

done('build 1208: positional audio — _spatialOut executed against a fake WebAudio graph (right/left/ahead pans, distance attenuation, out-of-range null-skip, camera-basis tracking under yaw, and graceful fallback to plain sfxBus with no position / no camera / no StereoPanner), plus tone/noise/playSample threaded with `at` and passed at the enemy-fire, explosion, kill and shatter sites — the largest single gameplay-feel gap is closed');
