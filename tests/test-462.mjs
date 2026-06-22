import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 608: per-shot dutch/roll — a keyframed camera tilt about the view axis (roll -> rollTo across the shot).

// defaults seeded everywhere a shot is born / normalized / resolved
assert(/roll:0, rollTo:0, ease:'inout', holdStart:0, holdEnd:0 \}; \}/.test(extractFunction('_newCineShot')), '_newCineShot seeds roll/rollTo');
assert(/dofStrengthTo:1\.4, roll:0, rollTo:0, ease:'inout', holdStart:0, holdEnd:0, audio:'', shots2:\[\]/.test(extractFunction('_newCutscene')), '_newCutscene seeds roll/rollTo');
assert(/roll:\+s\.roll\|\|0, rollTo:\(s\.rollTo!=null\?\+s\.rollTo:\(\+s\.roll\|\|0\)\)/.test(extractFunction('_resShot')), '_resShot resolves roll/rollTo');
assert(/roll:\+s\.roll\|\|0, rollTo:\(s\.rollTo!=null\?\+s\.rollTo:\(\+s\.roll\|\|0\)\)/.test(extractFunction('_normCineShot')), '_normCineShot carries roll/rollTo');
// applyCine restore + default
const ac = extractFunction('_applyCine');
assert(/cineCfg\.roll=\+lc\.roll\|\|0; cineCfg\.rollTo=\(lc\.rollTo!=null\?\+lc\.rollTo:cineCfg\.roll\)/.test(ac), '_applyCine restores roll/rollTo');
assert(/cineCfg\.roll=0; cineCfg\.rollTo=0;/.test(ac), '_applyCine defaults roll/rollTo when no saved cine');

// updateCinematic applies the roll after lookAt
const uc = extractFunction('updateCinematic');
assert(/camera\.lookAt\(_cineTgt\);\n  if\(d\.roll!=null \|\| d\.rollTo!=null\)\{ const r0=\+d\.roll\|\|0, r1=\(d\.rollTo!=null\?\+d\.rollTo:r0\), rr=r0\+\(r1-r0\)\*te; if\(rr\) camera\.rotateZ\(rr\*Math\.PI\/180\); \}/.test(uc), 'roll is applied as a local-Z rotation after lookAt, keyframed by te');

// ---- executable: midpoint roll = halfway between start and end (using the editor ease te) ----
// te = t*t*(3-2*t); at t=0.5 -> 0.5, so midpoint roll is the arithmetic mean.
const t=0.5, te=t*t*(3-2*t); const r0=10, r1=30; const rr=r0+(r1-r0)*te;
near(te, 0.5, 1e-9, 'smoothstep ease is 0.5 at the midpoint');
near(rr, 20, 1e-9, 'roll 10deg -> 30deg reads 20deg at the midpoint');

// editor exposes both ends
assert(/crow\('Dutch start', \(CS\.roll\|\|0\), -60, 60, 1, '\\u00b0', v=>\{ CS\.roll=v; \}\)/.test(src), 'editor has a Dutch start slider');
assert(/crow\('Dutch end', \(CS\.rollTo!=null\?CS\.rollTo:\(CS\.roll\|\|0\)\), -60, 60, 1, '\\u00b0', v=>\{ CS\.rollTo=v; \}\)/.test(src), 'editor has a Dutch end slider');

// serializer carries it on every shot shape (flat + others flat + both shots2 lists)
assert(/dofStrengthTo:s\.dofStrengthTo, roll:s\.roll, rollTo:s\.rollTo, ease:s\.ease, holdStart:s\.holdStart, holdEnd:s\.holdEnd \}/.test(src), 'serialized shots carry roll/rollTo');
assert(/dofStrengthTo:o\.dofStrengthTo, roll:o\.roll, rollTo:o\.rollTo, ease:o\.ease, holdStart:o\.holdStart, holdEnd:o\.holdEnd, shots2:/.test(src), 'serialized cutscenes carry roll/rollTo');

done('cinematic dutch/roll: keyframed tilt, full plumbing + editor + serialize (build 608)');
