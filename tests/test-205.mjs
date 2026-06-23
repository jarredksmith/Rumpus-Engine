import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 293: tunable impact FX + editor panel
assert(/const DEFAULT_FX = \{ color:0xffd9a0/.test(src), 'FX defaults present');
const sf = extractFunction('_sanitizeFx');
assert(/glow:o\.glow!==false/.test(sf) && /size:_fxClamp/.test(sf), 'fx sanitize covers fields');
// spark uses config + glow + flash + shrink
const sp = extractFunction('spark');
assert(/const fx=fxCfg/.test(sp), 'spark reads fxCfg');
assert(/shrink:true/.test(sp) && /_getSpark\(_sparkPool, _sparkGeo, col, !!fx\.glow/.test(sp), 'glow + shrink sparks (glow via pooled _getSpark)');
assert(/AdditiveBlending/.test(extractFunction('_getSpark')), 'glow sparks use additive blending in the pooled spawner');
assert(/if\(fx\.flash\)\{/.test(sp), 'optional flash sprite');
assert(!/SphereGeometry\(\.08,4,4\)/.test(sp), 'old cheesy sphere spark gone');
// surface impacts now use the configurable color
assert(/spark\(hit\.point, fxCfg\.color\)/.test(src), 'object impacts use fx color');
assert(!/spark\(hit\.point, 0x9fd8ff\)/.test(src), 'old blue object impact gone');
// serialized + restored
assert(/fx: Object\.assign\(\{\}, fxCfg\)/.test(src), 'fx serialized');
assert(/fxCfg = _sanitizeFx\(level\.fx\)/.test(src), 'fx restored on load');
// editor panel registered + built
assert(/kit:\s*\['object','transform','wepfx'\]/.test(src) && /id="edImpactFx" class="wepfxHost" data-wepfx="impactfx"/.test(src), 'impacts panel registered under the grouped Effects picker in Weapons mode (build 653)');
const rp = extractFunction('renderImpactFxPanel');
assert(/edImpactFx/.test(rp) && /Test burst/.test(rp), 'panel builds with a test button');
done();
