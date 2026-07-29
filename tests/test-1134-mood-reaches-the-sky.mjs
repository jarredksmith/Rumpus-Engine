// build 1134: a generated arena's lighting mood reaches the SKY.
//
// arenaMood authors seven complete moods — golden hour, ashen overcast, bright clear day, high noon,
// blue hour over snow, night on the pad, cool working day — and every one of them rendered under
// DEFAULT_WORLD's single temperate noon sky.
//
// The runtime block emitted `skyColor` (the hemisphere light's tint) and `fogColor`, but the procedural
// dome is driven by skyZenith / skyHorizon / skyGround / skyTurb, which nothing set. And since engine
// build 1127 the fog colour is derived FROM the dome, so the authored fogColor was discarded as well.
//
// Measured on captured frames at the same sky pixel (640,18) across seven themes, before:
//   desert 137,172,208 · industrial 142,179,216 · frost 150,182,213 · facility 155,190,225
//   castle 152,187,222 · garden 141,177,214 · volcanic 150,184,218
// R:B between 0.657 and 0.704 — one hue, seven times, with the NIGHT theme indistinguishable from
// high noon. After: facility 62,82,118 (R:B 0.53) · desert 154,176,201 (0.77) · volcanic 134,131,132
// (1.02) — a night sky, a dusty noon sky and a neutral overcast sky.
//
// The colours are not new numbers. They are light.skyZen / skyHor / groundAlb, which the mood already
// carries because the LIGHTMAP BAKE integrates against them — so emitting them means the sky the player
// sees and the sky the bake assumed are finally the same sky.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, eq, near, done } from './harness.mjs';

const lgSrc = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'levelgen.mjs'), 'utf8')
  .replace(/^#![^\n]*\n/, '');
const AsyncFn = Object.getPrototypeOf(async function(){}).constructor;
const api = await new AsyncFn('RUMPUS_LEVELGEN_HOST', 'Buffer', 'process',
  lgSrc + '\n;return { arenaMood, skyHex, ARENA_THEMES };')({ deflateSync:()=>new Uint8Array(0), writeFileSync:()=>{} }, Buffer, process);

// ---------------------------------------------------------------- the encode
// _skyP() reads these hexes through THREE.Color with legacyMode:false, which treats them as sRGB and
// linearises them. A linear bake value therefore has to be sRGB-ENCODED on the way out; emitting it
// raw would darken every sky by roughly a 2.2 gamma.
{
  const srgb2lin = (c) => (c <= 0.04045) ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  for (const lin of [0, 0.002, 0.05, 0.14, 0.42, 0.68, 1]) {
    const hex = api.skyHex([lin, lin, lin]);
    const back = srgb2lin(((hex >> 16) & 255) / 255);
    assert(Math.abs(back - lin) < 0.006, 'linear ' + lin + ' round-trips through the hex to ' + back.toFixed(4));
  }
  eq(api.skyHex([0, 0, 0]), 0x000000, 'black is black');
  eq(api.skyHex([1, 1, 1]), 0xffffff, 'white is white');
  eq(api.skyHex([2, -1, 0.5]), 0xff00bc, 'out-of-range components clamp rather than wrapping the channel');
  // the channels must not be transposed — a bug here would tint every sky
  const h = api.skyHex([1, 0, 0]);
  eq(h, 0xff0000, 'red stays in the red channel');
}

// ---------------------------------------------------------------- every theme emits a sky, and its own
{
  const seen = [];
  for (const theme of api.ARENA_THEMES) {
    const m = api.arenaMood(theme), w = m.world;
    for (const k of ['skyZenith', 'skyHorizon', 'skyGround', 'skyTurb', 'skySunGlow', 'skySunSize'])
      assert(w[k] != null, theme + ' emits ' + k);
    // and they are the bake's OWN colours, so the two cannot drift apart
    eq(w.skyZenith, api.skyHex(m.light.skyZen), theme + ": the dome's zenith IS the bake's zenith");
    eq(w.skyHorizon, api.skyHex(m.light.skyHor), theme + ': ...and its horizon');
    eq(w.skyGround, api.skyHex(m.light.groundAlb), theme + ': ...and its ground bounce');
    seen.push({ theme, zen: w.skyZenith });
  }
  // no two themes share a zenith: that is exactly the failure this build fixes
  const zens = new Set(seen.map(s => s.zen));
  eq(zens.size, api.ARENA_THEMES.length, 'all ' + api.ARENA_THEMES.length + ' themes have a DIFFERENT sky, not one sky seven times');
}
{
  // the moods that are meant to look nothing alike must measurably not
  const L = (hex) => { const s2l = (c) => (c <= 0.04045) ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
    return 0.2126*s2l(((hex>>16)&255)/255) + 0.7152*s2l(((hex>>8)&255)/255) + 0.0722*s2l((hex&255)/255); };
  const zen = (t) => api.arenaMood(t).world.skyZenith;
  const night = L(zen('facility')), noon = L(zen('desert')), day = L(zen('garden'));
  assert(night < noon * 0.4, 'the NIGHT theme\'s zenith is far darker than high noon\'s (' + night.toFixed(3) + ' vs ' + noon.toFixed(3) + ')');
  assert(night < day * 0.4, '...and than a clear day\'s (' + day.toFixed(3) + ')');
  // overcast has to be NEUTRAL: a grey sky is the whole look, and it was rendering blue
  const v = zen('volcanic'), r = (v>>16)&255, g = (v>>8)&255, b = v&255;
  assert(Math.abs(r - b) < 20 && Math.abs(g - b) < 20,
    'the ashen-overcast zenith is neutral, not blue (r' + r + ' g' + g + ' b' + b + ')');
  // and golden hour has to be WARM at the horizon, where the sun is
  const ch = api.arenaMood('castle').world.skyHorizon;
  assert(((ch>>16)&255) > (ch&255) + 30, 'golden hour\'s horizon is warmer than it is blue');
}
{
  // turbidity is haziness: the dome's ramp is pow(1-y, 1.6 + (1-turb)*3.4), so HIGH turb spreads the
  // horizon band. An overcast sky must be hazier than a clear one, or "overcast" is only a colour.
  const turb = (t) => api.arenaMood(t).world.skyTurb;
  assert(turb('volcanic') > turb('garden'), 'ashen overcast is hazier than a bright clear day (' + turb('volcanic') + ' vs ' + turb('garden') + ')');
  assert(turb('desert') > turb('industrial'), 'a dusty noon is hazier than a cool working day');
  for (const t of api.ARENA_THEMES){ const v = turb(t); assert(v >= 0 && v <= 1, t + ' turbidity is in range (' + v + ')'); }
  // a low sun through haze has a bigger, softer disc than a high hard one
  const size = (t) => api.arenaMood(t).world.skySunSize;
  assert(size('castle') > size('desert'), 'the golden-hour disc is larger than high noon\'s');
  assert(api.arenaMood('volcanic').world.skySunGlow < api.arenaMood('castle').world.skySunGlow,
    'and an overcast sky has almost no disc glow at all');
}
{
  // the mood must still carry everything it carried before — this build ADDS keys, it replaces none
  for (const theme of api.ARENA_THEMES) {
    const w = api.arenaMood(theme).world;
    for (const k of ['sun', 'sunColor', 'sunAzim', 'sunElev', 'sky', 'skyColor', 'ambient', 'fogDensity', 'fogColor', 'exposure', 'ssao'])
      assert(w[k] != null, theme + ' still emits ' + k);
  }
  // the sun elevations are the reason each mood exists; they must remain distinct
  const els = new Set(api.ARENA_THEMES.map(t => api.arenaMood(t).world.sunElev));
  assert(els.size >= 6, 'the sun elevations stay spread across the themes (' + [...els].sort((a,b)=>a-b).join(', ') + ')');
}
// the spread operator is how they land, so a future edit cannot silently drop them
assert(/\.\.\.skyMood\(/.test(lgSrc), 'the sky keys are spread into each theme\'s world block');
eq((lgSrc.match(/\.\.\.skyMood\(/g) || []).length, 7, 'all seven themes, none forgotten');

done('build 1134: seven authored moods render as seven skies, and the sky matches the bake');
