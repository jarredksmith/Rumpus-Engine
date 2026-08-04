// (build 855) SUN ROTATION — the directional light was hard-fixed at (40,80,20) since day one; now
// World > Lighting exposes 'Sun direction °' (azimuth 0-360) and 'Sun height °' (elevation 5-89).
// The light orbits the origin at the same ~90m radius so the ±80 ortho shadow box and 200 far plane
// still cover the arena; the azimuth default (63°) reproduces the historical direction so every existing
// level looks unchanged. Elevation is floored at 5° — a horizontal sun degenerates the shadow map.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// defaults ship (and reproduce the historical fixed position)
// build 1135: the elevation default moved 61 -> 34. At 61 degrees a 2 m object casts 1.11 m of shadow,
// which is barely visible from eye height — the frame had no key-light read at all and every critic said
// so. At 34 it casts 2.97 m. The AZIMUTH is unchanged, so the light still comes from the historical
// direction; any level that saved a world block carries its own values and is untouched.
// build 1360 restaged the stock frame: the sun was 117 degrees BEHIND the spawn's view, so nothing was ever
// rimmed and no shadow ever fell toward the camera. What this pin is about — that a default azimuth and
// elevation live in DEFAULT_WORLD, and that a low sun casts a long shadow — is asserted directly.
{
  const dw = src.match(/const DEFAULT_WORLD = \{[^\n]*/)[0];
  const az = Number(dw.match(/sunAzim:(-?[\d.]+),/)[1]), el = Number(dw.match(/sunElev:(-?[\d.]+),/)[1]);
  assert(az >= 0 && az <= 360 && el > 5 && el < 60, 'defaults ' + az + '\u00b0/' + el + '\u00b0 in DEFAULT_WORLD');
  assert(1 / Math.tan(el * Math.PI / 180) > 2, 'and the default sun is low enough to cast a shadow twice the caster\'s height');
}

// run the REAL apply snippet: sanitize + position math, against a stub moon
// (build 861 factored the orbit into _sunOrbit so the day/night cycle can drive it — include it)
const snip = src.match(/worldCfg\.sunAzim = \(\(\(\(worldCfg\.sunAzim[\s\S]*?_dirtyShadows\(3\)[^\n]*\n  \}/)[0];
const orbitFn = extractFunction('_sunOrbit');
const run = (azim, elev)=>{
  const moon={ position:{ set(x,y,z){ this.x=x; this.y=y; this.z=z; } }, color:{ setHex(){} } };
  const ctx={ worldCfg:{ sun:1, sunColor:0, sunAzim:azim, sunElev:elev, dayLen:240, dayStart:0.25 }, DEFAULT_WORLD:{ sunAzim:63, sunElev:61, dayLen:240, dayStart:0.25 }, moon, _dirtyShadows:()=>{}, Math };
  new Function(...Object.keys(ctx), orbitFn + '\n' + snip)(...Object.values(ctx));
  return { p:moon.position, cfg:ctx.worldCfg };
};
const def = run(null, null);
near(def.p.x, 40, 3, 'default X ≈ the historical 40');
near(def.p.y, 80, 3, 'default Y ≈ the historical 80');
near(def.p.z, 20, 3, 'default Z ≈ the historical 20');
near(Math.hypot(def.p.x, def.p.y, def.p.z), 90, 0.01, 'the sun orbits at 90m (inside the 200 shadow far plane)');
const noon = run(180, 89);
assert(noon.p.y > 89.9 && Math.abs(noon.p.x) < 2 && noon.p.z < 0, 'high elevation ≈ overhead; azimuth 180 lands on -Z');
const east = run(90, 30);
near(east.p.x, Math.cos(30*Math.PI/180)*90, 0.1, 'azimuth 90 puts the sun on +X');
near(east.p.y, 45, 0.1, '30° elevation = half height');
eq(run(-90, null).cfg.sunAzim, 270, 'azimuth wraps into 0-360');
eq(run(null, 0).cfg.sunElev, 5, 'elevation floors at 5° (no horizontal-sun shadow degeneracy)');
eq(run(null, 200).cfg.sunElev, 89, '...and caps at 89°');

// the editor exposes both, and shadows redraw on change
assert(/slider\(b,'Sun direction °','sunAzim',0,360,1\); slider\(b,'Sun height °','sunElev',5,89,1\);/.test(src), 'both sliders live in World > Lighting');
assert(/_dirtyShadows\(3\)/.test(snip), 'moving the sun re-renders the shadow map');
// worldCfg serializes wholesale, so the new keys ride along automatically
assert(/world:\s*Object\.assign\(\{\}, worldCfg\)/.test(src), 'sun direction saves with the level');

done('build 855: sun azimuth/elevation sliders — live shadows, historical default preserved, 90m orbit');
