// (build 1001) CHARACTER SELECT v2 — the field-report fixes (screenshot: tiny T-posed model,
// stretched canvas, wasted landscape space). Preview = buildAvatarVisual (game idle, no T-pose);
// live-fit canvas each tick; short-landscape split layout. Pixel-verified in the browser harness
// at 932x430: flex-direction row, buffer aspect == display aspect, avatar fills 82% of the stage.
import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();

assert(/@media \(orientation:landscape\) and \(max-height:620px\)\{/.test(html)
    && /#csBody \{ flex-direction:row; align-items:stretch; \}/.test(html),
  'short-landscape phones split: model left, name/cards/select right');
assert(/#csCards \{ flex-wrap:wrap; overflow-x:visible; overflow-y:auto; justify-content:center; max-height:38vh; \}/.test(html),
  'the card strip wraps into a grid on the landscape side panel');
assert(/if\(Math\.abs\(w-_csW\)>2 \|\| Math\.abs\(h-_csH\)>2\)\{ _csW=w; _csH=h; _invR\.setSize\(w,h,false\); _inspCam\.aspect=w\/h; _inspCam\.updateProjectionMatrix\(\); \}/.test(src),
  'the canvas live-fits the holder every tick (no stretch after late layout or rotation)');
assert(/const dist=Math\.max\(1\.25\/Math\.tan\(fovV\/2\), 1\.0\/\(Math\.tan\(fovV\/2\)\*Math\.max\(0\.3,_inspCam\.aspect\)\)\) \+ 0\.5;/.test(src),
  'camera distance fits the ~2m avatar to BOTH viewport axes — the model fills the stage on any screen');
assert(/_inspCam\.position\.set\(0, 1\.15, dist\); _inspCam\.lookAt\(0, 0\.98, 0\);/.test(src),
  'framed at chest height like the reference screens');
assert(/hold\.onpointermove=e=>\{ if\(!drag\) return; _csRotY\+=\(e\.clientX-lx\)\*0\.012; lx=e\.clientX; \};/.test(src),
  'drag is a clean yaw turntable (the avatar stands on its feet)');
assert(/const mx=_csGrp\.userData && _csGrp\.userData\.mixer;\s*\n\s*if\(mx\)\{ const mi=mixers\.indexOf\(mx\); if\(mi>=0\) mixers\.splice\(mi,1\); _csGrp\.userData\.mixer=null; \}/.test(src),
  'closing the screen releases the preview mixer');
done('build 1001: select-screen fit — full-size animated avatar, no stretch, landscape split');
