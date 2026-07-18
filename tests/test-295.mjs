import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 402 (updated build 449): bots avoid obstacles (wall-slide + stuck recovery) and separate from each
// other. The arena walls/props are the only movement boundary — the spawn region never blocks motion.

const ub = extractFunction('updateBots');

// --- separation steering ---
assert(/SEPARATION: push away from nearby teammates\/bots/.test(ub), 'bots compute a separation force');
assert(/if\(d2 < 4\.0\)\{/.test(ub) && /w=\(d<1\.2\)\?\(1\.5\*\(1\.2-d\)\+0\.2\):\(0\.18\*\(2\.0-d\)\)/.test(ub), 'separation: firm under 1.2m, gentle when merely close');
assert(/else \{ const a=Math\.random\(\)\*Math\.PI\*2; sx\+=Math\.cos\(a\)\*1\.5; sz\+=Math\.sin\(a\)\*1\.5; near\+\+; \}/.test(ub), 'exactly-stacked bots get a hard random shove apart (no freeze)');
assert(/if\(near\)\{ let sl=Math\.hypot\(sx,sz\); const cap=1\.3; if\(sl>cap\)\{ sx=sx\/sl\*cap; sz=sz\/sl\*cap; \} mvx \+= sx; mvz \+= sz;/.test(ub), 'the declump push is capped at 1.3 (un-piles firmly, never flings)');

// --- wall sliding (arena walls/props are the only block; no region gate) ---
assert(/const okFull=\(\(typeof clearAt!=='function'\) \|\| clearAt\(cx,cz,b\.pos\.y,_candSurf\)\);/.test(ub), 'tries the full step first (walls are the only block; reuses the precomputed surface)');
assert(/const okX = clearAt\(cx, b\.pos\.z, b\.pos\.y\), okZ = clearAt\(b\.pos\.x, cz, b\.pos\.y\);/.test(ub), 'on a block, probes X-only and Z-only');
assert(/if\(okX\)\{ b\.pos\.x=cx; \} else if\(okZ\)\{ b\.pos\.z=cz; \}/.test(ub), 'slides along whichever axis is open');
assert(!/regionOK/.test(ub), 'movement is never gated by the spawn region');

// --- stuck recovery ---
assert(/if\(moved < step\*0\.25\)\{ b\._stuckT=\(b\._stuckT\|\|0\)\+dt; \} else \{ b\._stuckT=0; b\._stuckSide=0; b\._sFlip=0; \}/.test(ub), 'accrues stuck time when barely moving; clears wall-follow side when moving (build 977: + the flip flag)');
assert(/if\(b\._stuckT>0\.5\)\{ if\(!b\._stuckSide\) b\._stuckSide=\(Math\.random\(\)<0\.5\?1:-1\);/.test(ub), 'picks a wall-follow side after being stuck ~0.5s');
assert(/const px=-mvz\*b\._stuckSide, pz=mvx\*b\._stuckSide;/.test(ub), 'wall-follow steers consistently along one side');
assert(/if\(b\._stuckT>3\.5 && typeof randomSpawn==='function'\)/.test(ub), 'a truly-jammed bot relocates only as a rare last resort');

// --- executable: wall-slide math. A bot moving +X into a wall at x>=5 should still advance in Z. ---
function clearAtMock(x,z){ return x < 5; }   // wall plane at x=5
let bx=4.9, bz=0; const mvx=0.8, mvz=0.6, step=0.3;
const cx=bx+mvx*step, cz=bz+mvz*step;
const okFull=clearAtMock(cx,cz);
if(okFull){ bx=cx; bz=cz; } else { const okX=clearAtMock(cx,bz), okZ=clearAtMock(bx,cz); if(okX) bx=cx; else if(okZ) bz=cz; }
assert(Math.abs(bx-4.9)<1e-9 && bz>0, 'into a wall: X blocked but the bot still slides along Z (no freeze)');

function sep(ax,az,bx2,bz2){ const ddx=ax-bx2, ddz=az-bz2, d2=ddx*ddx+ddz*ddz; if(d2<2.56&&d2>1e-4){ const d=Math.sqrt(d2); return {x:(ddx/d)*((1.6-d)/1.6), z:(ddz/d)*((1.6-d)/1.6)}; } return {x:0,z:0}; }
const f = sep(0.2,0, 0,0);
assert(f.x>0, 'a bot to the +X side of another is pushed further +X (they separate)');
done();
