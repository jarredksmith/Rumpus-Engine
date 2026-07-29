// build 1114: three more arena themes — desert, frost, facility — and the material families they
// needed. Also the refactor that made adding them cheap: a theme is DATA now (its materials plus the
// treatments it asks for: wall dressing, joinery, centrepiece, yard cover, foliage, names), so
// buildArena carries no `theme === ...` branch at all.
//
// The painters are tested by their PROPERTIES, not by eye, because the properties are what went
// wrong on the first cut of each one:
//   - snow's relief has to live in the height field, not the albedo. Driving base colour off the
//     drift height painted the sastrugi on as blue stripes; real snow is flat white with shape.
//   - sandstone has to read as BEDDING: row-to-row variation an order of magnitude above
//     column-to-column, or it is just noise with a brown tint.
//   - ice has to be mostly glassy with matte frost over it — one roughness value is the single
//     biggest tell of a procedural material (the painter's own opening comment).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq, done } from './harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lgSrc = readFileSync(path.join(root, 'tools', 'levelgen.mjs'), 'utf8').replace(/^#![^\n]*\n/, '');
const html = readFileSync(path.join(root, 'breach.html'), 'utf8');

const AsyncFn = Object.getPrototypeOf(async function(){}).constructor;
const host = { deflateSync: () => new Uint8Array(0), writeFileSync: () => {} };
process.env.TEXSIZE = '64';
const factory = new AsyncFn('RUMPUS_LEVELGEN_HOST', 'Buffer', 'process',
  lgSrc + '\n;return { snowTex, iceTex, sandstoneTex, MATLIB, ARENA_THEMES, arenaPalette, arenaMood, buildArena, prims, MATS, SOLIDS };');
const fresh = () => factory(host, { from:()=>{}, alloc:()=>{}, concat:()=>{} }, { env: process.env, argv: [] });
const api = await fresh();

// ---------------------------------------------------------------- the library grew
for (const id of ['sandstone', 'sandRed', 'snow', 'ice']) assert(api.MATLIB[id], 'the material library has ' + id);
eq(api.ARENA_THEMES.length, 7, 'seven arena themes');
for (const t of ['desert', 'frost', 'facility']) assert(api.ARENA_THEMES.includes(t), t + ' is one of them');

// ---------------------------------------------------------------- painter properties
const S = 64;
const stat = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length;
  return { m, sd: Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) }; };
const lumOf = (t) => Array.from({ length: S * S }, (_, i) => (t.rgb[i*3] + t.rgb[i*3+1] + t.rgb[i*3+2]) / 3);
const bandiness = (t) => {                       // row-to-row vs column-to-column variation
  const lum = lumOf(t), rows = [], cols = [];
  for (let y = 0; y < S; y++) { let s = 0; for (let x = 0; x < S; x++) s += lum[y*S+x]; rows.push(s / S); }
  for (let x = 0; x < S; x++) { let s = 0; for (let y = 0; y < S; y++) s += lum[y*S+x]; cols.push(s / S); }
  return stat(rows).sd / Math.max(1e-6, stat(cols).sd);
};
const chan = (t, q) => { let s = 0; for (let i = 0; i < S*S; i++) s += t.rgb[i*3+q]; return s / (S*S); };

{
  const t = api.snowTex('t_snow_test', 241, S), L = stat(lumOf(t)), H = stat(Array.from(t.h));
  assert(L.m > 0.85, 'snow is bright (' + L.m.toFixed(3) + ')');
  assert(L.sd < 0.06, '...and its albedo is nearly flat (sd ' + L.sd.toFixed(3) + ') — no painted-on stripes');
  assert(H.sd > 0.08, '...while the drifts and sastrugi live in the height field (sd ' + H.sd.toFixed(3) + ')');
  assert(chan(t, 2) > chan(t, 0) + 0.02, '...and the hollows are sky-lit, so blue leads red');
  const rough = Array.from({ length: S*S }, (_, i) => t.mr[i*2]);
  assert(rough.some(v => v < 0.6) && rough.some(v => v > 0.8), 'glazed crests against matte powder');
}
{
  const t = api.iceTex('t_ice_test', 251, S);
  const rough = Array.from({ length: S*S }, (_, i) => t.mr[i*2]);
  const glassy = rough.filter(v => v < 0.25).length / rough.length;
  const frost = rough.filter(v => v > 0.5).length / rough.length;
  assert(glassy > 0.4, 'ice is mostly glassy (' + (glassy * 100).toFixed(0) + '% under 0.25 roughness)');
  assert(frost > 0.01, '...with wind frost gone matte over it (' + (frost * 100).toFixed(0) + '%)');
  assert(chan(t, 2) > chan(t, 0) + 0.1, '...and it reads blue');
  assert(stat(Array.from(t.h)).sd > 0.04, '...with fractures cut into the height field');
}
{
  const t = api.sandstoneTex('t_sst_test', 233, S);
  assert(bandiness(t) > 3, 'sandstone reads as bedding: row variation ' + bandiness(t).toFixed(1) + 'x column variation');
  assert(chan(t, 0) > chan(t, 2) + 0.15, '...and stays warm — the soft beds are darker ochre, not grey');
  assert(stat(lumOf(t)).sd > 0.06, '...with real tone range between the beds');
}
// deterministic: the same seed paints the same texture, or a shared level would differ per client
{
  const a = api.sandstoneTex('x', 233, S), b = api.sandstoneTex('y', 233, S);
  let same = true; for (let i = 0; i < S * S * 3; i++) if (a.rgb[i] !== b.rgb[i]) { same = false; break; }
  assert(same, 'the painters are deterministic');
}

// ---------------------------------------------------------------- a theme is data
{
  const body = lgSrc.slice(lgSrc.indexOf('function buildArena(seed, theme, size, footprint)'));
  assert(!/theme === /.test(body),
    'buildArena branches on the palette\'s treatments, not on the theme name — adding a theme is one palette entry');
  assert(/if \(!ARENA_THEMES\.includes\(theme\)\) theme = ARENA_THEMES\[\(rr\(\) \* ARENA_THEMES\.length\) \| 0\];/.test(lgSrc),
    '...and "auto" rolls over every theme there is, including the new ones');
  for (const th of api.ARENA_THEMES) {
    const P = (await fresh()).arenaPalette(th);
    for (const k of ['ground', 'wall', 'slab', 'ramp', 'pillar', 'parapet', 'cover', 'cover2', 'trim',
                     'signC', 'foliage', 'dress', 'plaza', 'yard', 'lightCol', 'depot', 'names'])
      assert(P[k] != null, th + ' palette defines ' + k);
    assert(P.names.length >= 4, th + ' has arena names');
    const M = api.arenaMood(th);
    assert(M.light && M.world && M.world.sunColor != null, th + ' has a bake rig and a runtime mood');
    assert(M.light.sunElev >= 0 && M.light.sunElev <= 90, th + ' sun elevation is sane (' + M.light.sunElev + ')');
  }
}
// every theme actually builds an arena, with geometry and its own name
for (const th of ['desert', 'frost', 'facility']) {
  const a2 = await fresh();
  const info = a2.buildArena(21, th, 'medium', 'square');
  assert(new RegExp('seed 21 · ' + th + ' · medium').test(info.name), th + ' builds (' + info.name + ')');
  const tris = a2.prims.reduce((s, p) => s + (p ? p.idx.length / 3 : 0), 0);
  assert(tris > 4000, '...with real geometry (' + tris + ' triangles)');
  assert(a2.SOLIDS.length > 60, '...and occluders for the bake (' + a2.SOLIDS.length + ')');
}

// ---------------------------------------------------------------- decoration cannot block a ramp
// The wall-foot pieces (volcanic rubble, frost drifts) are chosen while the perimeter is dressed —
// before the galleries and buildings exist. Dropped there and then, one lands on a gallery ramp.
assert(/const later = \(x, z, r, fn\) => LATE\.push\(\[x, z, r, fn\]\);/.test(lgSrc),
  'wall-foot decoration is deferred, not placed on the spot');
assert(/for \(const \[lx, lz, lr, fn\] of LATE\) \{\n\s*if \(AV\.some/.test(lgSrc),
  '...and dropped later only where nothing has reserved the ground');
assert(/later\(bx2, bz2, R, \(\) => boulder\(P\.cover/.test(lgSrc), '...volcanic rubble goes through it');
assert(/later\(dx2, dz2, R, \(\) => boulder\(P\.snow/.test(lgSrc), '...and so do the frost drifts');
assert(/if \(!clear\(sx, sz\) \|\| !clear\(-sx, -sz\)\) continue;/.test(lgSrc),
  'and mirrored cover tests BOTH copies against the reserved rects, not just the candidate');

// ---------------------------------------------------------------- the editor offers them
assert(/pickRow\('Theme', \['auto','industrial','castle','volcanic','garden','desert','frost','facility'\]/.test(html),
  'the Generate Arena dialog lists every theme');
assert(/ARENA_THEMES\.join\('\|'\)/.test(lgSrc), 'and the CLI usage line is generated from the same list');

done('build 1114: desert, frost and facility — plus sandstone, snow and ice to build them from');
