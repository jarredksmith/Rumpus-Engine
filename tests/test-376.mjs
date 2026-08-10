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
assert(/if\(shopOpen \|\| editorOpen \|\| paused \|\| mapOpen \|\| duelDead \|\| invOpen\b[^)]*\) return;/.test(src), 'firing is blocked while the map is open');
/* build 1467: the free cursor joined this condition, so a pin quoting the WHOLE line broke with every
   part of what it meant still true — the whole-line trap this file records under builds 519/928/1073/1412.
   What each of these means is asserted as MEMBERSHIP of the guard. */
{
  const h = src.slice(src.indexOf("document.addEventListener('pointerlockchange'"),
                      src.indexOf("document.addEventListener('pointerlockchange'") + 1400);
  assert(/openPause\(\)/.test(h), 'exiting pointer-lock for the map does not pop the pause menu');
  for(const g of ['chatOpen', 'mapOpen', 'invOpen', 'shopOpen', 'paused', 'choosingUpgrade', '_hwCursorFree', '_cursorFreeNow'])
    assert(h.includes(g), '...unless ' + g + ' says the cursor was released on purpose');
}

// ---- loop: solo freezes (and still paints the map); multiplayer keeps the world live ----
  // build 1478 added a sixth term to the frame loop's freeze gate and broke five harnesses at once, every
  // one of their assertions still TRUE — they had each quoted the WHOLE condition to assert one thing about
  // it. That is build 1468's own recorded trap one line over: a pin that quotes a whole condition is a pin
  // against the condition's NEIGHBOURS. They assert MEMBERSHIP now.
{ const gate = src.match(/if\(\(shopOpen \|\| choosingUpgrade[^\n]*?\) \{ pollGamepad/);
  assert(gate, 'the frame loop has a freeze gate');
  assert(/\(mapOpen && NET\.mode==='off'\)/.test(gate[0]), 'solo freeze includes the map \u2014 and only solo'); }
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
