// (build 70) The endless-tone fix: the music drone no longer plays at a fixed volume. It starts silent
// and is swelled by the live intensity each step, so it fades to near-silence between waves.
// (build 1374: the drone gained an ALWAYS-ON floor - it still tracks intensity, but the low end is a hum, not silence.)
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();
const start = extractFunction('_startProcMusic');
assert(/g\.gain\.value=0;/.test(start), 'drone oscillators start silent (no constant tone)');
const step = extractFunction('_musicStepFn');
assert(/_musicDrone\)\{[^]*setTargetAtTime\(dg\[i\]\*\(0\.30\+0\.70\*inten\)/.test(step), 'drone gain tracks the live intensity above the build-1374 always-on floor');
assert(/stopMusic/.test(src), 'stopMusic still tears the drone down');
done('music drone tracks intensity');
