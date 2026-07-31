// build 1204: gameplay data rides with the GLB — the generator authors its own guards and pickups.
//
// The generator knows things about its layout the engine can only guess at: which ramps exist (SCANS,
// foot first / top second) and which lanes are open field. It now emits `game` beside `spawns`: posts —
// one patrol guard per ramp, standing at the FOOT with the ramp centreline as a ping-pong route, already
// in buildSpawnMarker's own opts shape — and pickup candidate spots (mid-lanes, flanks, ramp TOPS last so
// the consumer's index-ordered kinds put the good guns on high ground). Never (0,0): every footprint puts
// a structure there (1124's undercroft). The editor's Place-in-level seeds both behind a checkbox, inside
// the model-load callback, with NO clearAt validation on purpose — the generator authored these against
// its own geometry, and the big-GLB collider may still be deriving off-thread (1203) at that moment.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameSource, assert, eq, done } from './harness.mjs';

const lgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'levelgen.mjs');
const lgSrc = readFileSync(lgPath, 'utf8').replace(/^#![^\n]*\n/, '');
const src = gameSource();

// ---------------------------------------------------------------- the real generator, executed
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const host = { deflateSync: () => new Uint8Array(0), writeFileSync: () => {} };
const factory = new AsyncFn('RUMPUS_LEVELGEN_HOST', 'Buffer', 'process', lgSrc + '\n;return { buildArena };');
const api = await factory(host, null, { env: { TEXSIZE: '32', TEXAUX: '4' }, argv: [] });
const info = api.buildArena(4242, 'industrial', 'medium', 'square');

assert(info.game && Array.isArray(info.game.posts) && Array.isArray(info.game.pickups), 'buildArena emits the game block');
assert(info.game.posts.length >= 1 && info.game.posts.length <= 6, 'one guard per ramp, capped at 6 (' + info.game.posts.length + ')');
for (const ps of info.game.posts) {
  eq(ps.mode, 'patrol', 'a post is a PATROL guard');
  eq(ps.loop, false, '...ping-pong, up and down the ramp it defends');
  eq(ps.route.length, 2, '...whose route is the ramp centreline');
  eq(ps.t[0], ps.route[0][0], '...standing at the FOOT (t equals route[0])');
  eq(ps.t[1], ps.route[0][1]);
  assert(['grunt', 'runner', 'brute'].includes(ps.type), '...with a type buildSpawnMarker accepts');
  eq(ps.wave, 0, '...spawning every wave');
}
{
  const scanSet = new Set((info.scans || []).map(sc => sc.join(',')));
  for (const ps of info.game.posts) assert(scanSet.has([ps.route[0][0], ps.route[0][1], ps.route[1][0], ps.route[1][1]].join(',')),
    'every post route IS one of the arena\'s real ramp scans — layout-derived, not guessed');
}
{
  assert(info.game.pickups.length >= 5, 'pickups: mid-lanes + flanks + ramp tops (' + info.game.pickups.length + ')');
  for (const p of info.game.pickups) assert(!(+p[0] === 0 && +p[1] === 0), 'never (0,0) — the centre is a structure (1124)');
  const tops = (info.scans || []).slice(0, 6).map(sc => sc[2] + ',' + sc[3]);
  const tail = info.game.pickups.slice(4).map(p => p[0] + ',' + p[1]);
  for (const t of tail) assert(tops.includes(t), 'the ramp TOPS come last, so index-ordered kinds put the good guns on high ground');
}

// ---------------------------------------------------------------- the engine wiring
{
  assert(/game:info\.game\|\|null/.test(src), 'the in-editor worker carries the game block back beside world/spawns');
  assert(/Seed gameplay: ramp guards \+ pickup spots/.test(src), 'seeding is a visible creator choice in the dialog');
  assert(/if\(gpCb\.checked && r\.game\)\{ try\{/.test(src), '...defaulting on, applied only when checked');
  assert(/for\(const ps of r\.game\.posts\.slice\(0,8\)\) buildSpawnMarker\(ps\);/.test(src),
    'posts go straight into buildSpawnMarker — the generator emits the ENGINE\'s own authoring shape');
  assert(/r\.game\.pickups\.slice\(0,12\)\.forEach/.test(src) && /pickupSpots\.push\(\{ x:\+\(\+sp2\[0\]\)\.toFixed\(2\), z:\+\(\+sp2\[1\]\)\.toFixed\(2\), kind:_gpKinds\[i%_gpKinds\.length\] \}\)/.test(src),
    'pickup spots become ordinary pickupSpots entries (they serialize and sync like any authored ones)');
  assert(/refreshPickupMarkers==='function'\) refreshPickupMarkers\(\);\n            \}\n            if\(typeof setSpawnMarkersVisible==='function'\) setSpawnMarkersVisible\(editorOpen\);/.test(src),
    'markers refresh so the creator SEES what was seeded');
  assert(/if \(info\.game\) console\.log\('GAME ' \+ JSON\.stringify\(info\.game\)\);/.test(lgSrc), 'the CLI prints the manifest like SCANS/SPAWNS');
}

done('build 1204: gameplay data rides with the GLB — the real generator executed (posts are patrol guards whose routes ARE the arena\'s ramp scans, foot-anchored, ping-pong; pickups avoid the centre and end on the ramp tops), the worker carries it back, and Place-in-level seeds buildSpawnMarker posts + pickupSpots behind a default-on checkbox');
