// (build 1010) PELVIS-LESS BLENDER RIGS — from a real user file (chub2.glb, a Mixamo-animated
// character re-rigged in Blender). Its skeleton is Rig > Spine > { legs, Spine.003 > Spine.002 >
// Spine.001 > Neck } — no Hips/Pelvis bone at all, and the chest bones are numbered TOP-DOWN.
// The retargeter rejected it ("no recognizable humanoid bones") and, had it passed, numeric
// chain-sorting would have twisted the torso. Two fixes:
//   1) a rig without hips promotes its LOWEST spine bone to hips (the legs hang off it)
//   2) spine/neck chains pair by hierarchy DEPTH, not numeric suffix
import * as THREE from 'three';
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

const fns = extractFunction('_canonSuffixRetry', src) + '\n' + extractFunction('_canonBoneKey', src) + '\n' + extractFunction('_buildBoneMap', src);
const { _canonBoneKey, _buildBoneMap } = new Function('THREE', fns + '\nreturn { _canonBoneKey, _buildBoneMap };')(THREE);

// ---- canonicalizer handles the Blender naming family ----
eq(_canonBoneKey('Upperleg.L'), 'L:upleg', 'Blender Upperleg.L');
eq(_canonBoneKey('Lowerarm.R'), 'R:forearm', 'Blender Lowerarm.R');
eq(_canonBoneKey('Spine.003'), 'spine@3', 'dotted spine index');
eq(_canonBoneKey('Foot.L_end'), null, 'leaf helper skipped');
eq(_canonBoneKey('Fingers.L'), null, 'unnumbered finger bundle skipped (no crash)');

// ---- the exact field skeleton, rebuilt as bones ----
const grow = (parent, spec) => { const o = new THREE.Bone(); o.name = spec[0]; parent.add(o); (spec[1] || []).forEach(c => grow(o, c)); return o; };
const CHUB = ['Rig', [
  ['Body'],
  ['Spine', [
    ['Upperleg.L', [['Lowerleg.L', [['Foot.L', [['Foot.L_end']]]]]]],
    ['Spine.003', [['Spine.002', [['Spine.001', [
      ['Neck', [['Head']]],
      ['Shoulder.L', [['Upperarm.L', [['Lowerarm.L', [['Hand.L', [['Fingers.L'], ['Thumb.L']]]]]]]]],
      ['Shoulder.R', [['Upperarm.R', [['Lowerarm.R', [['Hand.R', [['Fingers.R'], ['Thumb.R']]]]]]]]],
    ]]]]]],
    ['Upperleg.R', [['Lowerleg.R', [['Foot.R', [['Foot.R_end']]]]]]],
  ]],
  ['neutral_bone'],
]];
const dst = new THREE.Group(); grow(dst, CHUB);

// Mixamo-named source (the built-in animation library's shape)
const mk = (name, parent) => { const o = new THREE.Bone(); o.name = name; if (parent) parent.add(o); return o; };
const srcRoot = new THREE.Group();
const hips = mk('mixamorig:Hips'); srcRoot.add(hips);
const sp = mk('mixamorig:Spine', hips), sp1 = mk('mixamorig:Spine1', sp), sp2 = mk('mixamorig:Spine2', sp1);
const neck = mk('mixamorig:Neck', sp2); mk('mixamorig:Head', neck);
for (const S of ['Left', 'Right']) {
  const sh = mk('mixamorig:' + S + 'Shoulder', sp2), ua = mk('mixamorig:' + S + 'Arm', sh), fa = mk('mixamorig:' + S + 'ForeArm', ua); mk('mixamorig:' + S + 'Hand', fa);
  const ul = mk('mixamorig:' + S + 'UpLeg', hips), ll = mk('mixamorig:' + S + 'Leg', ul), ft = mk('mixamorig:' + S + 'Foot', ll); mk('mixamorig:' + S + 'ToeBase', ft);
}

const map = _buildBoneMap(dst, srcRoot);
assert(map, 'the field rig maps (was: rejected outright)');
eq(map.hips.dst.name, 'Spine', 'the lowest spine bone is promoted to hips');
eq(map.hips.src.name, 'mixamorig:Hips', '...and pairs with the real source hips');
const by = (n) => map.pairs.find(p => p.dst.name === n);
eq(by('Spine.003').src.name, 'mixamorig:Spine', 'LOWEST chest bone pairs with the lowest source spine (depth order beats the reversed numbering)');
eq(by('Spine.001').src.name, 'mixamorig:Spine2', 'HIGHEST chest bone pairs with the highest source spine');
eq(by('Upperarm.L').src.name, 'mixamorig:LeftArm', 'arms map');
eq(by('Lowerleg.R').src.name, 'mixamorig:RightLeg', 'legs map');
eq(by('Hand.L').src.name, 'mixamorig:LeftHand', 'hands map');
assert(!by('Foot.L_end') && !by('neutral_bone') && !by('Rig') && !by('Body'), 'helpers/mesh/armature never retargeted');
assert(map.pairs.every(p => typeof p.key === 'string'), 'every pair carries its canonical key (the humanoid gate reads keys, not re-canonicalized names)');

// ---- regression: a standard Mixamo dst rig is untouched by the promotion ----
{
  const d2 = new THREE.Group();
  const h2 = mk('mixamorig:Hips'); d2.add(h2);
  const a = mk('mixamorig:Spine', h2), b = mk('mixamorig:Spine1', a), c = mk('mixamorig:Spine2', b);
  const n2 = mk('mixamorig:Neck', c); mk('mixamorig:Head', n2);
  for (const S of ['Left', 'Right']) {
    const sh = mk('mixamorig:' + S + 'Shoulder', c), ua = mk('mixamorig:' + S + 'Arm', sh), fa = mk('mixamorig:' + S + 'ForeArm', ua); mk('mixamorig:' + S + 'Hand', fa);
    const ul = mk('mixamorig:' + S + 'UpLeg', h2), ll = mk('mixamorig:' + S + 'Leg', ul); mk('mixamorig:' + S + 'Foot', ll);
  }
  const m2 = _buildBoneMap(d2, srcRoot);
  assert(m2, 'standard Mixamo rig still maps');
  eq(m2.hips.dst.name, 'mixamorig:Hips', 'a real hips bone is used as-is (no promotion)');
  eq(m2.pairs.find(p => p.dst.name === 'mixamorig:Spine').src.name, 'mixamorig:Spine', 'bottom-up numbering pairs identically under depth sorting');
}

// ---- a rig with neither hips NOR a spine chain still fails the humanoid gate honestly ----
{
  const d3 = new THREE.Group(); const x = mk('Bone'); d3.add(x); mk('Bone.001', x);
  eq(_buildBoneMap(d3, srcRoot), null, 'non-humanoid rigs are still rejected (capsule fallback stays honest)');
}

// source pins: the two mechanisms live in the shipped code
assert(/const promote=\(M\)=>\{ if\(M\.has\('hips'\)\) return;/.test(src), 'hips promotion wired');
assert(/sort\(\(a,b\)=>depth\(M\.get\(a\)\)-depth\(M\.get\(b\)\)\)/.test(src), 'chains sort by hierarchy depth');

done('build 1010: pelvis-less Blender rigs retarget — lowest spine promoted to hips, chains pair by depth');
