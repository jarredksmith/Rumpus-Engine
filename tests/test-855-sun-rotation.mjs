// (build 855) SUN ROTATION — the directional light was hard-fixed at (40,80,20) since day one; now
// World > Lighting exposes 'Sun direction °' (azimuth 0-360) and 'Sun height °' (elevation 5-89).
// The light orbits the origin at the same ~90m radius so the ±80 ortho shadow box and 200 far plane
// still cover the arena; the defaults (63°/61°) reproduce the historical position so every existing
// level looks unchanged. Elevation is floored at 5° — a horizontal sun degenerates the shadow map.
import { gameSource, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// defaults ship (and reproduce the historical fixed position)
assert(/sunAzim:63, sunElev:61,/.test(src.match(/const DEFAULT_WORLD = \{[^\n]*/)[0]), 'defaults 63°/61° in DEFAULT_WORLD');

// run the REAL apply snippet: sanitize + position math, against a stub moon
const snip = src.match(/worldCfg\.sunAzim = \(\(\(\(worldCfg\.sunAzim[\s\S]*?_dirtyShadows\(3\)[^\n]*\n  \}/)[0];
const run = (azim, elev)=>{
  const moon={ position:{ set(x,y,z){ this.x=x; this.y=y; this.z=z; } }, color:{ setHex(){} } };
  const ctx={ worldCfg:{ sun:1, sunColor:0, sunAzim:azim, sunElev:elev }, DEFAULT_WORLD:{ sunAzim:63, sunElev:61 }, moon, _dirtyShadows:()=>{}, Math };
  new Function(...Object.keys(ctx), snip)(...Object.values(ctx));
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
