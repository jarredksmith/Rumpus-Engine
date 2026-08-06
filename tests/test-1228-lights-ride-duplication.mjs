// build 1228: attached lights ride duplication — build 997 parents a light to its prop by nid, so a
// finished lamppost is prop + light. But the _pfEntryOf/_pfSpawnEntry pair — which duplicate, Alt-drag,
// the clipboard (1176), array (1225) AND prefabs all route through — carried only the prop, so every
// copy of a lamppost was a dark pole. One fix in the pair covers every path: the entry embeds the
// attached lights (live LOCAL transform, identity stripped), the spawner rebuilds them bound to the
// copy's FRESH nid, and 997's reconciler parents them on the next frame. Editor-time only: buildLight
// changes the scene's light count, which must never change during play (the 636/977/1153/1155 rule) —
// a prefab spawned mid-match by the logic verb arrives lightless rather than freezing the level.
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1418: _lightOpts converts a linear THREE.Color to an sRGB hex through a shared helper. Lifted from
// source rather than restated — a rig that restates a conversion keeps passing against a stale copy of it.
const COLHELP = src.slice(src.indexOf('const _colSRGB = new THREE.Color();'), src.indexOf('function _lightOpts(g){'));


// ---------------------------------------------------------------- the capture, executed against real THREE
const mkCapture = () => {
  const scene = new THREE.Scene();
  const prop = new THREE.Group(); prop.userData = { nid: 'N1' }; prop.position.set(5, 0, 5); scene.add(prop);
  const lg = new THREE.Group();
  lg.userData = { light: new THREE.PointLight(0xff8800, 7, 20), ltype: 'point', litI: 7, lon: true, lfade: 0.4,
    att: { nid: 'N1', p: [0, 3, 0], q: [0, 0, 0, 1] } };
  prop.add(lg); lg.position.set(0, 3.5, 0);   // NUDGED after attach — the live local, not the stale att.p, must copy
  prop.updateMatrixWorld(true);
  const stray = new THREE.Group();            // an unattached light must NOT ride
  stray.userData = { light: new THREE.PointLight(0xffffff, 5, 10), ltype: 'point' }; scene.add(stray);
  const env = { THREE, scene, propEntry: () => ({ src: 'box', t: [5, 0, 5, 0, 0, 0, 1, 1, 1] }), lightModels: [lg, stray] };
  const code = COLHELP + extractFunction('_lightOpts') + '\n' + extractFunction('_pfEntryOf') + '\nreturn _pfEntryOf(prop, { x: 0, y: 0, z: 0 });';
  return new Function(...Object.keys(env), 'prop', code)(...Object.values(env), prop);
};
{
  const e = mkCapture();
  assert(Array.isArray(e.lts) && e.lts.length === 1, 'the entry carries exactly the ATTACHED light — the stray scene light does not ride');
  const lo = e.lts[0];
  eq(lo.color, 0xff8800, 'colour survives');
  eq(lo.intensity, 7, 'intensity survives');
  eq(lo.distance, 20, 'range survives');
  near(lo.att.p[1], 3.5, 1e-6, 'the LIVE local transform copies — a light nudged after attach copies where it sits NOW, not where it first attached');
  eq(lo.t, undefined, 'the world position is stripped (identity)');
  eq(lo.att.nid, undefined, '...and so is the host nid — the spawner re-binds to the copy');
}

// ---------------------------------------------------------------- the spawn, executed: fresh nid, editor-gated
const CORE = extractFunction('_pfSpawnEntry');
const driveSpawn = (gameOn, editorOpen, lts) => {
  const built = [];
  const env = {
    gameOn, editorOpen, built,
    spawnProp: (s, t, cb) => { const o = { userData: { nid: 'FRESH9' } }; cb(o); },
    buildLight: (o) => built.push(o),
    applyPropDynState: () => {}, xaApply: () => {}, jointApply: () => {}, vehicleApply: () => {}, trackApply: () => {},
  };
  const p = { src: 'box', t: [0, 0, 0, 0, 0, 0, 1, 1, 1], lts };
  new Function(...Object.keys(env), 'p', CORE + '\n_pfSpawnEntry(p, { x: 10, y: 0, z: -2 }, null, null, null);')(...Object.values(env), p);
  return built;
};
{
  const built = driveSpawn(false, true, [{ type: 'point', color: 0xff8800, intensity: 7, distance: 20, att: { p: [0, 3.5, 0], q: [0, 0, 0, 1] } }]);
  eq(built.length, 1, 'the copy gets its light back');
  eq(built[0].att.nid, 'FRESH9', '...bound to the COPY\'s fresh nid, never the source\'s');
  near(built[0].t[0], 10, 1e-9, '...standing at the copy');
  near(built[0].t[1], 3.5, 1e-9, '...at its local height (the reconciler snaps the exact transform next frame)');
  eq(built[0].intensity, 7, '...with the authored light config intact');
}
{
  const built = driveSpawn(true, false, [{ type: 'point', att: { p: [0, 1, 0], q: [0, 0, 0, 1] } }]);
  eq(built.length, 0, 'MID-MATCH (the logic spawnprop verb) no light is built — the scene light count must never change during play (636/977/1153/1155)');
  const hostile = Array.from({ length: 20 }, () => ({ type: 'point', att: { p: [0, 1, 0], q: [0, 0, 0, 1] } }));
  eq(driveSpawn(false, true, hostile).length, 8, 'a hostile 20-light entry caps at 8');
}

// ---------------------------------------------------------------- every duplication path inherits from the ONE pair
{
  assert(/_dupSpawnFrom\(o, dx, dz, gid, cb\)\{\n  const e = _pfEntryOf\(o, \{ x:0, y:0, z:0 \}\);/.test(src) ||
         /function _dupSpawnFrom\(o, dx, dz, gid, cb\)\{\n  const e = _pfEntryOf/.test(src),
    'duplicate routes through the pair (1162)');
  assert(/_propClipboard=\{ props:list\.map\(o=>_pfEntryOf\(o, pivot\)\) \};/.test(src), 'the clipboard routes through the pair (1176)');
  assert(/const entries = list\.map\(o => _pfEntryOf\(o, pivot\)\);/.test(src), 'array routes through the pair (1225)');
  assert(/const props=list\.map\(o=>_pfEntryOf\(o, pivot\)\);/.test(src), 'prefab capture routes through the pair (1030)');
  const cap = (extractFunction('_pfEntryOf').match(/lts\.length>=8/g) || []).length;
  eq(cap, 1, 'the capture side caps at 8 too');
}

done('build 1228: attached lights ride duplicate / Alt-drag / clipboard / array / prefab — the real capture executed on a THREE graph (live local transform, identity stripped, strays excluded), the real spawner executed (fresh-nid rebind, position at the copy, config intact), the mid-match gate holds the 1153 light-count rule (a runtime-spawned prefab arrives lightless instead of freezing the level), hostile entries cap at 8, and all five duplication paths provably route through the one fixed pair');
