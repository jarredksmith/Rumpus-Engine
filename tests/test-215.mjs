import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 305: picker cards use the Poly Pizza / Sketchfab source thumbnails
const rt = extractFunction('_renderCharThumb');
assert(/if\(cfg\.thumb\)\{ apply\(cfg\.thumb\); return; \}/.test(rt), 'source thumbnail used directly when present');
assert(/backgroundPosition='center'/.test(rt) && /backgroundRepeat='no-repeat'/.test(rt), 'thumbnail centered in the swatch');
assert(/if\(!cfg\.url\) return;/.test(rt) && /_ensureThumbR\(\)/.test(rt), '3D render still the fallback');
// thumb threaded through the cfg
assert(/thumb:\(typeof c\.thumb==='string'\?c\.thumb:''\)/.test(src), 'sanitize carries thumb');
assert(/thumb:c\.thumb\|\|'', animLib:\(typeof c\.animLib==='string' && ANIM_LIB_PACKS\[c\.animLib\]\)\?c\.animLib:'', ikHold:\(c\.ikHold===false\)\?false:true, clips:Object\.assign\(\{\}, c\.clips\|\|\{\}\), clipSpeed:Object\.assign\(\{\}, c\.clipSpeed\|\|\{\}\), clipHold:Object\.assign\(\{\}, c\.clipHold\|\|\{\}\), clipInPlace:Object\.assign\(\{\}, c\.clipInPlace\|\|\{\}\), tint:/.test(src), 'myCharCfg passes thumb + clipSpeed + clipHold + clipInPlace (build 493; animLib 921; ikHold 937)');
assert(/thumb:c\.thumb\|\|'', animLib:c\.animLib\|\|'', ikHold:\(c\.ikHold===false\)\?false:true, clips:Object\.assign\(\{\},c\.clips\|\|\{\}\)/.test(src), 'roster serializes thumb (+ animLib 921; ikHold 937)');
assert(/thumb: playerModelCfg\.thumb\|\|''/.test(src), 'player serializes thumb');
// picked thumbnail captured + stored on the player model
assert(/tgt\.pickedThumb=m\.thumb\|\|'';/.test(src), 'pick captures the thumbnail url');
assert(/playerModelCfg\.thumb=this\.pickedThumb\|\|''; this\.pickedThumb='';/.test(src), 'player setUrl stores then clears the picked thumb');
done();
