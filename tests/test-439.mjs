import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 584: the hemisphere "sky" fill light had a hardcoded teal color (0x4a6c7a, green-dominant) that tinted
// everything and could only be dimmed, not recolored. Its color is now an adjustable worldCfg value.
// build 1116: the hex moved, the COLOUR did not. Before build 1115 this value was consumed as
// linear; now it is correctly read as sRGB, so it is re-expressed as the sRGB hex that yields the
// same linear colour (0x4a6c7a linear == 0x93aeb8 sRGB). The 'no look change' intent is intact —
// that is the whole point of migrating rather than retuning.
assert(/skyColor:0x93aeb8/.test(src), 'DEFAULT_WORLD keeps the original sky COLOUR, re-expressed for the corrected colour space');
{ const enc=(v)=> v<=0.0031308 ? v*12.92 : 1.055*Math.pow(v,1/2.4)-0.055;
  const ch=(h,s2)=>Math.round(enc((((h>>>s2)&255)/255))*255);
  const mig=(h)=>(ch(h,16)<<16)|(ch(h,8)<<8)|ch(h,0);
  assert(mig(0x4a6c7a)===0x93aeb8, 'and that hex is the exact sRGB encoding of the original linear value'); }
const aw = extractFunction('applyWorldCfg');
assert(/skyLight\.color\.setHex/.test(aw) && /worldCfg\.skyColor==null\?DEFAULT_WORLD\.skyColor:worldCfg\.skyColor/.test(aw), 'applyWorldCfg drives the sky-light color from worldCfg (default-safe)');
assert(/skyLight\.intensity = worldCfg\.sky/.test(aw), 'intensity still driven too');
assert(/colorRow\(b,'Sky light color','skyColor'\)/.test(src), 'editor lighting section exposes the sky-light color');
done('sky-light color is adjustable — removes the hardcoded green/teal cast (build 584)');
