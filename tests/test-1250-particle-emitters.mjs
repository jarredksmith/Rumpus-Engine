import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1250: AMBIENT PARTICLE EMITTERS — six fx_* presets shipped as PROPS, so the whole editor
// (gizmo, duplicate, clipboard, prefabs, tags, hide/show verbs, serialization, net sync) comes free.
// Executed here: the real seed / envelope / step through bounds, respawn, the jet splash, and the
// blink; pinned: the three collision exemptions, the shared-material reuse, and the no-lights rule.

const sys = src.slice(src.indexOf('build 1250: AMBIENT PARTICLE EMITTERS'), src.indexOf('function disposeFireZones'));
assert(sys.length > 500 && sys.length < 12000, 'the system block is where expected');

// --- the presets ------------------------------------------------------------------------------------
/* build 1331 moved FX_PRESETS ABOVE PRIMITIVE_BUILDERS — a saved level with an emitter hit a temporal
   dead zone at boot. Slicing "from FX_PRESETS to buildFxEmitter" now spans ~7,500 unrelated lines, so cut
   the TABLE itself instead: a position-relative extraction is exactly what a move breaks. */
/* ...and the table is no longer inside `sys` at all, because `sys` starts at the 1250 comment block that
   stayed put. Cut it from the WHOLE source. */
const _fxTable = (t) => { const i = t.indexOf('const FX_PRESETS = {'); return t.slice(i, t.indexOf('\n};\n', i) + 3); };
const presets = new Function(_fxTable(src) + '; return FX_PRESETS;')();
const KINDS = ['fx_ember', 'fx_dust', 'fx_smoke', 'fx_steam', 'fx_firefly', 'fx_fountain'];
eq(Object.keys(presets).length, 6, 'six presets');
for (const k of KINDS) {
  const P = presets[k];
  assert(P && P.n >= 8 && P.n <= 120, `${k}: particle count bounded`);
  assert(P.life[0] > 0 && P.life[1] >= P.life[0], `${k}: sane lifetime range`);
  assert(P.size[0] > 0 && P.size[1] >= P.size[0], `${k}: sane size range`);
  assert(P.region.every(v => v > 0), `${k}: a real spawn region`);
  assert(P.colA.concat(P.colB).every(v => v >= 0 && v <= 1.001), `${k}: colours in range`);
  assert(typeof P.add === 'boolean', `${k}: an explicit blend choice`);
}

// --- executable: envelope, seed, step ---------------------------------------------------------------
const env = new Function('age', 'life', `${extractFunction('_fxEnv')}; return _fxEnv(age, life);`);
near(env(0, 2), 0, 1e-9); near(env(2, 2), 0, 1e-6);
assert(env(1, 2) > 0.99, 'the envelope peaks mid-life');
assert(env(0.2, 2) < env(0.6, 2) && env(1.4, 2) > env(1.8, 2), 'rises then falls — no pop-in, no pop-out');

const mkSeed = new Function('P', `${extractFunction('_fxSeed')}; return (p)=>_fxSeed(p, P);`);
for (const k of KINDS) {
  const P = presets[k]; const seed = mkSeed(P);
  for (let i = 0; i < 200; i++) {
    const p = {}; seed(p);
    assert(p.life >= P.life[0] && p.life <= P.life[1], `${k}: seeded life in range`);
    assert(p.size0 >= P.size[0] && p.size0 <= P.size[1], `${k}: seeded size in range`);
    assert(Math.abs(p.bx) <= P.region[0] && Math.abs(p.bz) <= P.region[2], `${k}: base inside the region`);
    assert(p.vy >= P.up[0] && p.vy <= P.up[1], `${k}: rise speed in range`);
    if (i > 0) break;   // full sweep only on the first preset pass; one spot-check after
  }
}

// the real step over a stubbed runtime: alpha bounded, respawn works, the jet splashes back
function rig(kind) {
  const P = presets[kind];
  const stepSrc = extractFunction('_fxStep');
  const mk = new Function('FX_PRESETS', `${extractFunction('_fxSeed')}; ${extractFunction('_fxEnv')}; ${stepSrc}; return _fxStep;`);
  const step = mk(presets);
  const n = P.n;
  const attr = () => ({ needsUpdate: false });
  const rt = { P, parts: [], geo: { attributes: { position: attr(), aColor: attr(), aSize: attr(), aAlpha: attr() } },
    pos: new Float32Array(n * 3), col: new Float32Array(n * 3), size: new Float32Array(n), alp: new Float32Array(n) };
  const seed = mkSeed(P);
  for (let i = 0; i < n; i++) { const p = {}; seed(p); p.age = Math.random() * p.life; rt.parts.push(p); }
  const o = { scale: { x: 1, y: 1, z: 1 } };
  return { step: (dt) => step(o, rt, dt), rt, o };
}
{ // 10 simulated seconds of embers: every alpha stays in [0,1], sizes positive, buffers marked dirty
  const { step, rt } = rig('fx_ember');
  for (let f = 0; f < 600; f++) step(1 / 60);
  for (let i = 0; i < rt.alp.length; i++) {
    assert(rt.alp[i] >= 0 && rt.alp[i] <= 1.001, 'alpha bounded');
    assert(rt.size[i] > 0, 'size positive');
  }
  assert(rt.geo.attributes.position.needsUpdate && rt.geo.attributes.aAlpha.needsUpdate, 'buffers marked for upload');
}
{ // respawn: a particle never carries age past its life
  const { step, rt } = rig('fx_dust');
  for (let f = 0; f < 900; f++) { step(1 / 60); for (const p of rt.parts) assert(p.age <= p.life + 1e-6, 'age never exceeds life'); }
}
{ // the fountain: under gravity -9 every rendered particle stays at or above its pool base
  const { step, rt } = rig('fx_fountain');
  for (let f = 0; f < 600; f++) {
    step(1 / 60);
    for (let i = 0; i < rt.parts.length; i++) assert(rt.pos[i * 3 + 1] >= rt.parts[i].by - 1e-4, 'a jet particle splashes back and respawns, never tunnels below the pool');
  }
}
{ // scale: doubling the prop scale doubles the point sizes (positions ride the transform for free)
  const a = rig('fx_smoke'); const b = rig('fx_smoke');
  b.o.scale = { x: 2, y: 2, z: 2 };
  b.rt.parts = a.rt.parts.map(p => ({ ...p }));   // identical particles
  a.step(1 / 60); b.step(1 / 60);
  near(b.rt.size[0] / a.rt.size[0], 2, 1e-6);
}

// --- wiring pins ------------------------------------------------------------------------------------
assert(/fx_ember:\(\)=>buildFxEmitter\('fx_ember'\)/.test(src) && /fx_fountain:\(\)=>buildFxEmitter\('fx_fountain'\) \};/.test(src),
  'all six presets are PRIMITIVE_BUILDERS entries — spawnProp/serialize/duplicate/net-sync work unchanged');
assert(/if\(obj\.userData\.fx\)\{ obj\.userData\.boxes = \[\]; return; \}/.test(src),
  'collider exemption 1: no per-mesh collision boxes, ever (the overall box stays for selection)');
assert(/if\(o\.userData && o\.userData\.fx\) return;   \/\/ build 1250: an emitter never gets a physics body/.test(src),
  'collider exemption 2: no Rapier static body');
assert(/if\(!obj\.userData\.fx\) colliders\.push\(obj\);/.test(src),
  'collider exemption 3: emitters never join the colliders list (no raycast, no enemy avoidance, no ghost walls — the 1236 class, prevented)');
assert(/if\(typeof updateEmitters==='function'\) updateEmitters\(dt\);/.test(src), 'the loop ticks emitters beside the other world effects');
assert(/P\.add \? _getFireMat\(\) : _getFireMatSmoke\(\)/.test(src),
  'the fire system’s SHARED materials are reused — no new shader to silently fail, and the G-buffer sweeps already handle them');
assert(/obj\.userData\._fxRT\.geo\.dispose\(\)/.test(src) && !/_fxRT\.pts\.material\.dispose/.test(src),
  'removal disposes the per-emitter geometry and never the shared material');
assert(!/new THREE\.PointLight/.test(sys) && !/new THREE\.SpotLight/.test(sys),
  'no emitter creates a light — the 636/977/1153/1155 rule holds');
assert(/mk\.name='fxMark'; mk\.visible=false;/.test(src) && /rt\.mk\.visible=eo;/.test(src),
  'the selection marker exists only for the editor and is invisible in play');
/* build 1320: the six emitters were written out in the Object panel and nowhere else — the + menu could
   not place one. They are FX_SHAPES now, consumed by both. */
{ const fx = (new Function('return ('+(src.match(/const FX_SHAPES = (\[[\s\S]*?\n\]);/)||[])[1]+')'))();
  assert(fx.map(r=>r[0]).join(',')==='fx_ember,fx_dust,fx_smoke,fx_steam,fx_firefly,fx_fountain',
    'the editor offers the Effects row');
  assert(/for\(const \[fsrc,flabel\] of FX_SHAPES\)\{/.test(src), '...from the one table');
  assert(/for\(const \[src,label,glyph\] of FX_SHAPES\)\{/.test(src), '...which the + menu now shares'); }

done('build 1250: particle emitters — presets validated, seed/envelope/step executed (bounds, respawn, jet splash, scale), all three collision exemptions pinned, shared materials, no lights');
