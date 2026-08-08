// (build 183) Explosive props get an impact fuse: moving fast (>= impactVel) then slamming into something
// detonates them. Tunable per prop (0 = shoot-only). Explosion/smoke billboards lifted so they don't sink
// through the surface.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

const up = extractFunction('updatePhysics');
assert(/u\.explosive && u\.impactVel > 0 && !u\._shattered && obj !== heldProp/.test(up), 'impact fuse: explosive, armed, not held');
assert(/const prevSp = Math\.hypot\(pvx,pvy,pvz\), curSp = Math\.hypot\(lv\.x,lv\.y,lv\.z\)/.test(up), 'tracks previous + current speed');
assert(/if\(prevSp >= u\.impactVel && \(prevSp - curSp\) >= u\.impactVel\*0\.5\)/.test(up), 'gate requires DECELERATION (slam), not acceleration (being launched)');
// bug 2: animated props restored to base before re-capture on game start
assert(/xaSnapToBase\(\);   \/\/ restore animated props to their base FIRST/.test(src), 'startGame re-bases from the true base, not a mid-swing pose');
assert(/for\(const it of _impactList\) shatterProp\(it\.o, it\.o\.position\.clone\(\), it\.d, 9, null\)/.test(up), 'detonates after the sync loop');

const ea = (extractFunction('explodeAt') + extractFunction('_blastProps'));
assert(/const _vp = pos\.clone\(\); _vp\.y \+= \(VFX\.explosion\.size\|\|6\) \* eScale \* 0\.35/.test(ea), 'explosion/smoke billboards lifted off the surface');
assert(/playFlipbook\('explosion', _vp, eScale\)/.test(ea) && /playFlipbook\('smoke', _vp,/.test(ea), 'both billboards use the lifted position');

// editor + serialization round-trip
assert(/if\(sel\.userData\.impactVel==null\) sel\.userData\.impactVel=10;/.test(src), 'enabling explosive defaults an impact threshold');
assert(/mkSlider\('Impact',0,30,1,\(sel\.userData\.impactVel!=null\?sel\.userData\.impactVel:10\)/.test(src), 'impact slider in the editor');
assert(/if\(o\.userData\.impactVel!=null\) e\.iv=o\.userData\.impactVel;/.test(src), 'impactVel serialized');
assert(/if\(p\.iv!=null\) obj\.userData\.impactVel=p\.iv;/.test(src), 'impactVel restored');
assert(/obj\.userData\.impactVel=10;/.test(src), 'radial-deployed explosives armed by default');
done('explosive impact fuse + VFX ground lift');
