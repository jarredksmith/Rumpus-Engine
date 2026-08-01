import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1252: per-emitter controls. Overrides (amt/spd/size/spread/hgt/alpha/sat/col) are
// MULTIPLIERS over the preset, stored in userData.fx.cfg, serialized as `fxc` through propEntry
// (the one serializer every path routes through) and applied at all four loader sites. Executed
// here: the real sanitizer and the real effective-params derivation, every knob.

const sys = src.slice(src.indexOf('const FX_PRESETS'), src.indexOf('function _fxBuildRT'));
const scope = new Function(sys + '; return { FX_PRESETS, _fxCfgSan, _fxEff, _fxReset };')();
const { FX_PRESETS, _fxCfgSan, _fxEff, _fxReset } = scope;

// --- the sanitizer ----------------------------------------------------------------------------------
{
  const d = _fxCfgSan(null);
  for (const [k, v] of Object.entries({ amt: 1, spd: 1, size: 1, spread: 1, hgt: 1, alpha: 1, sat: 1 })) eq(d[k], v, `default ${k} is 1 (the preset)`);
  assert(!('col' in d), 'no tint by default');
  const h = _fxCfgSan({ amt: 99, spd: -4, size: 'x', alpha: 0, sat: 9, col: 0x1ff0000 + 0x123456 });
  eq(h.amt, 3, 'amount clamps high'); eq(h.spd, 0.25, 'speed clamps low');
  eq(h.size, 1, 'garbage falls to the default'); eq(h.alpha, 0.1, 'alpha floors above zero'); eq(h.sat, 2, 'saturation caps');
  assert(h.col >= 0 && h.col <= 0xffffff, 'a hostile colour is masked to 24 bits');
}

// --- the derivation ---------------------------------------------------------------------------------
{
  const P = FX_PRESETS.fx_ember;
  assert(_fxEff('fx_ember', null) === P, 'an untouched emitter uses the PRESET OBJECT itself — zero derivation cost');
  const E = _fxEff('fx_ember', { amt: 2, spd: 2, size: 1.5, spread: 2, hgt: 2, alpha: 2, sat: 1 });
  eq(E.n, Math.min(240, Math.round(P.n * 2)), 'Amount scales the particle count');
  near(E.up[1], P.up[1] * 2 * 2, 1e-9, 'a RISE climbs faster (speed) and higher (height) through its rise rate');
  near(E.out, P.out * 2, 1e-9, 'Speed scales the radial drift');
  near(E.region[0], P.region[0] * 2, 1e-9, 'Spread widens the region');
  near(E.region[1], P.region[1], 1e-9, 'a grounded effect keeps its base thin — height lives in the rise, not the slab');
  near(E.size[0], P.size[0] * 1.5, 1e-9, 'Size scales particles');
  near(E.alpha, P.alpha * 2, 1e-9, 'Opacity multiplies');
  assert(_fxEff('fx_ember', { amt: 3 }).n <= 240, 'the hard particle cap holds');
  assert(_fxEff('fx_ember', { amt: 0.25 }).n >= 4, 'and the floor');
}
{ // volume effects put Height in the region; jets put it in gravity with the arc SHAPE preserved
  const D = FX_PRESETS.fx_dust, Ed = _fxEff('fx_dust', { hgt: 3 });
  near(Ed.region[1], D.region[1] * 3, 1e-9, 'a drifting volume grows taller');
  const J = FX_PRESETS.fx_fountain;
  const Ej = _fxEff('fx_fountain', { hgt: 2 });
  near(Ej.grav, J.grav / 2, 1e-9, 'Height halves a jet’s gravity — same launch, twice the arc');
  const Es = _fxEff('fx_fountain', { spd: 2 });
  near(Es.up[0], J.up[0] * 2, 1e-9);
  near(Es.grav, J.grav * 4, 1e-9, 'Speed scales v and g together (v²/g constant) — a faster fountain keeps its exact arc shape');
}
{ // colour: the tint REPLACES the ramp; saturation 0 is greyscale of whatever is chosen
  const E = _fxEff('fx_smoke', { col: 0xff0000 });
  near(E.colA[0], 1, 1e-9); near(E.colA[1], 0, 1e-9); near(E.colA[2], 0, 1e-9);
  assert(E.colB[0] > E.colA[0] - 1e-9 && E.colB[1] < 0.2, 'the late-life colour stays the chosen hue, brightened');
  const G = _fxEff('fx_ember', { sat: 0 });
  near(G.colA[0], G.colA[1], 1e-9); near(G.colA[1], G.colA[2], 1e-9, 'saturation 0 collapses to luminance');
  const V = _fxEff('fx_ember', { sat: 2 });
  assert(V.colA[0] - V.colA[2] > FX_PRESETS.fx_ember.colA[0] - FX_PRESETS.fx_ember.colA[2] - 1e-9, 'saturation 2 pushes channels apart');
}
{ // reset: removes the points from the group, disposes the geometry, nulls the runtime
  let removed = false, disposed = false;
  const o = { userData: { _fxRT: { pts: { parent: { remove: () => { removed = true; } } }, geo: { dispose: () => { disposed = true; } } } } };
  _fxReset(o);
  assert(removed && disposed && o.userData._fxRT === null, '_fxReset tears the runtime down for the next tick to rebuild');
  _fxReset({ userData: {} });   // no runtime: a clean no-op
}

// --- wiring pins ------------------------------------------------------------------------------------
assert(/const P=_fxEff\(o\.userData\.fx\.kind, o\.userData\.fx\.cfg\), n=P\.n;/.test(src),
  'the runtime builds from preset x overrides');
assert(/if\(o\.userData\.fx && o\.userData\.fx\.cfg\) e\.fxc=_fxCfgSan\(o\.userData\.fx\.cfg\);/.test(src),
  'overrides serialize through propEntry — saves, prefabs, duplicate, clipboard and net pAdd all inherit (1162)');
eq((src.match(/if\(p\.fxc && obj\.userData\.fx\)\{ obj\.userData\.fx\.cfg=_fxCfgSan\(p\.fxc\); if\(typeof _fxReset==='function'\) _fxReset\(obj\); \}/g) || []).length, 4,
  'applied at all FOUR loader sites (level, net level, prefab spawn, net pAdd)');
assert(/fxSlide\('Amount','amt',0\.25,3,1/.test(src) && /fxSlide\('Saturation','sat',0,2,1/.test(src),
  'the panel offers the sliders');
assert(/rst\.onclick=\(\)=>\{ pushUndoSnapshot\(\); delete tagObj\.userData\.fx\.cfg;/.test(src),
  'Reset deletes the cfg — back to exactly the preset, and the entry serializes nothing');
assert(/i\.addEventListener\('mousedown', \(\)=>pushUndoSnapshot\(\)\);/.test(src), 'slider drags are undoable');

done('build 1252: per-emitter controls — sanitizer and derivation executed knob by knob (count cap, rise vs volume vs jet height, arc-preserving speed, tint replacement, saturation collapse), serialized once, applied four times');
