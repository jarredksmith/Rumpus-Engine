import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 586: cosmetic attachment mounting — procedural meshes parented to the viewmodel, anchored off the
// authored muzzle point plus a per-weapon per-slot offset. Placement math is pure (unit-tested).

// --- run the REAL pure mount transform ---
const xf = new Function('return ('+extractFunction('_attMountTransform')+')')();
const mz={ x:0.2, y:-0.1, z:-1.0 };
let t = xf(mz, { x:0, y:0, z:-0.1, s:1 });
near(t.z, -1.1, 1e-9, 'muzzle-slot device sits at the muzzle, extended forward');
eq(t.x, 0.2, 'x carries the muzzle x'); eq(t.s, 1, 'scale passes through');
t = xf(mz, { x:0, y:0.1, z:0.3, s:1.2 });
near(t.y, 0.0, 1e-9, 'optic offset above the muzzle'); near(t.z, -0.7, 1e-9, 'optic offset back toward the body'); eq(t.s, 1.2, 'optic scale');
t = xf(mz, {});
eq(t.x, 0.2, 'missing offset fields default to 0 (lands on the muzzle)'); eq(t.s, 1, 'missing scale -> 1');

// --- defaults + wiring ---
assert(/const _MOUNT_DEFAULT = \{/.test(src) && /optic:.*z:0\.30/.test(src) && /muzzle:.*z:-0\.10/.test(src), 'per-slot default offsets anchored off the muzzle');
const bm = extractFunction('_buildAttMesh');
assert(/a\.slot==='optic'/.test(bm) && /a\.slot==='muzzle'/.test(bm) && /a\.slot==='magazine'/.test(bm), 'a procedural mesh per slot type');
assert(/id==='drum'/.test(bm) && /id==='scope2x'/.test(bm) && /id==='laser'/.test(bm), 'meshes vary by specific attachment');
const rb = extractFunction('rebuildAttMounts');
assert(/while\(_attMountGroup\.children\.length\)/.test(rb) && /\.dispose\(\)/.test(rb), 'rebuild clears + disposes the old mount meshes');
assert(/const id=lo\[slot\]; if\(!id\) continue/.test(rb) && /_attMountTransform\(mz, getMount\(wep, slot\)\)/.test(rb), 'only equipped slots are mounted, at their resolved transform');
assert(/try\{/.test(rb) && /catch\(e\)\{/.test(rb), 'mount building is wrapped so it can never break rendering');

// --- hooks: switch / equip / muzzle-edit / persistence ---
assert(/if\(typeof rebuildAttMounts==='function'\) rebuildAttMounts\(key\)/.test(extractFunction('showWeaponModel')), 'weapon switch rebuilds mounts');
assert(/rebuildAttMounts\(curWep\)/.test(extractFunction('applyAttachments')), 'equipping rebuilds mounts');
assert(/mountWep:/.test(extractFunction('serializeLevel')), 'mounts persist with the level');
assert(/savedLevel\.mountWep/.test(src), 'mounts restore on load');

done('cosmetic attachment mounting: procedural meshes anchored off the authored muzzle, per-weapon offsets, persisted (build 586)');
