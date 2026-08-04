// (build 1360) THE FIRST FRAME IS STAGED NOW — five numbers, from the AAA art-direction review.
//
// Measured on the shipped frame, authored hex linearised to relative luminance:
//     _DL.pipe 0.0149 | _DL.wall 0.0365 | _DL.deck 0.0592   <- the level's own structure
//     floorColor 0.1040  <- the ENGINE ground plane, +0.81 stops over the deck it surrounds
//     wallColor  0.1349  <- the BOUNDARY WALL, +1.19 stops over the deck, and the coolest thing in shot
// The two surfaces with the least to say were the first and second brightest large albedos, so nothing
// popped off the floor and the frame's outer ring was its brightest region.
//
// AND THE SUN WAS 117 DEGREES BEHIND THE PLAYER — which is why no capture in this repo ever had a rim
// light, a long shadow toward camera, or the sun anywhere in frame.
//
// Captured, pinned top rung (MSAA x4), the same pose, before and after:
//     azim 63/elev 34 (before)  clip 0.05%  ground Y 0.0853  ground sat 0.314
//     azim 150/elev 24          clip 5.04%  ground Y 0.0617  ground sat 0.212   <- TRIED AND REJECTED
//     azim 105/elev 24 (ship)   clip 0.03%  ground Y 0.0486  ground sat 0.254
// The middle row is the interesting one: textbook three-quarter back-light put the sun disc and its glow
// inside a 110-degree horizontal fov, auto-exposure lifted the frame to accommodate it, and clipping went
// up a hundredfold. The ELEVATION buys the shadows; the azimuth only decides whether you are photographing
// the level or the sun.
import { gameSource, assert, near, done } from './harness.mjs';

const src = gameSource();
const DW = src.match(/const DEFAULT_WORLD = \{[^\n]*/)[0];
const num = (k) => { const m = DW.match(new RegExp(k + ':(0x[0-9a-fA-F]+|-?[\\d.]+),')); assert(m, k + ' is declared'); return m[1].startsWith('0x') ? parseInt(m[1], 16) : Number(m[1]); };

const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const lin = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255].map(v => s2l(v / 255));
const Y = (h) => { const a = lin(h); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };

// the level's own palette, read from _DL rather than restated
const DL = src.slice(src.indexOf('const _DL = {'), src.indexOf('const _DL = {') + 2600);
const dl = (k) => { const m = DL.match(new RegExp('\\b' + k + ':\\s*\\{\\s*col:(0x[0-9a-fA-F]+)')); assert(m, '_DL.' + k + ' is declared'); return parseInt(m[1], 16); };

// ---- the value structure, computed from the real constants ----
{
  const floor = Y(num('floorColor')), wall = Y(num('wallColor'));
  const deck = Y(dl('deck')), crate = Y(dl('crate')), crateH = Y(dl('crateH'));

  assert(floor < deck,
    'THE GROUND IS THE DARKEST LARGE VALUE, which is where it sits in almost every shipped AAA frame. ' +
    'It was +0.81 stops OVER the deck it surrounds (floor ' + floor.toFixed(4) + ' vs deck ' + deck.toFixed(4) + ')');
  assert(wall < crate && wall < crateH,
    'and the boundary wall recedes behind the props instead of being the brightest thing in the outer ring, ' +
    'where a 0.42 vignette was fighting it (wall ' + wall.toFixed(4) + ' vs crate ' + crate.toFixed(4) + ')');
  assert(wall > floor,
    '...but still above the ground, so the far edge reads as a wall rather than merging with the floor');
  // the props are now the brightest things in the level, which is the point of a value structure
  assert(crateH > wall && crateH > floor, 'the highlight crate is the brightest authored surface');
}

// ---- the hue survived, because the scaling was done in LINEAR space ----
{
  const before = [0x5f, 0x5a, 0x55].map(v => s2l(v / 255));
  const after = lin(num('floorColor'));
  const rb = before[0] / before[2], ra = after[0] / after[2];
  near(ra, rb, 0.06, 'the ground keeps its warm hue exactly — a uniform linear scale cannot change ' +
    'chromaticity (R/B ' + rb.toFixed(3) + ' -> ' + ra.toFixed(3) + ')');
  assert(after[0] > after[2], '...and it is still warm, which build 1156 tied to the dome’s ground band');
}

// ---- the sun is staged, and the geometry is checked rather than asserted ----
{
  const az = num('sunAzim') * Math.PI / 180, el = num('sunElev') * Math.PI / 180;
  // _sunDir(): (cos el sin az, sin el, cos el cos az). The spawn stands at (0,1.2,30) facing -Z.
  const hx = Math.cos(el) * Math.sin(az), hz = Math.cos(el) * Math.cos(az);
  const n = Math.hypot(hx, hz), dot = (hz * -1) / n;
  const offAhead = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;

  assert(dot > 0, 'the sun is in FRONT of the spawn’s view, not 117 degrees behind it — that is what puts ' +
    'a rim on a vertical edge and a shadow between the player and what they are looking at');
  assert(offAhead > 45,
    '...and far enough off the view axis to stay out of frame: at 30 degrees the disc and its glow sit ' +
    'inside a 110-degree horizontal fov and clipping measured 5.04% (' + offAhead.toFixed(0) + ' degrees)');
  const shadow = 1 / Math.tan(el);
  assert(shadow > 2, 'the sun is low enough that a caster throws a shadow over twice its height (' +
    shadow.toFixed(2) + 'x, was 1.48x)');
  assert(num('sunElev') > 8, '...but not so low that half the level is in shade');
}

// ---- the bounce was re-derived, not left behind ----
{
  // build 1149's term is `bounce * sun`, coloured by sunColor x mix(floor, wall, 0.4) — the ALBEDO is
  // already in the colour, so halving the floor's luminance halves the delivered fill unless this moves.
  const bounce = num('bounce');
  const floorNow = Y(num('floorColor')), floorWas = Y(0x5f5a55);
  const deliveredNow = bounce * floorNow, deliveredWas = 0.50 * floorWas;
  assert(deliveredNow < deliveredWas,
    'a darker ground bounces LESS, as it physically must — the term is not compensated back to parity');
  assert(deliveredNow / deliveredWas > 0.6,
    '...but it keeps most of build 1149’s margin against a crushed red channel, against a frame that now ' +
    'has far more surface in shade (' + (deliveredNow / deliveredWas * 100).toFixed(0) + '% of the old fill)');
}

// ---- the dome's ground band moved with the plane it meets ----
{
  const g = lin(num('skyGround')), f = lin(num('floorColor'));
  const uy = (a) => { const y = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; return a.map(v => v / y); };
  const ug = uy(g), uf = uy(f);
  for (let k = 0; k < 3; k++)
    near(uf[k], ug[k], 0.035, 'build 1156’s link survives the restaging — same hue either side of the ' +
      'horizon (ch ' + k + ')');
  assert(Y(num('skyGround')) > Y(num('floorColor')),
    '...with the band still the brighter of the two, so it is not skyGround adopted outright');
}

// ---- and the sky preset that promises to return stock still does ----
{
  const day = src.match(/day:\s*\{[^\n]*/)[0];
  for (const k of ['skyZenith', 'skyHorizon', 'skyGround', 'skyTurb', 'skySunSize', 'skySunGlow', 'skyExp', 'sun', 'sunColor', 'sunElev']) {
    const a = day.match(new RegExp(k + ':\\s*(0x[0-9a-fA-F]+|-?[\\d.]+)')), b = DW.match(new RegExp(k + ':\\s*(0x[0-9a-fA-F]+|-?[\\d.]+)'));
    assert(a && b && a[1] === b[1], 'build 1234’s Day preset still restates DEFAULT_WORLD exactly (' + k + ')');
  }
}

done('build 1360: the ground is the darkest value and the sun is in front of the player');
