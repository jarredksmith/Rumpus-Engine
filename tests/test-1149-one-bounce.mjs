// build 1149: the shade had lost a whole colour channel.
//
// A HemisphereLight hands an up-facing surface 100% of the SKY colour and none of the ground colour,
// and a cosine lobe over a cubemap probe excludes the lower hemisphere entirely. Both are correct for
// a bare sky and both are wrong for a scene with walls and crates standing around it — so a floor in
// shadow was lit by nothing but blue, and the engine has no GI to supply the rest.
//
// Measured on the stock level, the floor inside a cast shadow, per channel:
//     R  min 0  p50 2  max 6   — 19% of the patch at EXACTLY 0, 73% at or below 2
//     G  min 28 p50 38 max 46
//     B  min 42 p50 50 max 57
// The red channel was gone. That is why the frame read as teal murk, and no grade could recover it:
// there was nothing left to recover.
//
// The fix is the standard pre-GI stand-in — one bounce of the SUN off the level's own surfaces, flat
// and direction-independent, coloured by sunColor x the level's own floor/wall albedo.
import { readFileSync } from 'node:fs';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- a Color that really is linear
// legacyMode is false in this engine, so THREE.Color.setHex converts sRGB -> linear on the way in.
// The whole point of the bounce colour is that it is a LINEAR product of light and albedo, so the
// stub has to do the transfer function for real or the test proves nothing about the arithmetic.
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
class Color {
  constructor(){ this.r = this.g = this.b = 0; }
  setHex(h){ this.r = s2l(((h >> 16) & 255) / 255); this.g = s2l(((h >> 8) & 255) / 255); this.b = s2l((h & 255) / 255); return this; }
  copy(o){ this.r = o.r; this.g = o.g; this.b = o.b; return this; }
  multiply(o){ this.r *= o.r; this.g *= o.g; this.b *= o.b; return this; }
  lerp(o, t){ this.r += (o.r - this.r) * t; this.g += (o.g - this.g) * t; this.b += (o.b - this.b) * t; return this; }
  get arr(){ return [this.r, this.g, this.b]; }
}
function mk(world){
  const bounceLight = { color: new Color(), intensity: -1 };
  const DEFAULT_WORLD = { sunColor: 0xfff2dc, floorColor: 0x4f5d66, wallColor: 0x5a6972, bounce: 0.50, sun: 1.5 };
  const fn = new Function('worldCfg', 'DEFAULT_WORLD', 'bounceLight', '_bnA', '_bnB', '_bnC',
    extractFunction('_applyBounce') + '; return _applyBounce;'
  )(Object.assign({}, DEFAULT_WORLD, world), DEFAULT_WORLD, bounceLight, new Color(), new Color(), new Color());
  return { fn, bounceLight };
}

// ---------------------------------------------------------------- the arithmetic, executed
{
  const { fn, bounceLight } = mk({});
  fn(1);
  // sunColor 0xfff2dc x (floor 0x4f5d66 lerped 40% toward wall 0x5a6972), all in linear
  const sun = new Color().setHex(0xfff2dc), alb = new Color().setHex(0x4f5d66);
  alb.lerp(new Color().setHex(0x5a6972), 0.4);
  const want = [sun.r * alb.r, sun.g * alb.g, sun.b * alb.b];
  near(bounceLight.color.r, want[0], 1e-9, 'the bounce colour is sunColor x albedo, in LINEAR space (R)');
  near(bounceLight.color.g, want[1], 1e-9, '...(G)');
  near(bounceLight.color.b, want[2], 1e-9, '...(B)');
  near(bounceLight.intensity, 0.50 * 1.5, 1e-9, 'and its strength is bounce x sun — a bounce is the key light coming back, so it scales with the key');
}
{
  // THE point of the whole build: the bounce is REDDER, relative to blue, than the sky term that was
  // clipping the channel. A term with the sky's own hue could not have fixed anything.
  const { fn, bounceLight } = mk({});
  fn(1);
  const bounceRB = bounceLight.color.r / bounceLight.color.b;
  const sky = new Color().setHex(0x6f9ad4);            // DEFAULT_WORLD.skyZenith — what lit the shade before
  const skyRB = sky.r / sky.b;
  assert(bounceRB > skyRB * 2,
    'the bounce is far redder than the sky it supplements (R:B ' + bounceRB.toFixed(2) + ' vs ' + skyRB.toFixed(2) + ')');
}
{
  // night: no key light, no bounce. This is what a flat `ambient` lift cannot do, and why the bounce
  // is a separate term rather than a bigger default for that one.
  const { fn, bounceLight } = mk({ sun: 0 });
  fn(1);
  eq(bounceLight.intensity, 0, 'no sun, no bounce');
  const b2 = mk({}); b2.fn(0);
  eq(b2.bounceLight.intensity, 0, '...and the day cycle takes it to zero at midnight, through the same daylight factor as the sun');
  const b3 = mk({}); b3.fn(0.5);
  near(b3.bounceLight.intensity, 0.50 * 1.5 * 0.5, 1e-9, '...proportionally in between');
}
{
  const { fn, bounceLight } = mk({ bounce: 0 });
  fn(1);
  eq(bounceLight.intensity, 0, 'a creator can switch it off entirely');
  const neg = mk({ bounce: -3 }); neg.fn(1);
  eq(neg.bounceLight.intensity, 0, '...and a negative value cannot subtract light');
  const nul = mk({ bounce: null }); nul.fn(1);
  eq(nul.bounceLight.intensity, 0, 'a null reads as zero here — applyWorldCfg is what substitutes the default, so this stays one job');
}
{
  // a level that names no albedo at all still gets a colour rather than black or NaN
  const { fn, bounceLight } = mk({ floorColor: null, wallColor: null, sunColor: null });
  fn(1);
  assert(bounceLight.color.r > 0 && bounceLight.color.g > 0 && bounceLight.color.b > 0,
    'missing colours fall back to the defaults rather than producing black: ' + bounceLight.color.arr.map(v=>v.toFixed(3)).join(','));
}
{
  // the ground bounces most of it; the walls the rest. A pure-floor mix would ignore a level whose
  // walls are the only warm surface in it.
  const warmWall = mk({ floorColor: 0x000000, wallColor: 0xff0000 }); warmWall.fn(1);
  assert(warmWall.bounceLight.color.r > 0, 'the walls contribute, not only the floor');
  const warmFloor = mk({ floorColor: 0xff0000, wallColor: 0x000000 }); warmFloor.fn(1);
  assert(warmFloor.bounceLight.color.r > warmWall.bounceLight.color.r,
    '...but the ground contributes more, because that is the surface a floor mostly sees');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/const bounceLight = new THREE\.AmbientLight\(0xffffff, 0\);\s*\nscene\.add\(bounceLight\);/.test(src),
    'it is an AmbientLight — a bounce arrives from every direction, which is the one thing that light models correctly');
// build 1360 re-derived the value when it halved the stock floor's luminance: the bounce's COLOUR already
// carries the floor albedo, so a darker ground delivers proportionally less fill. 0.50 -> 0.85 keeps 77% of
// the old delivered fill (a darker floor still bounces less, as it must) while preserving this build's
// margin against a crushed red channel. What THIS pin is about — that the value lives in DEFAULT_WORLD and
// rides the existing world serialization — is unchanged.
{
  const b = Number(src.match(/const DEFAULT_WORLD = \{[^\n]*?bounce:([\d.]+),/)[1]);
  assert(b > 0 && b <= 1.5, 'DEFAULT_WORLD carries the default, so it rides the existing world serialization with no new plumbing');
}
  assert(/worldCfg\.bounce = Math\.max\(0, Math\.min\(2, worldCfg\.bounce == null \? DEFAULT_WORLD\.bounce : \+worldCfg\.bounce\)\);/.test(src),
    'applyWorldCfg clamps it, and a level saved without it inherits the default');
  assert(/if\(typeof _applyBounce==='function'\) _applyBounce\(_dayActive \? _dayF : 1\);/.test(src),
    'applyWorldCfg re-derives it — including mid-cycle, which is why _dayF is kept');
  assert(/_dayF = d\.dayF; if\(typeof _applyBounce==='function'\) _applyBounce\(d\.dayF\);/.test(src),
    'and the day cycle drives it beside the sun and the hemisphere fill, so the three cannot disagree');
  assert(/let _dayPhase=null, _dayShadowT=0, _daySkyT=0, _dayActive=false, _dayF=1;/.test(src),
    '_dayF is declared with the rest of the cycle state, above every reader');
  assert(/_dayActive=false; _dayPhase=null; _skyDayDim=1; _dayF=1;/.test(src),
    '...and returns to 1 when the cycle is switched off, or the bounce would stay stuck at whatever hour it stopped at');
  assert(/slider\(b,'Bounce \(sun off the ground\)','bounce',0,2,0\.05\);/.test(src),
    'the creator gets a slider for it, beside Sun and Sky');
  // the documented TDZ trap: a typeof guard here would read as safe and not be
  const fn = extractFunction('_applyBounce');
  assert(!/typeof worldCfg/.test(fn),
    'no typeof guard on worldCfg — typeof THROWS inside a temporal dead zone, so such a guard is worse than none');
  assert(/typeof THROWS inside a temporal dead zone/.test(src), '...and the source says why, so it does not get "tidied up" back in');
}
{
  // build 868's water estimate exists so the water tracks every other surface in the scene. A light it
  // does not know about is exactly how it stops doing that.
  const fn = extractFunction('_waterLightF');
  assert(/bounceLight\.intensity/.test(fn), 'the water lighting estimate counts the bounce');
  assert(/b\*0\.25/.test(fn), '...weighted below the sun and the sky, like the flat lift beside it');
}
{
  // it must not have displaced the creator's own white lift
  assert(/const worldAmbient = new THREE\.AmbientLight\(0xffffff, 0\);/.test(src), '`ambient` — the flat white lift — is untouched');
  assert(/worldAmbient\.intensity = worldCfg\.ambient;/.test(src), '...and still driven by its own key');
  assert(/slider\(b,'Brightness lift','ambient',0,2,0\.05\);/.test(src), '...and still has its own slider');
}

// ---------------------------------------------------------------- the generator states its own value
// The engine default is coloured by the level's floor, so its delivered fill scales with that floor's
// brightness. Across seven themes whose grounds span 5:1 in luminance that over-fills the bright ones
// toward clipping — measured on the desert arena, the imported sand went 244,208,160 -> 250,218,170 at
// the engine default, which is nearly white. So each theme asks for a constant AMOUNT of fill.
{
  const lg = readFileSync(new URL('../tools/levelgen.mjs', import.meta.url), 'utf8').replace(/^#![^\n]*\n/, '');
  const AsyncFn = Object.getPrototypeOf(async function(){}).constructor;
  const api = await new AsyncFn('RUMPUS_LEVELGEN_HOST', 'Buffer', 'process',
    lg + '\n;return { arenaMood, groundMood };')(
    { deflateSync:()=>new Uint8Array(0), writeFileSync:()=>{} }, Buffer, process);

  const lum = (g) => 0.2126*g[0] + 0.7152*g[1] + 0.0722*g[2];
  const THEMES = ['industrial','castle','volcanic','garden','desert','frost','facility'];
  const fills = [];
  for(const t of THEMES){
    const m = api.arenaMood(t);
    const b = m.world.bounce;
    assert(b != null, t + ' names a bounce of its own rather than inheriting the engine default');
    assert(b >= 0.05 && b <= 1.0, t + ' bounce ' + b + ' is inside the clamp');   // build 1151 raised the ceiling: garden's real grass asks 0.96
    fills.push([t, b * lum(m.light.groundAlb)]);
  }
  // THE property: every theme delivers about the same amount of fill, whatever its ground is made of
  const vals = fills.map(f => f[1]);
  const spread = Math.max(...vals) / Math.min(...vals);
  assert(spread < 1.12, 'every theme delivers the same fill to within 12%: ' +
    fills.map(f => f[0] + ' ' + f[1].toFixed(4)).join(', '));
  // ...and the bright grounds really do ask for less than the dark ones
  const byName = Object.fromEntries(THEMES.map((t,i) => [t, api.arenaMood(t).world.bounce]));
  assert(byName.frost < byName.facility * 0.4,
    'snow (groundAlb Y 0.64) asks for far less than a dark apron (Y 0.12): ' + byName.frost + ' vs ' + byName.facility);
  assert(byName.desert < byName.volcanic, '...and bleached sand less than ash');
  // it is derived in ONE place, beside the floor and wall colours that come from the same albedo —
  // build 1143's lesson, which is that a mood written out twice is a mood that ends up disagreeing
  assert(/bounce: \+Math\.max\(0\.05, Math\.min\(1\.0, 0\.0535 \/ Math\.max\(1e-4, y\)\)\)\.toFixed\(2\)/.test(lg),
    'and it is derived inside groundMood, so an eighth theme gets it without knowing it exists');
  const moodBody = lg.slice(lg.indexOf('function arenaMood('), lg.indexOf('function arenaMood(') + 4000);
  assert(!/bounce:/.test(moodBody), '...with no theme naming it by hand');
}

done('build 1149: the shade gets its red channel back — one bounce of the sun off the level\'s own albedo, tied to the key light so it vanishes at night');
