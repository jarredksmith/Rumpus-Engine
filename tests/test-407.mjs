import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();

// build 532: region confinement must apply to EVERY enemy spawn, because both wave sources (authored markers
// AND randomWaveDescriptors) ship an explicit x/z — so the null-spawn branch was never hit in real play.
assert(/if\(_regionOn && typeof _inRegion==='function' && !_inRegion\(px,pz\) && typeof randomSpawn==='function'\)\{\s*const sp=randomSpawn\(\); px=sp\.x; pz=sp\.z;/.test(src), 'any out-of-region spawn (authored or random) is re-sampled into the region');
assert(/if\(spawn && spawn\.x!=null\)\{ px = spawn\.x; pz = spawn\.z; \}/.test(src), 'explicit spawn uses its authored position (then confinement check applies)');

// both wave descriptor sources carry explicit positions (the reason the earlier fix did nothing)
assert(/out\.push\(\{ x:px, z:pz, mode:'hunt', type: pickEnemyType/.test(src), 'randomWaveDescriptors ships explicit x/z');
assert(/return \{ x:g\.position\.x, z:g\.position\.z, mode:m\.mode/.test(src), 'descFromMarker ships explicit x/z');
done();
