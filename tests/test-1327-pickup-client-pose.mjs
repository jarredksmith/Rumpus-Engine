import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1327 — reported from play: "in a multiplayer match, the joiner sees the pickups, but they flash.
// They don't flash on the host."
//
// Flashing that is per-frame and camera-dependent is Z-FIGHTING: two surfaces contending for the same
// pixels. So the question was not "what toggles visible" but "what stands somewhere different on a client",
// and the answer was measured rather than guessed.
//
// The pickup snapshot carried x, z, kind and ready. NOTHING ELSE. A pickup spot also carries an authored
// `y`, three rotations and a scale, and the host lifts every pad onto the ground with `_maxTerrainOver`.
// The client did neither — `m.position.set(pu.p[0], 0, pu.p[1])`, flat at zero. A pad disc buried in (or
// exactly coplanar with) the floor is the flash.
//
// Measured live (tools/probe/pickup-flash.mjs), ground at 3, pad authored y 1.5 / ry 45 / scale 1.4:
//   before   host group y 3          client group y 0        (rotation and scale lost entirely)
//   after    host y 4.5 ry 0.785 sc 1.4  ==  client y 4.5 ry 0.785 sc 1.4   (identical)
//   icon     client before: y 1.25 spin 0 unchanged after a frame;  after: y 1.16, spin 0.0288

// ---------------------------------------------------------------- the payload carries the transform
{
  const sn = src.slice(src.indexOf('const PUall = powerups.map'), src.indexOf('const PUall = powerups.map') + 900);
  assert(/const sp = p\.spot \|\| \{\};/.test(sn), 'the pickup remembers the spot it was built from…');
  assert(/if\(sp\.y\) e\.y = q2\(\+sp\.y\);/.test(sn), '…and its authored height rides the wire');
  assert(/if\(sp\.rx \|\| sp\.ry \|\| sp\.rz\) e\.rr = /.test(sn), '…its rotation');
  assert(/if\(sp\.scale!=null && \+sp\.scale>0 && Math\.abs\(\+sp\.scale-1\)>1e-3\) e\.sc = /.test(sn), '…and its scale');
  // absent when default, so the common pad costs exactly what it did before
  assert(/if\(sp\.y\)/.test(sn) && /Math\.abs\(\+sp\.scale-1\)>1e-3/.test(sn),
    'each is omitted at its default — an unauthored pad is byte-identical on the wire');
  assert(/mesh, spot \}\);   \/\* build 1327/.test(src), 'spawnPowerups keeps the spot on the powerup');
  assert(/z-fighting is what flashing IS/.test(src), 'with the mechanism named');
}

// ---------------------------------------------------------------- the client uses the HOST'S OWN function
{
  const aw = extractFunction('applyWorld');
  assert(/_applyPickupXform\(m, \{ x:pu\.p\[0\], z:pu\.p\[1\], y:\(pu\.y\|\|0\),/.test(aw),
    'the client places its pads with _applyPickupXform — the same function the host uses');
  assert(/rx:\(pu\.rr\?pu\.rr\[0\]:0\), ry:\(pu\.rr\?pu\.rr\[1\]:0\), rz:\(pu\.rr\?pu\.rr\[2\]:0\), scale:\(pu\.sc!=null\?pu\.sc:1\) \}\);/.test(aw),
    '...with every field it takes');
  assert(!/m\.position\.set\(pu\.p\[0\],0,pu\.p\[1\]\)/.test(src), 'and the flat y=0 placement is gone');
  assert(/so the two cannot diverge again/.test(aw), 'with the reason for sharing the function, not copying it');
  // the host's own placement must still go through the same one
  assert(/_applyPickupXform\(mesh, spot\)/.test(extractFunction('spawnPowerups')), 'the host still uses it too');
}

// ---------------------------------------------------------------- and a client's pads are alive
{
  const up = extractFunction('updatePowerups');
  assert(/if\(NET\.mode==='client'\)\{/.test(up), 'a client takes its own branch…');
  assert(/if\(M\) for\(const id in M\)\{ const m=M\[id\]; if\(m && m\.visible\) _animatePickup\(m, dt\); \}/.test(up),
    '…animating the meshes the snapshot built, which live in NET.powerupMeshes and not in `powerups`');
  assert(up.indexOf("if(NET.mode==='client')") < up.indexOf('if(!powerups.length) return;'),
    'before the early return that was skipping them entirely');
  assert(/a joiner watched four dead discs/.test(up), 'with the symptom recorded');
  // only visible pads are animated — an invisible one is off-screen work
  assert(/if\(m && m\.visible\)/.test(up), 'and a collected pad is not animated while it waits to respawn');
}

// ---------------------------------------------------------------- the transform function itself is unchanged
{
  const x = extractFunction('_applyPickupXform');
  assert(/obj\.position\.set\(sp\.x, _maxTerrainOver\(sp\.x,sp\.z,1\.2\)\+\(\+sp\.y\|\|0\), sp\.z\)/.test(x),
    'it lifts onto the terrain and adds the authored height — which is exactly what the client was missing');
  assert(/obj\.rotation\.set\(\(\+sp\.rx\|\|0\)\*RAD/.test(x), '...and the rotation');
  assert(/obj\.scale\.setScalar/.test(x), '...and the scale');
}

done('build 1327 (reported from play): a joiner\'s pickups flashed and the host\'s did not. Flashing that is per-frame and camera-dependent is z-fighting, so the question was what stands somewhere DIFFERENT on a client — and the pickup snapshot carried x, z, kind and ready and nothing else. A pickup spot also carries an authored y, three rotations and a scale, and the host lifts every pad onto the ground with _maxTerrainOver; the client did neither and placed the pad flat at y=0, so its disc sat buried in or exactly coplanar with the floor. Measured with the ground at 3 and a pad authored at y 1.5 / ry 45 / scale 1.4: host group y 3 against client y 0 before, and afterwards host y 4.5 ry 0.785 sc 1.4 IDENTICAL to the client. The payload gained the three fields, each omitted at its default so an unauthored pad is byte-identical on the wire, and the client now places its pads with _applyPickupXform — the host\'s own function — so the two cannot diverge again. The same probe found a second thing: updatePowerups early-returned on an empty local list, so a client\'s pads were never animated at all — no spin, no bob, and pad.visible never followed the world\'s pickupBase toggle. A joiner watched four dead discs; they now move exactly as the host\'s do');
