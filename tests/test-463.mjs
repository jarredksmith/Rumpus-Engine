import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 609: per-shot ease curve (motion). Default 'inout' = the old smoothstep, so existing shots are unchanged.

// the ease helper, run for real
const _cineEase = new Function(extractFunction('_cineEase') + '; return _cineEase;')();
near(_cineEase(0,'linear'), 0, 1e-9, 'linear @0'); near(_cineEase(1,'linear'), 1, 1e-9, 'linear @1');
near(_cineEase(0.5,'linear'), 0.5, 1e-9, 'linear midpoint = 0.5 (constant speed)');
near(_cineEase(0.5,'in'), 0.25, 1e-9, 'ease-in midpoint = 0.25 (still accelerating)');
near(_cineEase(0.5,'out'), 0.75, 1e-9, 'ease-out midpoint = 0.75 (already decelerating)');
near(_cineEase(0.5,'inout'), 0.5, 1e-9, 'smoothstep midpoint = 0.5');
near(_cineEase(0.5), 0.5, 1e-9, 'undefined ease defaults to smoothstep'); near(_cineEase(0.25), 0.15625, 1e-9, 'default is smoothstep, not linear');
near(_cineEase(-1,'linear'), 0, 1e-9, 'clamps below 0'); near(_cineEase(2,'in'), 1, 1e-9, 'clamps above 1');

// updateCinematic drives te through the curve
assert(/let t = _cineT<=_hs \? 0 : \(_cineT>=_hs\+d\.dur \? 1 : \(_cineT-_hs\)\/d\.dur\); const te=_cineEase\(t, d\.ease\);/.test(extractFunction('updateCinematic')), 'updateCinematic eases t per the shot');

// plumbing carries ease everywhere, defaulting to inout
const EE = "(['linear','in','out','inout'].indexOf(s.ease)>=0?s.ease:'inout')";
assert(extractFunction('_resShot').includes('ease:'+EE), '_resShot resolves ease (default inout)');
assert(extractFunction('_normCineShot').includes('ease:'+EE), '_normCineShot carries ease');
assert(/roll:0, rollTo:0, ease:'inout', holdStart:0, holdEnd:0 \}; \}/.test(extractFunction('_newCineShot')), '_newCineShot seeds ease inout');
assert(/roll:0, rollTo:0, ease:'inout', holdStart:0, holdEnd:0, audio:''/.test(extractFunction('_newCutscene')), '_newCutscene seeds ease inout');
const ac=extractFunction('_applyCine');
assert(/cineCfg\.ease=\(\['linear','in','out','inout'\]\.indexOf\(lc\.ease\)>=0\?lc\.ease:'inout'\)/.test(ac), '_applyCine restores ease');
assert(/cineCfg\.ease='inout';/.test(ac), '_applyCine defaults ease');
// serialize
assert(/roll:s\.roll, rollTo:s\.rollTo, ease:s\.ease, holdStart:s\.holdStart, holdEnd:s\.holdEnd \}/.test(src), 'serialized shots carry ease');
assert(/roll: cineCfg\.roll, rollTo: cineCfg\.rollTo, ease: cineCfg\.ease, holdStart: cineCfg\.holdStart, holdEnd: cineCfg\.holdEnd, audio/.test(src), 'serialized intro carries ease');
assert(/roll:o\.roll, rollTo:o\.rollTo, ease:o\.ease, holdStart:o\.holdStart, holdEnd:o\.holdEnd, shots2:/.test(src), 'serialized cutscenes carry ease');
// editor
assert(/\['inout','Smooth \(ease in \+ out\)'\],\['linear','Constant speed'\],\['in','Ease in \(accelerate\)'\],\['out','Ease out \(decelerate\)'\]/.test(src), 'editor offers all four motion curves');
assert(/sel\.onchange=\(\)=>\{ CS\.ease=sel\.value; \}/.test(src), 'Motion dropdown writes CS.ease');

done('cinematic ease curves: linear/in/out/smooth, default smoothstep keeps old shots identical (build 609)');
