import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 306: jump + die animation states propagate over the network
// airborne flag in all three send paths
assert(/hp:Math\.max\(0,player\.hp\), j:player\.onGround\?0:1, sl:sliding\?1:0, ad:\(ads\|\|padAds\|\|touchAds\)\?1:0, cr:crouching\?1:0, hd:_netHitDir, hs:_netHitSeq, n:NET\.name\|\|'Host'/.test(src), 'host sends its own airborne + slide flags');
assert(/hp:rp\.hp, j:rp\.air\?1:0, sl:rp\.slide\?1:0, ad:rp\.ads\?1:0, cr:rp\.crouch\?1:0, hd:rp\.hd\|\|0, hs:rp\.hs\|\|0, n:rp\.name/.test(src), 'host relays each peer airborne + slide flag');
assert(/hp:Math\.max\(0,player\.hp\), j:player\.onGround\?0:1, sl:sliding\?1:0, ad:\(ads\|\|padAds\|\|touchAds\)\?1:0, cr:crouching\?1:0, hd:_netHitDir, hs:_netHitSeq, n:NET\.name, mt:\(mountedTurret\?_turretIndexOf\(mountedTurret\):-1\), cl:_climbCode\(\), c:_packCar\(\) \}/.test(src), 'client sends its own airborne + slide flags (build 497: + hd/hs; build 548: + mt; build 895: + driven car)');
// stored on receive (both directions)
const srs = extractFunction('setRemoteState');
assert(/rp\.air = !!msg\.j;/.test(srs), 'host stores peer airborne flag');
assert(/rp\.wep=pl\.w; if\(pl\.g\) rp\.grip=_unpackGrip\(pl\.g\); rp\.air=!!pl\.j;/.test(src), 'client stores peer airborne flag (+ synced grip) from the array');
// remote pose priority: die > attack > jump > move
const ni = extractFunction('netInterpolate');
assert(/if\(rp\.air\) _st='jump';/.test(ni), 'remote plays jump when airborne');
assert(/if\(rp\.hp!=null && rp\.hp<=0\) _st = \(rp\._hitDir===0\?'dieBack'/.test(ni), 'remote plays a directional death when dead (build 497)');
const jump=ni.indexOf("_st='jump'"), atk=ni.indexOf("rp._fireT && performance.now() < rp._fireT"), die=ni.indexOf("_st = (rp._hitDir");
assert(jump>0 && atk>jump && die>atk, 'priority order is jump < attack < die');
done();
