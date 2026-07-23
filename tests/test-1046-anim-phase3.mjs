// (build 1046) ANIMATION EDITOR PHASE 3 — any-character targets (the editor opens on enemy
// models, assignment writes THAT character's override map and rebuilds ITS visuals),
// multi-select key editing (shift-click toggles, group drag from a snapshot, group delete),
// and a root-motion path line (the hips trajectory across the clip, live in the viewport).
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
const manual = readFileSync(new URL('../breach-help.html', import.meta.url), 'utf8');

// ---- executable: group key moves are snapped and self-collision-safe ----
{
  const env = new Function(
    extractFunction('_aeUpsertKey', src) + '\n' + extractFunction('_aeSnapT', src) + '\n' + extractFunction('_aeMoveKeys', src)
    + '\nreturn _aeMoveKeys;')();
  const mk = () => ({ dur: 2, fps: 10, tracks: { head: { q: [[0.4, 1, 0, 0, 0], [0.5, 2, 0, 0, 0], [1.5, 3, 0, 0, 0]] } } });
  {
    const c = mk();
    const out = env(c, 'head', [0.4, 0.5], 0.1, 10, true);   // move the adjacent pair right by exactly one slot
    eq(out.join(','), '0.5,0.6', 'the group moves together');
    eq(c.tracks.head.q.map(k => k[0]).join(','), '0.5,0.6,1.5', 'moving right does NOT eat its own members (trailing edge first)');
    eq(c.tracks.head.q.find(k => k[0] === 0.5)[1], 1, '...and each key keeps its own value');
  }
  {
    const c = mk();
    env(c, 'head', [0.5, 1.5], -0.1, 10, true);
    eq(c.tracks.head.q.map(k => k[0]).join(','), '0.4,1.4', 'landing on an UNSELECTED key overwrites it (standard editor behavior)');
    eq(c.tracks.head.q.find(k => k[0] === 0.4)[1], 2, '...the moved key wins the slot');
  }
  {
    const c = mk();
    const out = env(c, 'head', [0.4], -1, 10, true);
    eq(out[0], 0, 'moves clamp at zero');
    const c2 = mk();
    env(c2, 'head', [1.5], 1, 10, true);
    eq(c2.dur, 2.5, 'moving past the end extends the clip');
    eq(env({ dur: 1, fps: 10, tracks: {} }, 'head', [0.5], 0.1, 10, true).join(','), '0.5', 'a missing track is a no-op');
  }
  {
    const c = { dur: 2, fps: 10, tracks: { hips: { q: [[0.5, 1, 0, 0, 0]], p: [[0.5, 0, 1, 0]] } } };
    env(c, 'hips', [0.5], 0.2, 10, true);
    eq(c.tracks.hips.q[0][0], 0.7, 'rotation and...');
    eq(c.tracks.hips.p[0][0], 0.7, '...position channels move together');
  }
}

// ---- executable: the root path samples the hips trajectory in world units ----
{
  const env = new Function('THREE',
    extractFunction('_caEvalP', src) + '\n' + extractFunction('_aeRootPathPoints', src) + '\nreturn _aeRootPathPoints;')(THREE);
  const clip = { dur: 1, interp: 'linear', tracks: { hips: { p: [[0, 0, 0, 0], [1, 0, 0, 2]] } } };   // walk 2 hip-heights forward
  const pts = env(clip, new THREE.Vector3(0, 1, 0), 0.9, 10);
  eq(pts.length, 33, 'n samples + 1, xyz each');
  near(pts[1], 1, 1e-6, 'the path starts at the hip rest height');
  near(pts[32], 1.8, 1e-6, 'the end lands 2 hip-heights (x0.9m) forward — world units, this rig');
  near(pts[3 * 5 + 2], 0.9, 1e-6, 'the midpoint sits halfway (linear)');
  eq(env({ dur: 1, tracks: {} }, new THREE.Vector3(), 1, 10), null, 'no hips positions -> no path (the toggle explains why)');
}

// ---- any-character targets ----
assert(/function _aeOpen\(cfg, label, rebuildFn\)\{/.test(src), '_aeOpen takes a character target');
assert(/_aeCfg = cfg \|\| playerModelCfg;/.test(src), 'the player stays the default');
assert(/_loadGLTFWithLib\(url, _aeCfg, \(gltf\)=>\{/.test(src), 'the target cfg drives the model load (auto-rig + library included)');
assert(/tt\.textContent='ANIMATION EDITOR — '\+_aeCfgLabel\.toUpperCase\(\);/.test(src), 'the title names the target');
assert(/_aeOpen\(enemyModelCfg\(editorEnemyType\), 'Enemy '\+editorEnemyType, refreshEnemyVisuals\);/.test(src),
  'the Enemies tab opens the editor on the edited enemy type');
eq((src.match(/if\(typeof _aeRebuildFn==='function'\) _aeRebuildFn\(\); else if\(typeof rebuildAvatars==='function'\) rebuildAvatars\(\);/g) || []).length, 3,
  'save / delete / assign all rebuild the TARGET character (falling back to the player avatars)');
assert(/sec\('ASSIGN TO '\+\(_aeCfgLabel\|\|'Player'\)\.toUpperCase\(\)\)/.test(src), 'the assign panel says who it assigns to');

// ---- multi-select keys ----
assert(!/_aeSelKey[^s]/.test(src.slice(src.indexOf('let _aeRAF'))), 'the single-key selection is fully retired');
assert(/if\(e\.shiftKey\)\{   \/\/ build 1046\/1063: shift-click toggles this key's membership/.test(src), 'shift-click toggles keys into the selection');
assert(/drag=\{ from:hit, orig:JSON\.stringify\(_aeClip\.tracks\), uni:_aeSelUnified\(\) \};/.test(src),
  'group drags snapshot the tracks + the cross-bone selection at grab time (build 1063)');
assert(/_aeClip\.tracks=JSON\.parse\(drag\.orig\);/.test(src) && /for\(const \[slot,times\] of drag\.uni\)\{ moved\.set\(slot, _aeMoveKeys\(_aeClip, slot, times, delta, _aeClip\.fps, _aeSnap\)\); \}/.test(src),
  '...and re-apply the whole move each mouse step across every selected bone (no cumulative drift)');
assert(/else if\(e\.code==='Delete' \|\| e\.code==='Backspace'\)\{ _aeDeleteSel\(\); \}/.test(src), 'Delete clears the whole selection');
assert(/const selK=_aeSelHasCell\(slot, t\);/.test(src), 'every selected key draws gold (build 1063: on ANY row, cross-bone)');

// ---- root path lifecycle ----
assert(/id="aeRootP"/.test(src) && /_aeRootPathOn=!_aeRootPathOn;/.test(src), 'the Root path toggle exists');
assert(/bound after the view loop/.test(src), '...and is bound after the view-preset loop (which would otherwise claim it)');
assert(/if\(_aeRootPathOn\) _aeRootPathSync\(\);   \/\/ build 1046: the path follows every edit/.test(src), 'the path refreshes on every rebuild');
{
  const sync = extractFunction('_aeRootPathSync', src);
  assert(/_aeRootPath\.geometry\.dispose\(\); _aeRootPath\.material\.dispose\(\);/.test(sync), 'the old line disposes before redrawing');
  assert(/Shift-drag the hips and key them to author root motion/.test(sync), 'a pathless clip explains itself');
}
assert(/_aeRootPath=null; _aeRootPathOn=false;/.test(extractFunction('_aeClose', src)), 'the path disposes with the editor');
assert(/Root path<\/b>/.test(manual) && /Enemies tab<\/b>/.test(manual), 'the field manual covers phase 3');

done('build 1046: enemies get the editor too, keys move in groups, and root motion is visible');
