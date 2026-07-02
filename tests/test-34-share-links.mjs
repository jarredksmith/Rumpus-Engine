// (build 50) Shareable level links: serializeLevel() -> (gzip) -> base64url in the URL hash, decoded on
// load and rebuilt via restoreLevel. Real round-trip + url-safety + wiring.
import { gameSource, done, assert, eq } from './harness.mjs';
const src = gameSource();

// pull the codec block out of the source (keeps the real async impl intact) and run it
globalThis.location = { origin:'https://jarredksmith.github.io', pathname:'/atg/breach/breach.html', hash:'#lvl=ZZZ123' };
const a = src.indexOf('function _b64urlFromBytes');
const b = src.indexOf('function flashToast');
const block = src.slice(a, b);
const api = new Function(block + '\n return { encodeLevel, decodeLevel, _b64urlFromBytes, _bytesFromB64url, buildShareLink, levelCodeFromUrl };')();

// base64url helpers are url-safe + reversible
const bytes = new Uint8Array([0,1,2,250,251,252,253,254,255,62,63]);
const s = api._b64urlFromBytes(bytes);
assert(!/[+/=]/.test(s), 'encoding is URL-safe (no + / =)');
eq(Array.from(api._bytesFromB64url(s)).join(','), Array.from(bytes).join(','), 'bytes survive the round-trip');

// full level round-trip (gzip when available, raw otherwise) — must reconstruct exactly
const sample = {
  v:1,
  props:[{ src:'box', t:[1,2,3,0,0,0,1,1,1], mat:{ shine:{ r:0.2, m:0.8 } } }, { src:'https://x/y.glb', t:[5,0,5,0,1.5,0,2,2,2] }],
  lights:[{ color:0x66ccff, intensity:3, distance:20, t:[2,3,4] }],
  spawns:[{ t:[5,5], mode:'hunt', type:'gunner', wave:2, route:[[1,1],[2,2]], loop:true }],
  game:{ mode:'prebuilt', winWaves:5 },
  pstart:{ x:3, z:4, yaw:1.2 },
  grenade:{ model:'', scale:1, radius:9, damage:90, fuse:1.4, throwForce:28 },
  weapons:{ rifle:{ model:'u', view:{ px:0.1, py:-0.3, pz:-0.5, rx:0, ry:180, rz:0, s:1.5 } } },
};
const enc = await api.encodeLevel(sample);
assert(enc[0]==='g' || enc[0]==='r', 'tagged gzip or raw');
const dec = await api.decodeLevel(enc);
eq(JSON.stringify(dec), JSON.stringify(sample), 'shared level reconstructs exactly');

// gzip should beat raw on a repetitive level (only assert if gzip is available in this runtime)
if(enc[0]==='g'){ const raw = 'r' + api._b64urlFromBytes(new TextEncoder().encode(JSON.stringify(sample))); assert(enc.length < raw.length, 'gzip shrinks the payload'); }

// link + hash parsing
eq(api.buildShareLink('ABC'), 'https://jarredksmith.github.io/atg/breach/breach.html#lvl=ABC', 'link format');
eq(api.levelCodeFromUrl(), 'ZZZ123', 'reads lvl code from the hash');
globalThis.location.hash = '#nothing'; eq(api.levelCodeFromUrl(), null, 'no code when hash lacks lvl=');

// --- wiring ---
assert(/id="edShare"/.test(src) && /_icn\('link'\)\+'Copy share link/.test(src), 'editor has a share button (build 816: SVG icon)');
assert(/buildShareLink\(await encodeLevel\(serializeLevel\(\)\)\)/.test(src), 'share encodes the live level into a link');
assert(/navigator\.clipboard\.writeText\(link\)/.test(src), 'copies to clipboard (with a visible fallback box)');
assert(/const code = levelCodeFromUrl\(\);/.test(src) && /restoreLevel\(lvl\); flashToast/.test(src), 'startup loads a shared level via restoreLevel');
assert(/\(tag === 'g'\) \? await _gunzip\(bytes\) : bytes/.test(src), 'decode handles gzip + raw');
done('shareable level links (gzip round-trip + url-safe + wiring)');
