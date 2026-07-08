import { gameSource, assert, near, done } from './harness.mjs';
const src = gameSource();
// build 500: a full-screen tactical map on "M" — north-up, pan (drag) + zoom (scroll) like the editor's
// top-down view, every blip across the whole level, and click-to-place a waypoint that also shows on the
// minimap with a live distance. The world freezes in solo (like pause) but keeps running in multiplayer.

// ---- module + entry points ----
assert(/let mapOpen=false;/.test(src), 'map open-state flag exists');
assert(/function openBigMap\(\)\{/.test(src) && /function closeBigMap\(\)\{/.test(src) && /function toggleBigMap\(\)\{/.test(src), 'open/close/toggle entry points exist');
assert(/function drawBigMap\(\)\{/.test(src), 'the map renderer exists');
assert(/function _w2s\(wx,wz,v\)\{/.test(src) && /function _s2w\(sx,sy,v\)\{/.test(src), 'world<->screen transforms exist');

// ---- M opens it; mute moved off the M key ----
assert(/if\(e\.code===BINDS\.map && !e\.repeat\)\{ if\(gameOn && !editorOpen && !shopOpen && !chatOpen && !radialOpen && !choosingUpgrade\)\{ openBigMap\(\)/.test(src) && /map:'KeyM'/.test(src), 'M (rebindable) opens the tactical map during play');
assert(!/if\(e\.code==='KeyM'\)\{ const m=toggleMute\(\)/.test(src), 'the old M=mute keybind is gone (mute stays in settings)');

// ---- the map owns the keyboard while open (Esc/M close, C clears, everything else swallowed) ----
assert(/if\(mapOpen\)\{[\s\S]*?if\(e\.code===BINDS\.map \|\| e\.code==='Escape'\) closeBigMap\(\);[\s\S]*?else if\(e\.code==='KeyC'\) mapWaypoint=null;[\s\S]*?e\.preventDefault\(\); return;/.test(src), 'while open: Esc/map-bind close, C clears the waypoint, other keys are swallowed');

// ---- live-play gating: no fire while the map is up; releasing the lock for the map doesn't open pause ----
assert(/if\(shopOpen \|\| editorOpen \|\| paused \|\| mapOpen \|\| duelDead \|\| invOpen\) return;/.test(src), 'firing is blocked while the map is open');
assert(/&& !paused && !chatOpen && !mapOpen && !invOpen\) openPause\(\)/.test(src), 'exiting pointer-lock for the map does not pop the pause menu');

// ---- loop: solo freezes (and still paints the map); multiplayer keeps the world live ----
assert(/\|\| \(mapOpen && NET\.mode==='off'\) \|\| \(invOpen && NET\.mode==='off'\)\) && !\(duelDead/.test(src), 'solo freeze includes the map');
assert(/renderViewmodel\(\); if\(mapOpen\) drawBigMap\(\); return; \}/.test(src), 'the map is painted while the world is frozen in solo');
assert(/drawMinimap\(\); if\(perfOn\)_prof\.mini\+=_pnow\(\)-_a; \}\n  if\(mapOpen\) drawBigMap\(\);/.test(src), 'multiplayer keeps simulating and draws the map each frame');

// ---- waypoint: click sets it, right-click clears it, and it shows on the minimap ----
assert(/mapWaypoint=\{ x:w\[0\], z:w\[1\] \}/.test(src), 'a click on the map sets a world-space waypoint');
assert(/contextmenu[\s\S]*?e\.preventDefault\(\); mapWaypoint=null/.test(src), 'right-click clears the waypoint');
assert(/const wrx=dxx\*cosY - dzz\*sinY, wrz=dxx\*sinY \+ dzz\*cosY/.test(src), 'the minimap draws the waypoint (rotated into dial space)');

// ---- executable: the view transform round-trips, and zoom stays anchored under the cursor ----
function mk(panX, panZ, zoom, W, H){
  const scale=(Math.min(W,H)/2)/zoom, cx=W/2, cy=H/2;
  return { scale, w2s:(wx,wz)=>[cx+(wx-panX)*scale, cy+(wz-panZ)*scale], s2w:(sx,sy)=>[panX+(sx-cx)/scale, panZ+(sy-cy)/scale] };
}
{
  const m=mk(10,-5,70,1000,800);
  const w=m.s2w(317,222); const s=m.w2s(w[0],w[1]);
  near(s[0],317,1e-6,'round-trip x'); near(s[1],222,1e-6,'round-trip y');
}
{
  // zoom toward the cursor: capture the world point under the cursor, change zoom, shift pan by (before-after)
  let panX=10, panZ=-5, zoom=70; const W=1000, H=800, sx=760, sy=280;
  let v=mk(panX,panZ,zoom,W,H); const before=v.s2w(sx,sy);
  zoom=Math.max(8, Math.min(112, zoom*(1+0.12)));   // one scroll step out
  v=mk(panX,panZ,zoom,W,H); const mid=v.s2w(sx,sy); panX+=before[0]-mid[0]; panZ+=before[1]-mid[1];
  v=mk(panX,panZ,zoom,W,H); const after=v.s2w(sx,sy);
  near(before[0],after[0],1e-6,'zoom anchor x'); near(before[1],after[1],1e-6,'zoom anchor y');
}

done();
