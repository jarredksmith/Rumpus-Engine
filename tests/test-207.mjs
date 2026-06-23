import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 295: tunable bullet streak (tracer) + editor panel
assert(/const DEFAULT_TRACER = \{ color:0xfff1c0, width:1, life:1, opacity:0.95, glow:true, on:true \}/.test(src), 'tracer defaults present');
const st = extractFunction('_sanitizeTracer');
assert(/width:_fxClamp/.test(st) && /on:o\.on!==false/.test(st), 'tracer sanitize covers fields');
const tr = extractFunction('tracer');
assert(/const tc=tracerCfg; if\(!tc\.on && !force\) return;/.test(tr), 'tracer honors enable (force bypasses for the editor test)');
assert(/const w=0\.045\*tc\.width/.test(tr) && /0\.06\*tc\.life/.test(tr), 'width + life scale from config');
assert(!/color:0xfff1c0, transparent:true, opacity:0.95, blending/.test(tr), 'old hardcoded tracer material gone');
// serialize + restore
assert(/tracer: Object\.assign\(\{\}, tracerCfg\)/.test(src), 'tracer serialized');
assert(/tracerCfg = _sanitizeTracer\(level\.tracer\)/.test(src), 'tracer restored on load');
// editor section + panel
assert(/kit:\s*\['object','transform','wepfx'\]/.test(src) && /id="edTracerFx" class="wepfxHost" data-wepfx="tracerfx"/.test(src), 'tracer panel registered under the grouped Effects picker in Weapons mode (build 653)');
const rp = extractFunction('renderTracerFxPanel');
assert(/edTracerFx/.test(rp) && /Test streak/.test(rp), 'panel builds with a test button');
done();
