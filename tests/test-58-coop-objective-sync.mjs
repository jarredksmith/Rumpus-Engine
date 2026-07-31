// (build 82) Co-op objective sync: the host puts objective state in the world snapshot, clients render
// the survival timer + extraction beacon from it, and the extraction hold counts ANY player in the zone.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// host: snapshot carries the objective block
const sw = extractFunction('serializeWorld');
assert(/const O = \{ o:objectiveActive\(\)/.test(sw), 'snapshot builds an objective block O');
assert(/ex:\[\+extractPos\.x\.toFixed\(2\), \+extractPos\.z\.toFixed\(2\)\]/.test(sw), 'O carries the beacon position');
assert(/return \{ t:'world', dl: full\?undefined:1, P, E, Ex, C, D, K, PU, O, wv:wave, en:_hostileAlive\(\) \};/.test(sw), 'O is included in the world message (delta-framed since 1197; hostile count since 1226)');

// host: extraction hold counts any teammate, not just the host
const ot = extractFunction('objectiveTick');
assert(/let inZone = false;/.test(ot), 'win-check tracks whether anyone is in the zone');
assert(/for\(const id in NET\.players\)[\s\S]*?rp\.posEye\.x-extractPos\.x/.test(ot), 'co-op teammates are checked against the zone');
assert(/if\(inZone\) extractHoldT = Math\.min\(H, extractHoldT \+ dt\)/.test(ot), 'hold advances while someone is in the zone');

// client: applies the objective snapshot (HUD + beacon)
const ao = extractFunction('applyObjectiveSnapshot');
assert(/O\.o==='extraction'/.test(ao) && /extractZone\.visible=true/.test(ao), 'client shows the beacon for extraction');
assert(/extractPos\.set\(O\.ex\[0\],0,O\.ex\[1\]\)/.test(ao), 'client positions the beacon from the snapshot');
assert(/O\.o==='survival'[\s\S]*?'SURVIVE '\+fmtClock\(O\.s\|\|0\)/.test(ao), 'client shows the survival timer');
assert(/EXTRACTING '\+\(\+O\.h\)\.toFixed\(1\)/.test(ao), 'client shows live extraction hold progress');
const aw = extractFunction('applyWorld');
assert(/applyObjectiveSnapshot\(msg\.O, wave\)/.test(aw), 'applyWorld drives the objective from the snapshot');

// client: the beacon pulses each frame
const ni = extractFunction('netInterpolate');
assert(/_clientBeaconOn && extractZone/.test(ni), 'client pulses the synced beacon');
done('co-op objective sync');
