import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 308: Defend objective (hold a zone for a countdown while waves attack)
assert(/let _defendInZone = false;/.test(src), 'defend in-zone flag exists');
// startObjective shows the zone for defend
const so = extractFunction('startObjective');
assert(/objectiveActive\(\)==='extraction' \|\| objectiveActive\(\)==='defend'/.test(so), 'defend shows the zone');
// HUD label
const hud = extractFunction('objectiveHUD');
assert(/objectiveActive\(\)==='defend'/.test(hud) && /HOLD THE ZONE/.test(hud) && /DEFEND '\+fmtClock/.test(hud), 'defend HUD label');
// tick: clock only runs while held, wins at 0
const ot = extractFunction('objectiveTick');
assert(/objectiveActive\(\)==='defend'/.test(ot), 'defend tick branch');
assert(/_defendInZone = inZone;/.test(ot) && /if\(inZone\) surviveLeft -= dt;/.test(ot), 'clock counts down only while held');
assert(/if\(surviveLeft<=0\)\{ surviveLeft=0; if\(typeof gameWon==='function'\) gameWon\(\); \}/.test(ot), 'defend wins when the clock hits 0');
// co-op client sees the zone + HUD
const aos = extractFunction('applyObjectiveSnapshot');
assert(/O\.o==='defend'/.test(aos) && /extractZone\.visible=true/.test(aos), 'client shows defend zone');
// editor button + params
assert(/obBtn\('defend',_icn\('shield'\)\+'Defend'\)/.test(src), 'editor has a Defend button (build 819: SVG icon)');
assert(/objectiveActive\(\)==='defend'\)\{\n\s*const drow=/.test(src), 'editor exposes defend params');
done();
