// (build 901) RACE HUD OVERLAP — during a race, TWO readouts stacked at the top of the screen: the
// dedicated raceHud pill (build 839) AND the wave banner's race branch printing the same
// P/LAP/time right underneath (plus 'HOSTILES: 0' — races spawn no enemies). objectiveHUD now hides
// the wave panel whenever the race has a start line (the pill owns the readout) and brings it back
// for the 'PLACE A START LINE' nudge and every other objective; KOTH's own hide is left alone.
import { gameSource, extractFunction, evalDecl, assert, eq, done } from './harness.mjs';

const src = gameSource();
const fn = extractFunction('objectiveHUD', src);
assert(/const wp=\$\('wavePanel'\);/.test(fn) && /wp\.style\.display=\(objectiveActive\(\)==='race' && _raceStartO\)\?'none':''/.test(fn),
  'the wave banner hides during a live race and restores otherwise');
assert(/!\(typeof NET!=='undefined' && NET\.gameMode==='cp'\)/.test(fn), "KOTH's own wave-panel hide is not fought over");

// executable: drive the branch with stubs
const mk=(objective, startO, gameMode)=>{
  const els={ waveNum:{ textContent:'' }, wavePanel:{ style:{ display:'seed' } } };
  const f=evalDecl(fn, 'objectiveHUD', {
    $:(id)=>els[id]||null,
    objectiveActive:()=>objective,
    NET:{ gameMode },
    _raceStartO:startO, _raceLap:1, _raceLapT:12.3, _raceBestT:Infinity, _racePlace:()=>({place:2,field:5}),
    gameCfg:{ raceLaps:3, winWaves:0 }, wave:2,
    _fmtRace:(t)=>t.toFixed(1), fmtClock:(t)=>String(t), surviveLeft:0, extractHoldT:0,
    _defendInZone:false, _destroyTotal:0, _destroyRemain:0, _escortNear:false, _escortPct:0, _curGoal:'',
  });
  f();
  return els;
};
eq(mk('race', {}, 'coop').wavePanel.style.display, 'none', 'racing with a start line -> banner hidden (the pill owns it)');
eq(mk('race', null, 'coop').wavePanel.style.display, '', 'no start line -> banner returns with the PLACE A START LINE nudge');
eq(mk('eliminate', {}, 'coop').wavePanel.style.display, '', 'combat objectives keep the banner');
eq(mk('race', {}, 'cp').wavePanel.style.display, 'seed', 'KOTH rooms: this code never touches the panel');

done('build 901: one race readout — the pill; the wave banner steps aside');
