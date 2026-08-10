// build 1484 — the click-to-move destination says something back, and says WHICH answer it is
//
// Build 1481 shipped the verb and left the feedback out, so a refused click and a click the game never heard
// were identical. Everything below EXECUTES the shipped functions against the real three build; the point of
// the whole thing is that success and refusal produce different pixels, so both are driven, never one.

import * as THREE from 'three';
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// ---------------------------------------------------------------- the numbers are derived, not picked
const CM_ARRIVE  = +extractConst('CM_ARRIVE', src);
const CM_PING_S  = +extractConst('CM_PING_S', src);
const CM_PING_FROM = +extractConst('CM_PING_FROM', src);
const CM_PING_TO = +extractConst('CM_PING_TO', src);
const CM_MARK_UP = +extractConst('CM_MARK_UP', src);
const CM_DENY_COL = extractConst('CM_DENY_COL', src);

assert(CM_PING_S > 0.1 && CM_PING_S < 1.5, 'the ping is a beat, not a lingering decal');
assert(CM_PING_FROM < 1 && CM_PING_TO > 1, 'the ping expands THROUGH the held size rather than around it');
assert(CM_MARK_UP > 0 && CM_MARK_UP < 0.2, 'stood off the floor by PROUD, not floated');
eq(String(CM_DENY_COL).toLowerCase(), '0xff4d6d', 'the refusal is a warning colour, fixed (1469)');

// ---------------------------------------------------------------- a scope carrying the real functions
function rig(opts){
  const o = opts || {};
  const scene = new THREE.Scene();
  const scope = {
    THREE, scene,
    CM_ARRIVE, CM_PING_S, CM_PING_FROM, CM_PING_TO, CM_MARK_UP, CM_DENY_COL: 0xff4d6d,
    DEFAULT_HUD: { accent:'#38f5b5' },
    hudCfg: o.hudCfg === undefined ? { accent:'#38f5b5' } : o.hudCfg,
    editorOpen: !!o.editorOpen,
    _cmOn: !!o.cmOn,
  };
  const body = [
    'let _cmMark = null, _cmPingT = 0, _cmPingOk = false, _cmMarkPhase = 0;',
    extractFunction('_cmMarkMesh', src),
    extractFunction('_cmMarkCol', src),
    extractFunction('_cmMarkAt', src),
    extractFunction('_cmMarkTick', src),
    'return { _cmMarkMesh, _cmMarkCol, _cmMarkAt, _cmMarkTick,',
    /* the scope values arrive as PARAMETERS, so they are bound copies — mutating the outer object never
       reaches them, and two checks read as engine failures until the rig grew a real setter */
    '  set: (k, v)=>{ if(k === "_cmOn") _cmOn = v; else if(k === "editorOpen") editorOpen = v; },',
    '  st: ()=>({ pingT:_cmPingT, ok:_cmPingOk, phase:_cmMarkPhase, mesh:_cmMark }) };',
  ].join('\n');
  const keys = Object.keys(scope);
  const fn = new Function(...keys, body);
  const api = fn(...keys.map(k => scope[k]));
  api.scope = scope;
  api.scene = scene;
  return api;
}

// ---------------------------------------------------------------- one mesh, reused, and its properties
{
  const r = rig({});
  r._cmMarkAt(3, 1, -4, true);
  const m1 = r.st().mesh;
  assert(!!m1, 'the mesh is built on first use');
  r._cmMarkAt(9, 2, 9, false);
  assert(r.st().mesh === m1, 'a second click reuses the SAME mesh — never allocated per click (1168)');

  eq(m1.material.transparent, true, 'transparent');
  eq(m1.material.depthWrite, false, 'writes no depth');
  eq(m1.frustumCulled, false, 'never culled out from under itself');
  eq(typeof m1.raycast, 'function', 'it has a raycast...');
  let hits = [];
  m1.raycast(new THREE.Raycaster(), hits);
  eq(hits.length, 0, '...and it is NEUTRALISED: the marker can never be what a later click resolves to');
  assert(!m1.isLight, 'not a light — the scene light count must not change during play (636/977/1153/1155)');
  eq(m1.parent, r.scene, 'seated in the scene');
}

// ---------------------------------------------------------------- the AO/velocity sweep covers it for free
{
  const noDepth = new Function('return ' + extractFunction('_aoNoDepthMat', src).replace(/^function\s+_aoNoDepthMat/, 'function'))();
  const r = rig({});
  r._cmMarkAt(0, 0, 0, true);
  eq(noDepth(r.st().mesh.material), true,
     'the real _aoNoDepthMat sweeps the marker out of the depth-derived G-buffers (1152/1285) by construction');
  eq(noDepth(new THREE.MeshStandardMaterial()), false, '...and still passes an ordinary opaque material');
}

// ---------------------------------------------------------------- placement, and the two colours
{
  const r = rig({ hudCfg:{ accent:'#ffcc00' } });
  r._cmMarkAt(12, 3, -7, true);
  const m = r.st().mesh;
  near(m.position.x, 12, 1e-9, 'x is the point clicked');
  near(m.position.z, -7, 1e-9, 'z is the point clicked');
  near(m.position.y, 3 + CM_MARK_UP, 1e-9, 'y is lifted by PROUD so a flat ring cannot z-fight the floor');
  eq(m.material.color.getHex(), 0xffcc00, "success takes the LEVEL'S accent (1469)");
  eq(r.st().ok, true, 'and records that it was a success');

  r._cmMarkAt(12, 3, -7, false);
  eq(m.material.color.getHex(), 0xff4d6d, 'refusal is the warning colour, never the accent');
  eq(r.st().ok, false, 'and records that it was a refusal');
}

// _cmMarkCol degrades rather than throwing on anything a level file can carry
{
  eq(rig({ hudCfg:null })._cmMarkCol(), 0x38f5b5, 'no hudCfg falls back to the engine default');
  eq(rig({ hudCfg:{} })._cmMarkCol(), 0x38f5b5, 'no accent falls back to the engine default');
  eq(rig({ hudCfg:{ accent:'#123456' } })._cmMarkCol(), 0x123456, 'a real accent is read');
  const junk = rig({ hudCfg:{ accent:'not a colour' } })._cmMarkCol();
  assert(typeof junk === 'number', 'junk yields a number rather than throwing mid-frame');
}

// ---------------------------------------------------------------- the ping: expands and fades, both answers
for(const ok of [true, false]){
  const r = rig({ cmOn: ok });
  r._cmMarkAt(0, 0, 0, ok);
  const m = r.st().mesh;

  r._cmMarkTick(0);
  eq(m.visible, true, `the ping is visible on the frame it fires (ok=${ok})`);
  const s0 = m.scale.x, o0 = m.material.opacity;
  near(s0, CM_ARRIVE * CM_PING_FROM, 1e-6, 'it starts inside the arrival ring');
  near(o0, 1, 1e-6, 'at full opacity');

  r._cmMarkTick(CM_PING_S * 0.5);
  assert(m.scale.x > s0, 'it EXPANDS');
  assert(m.material.opacity < o0, 'and FADES');
  assert(m.visible, 'still visible mid-ping');

  r._cmMarkTick(CM_PING_S * 0.5);
  near(r.st().pingT, 0, 1e-9, 'the ping is spent after exactly CM_PING_S');
}

// ---------------------------------------------------------------- the HOLD is the whole distinction
{
  const okRig = rig({ cmOn:true });
  okRig._cmMarkAt(0, 0, 0, true);
  okRig._cmMarkTick(CM_PING_S);            // spend the ping
  okRig._cmMarkTick(0.016);
  eq(okRig.st().mesh.visible, true, 'a SUCCESS holds at the destination after its ping');
  near(okRig.st().mesh.scale.x, CM_ARRIVE, 1e-9,
      'and the held ring IS the arrival radius — a drawing of where "arrived" means, not a decoration');
  assert(okRig.st().mesh.material.opacity > 0.05 && okRig.st().mesh.material.opacity < 0.9,
         'held at a readable but non-shouting opacity');

  const noRig = rig({ cmOn:false });
  noRig._cmMarkAt(0, 0, 0, false);
  noRig._cmMarkTick(CM_PING_S);
  noRig._cmMarkTick(0.016);
  eq(noRig.st().mesh.visible, false,
     'a REFUSAL does NOT hold — the two answers are different pixels, which is the whole build');
}

// arriving takes the marker with it: the hold requires a LIVE route
{
  const r = rig({ cmOn:true });
  r._cmMarkAt(0, 0, 0, true);
  r._cmMarkTick(CM_PING_S); r._cmMarkTick(0.016);
  eq(r.st().mesh.visible, true, 'held while the route is live');
  r.set("_cmOn", false);                    // _cmCancel: arrived, or gave up
  r._cmMarkTick(0.016);
  eq(r.st().mesh.visible, false, 'arrival takes the marker with it — no second arrival cue is needed');
}

// the pulse actually moves
{
  const r = rig({ cmOn:true });
  r._cmMarkAt(0, 0, 0, true);
  r._cmMarkTick(CM_PING_S);
  const seen = new Set();
  for(let i = 0; i < 12; i++){ r._cmMarkTick(0.05); seen.add(r.st().mesh.material.opacity.toFixed(4)); }
  assert(seen.size > 3, 'the held ring breathes rather than sitting at one dead value');
  assert(r.st().phase > 0, 'the phase advances with dt, so it is frame-rate independent');
}

// ---------------------------------------------------------------- never while authoring
{
  const r = rig({ cmOn:true, editorOpen:true });
  r._cmMarkAt(0, 0, 0, true);
  r._cmMarkTick(0);
  eq(r.st().mesh.visible, false, 'the editor never shows it: the creator is placing things, not walking');
  r.set("editorOpen", false);
  r._cmMarkTick(0);
  eq(r.st().mesh.visible, true, '...and leaving the editor gives it straight back');
}

// a tick before any click cannot throw and shows nothing
{
  const r = rig({ cmOn:true });
  r._cmMarkTick(0.016);
  eq(r.st().mesh, null, 'no mesh is built by ticking alone — it costs a level that never clicks nothing');
}

// ---------------------------------------------------------------- re-seated through a level swap
{
  const r = rig({});
  r._cmMarkAt(0, 0, 0, true);
  const m = r.st().mesh;
  r.scene.remove(m);
  eq(m.parent, null, 'a scene teardown orphans it');
  r._cmMarkAt(1, 1, 1, true);
  eq(m.parent, r.scene, '...and the next click re-seats it rather than pinging into nowhere');
}

// ---------------------------------------------------------------- the wiring
{
  const cg = extractFunction('_cmClickGround', src);
  assert(/const ok = _cmGoTo\(hit\.point\.x, hit\.point\.z, hit\.point\.y\);/.test(cg),
         'the click asks _cmGoTo for the answer...');
  assert(/_cmMarkAt\(hit\.point\.x, hit\.point\.y, hit\.point\.z, ok\);/.test(cg),
         '...and reports THAT answer at the point that was pointed at');
  const noHit = cg.indexOf('if(!hit) return false');
  const cue = cg.indexOf('_cmMarkAt(');
  assert(noHit > 0 && cue > noHit,
         'a click that hit nothing returns BEFORE the cue — there is no point in space to mark');
  eq((src.match(/_cmMarkAt\(/g) || []).length, 2,
     'exactly one call site beside the definition: the cue cannot be fired from somewhere that skipped the answer');
  assert(/_cmMarkTick\(dt\);/.test(src), 'ticked from the frame loop');
  eq((src.match(/_cmMarkTick\(/g) || []).length, 2, 'and ticked from exactly one place');
  // it must run beside the other click tick, after it
  const hov = src.indexOf('_clkHoverTick();      // build 1480');
  const tick = src.indexOf('_cmMarkTick(dt);');
  assert(hov > 0 && tick > hov && tick - hov < 400, 'it ticks beside build 1480s hover tick');
}

// the marker is never given a light, at any site
{
  const mk = extractFunction('_cmMarkMesh', src);
  assert(!/new THREE\.(Point|Spot|Directional|Hemisphere|Ambient)Light/.test(mk),
         'no light is constructed — the count must not change during play');
  assert(/MeshBasicMaterial/.test(mk), 'unlit, so a destination reads in an unlit corner (1411)');
  assert(/_cmMark\.raycast = function\(\)\{\};/.test(mk), 'its raycast is neutralised at construction');
}

done();
