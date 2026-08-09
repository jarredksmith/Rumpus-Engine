// A fixture for the interleaved-glTF probes, generated rather than downloaded.
//
// Build 1434 diagnosed the decal ghost against a real reported model, and build 1436's container rollback
// took that file with it — leaving two committed probes that could not run. CLAUDE.md has recorded the
// rule three times now (builds 1378, 1405, 1436): anything a probe needs twice has to be in a commit.
// A binary asset in the tree is one answer; generating it is a better one, because the generator also
// STATES what makes the fixture the right shape, and can be re-tuned.
//
// Two properties are load-bearing and both come from measuring the reported file:
//
//   * INTERLEAVED, stride 48 bytes = twelve floats per vertex — POSITION 3 + NORMAL 3 + TANGENT 4 +
//     TEXCOORD_0 2. This is what gltfpack, meshopt and every "optimize my glTF" pipeline emit, and it is
//     what build 1097's raycast read with a stride of 3.
//   * THIN. The reported arch's local extent is 1.00 x 0.64 x 0.18. A chunky model HIDES the bug: its own
//     bounds already contain every normal (+-1), tangent and uv, so triangles built out of those stay
//     inside it and nothing looks wrong. Build 1434's first test fixture was a 2x2x2 cube and measured the
//     defect at 0.00 m out — a clean null against code that was definitely broken.
//
// It must also clear `_installRaycastBVH`'s 256-triangle floor, or the fast path is never installed and
// the probe measures three's own raycast while believing it measured ours. A subdivided slab does both.
import fs from 'node:fs';
import path from 'node:path';

const F32 = 4, STRIDE_F = 12, STRIDE_B = STRIDE_F * F32;   // 48, the reported file's byteStride

/** A thin slab, each face subdivided N x N, with interleaved vertex data. */
function slab(sx = 1.0, sy = 0.64, sz = 0.18, N = 8) {
  const verts = [], idx = [];
  // +X, -X, +Y, -Y, +Z, -Z: origin corner, two edge vectors, normal
  const faces = [
    [[ .5,-.5,-.5], [0,0,1], [0,1,0], [ 1,0,0]],
    [[-.5,-.5, .5], [0,0,-1],[0,1,0], [-1,0,0]],
    [[-.5, .5,-.5], [1,0,0], [0,0,1], [0, 1,0]],
    [[-.5,-.5, .5], [1,0,0], [0,0,-1],[0,-1,0]],
    [[-.5,-.5, .5], [1,0,0], [0,1,0], [0,0, 1]],
    [[ .5,-.5,-.5], [-1,0,0],[0,1,0], [0,0,-1]],
  ];
  for (const [o, u, v, n] of faces) {
    const base = verts.length / STRIDE_F;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const a = i / N, b = j / N;
      const x = (o[0] + u[0] * a + v[0] * b) * sx;
      const y = (o[1] + u[1] * a + v[1] * b) * sy;
      const z = (o[2] + u[2] * a + v[2] * b) * sz;
      // POSITION, NORMAL, TANGENT (w = handedness), TEXCOORD_0 — in that order, in one buffer
      verts.push(x, y, z, n[0], n[1], n[2], u[0], u[1], u[2], 1, a, b);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p = base + j * (N + 1) + i;
      idx.push(p, p + 1, p + N + 2, p, p + N + 2, p + N + 1);
    }
  }
  return { verts: new Float32Array(verts), idx: new Uint32Array(idx), count: verts.length / STRIDE_F };
}

const pad4 = (n) => (n + 3) & ~3;

export function buildInterleavedGlb(opts = {}) {
  const { verts, idx, count } = slab(opts.sx, opts.sy, opts.sz, opts.n);
  const vBytes = Buffer.from(verts.buffer, verts.byteOffset, verts.byteLength);
  const iBytes = Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength);
  const vLen = pad4(vBytes.length), iOff = vLen;
  const bin = Buffer.alloc(vLen + pad4(iBytes.length));
  vBytes.copy(bin, 0); iBytes.copy(bin, iOff);

  // POSITION requires min/max in glTF
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) {
    const v = verts[i * STRIDE_F + k];
    if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v;
  }

  const json = {
    asset: { version: '2.0', generator: 'rumpus probe fixture — interleaved, stride 48' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TANGENT: 2, TEXCOORD_0: 3 }, indices: 4 }] }],
    accessors: [
      { bufferView: 0, byteOffset: 0,  componentType: 5126, count, type: 'VEC3', min: mn, max: mx },
      { bufferView: 0, byteOffset: 12, componentType: 5126, count, type: 'VEC3' },
      { bufferView: 0, byteOffset: 24, componentType: 5126, count, type: 'VEC4' },
      { bufferView: 0, byteOffset: 40, componentType: 5126, count, type: 'VEC2' },
      { bufferView: 1, byteOffset: 0,  componentType: 5125, count: idx.length, type: 'SCALAR' },
    ],
    // byteStride on the vertex view is the whole point of this fixture
    bufferViews: [
      { buffer: 0, byteOffset: 0,    byteLength: vBytes.length, byteStride: STRIDE_B, target: 34962 },
      { buffer: 0, byteOffset: iOff, byteLength: iBytes.length, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  };

  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = Buffer.alloc(pad4(jsonBuf.length) - jsonBuf.length, 0x20);   // spaces, per spec
  const binPad  = Buffer.alloc(0);
  const jLen = jsonBuf.length + jsonPad.length, bLen = bin.length + binPad.length;

  const head = Buffer.alloc(12);
  head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jLen + 8 + bLen, 8);
  const jHead = Buffer.alloc(8); jHead.writeUInt32LE(jLen, 0); jHead.writeUInt32LE(0x4E4F534A, 4);
  const bHead = Buffer.alloc(8); bHead.writeUInt32LE(bLen, 0); bHead.writeUInt32LE(0x004E4942, 4);

  return { glb: Buffer.concat([head, jHead, jsonBuf, jsonPad, bHead, bin, binPad]),
           verts: count, tris: idx.length / 3, stride: STRIDE_B };
}

/** Write it into the probe staging directory if it is not already there. Returns what it made. */
export function ensureFixture(file = 'probe-out/arch.glb', opts = {}) {
  const p = path.resolve(file);
  if (fs.existsSync(p) && !opts.force) return { path: p, existed: true };
  const r = buildInterleavedGlb(opts);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, r.glb);
  return { path: p, existed: false, verts: r.verts, tris: r.tris, stride: r.stride, bytes: r.glb.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = ensureFixture(process.argv[2] || 'probe-out/arch.glb', { force: true });
  console.log(JSON.stringify(r, null, 2));
}
