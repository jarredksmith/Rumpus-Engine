// (build 941) MINECRAFT-STYLE DELETE IN BUILD MODE — a misplaced block can be removed as easily as
// it was placed. Aim at a prop you placed this session and: X or middle-click (desktop), LT (pad),
// AIM (touch) — the same shatter path a gunshot uses (debris, sound, net broadcast). Guard rails:
// only userData.runtime props (build mode + radial deploys) are deletable — authored level geometry
// refuses with a deny blip — and the ray runs over ALL props, so a wall in front protects the block
// behind it. Clients delete through a host-authoritative bDel message (runtime-gated on the host
// too). The build hint teaches the key per device.
// Verified live: placed blocks deleted via the X keydown AND the middle-click path (runtime count
// 1->0 twice), an authored prop refused with everything intact, and build mode stayed active
// through the whole place/delete loop.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

const del = extractFunction('_bmDeleteAimed', src);
assert(/if\(!node \|\| !node\.userData\.runtime\)\{/.test(del), 'only session-placed (runtime) props are deletable — authored level geometry is safe');
assert(/for\(const o of propModels\)\{ if\(o && o\.visible && o\.userData && !o\.userData\._destroyed && !o\.userData\._shattered\) cands\.push\(o\); \}/.test(del),
  'the ray sees ALL props, so authored geometry in front blocks a runtime prop behind it');
assert(/NET\.conn\.send\(\{ t:'bDel', nid:node\.userData\.nid \}\)/.test(del), 'a client asks the host (same authority as breaking by gunfire)');
assert(/shatterProp\(node, null, null, 5,/.test(del), 'solo/host reuse the shatter path — debris, sound and the existing net broadcast');

// inputs, one per device — each meaningless in build mode otherwise
assert(/if\(e\.code==='KeyX' && typeof buildMode!=='undefined' && buildMode && gameOn && !editorOpen\)\{ e\.preventDefault\(\); _bmDeleteAimed\(\); return; \}/.test(src),
  'desktop: X deletes');
assert(/else if\(e\.button===1\)\{ _bmDeleteAimed\(\); \}/.test(src), 'desktop: middle-click deletes');
assert(/if\(typeof buildMode!=='undefined' && buildMode\)\{ padAds=false; if\(\(down\(6\) \|\| aval\(6\)>0\.5\) && !padPrev\[6\]\) _bmDeleteAimed\(\); \}/.test(src),
  'pad: LT deletes (and ADS is suppressed while building)');
assert(/if\(typeof buildMode!=='undefined' && buildMode\)\{ _bmDeleteAimed\(\); e\.preventDefault\(\); return; \}   \/\/ build 941: AIM deletes/.test(src),
  'touch: the AIM button deletes');

// host-side authority for client deletes
assert(/else if\(msg\.t==='bDel'\)\{ const o=propByNid\(msg\.nid\); if\(o && o\.userData\.runtime && !o\.userData\._shattered\) shatterProp\(o, null, null, 5, id\); \}/.test(src),
  'the host honors bDel for runtime props only');

// the hint teaches it per device
assert(/LT delete/.test(src) && /AIM delete/.test(src) && /X\/MMB delete/.test(src), 'the build hint names the delete key on every device');

done('build 941: misplaced blocks delete as easily as they place — X/MMB, LT or AIM, authored geometry protected');
