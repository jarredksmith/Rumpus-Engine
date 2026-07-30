// build 1143: a generated arena's mood reaches the GROUND.
//
// Build 1134 sent every theme's authored colours to the sky. This is the other half of the same gap, and
// the same one-line-per-theme shape: `arenaMood` set sky, fog, post and ssao but never `floorColor` or
// `wallColor`, so the ENGINE's own ground plane and boundary walls stayed at DEFAULT_WORLD's cool
// grey-blue 0x4f5d66 / 0x5a6972 in every generated level. The imported ground stops at ±W and the
// engine's plane runs on to ±ARENA, so it was directly visible: in the `arena-editor` capture, an
// olive-grey plane butting straight against cream sand where the desert's ground ended.
//
// The colours are not new numbers either. `light.groundAlb` is the ground's albedo — the value the
// lightmap bake integrates for the sun bounce — so the plane the player walks past and the bounce the
// bake assumed are finally the same surface. A pleasant consequence: floorColor now equals skyGround, so
// the dome's ground band and the real ground meet at the horizon without a seam.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameSource, assert, eq, near, done } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const lgSrc = readFileSync(path.resolve(HERE, '..', 'tools', 'levelgen.mjs'), 'utf8').replace(/^#![^\n]*\n/, '');
const AsyncFn = Object.getPrototypeOf(async function(){}).constructor;
const api = await new AsyncFn('RUMPUS_LEVELGEN_HOST', 'Buffer', 'process',
  lgSrc + '\n;return { arenaMood, groundMood, skyHex, ARENA_THEMES };')({ deflateSync:()=>new Uint8Array(0), writeFileSync:()=>{} }, Buffer, process);

const srgb2lin = (c) => (c <= 0.04045) ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const linOf = (hex) => [16, 8, 0].map(sh => srgb2lin(((hex >> sh) & 255) / 255));

// ---------------------------------------------------------------- every theme sets a ground
for (const theme of api.ARENA_THEMES) {
  const { light, world } = api.arenaMood(theme);
  const tag = theme + ': ';
  for (const k of ['floorColor', 'wallColor', 'floorRough', 'floorMetal', 'wallRough', 'wallMetal'])
    assert(world[k] != null, tag + 'the mood sets ' + k);
  // the floor is the bake's own ground albedo, round-tripped through sRGB
  const back = linOf(world.floorColor);
  for (let i = 0; i < 3; i++)
    near(back[i], light.groundAlb[i], 0.01, tag + 'floorColor decodes to the bake\'s groundAlb (channel ' + i + ')');
  // ...which is also what the sky dome's ground band uses, so the horizon has no seam
  eq(world.floorColor, world.skyGround, tag + 'the ground plane and the dome\'s ground band are the same colour');
  // the walls are the same albedo one value down: the same world, not a different one
  const wall = linOf(world.wallColor);
  for (let i = 0; i < 3; i++) {
    assert(wall[i] < back[i] + 1e-6, tag + 'the boundary wall is no brighter than the ground (channel ' + i + ')');
    if (back[i] > 0.02) assert(wall[i] > back[i] * 0.25, tag + 'but not so dark it reads as a different material (channel ' + i + ')');
  }
  // hue is preserved: a wall that is a scaled copy of the ground cannot drift in hue
  if (Math.max(...back) > 0.02) {
    const hueOf = (c) => { const m = Math.max(...c) || 1; return c.map(v => v / m); };
    const hb = hueOf(back), hw = hueOf(wall);
    for (let i = 0; i < 3; i++) near(hw[i], hb[i], 0.06, tag + 'the wall keeps the ground\'s hue (channel ' + i + ')');
  }
  // physically sane surfaces: ground is matte, and nothing is a mirror
  assert(world.floorRough >= 0.65 && world.floorRough <= 1, tag + 'the ground is rough (' + world.floorRough + ')');
  assert(world.floorMetal >= 0 && world.floorMetal <= 0.25, tag + 'and not metal (' + world.floorMetal + ')');
}

// ---------------------------------------------------------------- the values match the theme
{
  // spot-checks a reader can verify by eye, because "it round-trips" would also hold for seven greys
  const hue = (hex) => { const [r, g, b] = [16, 8, 0].map(sh => (hex >> sh) & 255); return { r, g, b }; };
  const desert = hue(api.arenaMood('desert').world.floorColor);
  assert(desert.r > desert.g && desert.g > desert.b, 'desert ground is warm sand, R>G>B (' + JSON.stringify(desert) + ')');
  assert(desert.r > 150, '...and light (' + desert.r + ')');
  const frost = hue(api.arenaMood('frost').world.floorColor);
  assert(frost.b > frost.r && frost.b > 200, 'frost ground is bright cool snow (' + JSON.stringify(frost) + ')');
  const garden = hue(api.arenaMood('garden').world.floorColor);
  assert(garden.g > garden.r && garden.g > garden.b, 'garden ground is green (' + JSON.stringify(garden) + ')');
  const facility = hue(api.arenaMood('facility').world.floorColor);
  assert(facility.b > facility.r && facility.b < 120, 'facility ground is a dark cool apron (' + JSON.stringify(facility) + ')');
  const volcanic = hue(api.arenaMood('volcanic').world.floorColor);
  assert(volcanic.r > volcanic.b, 'volcanic ground is warm ash (' + JSON.stringify(volcanic) + ')');
  // and no two themes ship the same ground, or the feature achieves nothing
  const seen = new Map();
  for (const t of api.ARENA_THEMES) {
    const c = api.arenaMood(t).world.floorColor;
    assert(!seen.has(c), t + ' has its own ground colour (clashes with ' + seen.get(c) + ')');
    seen.set(c, t);
  }
  // the engine default is what they were all stuck on — none of them may still be it
  const dw = gameSource().match(/const DEFAULT_WORLD = \{[\s\S]*?\};/)[0];
  const defFloor = parseInt(dw.match(/floorColor:\s*0x([0-9a-f]{6})/)[1], 16);
  for (const t of api.ARENA_THEMES) assert(api.arenaMood(t).world.floorColor !== defFloor, t + ' no longer ships the engine default ground');
}

// ---------------------------------------------------------------- one literal, three consumers
{
  // The bake, the dome and the ground all read the same array. Before this build the arrays were written
  // out twice per theme and this would have made it three times — which is how a mood ends up lighting
  // its bake against one ground and showing the player another.
  const fn = lgSrc.slice(lgSrc.indexOf('function arenaMood(theme) {'), lgSrc.indexOf('const ARENA_THEMES'));
  const triples = (fn.match(/\[\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*\]/g) || []);
  // FOUR colour triples per theme and no more: zen, hor and gnd (each declared once, then used up to
  // three times by name) plus sunCol. Before this build there were seven per theme, because zen/hor/gnd
  // were written out in the `light` block AND again inside the skyMood(...) call.
  eq(triples.length, api.ARENA_THEMES.length * 4,
    'each theme declares exactly four colour triples (' + triples.length + ') - no literal is written twice');
  for (const t of api.ARENA_THEMES) assert(/skyZen: zen, skyHor: hor, groundAlb: gnd/.test(fn), 'the bake reads the named arrays');
  eq((fn.match(/\.\.\.skyMood\(zen, hor, gnd,/g) || []).length, api.ARENA_THEMES.length, 'so does the dome, for all ' + api.ARENA_THEMES.length + ' themes');
  eq((fn.match(/\.\.\.groundMood\(gnd/g) || []).length, api.ARENA_THEMES.length, '...and so does the ground');
}
{
  // groundMood, executed directly: the defaults and the overrides
  const g = api.groundMood([0.5, 0.4, 0.3]);
  eq(g.floorRough, 0.95, 'the default ground is matte');
  eq(g.floorMetal, 0.05, '...and near-dielectric');
  eq(api.groundMood([0.5, 0.4, 0.3], 0.7, 0.18).floorRough, 0.7, 'a theme can override the roughness');
  eq(api.groundMood([0.5, 0.4, 0.3], 0.7, 0.18).floorMetal, 0.18, '...and the metalness');
  eq(api.groundMood([0, 0, 0]).floorColor, 0, 'black stays black');
  eq(api.groundMood([1, 1, 1]).floorColor, 0xffffff, 'white stays white');
  eq(api.groundMood([1, 1, 1]).wallColor, api.skyHex([0.55, 0.55, 0.55]), 'the wall is the ground at 55%, in LINEAR space (where 55% of the light is 55% of the light)');
}

// ---------------------------------------------------------------- the keys actually exist in the engine
{
  const dw = gameSource().match(/const DEFAULT_WORLD = \{[\s\S]*?\};/)[0];
  for (const k of ['floorColor', 'floorRough', 'floorMetal', 'wallColor', 'wallRough', 'wallMetal'])
    assert(new RegExp('\\b' + k + ':').test(dw), 'DEFAULT_WORLD has ' + k + ', so the emitted key is applied rather than ignored');
  // and applyWorldCfg is what applies them — a key the generator emits that nothing reads is dead weight
  const src = gameSource();
  assert(/floorMat\.color\.setHex\(worldCfg\.floorColor>>>0\);/.test(src), 'floorColor reaches the floor material');
  assert(/wallMat\.color\.setHex\(worldCfg\.wallColor>>>0\);/.test(src), 'wallColor reaches the wall material');
  assert(/floorMat\.roughness = Math\.max\(0, Math\.min\(1, \+worldCfg\.floorRough\)\);/.test(src), 'floorRough too');
  assert(/floorMat\.metalness = Math\.max\(0, Math\.min\(1, \+worldCfg\.floorMetal\)\);/.test(src), '...and floorMetal');
}

done('build 1143: every generated theme sets the engine\'s own ground and boundary walls, from the albedo its bake already uses');
