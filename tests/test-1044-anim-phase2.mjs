// (build 1044) ANIMATION EDITOR PHASE 2 — production authoring: pose/clip mirroring across the
// canonical body, pose + key clipboards, per-clip interpolation modes (smooth/linear/step),
// .rumpusanim export/import through the sanitizer, and onion-skin ghost skeletons.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
const manual = readFileSync(new URL('../breach-help.html', import.meta.url), 'utf8');

// ---- executable: mirroring math ----
const env = new Function(
  extractFunction('_aeMirrorSlot', src) + '\n' + extractFunction('_aeMirrorQK', src) + '\n'
  + extractFunction('_aeMirrorPK', src) + '\n' + extractFunction('_aeMirrorClipData', src)
  + '\nreturn { slot:_aeMirrorSlot, qk:_aeMirrorQK, pk:_aeMirrorPK, clip:_aeMirrorClipData };')();
eq(env.slot('L:uparm'), 'R:uparm', 'left slots mirror right');
eq(env.slot('R:foot'), 'L:foot', '...and back');
eq(env.slot('spine1'), 'spine1', 'center bones mirror in place');
{
  // a rotation about world Y mirrors to -Y; about X stays (YZ-plane reflection)
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.8);
  const m = env.qk([0, qy.x, qy.y, qy.z, qy.w]);
  const mq = new THREE.Quaternion(m[1], m[2], m[3], m[4]);
  near(mq.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.8)), 0, 1e-6, 'a Y-rotation mirrors to -Y');
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.8);
  const mx = env.qk([0, qx.x, qx.y, qx.z, qx.w]);
  near(new THREE.Quaternion(mx[1], mx[2], mx[3], mx[4]).angleTo(qx), 0, 1e-6, 'an X-rotation is its own mirror');
  const twice = env.qk(env.qk([0, 0.1, 0.2, 0.3, 0.927]));
  eq(twice.join(','), [0, 0.1, 0.2, 0.3, 0.927].join(','), 'mirroring twice is the identity');
  eq(env.pk([0.5, 0.2, 1, -0.1]).join(','), '0.5,-0.2,1,-0.1', 'the hips offset flips X only');
}
{
  const data = { id:'ca_m', name:'wave', dur:1, fps:30, loop:'loop', interp:'smooth',
    tracks: { 'L:uparm': { q: [[0, 0, 0, 0.7071, 0.7071]] }, hips: { q: [[0, 0, 0, 0, 1]], p: [[0, 0.2, 0.1, 0]] } } };
  const m = env.clip(data);
  assert(m.tracks['R:uparm'] && !m.tracks['L:uparm'], 'clip mirror swaps sided tracks');
  near(m.tracks.hips.p[0][1], -0.2, 1e-9, '...and flips the hips X offset');
  eq(m.dur, 1, 'settings ride along untouched');
  const back = env.clip(m);
  eq(JSON.stringify(back.tracks), JSON.stringify(data.tracks), 'mirror twice round-trips exactly');
}

// ---- executable: the key clipboard ----
{
  const kenv = new Function(
    extractFunction('_aeUpsertKey', src) + '\n' + extractFunction('_aeKeysAt', src) + '\n' + extractFunction('_aePasteKeysAt', src)
    + '\nreturn { at:_aeKeysAt, paste:_aePasteKeysAt };')();
  const clip = { dur: 2, tracks: { head: { q: [[0, 0, 0, 0, 1], [1, 0, 0, 0.7, 0.7]] }, hips: { q: [[1, 0, 0, 0, 1]], p: [[1, 0, 0.5, 0]] } } };
  const snap = kenv.at(clip, 1);
  eq(Object.keys(snap).sort().join(','), 'head,hips', 'copy grabs every track keyed at the playhead');
  eq(snap.hips.p.join(','), '0,0.5,0', '...including the hips position');
  eq(Object.keys(kenv.at(clip, 0.5)).length, 0, 'no keys at that time -> empty clipboard');
  const n = kenv.paste(clip, snap, 1.8);
  eq(n, 3, 'paste writes all copied channels');
  assert(clip.tracks.head.q.some(k => k[0] === 1.8), '...at the new time');
  eq(kenv.paste(clip, snap, 3), 3, 'pasting past the end...');
  eq(clip.dur, 3, '...extends the duration');
  eq(kenv.paste(clip, null, 1), 0, 'an empty clipboard is a no-op');
}

// ---- executable: interpolation modes ----
{
  const ienv = new Function('THREE', extractFunction('_caEvalQ', src) + '\nreturn _caEvalQ;')(THREE);
  const Q90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const keys = [[0, 0, 0, 0, 1], [1, Q90.x, Q90.y, Q90.z, Q90.w]];
  const ang = (mode, t) => ienv(keys, t, new THREE.Quaternion(), mode).angleTo(new THREE.Quaternion());
  near(ang('step', 0.9), 0, 1e-9, 'step holds the previous key');
  near(ang('linear', 0.25), Math.PI / 8, 1e-6, 'linear slerps proportionally');
  assert(ang('smooth', 0.25) < ang('linear', 0.25) * 0.75, 'smooth eases in (slower start): ' + ang('smooth', 0.25).toFixed(3));
  near(ang('smooth', 0.5), Math.PI / 4, 1e-6, '...meeting linear at the midpoint');
  near(ang('smooth', 1), Math.PI / 2, 1e-4, 'every mode lands the final key');
}
{
  const sanEnv = new Function('let _caRev=0;\n' + 'const CA_SLOTS=' + JSON.stringify(['hips','head']) + ';\n'
    + extractFunction('_caNewId', src) + '\n' + extractFunction('_caSanitize', src) + '\nreturn _caSanitize;')();
  eq(sanEnv([{ tracks:{}, interp:'step' }])[0].interp, 'step', 'the sanitizer keeps a chosen curve mode');
  eq(sanEnv([{ tracks:{}, interp:'bogus' }])[0].interp, 'smooth', '...and defaults junk to smooth');
}

// ---- export/import ----
assert(/JSON\.stringify\(\{ format:'rumpusanim', v:1, clip:clean \}\)/.test(src), 'export writes the versioned .rumpusanim envelope');
assert(/\.download=\(\(clean\.name\.replace/.test(src) && /\+'\.rumpusanim';/.test(src), '...named after the clip');
{
  const imp = extractFunction('_aeImport', src);
  assert(/_caSanitize\(\[j && j\.clip \? j\.clip : j\]\)\[0\];/.test(imp), 'import runs everything through the sanitizer (inert data, never code)');
  assert(/if\(customAnims\.some\(c=>c\.id===clean\.id\)\) clean\.id=_caNewId\(\);/.test(imp), 'colliding ids re-mint');
  assert(/toast\('Not a Rumpus animation file'\)/.test(imp), 'junk files get a clear message');
}

// ---- onion skin ----
{
  const g = extractFunction('_aeGhostSync', src);
  assert(/_aeGhostA=mk\(0x5a8dff\); _aeGhostB=mk\(0xff8a5b\);/.test(g), 'two ghosts: blue previous, orange next');
  assert(/find\(t=>t<_aeTime-1e-4\), next=ts\.find\(t=>t>_aeTime\+1e-4\)/.test(g), 'posed at the neighboring key times');
  assert(/if\(gh\.clip!==clip\)/.test(g), 'ghost mixers persist and rebind only when the clip changes');
  assert(/o\.visible=false/.test(g), 'ghosts show the skeleton only (meshes hidden)');
}
assert(/_aeGhostClear\(\); _aeGhostOn=false;/.test(extractFunction('_aeClose', src)), 'ghosts dispose with the editor');
assert(/_aeGhostT=setTimeout\(\(\)=>\{ _aeGhostT=0; _aeGhostSync\(\); \}, 90\);/.test(src), 'scrubbing updates ghosts, debounced');

// ---- UI wiring + docs ----
for (const id of ['aeExp', 'aeImp', 'aeCopyK', 'aePasteK', 'aeGhost']) assert(new RegExp("id=\"" + id + "\"").test(src), 'button #' + id + ' exists');
assert(/mp\.textContent='Mirror pose';/.test(src) && /mcb\.textContent='Mirror clip';/.test(src), 'both mirror operations are reachable');
assert(/\[\['smooth','Smooth \(eased\)'\],\['linear','Linear'\],\['step','Step \(hold\)'\]\]/.test(src), 'the Curve mode picker offers all three');
assert(/_caEvalQ\(tr\.q, t, _qd, data\.interp\);/.test(src), 'the clip builder honors the chosen mode');
assert(/Mirror pose<\/b>/.test(manual) && /\.rumpusanim<\/code>/.test(manual), 'the field manual covers the phase-2 tools');

done('build 1044: mirroring, clipboards, curve modes, onion skins, .rumpusanim — phase 2 authoring tools');
