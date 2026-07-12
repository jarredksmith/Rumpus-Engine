// (build 948) THE BIG MAP IS FULLY DRIVEABLE ON A CONTROLLER — it could only be opened/closed
// before. Left stick PANS (speed scales with zoom), RT/LT ZOOM in/out (analog, clamped to the same
// MAP_ZMIN/MAP_ZMAX the wheel uses), A drops a waypoint at the view center, X recenters on the
// player, Y clears the waypoint, B / D-pad down still close. While a pad is in use the map draws a
// center crosshair (where A drops the waypoint) and a one-line control legend.
// Verified live with a synthetic pad: stick panned the view, RT zoomed in past 25%, LT zoomed back
// out, A set the waypoint exactly at the view center, X snapped the center to the player, Y cleared,
// and B closed the map.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();
const poll = extractFunction('pollGamepad', src);

assert(/mapPanX \+= _px\*mapZoom\*1\.8\*dt; mapPanZ \+= _pz\*mapZoom\*1\.8\*dt;/.test(poll),
  'left stick pans, scaled by zoom so it feels constant on screen');
assert(/mapZoom=Math\.max\(MAP_ZMIN, Math\.min\(MAP_ZMAX, mapZoom\*\(1 - _zi\*1\.4\*dt \+ _zo\*1\.4\*dt\)\)\);/.test(poll),
  'RT/LT zoom analog within the same clamps the mouse wheel uses');
assert(/if\(edge9\(0\)\) mapWaypoint=\{ x:mapPanX, z:mapPanZ \};/.test(poll), 'A drops a waypoint at the view center');
assert(/if\(edge9\(2\)\)\{ mapPanX=player\.pos\.x; mapPanZ=player\.pos\.z; \}/.test(poll), 'X recenters on the player');
assert(/if\(edge9\(3\)\) mapWaypoint=null;/.test(poll), 'Y clears the waypoint');
assert(/if\(edge9\(1\)\|\|edge9\(13\)\)\{ closeBigMap\(\); \}/.test(poll), 'B / D-pad down still close');

// pad-aware overlay on the map itself
const draw = extractFunction('drawBigMap', src);
assert(/padRecent\(\)/.test(draw) && /Stick pan \\u00b7 RT\/LT zoom \\u00b7 A waypoint \\u00b7 X me \\u00b7 Y clear \\u00b7 B close/.test(draw),
  'with a pad in use the map shows a center crosshair and the control legend');

done('build 948: the big map pans, zooms and sets waypoints on a controller');
