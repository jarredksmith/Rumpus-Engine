// (build 873) ZONE VISUALS AFTER A PAGE REFRESH — user report: "sometimes in the editor view, I have
// to make an adjustment to the radius or other setting for the water visual to show back up."
// Root cause (reproduced headless): boot fills waterZones/waterfalls/fireZones/deathZones/jumpPads/
// ladders straight from the autosave, but no refresh*() ever ran — zero zone meshes existed until a
// panel edit rebuilt them. Physics reads the arrays (levels still worked), so only the VISUALS vanished.
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

// the boot block exists, covers all six systems, and runs at TOP LEVEL (column 0 — not inside a function)
const block = src.match(/^if\(waterZones\.length\) refreshWaterZones\(\);\n^if\(waterfalls\.length\) refreshWaterfalls\(\);\n^if\(fireZones\.length\) refreshFireZones\(\);\n^if\(deathZones\.length\) refreshDeathZoneMarkers\(\);\n^if\(jumpPads\.length\) refreshJumpPadMarkers\(\);\n^if\(ladders\.length\) refreshLadderMarkers\(\);/m);
assert(!!block, 'boot block rebuilds all six zone visual sets');

// it must sit AFTER every refresher it calls (they are plain function declarations — hoisted — but the
// arrays and their helpers (scene, materials) are const/let, so order still documents the dependency)
const bootAt = src.indexOf('if(waterZones.length) refreshWaterZones();');
for (const fn of ['refreshWaterZones','refreshWaterfalls','refreshFireZones','refreshDeathZoneMarkers','refreshJumpPadMarkers','refreshLadderMarkers']) {
  const def = src.indexOf('function ' + fn + '(');
  assert(def > -1 && def < bootAt, `${fn} defined before the boot block`);
}
// and after the arrays' boot initialization from savedLevel
for (const arr of ['waterZones','waterfalls','fireZones','deathZones','jumpPads','ladders']) {
  const init = src.indexOf('let ' + arr + ' = (savedLevel');
  assert(init > -1 && init < bootAt, `${arr} initialized from the autosave before the boot block`);
}

// regression guard: the load-into-session path STILL refreshes (the boot block must not replace it)
assert(/waterZones = Array\.isArray\(level\.waterZones\) \? level\.waterZones\.map\(_migrateWaterZone\) : \[\]; if\(typeof refreshWaterZones==='function'\) refreshWaterZones\(\);/.test(src),
  'level-load path keeps its own refresh');

done('build 873: zone visuals rebuild at boot — water/falls/fire/markers survive a page refresh');
