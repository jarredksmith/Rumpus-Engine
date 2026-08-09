// build 1454 — the extraction marker follows a level load on BOTH paths.
//
// The duplicated loader block had drifted: `loadLevelFromNet` ended with `refreshExtractMarker()` and
// `restoreLevel` did not. So in the EDITOR — where every level open and every Ctrl+Z goes through
// restoreLevel — the beacon stayed at the previous level's spot, or lingered when the new level had
// none. A source pin cannot show that; the marker is a mesh with a world position.
//
// The control is the point: A -> B must MOVE the marker, and B -> (no spot) must move it to the auto
// position. Before this build both were no-ops unless the creator was sitting on the extract tab,
// which re-renders the marker for its own reasons.
import { withGame } from './driver.mjs';

const P = (s) => `(function(){ ${s} })()`;

await withGame(async (probe) => {
  const out = [];
  const say = (k, v) => { out.push([k, v]); console.log(String(k).padEnd(34), JSON.stringify(v)); };

  // ---- open the editor: this is the path with the bug ----
  say('editor', await probe(P(`
    if(!editorOpen) toggleEditor();
    return { editorOpen: !!editorOpen, hasMarker: !!(typeof extractZone!=='undefined' && extractZone) };
  `)));

  const readMarker = P(`
    refreshExtractMarker();
    var z = extractZone;
    return { spot: extractSpot ? { x:+extractSpot.x.toFixed(3), z:+extractSpot.z.toFixed(3) } : null,
             marker: z ? { x:+z.position.x.toFixed(3), z:+z.position.z.toFixed(3) } : null };
  `);

  // ---- level A: an authored spot well away from anything ----
  const A = await probe(P(`
    extractSpot = { x: 120, z: -80 };
    refreshExtractMarker();
    var z = extractZone;
    return { spot: { x: extractSpot.x, z: extractSpot.z },
             marker: { x:+z.position.x.toFixed(3), z:+z.position.z.toFixed(3) } };
  `));
  say('A: authored spot', A);

  // ---- load level B through the REAL editor loader, with a DIFFERENT spot ----
  const B = await probe(P(`
    var lvl = serializeLevel();
    lvl.extract = { x: -35, z: 55 };
    restoreLevel(lvl);
    var z = extractZone;
    return { spot: extractSpot ? { x:extractSpot.x, z:extractSpot.z } : null,
             marker: { x:+z.position.x.toFixed(3), z:+z.position.z.toFixed(3) } };
  `));
  say('B: restoreLevel, new spot', B);
  say('B: marker FOLLOWED', Math.abs(B.marker.x - (-35)) < 0.01 && Math.abs(B.marker.z - 55) < 0.01);

  // ---- load level C with NO extract spot: the marker must leave the authored place ----
  const C = await probe(P(`
    var lvl = serializeLevel();
    lvl.extract = null;
    restoreLevel(lvl);
    var z = extractZone, auto = extractAutoPos();
    return { spot: extractSpot,
             marker: { x:+z.position.x.toFixed(3), z:+z.position.z.toFixed(3) },
             auto: { x:+auto.x.toFixed(3), z:+auto.z.toFixed(3) } };
  `));
  say('C: restoreLevel, no spot', C);
  say('C: marker left B and sits at auto',
    Math.abs(C.marker.x - C.auto.x) < 0.01 && Math.abs(C.marker.z - C.auto.z) < 0.01 &&
    Math.abs(C.marker.x - (-35)) > 0.01);

  // ---- the CONTROL: the net path was always correct and must stay so ----
  const NET = await probe(P(`
    var body = _applyLevelSections.toString();
    return { applierRefreshes: /refreshExtractMarker\\(\\)/.test(body),
             netReaches: /_applyLevelSections\\(level\\)/.test(loadLevelFromNet.toString()),
             editorReaches: /_applyLevelSections\\(level\\)/.test(restoreLevel.toString()) };
  `));
  say('both paths reach the one applier', NET);

  const ok = B.marker && Math.abs(B.marker.x + 35) < 0.01 && Math.abs(B.marker.z - 55) < 0.01
          && Math.abs(C.marker.x - C.auto.x) < 0.01
          && NET.applierRefreshes && NET.netReaches && NET.editorReaches;
  console.log('\n' + (ok ? 'PASS' : 'FAIL') + ' — the extraction marker follows an editor level load');
  if (!ok) process.exitCode = 1;
}, { settleMs: 2500 });
