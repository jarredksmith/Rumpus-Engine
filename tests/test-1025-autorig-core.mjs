// (build 1025) AUTO-RIGGER CORE — Mixamo-style rigging for STATIC humanoid models. The author
// marks chin/wrists/elbows/knees/groin; a mixamorig-NAMED skeleton is fitted to the markers +
// mesh bounds and the meshes are bound with inverse-distance^4 top-4 weights. The bones carry
// Mixamo names on purpose: the EXISTING retarget pipeline (_buildBoneMap + the animation
// library) then treats the model as if it came rigged. Markers ride the char cfgs (player /
// roster / enemies) so the rig rebuilds deterministically on every load.
import * as THREE from 'three';
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const fns = 'const AUTORIG_MARKERS = ' + extractConst('AUTORIG_MARKERS', src) + ';\n'
  + extractFunction('_sanitizeAutoRig', src) + '\n'
  + extractFunction('_autoRigJoints', src) + '\n'
  + extractFunction('_segDist2', src) + '\n'
  + extractFunction('_arBlendR', src) + '\n'      // build 1037: soft joint blending helpers
  + extractFunction('_arWeightKernel', src) + '\n'
  + extractFunction('_arSmoothWeights', src) + '\n'      // build 1039: surface weight smoothing
  + extractFunction('_arSmoothIters', src) + '\n'
  + extractFunction('_arJoints', src) + '\n'      // build 1043: guaranteed-width joint ramps
  + extractFunction('_arJointEnforce', src) + '\n'
  + extractFunction('_autoRigApply', src);
const env = new Function('THREE', 'console', fns
  + '\nreturn { _sanitizeAutoRig, _autoRigJoints, _segDist2, _autoRigApply, AUTORIG_MARKERS };')(THREE, console);

// ---- sanitizer: the markers ride network/level data, so they must be validated ----
const MK = { chin:[0,1.55,0.05], wristL:[0.75,1.32,0], wristR:[-0.75,1.32,0], elbowL:[0.45,1.33,0], elbowR:[-0.45,1.33,0], kneeL:[0.14,0.48,0.02], kneeR:[-0.14,0.48,0.02], groin:[0,0.85,0] };
assert(env._sanitizeAutoRig(MK), 'a full marker set passes');
eq(env._sanitizeAutoRig({ ...MK, groin:undefined }), null, 'a missing marker rejects the whole set');
eq(env._sanitizeAutoRig({ ...MK, chin:[0,NaN,0] }), null, 'non-finite coordinates reject');
eq(env._sanitizeAutoRig('nope'), null, 'garbage rejects');

// ---- joint layout: pure geometry ----
const J = env._autoRigJoints(MK, [-0.8,0,-0.2], [0.8,1.75,0.2], 1);
const by = (n)=>J.find(j=>j.name==='mixamorig'+n);
assert(J.every(j=>j.name.startsWith('mixamorig') && !j.name.includes(':')), 'Mixamo namespace WITHOUT the colon — three\u2019s track parser cannot drive \u2019mixamorig:X\u2019 bones (the statue bug the smoke caught)');
assert(by('Hips') && !by('Hips').parent, 'Hips is the root');
assert(by('Hips').pos[1] > MK.groin[1] && by('Hips').pos[1] < MK.chin[1], 'hips sit above the groin marker');
eq(by('LeftForeArm').pos.join(','), MK.elbowL.join(','), 'the elbow marker IS the forearm joint');
eq(by('LeftHand').pos.join(','), MK.wristL.join(','), 'the wrist marker IS the hand joint');
eq(by('RightLeg').pos.join(','), MK.kneeR.join(','), 'the knee marker IS the lower-leg joint');
assert(by('Spine').pos[1] < by('Spine1').pos[1] && by('Spine1').pos[1] < by('Spine2').pos[1], 'the spine chain climbs');
assert(by('LeftFoot').pos[1] < MK.kneeL[1] && by('LeftFoot').pos[1] > 0, 'the ankle is derived between knee and floor');
assert(by('LeftToeBase').pos[2] > by('LeftFoot').pos[2], 'toes extend along the +z toe direction');
{ const J2 = env._autoRigJoints(MK, [-0.8,0,-0.2], [0.8,1.75,0.2], -1);
  assert(J2.find(j=>j.name==='mixamorigLeftToeBase').pos[2] < J2.find(j=>j.name==='mixamorigLeftFoot').pos[2], '...and flip when the model faces the other way'); }
for(const chain of [['Hips','Spine','Spine1','Spine2','Neck','Head','HeadTop_End'],
                    ['Spine2','LeftShoulder','LeftArm','LeftForeArm','LeftHand','LeftHand_End'],
                    ['Hips','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','LeftToe_End']]){
  for(let i=1;i<chain.length;i++) eq(by(chain[i]).parent, 'mixamorig'+chain[i-1], chain[i]+' hangs off '+chain[i-1]);
}

// ---- the full apply on a synthetic UNRIGGED humanoid (boxes for torso/head/limbs) ----
function box(w,h,d, x,y,z){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial()); m.position.set(x,y,z); return m; }
function makeStatic(){
  const root=new THREE.Group();
  root.add(box(0.5,0.7,0.28, 0,1.2,0));      // torso
  root.add(box(0.26,0.3,0.26, 0,1.66,0.02)); // head
  root.add(box(0.62,0.11,0.12, 0.48,1.33,0)); // arm L (T-pose, +x)
  root.add(box(0.62,0.11,0.12, -0.48,1.33,0));// arm R
  root.add(box(0.16,0.9,0.2, 0.15,0.45,0.01)); // leg L
  root.add(box(0.16,0.9,0.2, -0.15,0.45,0.01));// leg R
  root.add(box(0.16,0.08,0.34, 0.15,0.04,0.08)); // foot L (toes toward +z)
  root.add(box(0.16,0.08,0.34, -0.15,0.04,0.08));// foot R
  return root;
}
const gltf = { scene: makeStatic(), userData:{ _libFor:'ual1', _libAnims:[] } };
eq(env._autoRigApply(gltf, MK), true, 'a static humanoid rigs');
let skinned=0, plain=0, boneCount=0;
gltf.scene.traverse(o=>{ if(o.isSkinnedMesh) skinned++; else if(o.isMesh) plain++; else if(o.isBone) boneCount++; });
eq(plain, 0, 'no static mesh survives — everything is bound');
eq(skinned, 8, 'every body part became a SkinnedMesh');
eq(boneCount, 27, 'the full mixamorig skeleton (27 joints incl. ends)');
assert(gltf.userData._autoRigged, 'marked rigged (idempotent)');
assert(!('_libFor' in gltf.userData), 'stale animation-library retarget state is cleared — the pack re-attaches against the NEW bones');
eq(env._autoRigApply(gltf, MK), true, 'second apply is a no-op success');
{ let sk2=0; gltf.scene.traverse(o=>{ if(o.isSkinnedMesh) sk2++; }); eq(sk2, 8, '...and does not double-rig'); }

// weights: normalized, 4 influences, indices in range
const sm = (()=>{ let f=null; gltf.scene.traverse(o=>{ if(!f && o.isSkinnedMesh) f=o; }); return f; })();
const wts=sm.geometry.attributes.skinWeight, ids=sm.geometry.attributes.skinIndex;
let okSum=true, okIdx=true;
for(let i=0;i<wts.count;i++){
  const s4=wts.getX(i)+wts.getY(i)+wts.getZ(i)+wts.getW(i);
  if(Math.abs(s4-1)>1e-4) okSum=false;
  for(const v of [ids.getX(i),ids.getY(i),ids.getZ(i),ids.getW(i)]) if(v<0 || v>=27) okIdx=false;
}
assert(okSum, 'every vertex weight quad sums to 1');
assert(okIdx, 'every skin index points at a real bone');

// cross-body damping: a left-arm vertex must be owned by LEFT bones
{ const names=sm.skeleton.bones.map(b=>b.name);
  let leftArmMesh=null; gltf.scene.traverse(o=>{ if(o.isSkinnedMesh && !leftArmMesh){ const bb=new THREE.Box3().setFromObject(o); if(bb.min.x>0.15 && bb.max.y>1 && bb.max.y<1.6) leftArmMesh=o; } });
  assert(leftArmMesh, 'found the left arm mesh');
  const li=leftArmMesh.geometry.attributes.skinIndex, lw=leftArmMesh.geometry.attributes.skinWeight;
  let crossW=0, totW=0;
  for(let i=0;i<li.count;i++){ for(const [b,w] of [[li.getX(i),lw.getX(i)],[li.getY(i),lw.getY(i)],[li.getZ(i),lw.getZ(i)],[li.getW(i),lw.getW(i)]]){ totW+=w; if(/Right/.test(names[b])) crossW+=w; } }
  assert(crossW/totW < 0.02, 'right-side bones hold <2% of the left arm (cross-body damping works)');
}

// ---- THE POINT: the generated rig passes the game's own retarget gate ----
const rt = extractFunction('_canonSuffixRetry', src) + '\n' + extractFunction('_canonBoneKey', src) + '\n' + extractFunction('_buildBoneMap', src);
const { _buildBoneMap } = new Function('THREE', rt + '\nreturn { _buildBoneMap };')(THREE);
const mk2 = (name,parent)=>{ const o=new THREE.Bone(); o.name=name; if(parent) parent.add(o); return o; };
const srcRoot = new THREE.Group();
const hips = mk2('mixamorig:Hips'); srcRoot.add(hips);
const sp=mk2('mixamorig:Spine',hips), sp1=mk2('mixamorig:Spine1',sp), sp2=mk2('mixamorig:Spine2',sp1);
const nk=mk2('mixamorig:Neck',sp2); mk2('mixamorig:Head',nk);
for(const S of ['Left','Right']){
  const sh=mk2('mixamorig:'+S+'Shoulder',sp2), ua=mk2('mixamorig:'+S+'Arm',sh), fa=mk2('mixamorig:'+S+'ForeArm',ua); mk2('mixamorig:'+S+'Hand',fa);
  const ul=mk2('mixamorig:'+S+'UpLeg',hips), ll=mk2('mixamorig:'+S+'Leg',ul), ft=mk2('mixamorig:'+S+'Foot',ll); mk2('mixamorig:'+S+'ToeBase',ft);
}
const map=_buildBoneMap(gltf.scene, srcRoot);
assert(map, 'the auto-rigged model passes _buildBoneMap — the animation library will attach');
eq(map.hips.dst.name, 'mixamorigHips', 'hips pair (colon-less dst maps to the colon\u2019d source)');
const pair=(n)=>map.pairs.find(p=>p.dst.name==='mixamorig'+n);
eq(pair('LeftArm').src.name, 'mixamorig:LeftArm', 'upper arms pair');
eq(pair('RightFoot').src.name, 'mixamorig:RightFoot', 'feet pair');
eq(pair('Spine2').src.name, 'mixamorig:Spine2', 'chest pairs');

// ---- the load-path hook + cfg plumbing ----
assert(/if\(cfg && cfg\.autoRig && typeof _autoRigApply==='function'\)\{ try\{ _autoRigApply\(gltf, cfg\.autoRig\); \}catch\(e\)\{/.test(src),
  'every character load (player / roster / enemies / bots) rigs BEFORE the animation library attaches');
assert(/autoRig:_sanitizeAutoRig\(c\.autoRig\),/.test(src), 'roster cfg sanitizes the markers');
assert(/autoRig: playerModelCfg\.autoRig\|\|undefined,/.test(src), 'markers serialize with the player');
assert(/autoRig:c\.autoRig\|\|undefined,/.test(src), '...with each roster character');
assert(/autoRig:m\.autoRig\|\|undefined,/.test(src), '...and with each enemy model');
assert(/playerModelCfg\.autoRig=\(typeof _sanitizeAutoRig==='function'\)\?_sanitizeAutoRig\(pl\.autoRig\):null;/.test(src), 'level load restores the player markers');
assert(/autoRig: \(typeof _sanitizeAutoRig==='function'\)\?_sanitizeAutoRig\(src\.autoRig\):null,/.test(src), 'level load restores enemy markers');

done('build 1025: auto-rig core — markers to mixamo-named skeleton, auto weights, retarget-gate verified');
