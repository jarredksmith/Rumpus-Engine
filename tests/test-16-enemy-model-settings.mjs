// (build 57) Per-enemy-type models: each type (grunt/runner/brute/gunner) has its own GLB + framing.
// Back-compat: an old single-model level applies to every type. Runnable precedence + full wiring.
import { extractFunction, extractConst, gameSource, done, assert, eq } from './harness.mjs';
const src = gameSource();

assert(/const ENEMY_MODEL0 = \{ url:'', scale:1, face:0, cr:0, ch:0, yoff:0, xoff:0, zoff:0, clip:'', animLib:'', autoRig:null, clips:\{ idle:'', walk:'', run:'', attack:'' \}, clipSpeed:\{\}, clipHold:\{\}, clipInPlace:\{\} \}/.test(src), 'per-type model defaults (build 501: + per-clip maps; build 919: + animLib)');
assert(/const enemyModels = \{\};/.test(src), 'per-type model map');
assert(/applyEnemyModelData\(savedLevel && savedLevel\.enemies, savedLevel && savedLevel\.enemy\)/.test(src), 'loads per-type (legacy fallback) at startup');

// runnable: precedence — legacy applies to all; per-type map overrides; missing entries fall back to legacy
const S = new Function('ENEMY_TYPE_KEYS','ENEMY_TYPES', `
  "use strict";
  const ENEMY_MODEL0 = ${extractConst('ENEMY_MODEL0')};
  const enemyModels = {};
  ${extractFunction('enemyModelCfg')}
  ${extractFunction('applyEnemyModelData')}
  return { enemyModelCfg, applyEnemyModelData };
`)(['grunt','runner','brute','gunner'], {grunt:{},runner:{},brute:{},gunner:{}});

S.applyEnemyModelData(null, { url:'legacy.glb', scale:2 });
eq(S.enemyModelCfg('grunt').url, 'legacy.glb', 'legacy model applies to grunt');
eq(S.enemyModelCfg('gunner').url, 'legacy.glb', 'legacy model applies to gunner');
eq(S.enemyModelCfg('brute').scale, 2, 'legacy scale applies to all');

S.applyEnemyModelData({ grunt:{url:'g.glb'}, brute:{url:'b.glb', cr:2.5} }, { url:'L.glb' });
eq(S.enemyModelCfg('grunt').url, 'g.glb', 'grunt gets its own model');
eq(S.enemyModelCfg('brute').url, 'b.glb', 'brute gets its own model');
eq(S.enemyModelCfg('brute').cr, 2.5, 'brute collider override kept');
eq(S.enemyModelCfg('runner').url, 'L.glb', 'a type with no entry falls back to legacy');

S.applyEnemyModelData({ grunt:{url:'only.glb'} }, null);
eq(S.enemyModelCfg('grunt').url, 'only.glb', 'grunt set');
eq(S.enemyModelCfg('runner').url, '', 'runner stays capsule when no model + no legacy');

// buildEnemyVisual reads the per-type cfg
const bev = extractFunction('buildEnemyVisual');
assert(/const mc = enemyModelCfg\(body\.userData\.enemyType\)/.test(bev), 'visual uses the type config');
assert(/if\(!mc\.url\)\{ useCapsule\(\); return; \}/.test(bev), 'no url -> capsule');
assert(/_loadGLTFWithLib\(mc\.url, mc/.test(bev), 'loads the type model (via the anim-library shim, build 919)');
assert(/-\s*lbox\.min\.y\s*-\s*1\.4\s*\+\s*mc\.yoff/.test(bev), 'seating adds the type Y offset');
assert(/setEnemyHitProxy\(body, mc\.cr > 0 \? mc\.cr : body\.userData\.footprint/.test(bev), 'collider radius sizes the hit cylinder per type');
assert(/footprint = 0\.9\*ty\.scale/.test(bev), 'capsule movement footprint is auto (decoupled from collider radius)');
assert(/body\.userData\.hasModel = true; body\.userData\.faceOff = mc\.face/.test(bev), 'stores per-enemy facing');
assert(/url !== mc\.url\) return/.test(bev), 'stale-load guard when a type url changes');

// facing read per-enemy, not from a global
assert(/turnToward\(en\.mesh\.rotation\.y, _tYaw, dt, en\.shielded \? TURN_RATE\*0\.45 : TURN_RATE\)/.test(src) && /en\.mesh\.userData\.faceOff\|\|0/.test(src), 'solo enemy turns smoothly toward facing (per-model faceOff applied; Shieldbearer slower)');
assert(/turnToward\(em\.mesh\.rotation\.y, _ey, dt, TURN_RATE\)/.test(src) && /em\.mesh\.userData\.faceOff\|\|0/.test(src), 'remote enemy turns smoothly toward facing (per-model faceOff applied)');

// save + restore + net
assert(/enemies: ENEMY_TYPE_KEYS\.reduce\(/.test(src), 'serialized as a per-type map');
assert(/if\(level\.enemies \|\| level\.enemy\)\{ applyEnemyModelData\(level\.enemies, level\.enemy\)/.test(src), 'restore handles per-type + legacy');
assert(/applyEnemyModelData\(level\.enemies, level\.enemy\)/.test(src) && /for\(const id in NET\.enemyMeshes\) buildEnemyVisual/.test(src), 'co-op clients adopt host per-type models');

// editor: type selector + fields bound to the selected type
assert(/let editorEnemyType = 'grunt'/.test(src), 'editor tracks which type is being edited');
assert(/b\.onclick=\(\)=>\{ editorEnemyType=key;/.test(src), 'selector switches the edited type');
assert(/const mc = enemyModelCfg\(editorEnemyType\)/.test(src), 'editor fields bind to that type');
assert(/swapEnemyModel\(eUrl\.value, editorEnemyType\)/.test(src), 'Apply sets the selected type model');
done('per-type enemy models (config / build / save / restore / net / editor)');
