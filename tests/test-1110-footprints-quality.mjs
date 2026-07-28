// build 1110: arena footprints (cross / octagon / diagonal) + a texture-budget selector.
//
// Two "options" items: the play space no longer has to be a square, and the browser dialog can
// finally reach the texture knobs that were CLI-only env vars (so a generated arena can come in
// under the 12 MB upload cap, or light enough for a phone).
//
// The footprint masses are placed AFTER the central feature, side structures and bases have
// reserved their footprints, and each candidate is shrunk until it clears them — otherwise a large
// arena's gallery ramp (which reaches |z| = 30) ends up buried inside a corner block.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameSource, assert, eq, done } from './harness.mjs';

const src = gameSource();
const lgSrc = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'levelgen.mjs'), 'utf8')
  .replace(/^#![^\n]*\n/, '');

// ---------------------------------------------------------------- dialog wiring
assert(/pickRow\('Shape', \['square','cross','octagon','diagonal','auto'\], \(\)=>footprint, v=>footprint=v\);/.test(src),
  'the dialog offers the footprints');
assert(/const QUAL=\{ low:\{ texsize:'256', texaux:'4' \}, medium:\{ texsize:'512', texaux:'2' \}, high:\{ texsize:'', texaux:'2' \} \};/.test(src),
  'three texture budgets map to the generator env knobs');
assert(/_lgGenerate\(\{ kind:'arena', seed:\(\+seedI\.value\|\|1\)\|0, theme, size, footprint, \.\.\.QUAL\[quality\] \}/.test(src),
  'both ride into the worker');
assert(/api\.buildArena\(d\.seed, d\.theme, d\.size, d\.footprint\)/.test(src), 'and reach buildArena');

// ---------------------------------------------------------------- generator
assert(/function buildArena\(seed, theme, size, footprint\)/.test(lgSrc), 'buildArena takes a footprint');
assert(/if \(!FOOTPRINTS\.includes\(footprint\)\) footprint = \(footprint === 'auto'\) \? FOOTPRINTS\[\(rr\(\) \* 4\) \| 0\] : 'square';/.test(lgSrc),
  "unknown values fall back to square; 'auto' rolls one from the seed");
assert(/const hits = \(r\) => AV\.some\(a => r\[0\] < a\[2\] \+ 1 && r\[2\] > a\[0\] - 1 && r\[1\] < a\[3\] \+ 1 && r\[3\] > a\[1\] - 1\);/.test(lgSrc),
  'candidate masses are tested against everything already reserved');
assert(/for \(const f of \[1, 0\.75, 0\.5\]\) \{ {17}\/\/ shrink until the corner is clear/.test(lgSrc),
  '...and shrink before giving up');
assert(/if \(!C\) continue;/.test(lgSrc), 'a corner that can never fit is simply left square');

// ---------------------------------------------------------------- executable: the shapes are real
const AsyncFn = Object.getPrototypeOf(async function(){}).constructor;
const factory = new AsyncFn('RUMPUS_LEVELGEN_HOST', 'Buffer', 'process',
  lgSrc + '\n;return { buildArena, SOLIDS };');
const host = { deflateSync:()=>new Uint8Array(0), writeFileSync:()=>{} };
process.env.TEXSIZE = '64';

async function build(fp) {
  const api = await factory(host, { from:()=>{}, alloc:()=>{}, concat:()=>{} }, { env: process.env, argv: [] });
  const info = api.buildArena(7, 'industrial', 'medium', fp);
  return { info, solids: api.SOLIDS.slice() };
}
// count tall solids whose footprint sits wholly inside a corner quadrant, away from the perimeter walls
const cornersFilled = (solids, W) => {
  const q = new Set();
  for (const b of solids) {
    if (b[4] - b[1] < 4) continue;                              // not a full-height mass
    // ...and genuinely massive: the wall buttresses are full height too, but only ~1 m² of floor
    if ((b[3] - b[0]) * (b[5] - b[2]) < 15) continue;
    const cx = (b[0] + b[3]) / 2, cz = (b[2] + b[5]) / 2;
    if (Math.abs(cx) < W * 0.45 || Math.abs(cz) < W * 0.45) continue;   // must be cornerward on BOTH axes
    if (Math.abs(cx) > W || Math.abs(cz) > W) continue;         // that is the perimeter wall itself
    q.add((cx > 0 ? 'E' : 'W') + (cz > 0 ? 'S' : 'N'));
  }
  return q;
};
const W = 38;   // medium
{
  const sq = await build('square');
  eq(cornersFilled(sq.solids, W).size, 0, 'square: no corner masses');

  const cross = await build('cross');
  eq(cornersFilled(cross.solids, W).size, 4, 'cross: all four corners cut');
  assert(/· cross/.test(cross.info.name), 'the name records the shape (' + cross.info.name + ')');

  const oct = await build('octagon');
  eq(cornersFilled(oct.solids, W).size, 4, 'octagon: all four corners chamfered');
  assert(oct.solids.length > cross.solids.length, 'the chamfer is stepped, so it costs more solids');

  const diag = await build('diagonal');
  const dq = cornersFilled(diag.solids, W);
  eq(dq.size, 2, 'diagonal: exactly two corners cut');
  assert((dq.has('ES') && dq.has('WN')) || (dq.has('EN') && dq.has('WS')),
    'and they are OPPOSITE, so the arena stays 180°-symmetric (' + [...dq] + ')');
}

done('build 1110: cross, octagon and diagonal arenas — and a texture budget you can pick');
