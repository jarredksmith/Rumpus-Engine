// build 1104: "Generate arena" inside the editor — the level generator's browser home.
//
// tools/levelgen.mjs became dual-environment: the CLI path is untouched, and the editor fetches
// the SAME source, evaluates it in a worker via AsyncFunction with a tiny host (Buffer work-alike,
// fflate deflate, an output sink), and places the GLB as a model prop. This test runs the exact
// browser evaluation path in Node — same wrapper, same shims (zlib standing in for fflate) — and
// generates a full arena, then checks the GLB container.
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameSource, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---------------------------------------------------------------- engine wiring pins
assert(/for\(const p of \['tools\/levelgen\.mjs','levelgen\.mjs'\]\)\{/.test(src),
  'the editor fetches the generator source from beside the game (tools/ or flat)');
assert(/RUMPUS ENGINE level generator/.test(src), '...and sanity-checks what it fetched');
assert(/const factory = new AsyncFn\('RUMPUS_LEVELGEN_HOST','Buffer','process', d\.src/.test(src),
  'the worker evaluates the source with host, Buffer and process supplied');
assert(/zlibSync\(buf instanceof Uint8Array \? buf : new Uint8Array\(buf\), \{ level: 9 \}\)/.test(src),
  'fflate zlibSync stands in for node:zlib deflateSync (same zlib container)');
assert(/label:'Generate arena…', run:\(\)=>\{ if\(typeof _lgOpenDialog==='function'\) _lgOpenDialog\(\); \}/.test(src),
  'Tools menu opens the dialog');
assert(/spawnProp\(url, \[0,0,0, 0,0,0, 1\]/.test(src), 'Place in level spawns the blob GLB as a model prop');
assert(/Object\.assign\(worldCfg, r\.world\); applyWorldCfg\(\);/.test(src), 'the arena lighting mood can be applied');

// ---------------------------------------------------------------- executable: the browser path
{
  const lgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'levelgen.mjs');
  const lgSrc = readFileSync(lgPath, 'utf8').replace(/^#![^\n]*\n/, '');   // same shebang strip the engine's fetch does
  assert(/const _LG_HOST = \(typeof RUMPUS_LEVELGEN_HOST !== 'undefined'\)/.test(lgSrc), 'the generator carries the dual-environment shim');
  assert(/if \(!_LG_HOST\) \{ {3}\/\/ CLI only/.test(lgSrc), 'the CLI main is gated out of the browser evaluation');

  // the same Buffer work-alike the worker builds
  class LB extends Uint8Array {
    writeUInt32LE(v, o){ this[o]=v&255; this[o+1]=(v>>>8)&255; this[o+2]=(v>>>16)&255; this[o+3]=(v>>>24)&255; }
    writeUInt32BE(v, o){ this[o]=(v>>>24)&255; this[o+1]=(v>>>16)&255; this[o+2]=(v>>>8)&255; this[o+3]=v&255; }
    writeInt32BE(v, o){ this.writeUInt32BE(v>>>0, o); }
    slice(a, b){ return new LB(Uint8Array.prototype.slice.call(this, a, b)); }
    copy(target, targetStart){ target.set(this, targetStart||0); return this.length; }
  }
  const Buf = {
    from(x){ if (typeof x==='string') return new LB(new TextEncoder().encode(x)); if (x instanceof ArrayBuffer) return new LB(new Uint8Array(x)); return new LB(x); },
    alloc(n){ return new LB(n); },
    concat(list){ let n=0; for(const b of list) n+=b.length; const out=new LB(n); let o=0; for(const b of list){ out.set(b,o); o+=b.length; } return out; }
  };
  const host = { out:null,
    deflateSync:(buf)=>new LB(deflateSync(buf instanceof Uint8Array ? Buffer.from(buf) : buf, { level: 9 })),
    writeFileSync:(_p, b)=>{ host.out=b; } };
  const AsyncFn = Object.getPrototypeOf(async function(){}).constructor;
  const factory = new AsyncFn('RUMPUS_LEVELGEN_HOST', 'Buffer', 'process',
    lgSrc + '\n;return { buildArena, bakeLightmap, writeGLB, LAYOUTS };');

  const run = await factory(host, Buf, { env: { TEXSIZE: '256', TEXAUX: '2' }, argv: [] });
  const info = run.buildArena(7, 'industrial', 'small');
  assert(/seed 7 · industrial · small/.test(info.name), 'the browser path generates the requested arena (' + info.name + ')');
  assert(info.world && info.world.sunColor != null, '...with its lighting mood attached');
  run.bakeLightmap(info.light);
  const w = run.writeGLB('out.glb');
  const glb = host.out;
  assert(glb && glb.length > 200000, 'a real GLB came out (' + (glb.length/1024|0) + ' KB at 256px textures)');
  // container checks: magic, version, declared length, JSON chunk with the expected structure
  eq(glb[0], 0x67, 'glTF magic'); eq(glb[1], 0x6C, '...'); eq(glb[2], 0x54, '...'); eq(glb[3], 0x46, '...');
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  eq(dv.getUint32(4, true), 2, 'glTF 2.0');
  eq(dv.getUint32(8, true), glb.length, 'declared length matches the bytes');
  const jlen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jlen)));
  assert(json.meshes && json.meshes[0].primitives.length > 3, 'meshes and materials made it through the shimmed writer');
  assert(json.nodes.some(n => /^nocollide/.test(n.name || '')), 'the nocollide foliage node survived too');
  assert(w.tris > 3000, 'triangle count is arena-sized (' + w.tris + ')');
}

done('build 1104: the editor generates arenas with the exact CLI generator');
