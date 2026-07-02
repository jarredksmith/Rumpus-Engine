import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 521 (turret Phase 1.1): a mounted turret you place in the editor — a custom GLB shared by all
// turrets (primitive placeholder when none set), per-instance position/facing/scale and a traverse arc +
// pitch limits, saved into the level. Mount/control/firing come in the next builds.

// ---- runtime: data model + builder + serializer ----
assert(/const TURRET_DEFAULT = \{ scale:1, yawArc:120, pitchMin:-15, pitchMax:35, eye:\[0,1\.45,0\.4\] \};/.test(src), 'turret defaults exist');
assert(/const turretModels = \[\];/.test(src), 'turret instance list exists');
assert(/let turretModelUrl =/.test(src) && /let turretModelScale =/.test(src), 'one shared custom-model URL + scale');
assert(/function buildTurret\(opts\)\{/.test(src), 'buildTurret exists');
assert(/if\(turretModelUrl\)\{\s*\n\s*loadGLTFCached\(turretModelUrl,/.test(src), 'buildTurret loads the custom GLB when set');
assert(/\}\s*else \{ _turretPrimitive\(g\); \}/.test(src), 'buildTurret falls back to a visible placeholder');

// ---- saved in the level (shared model + per-instance array) ----
assert(/turret:  \{ url: turretModelUrl, scale: turretModelScale,/.test(src), 'serializeLevel saves the shared turret model (+ alignment fields, build 544/545)');
assert(/turrets: turretModels\.map\(_turretOpts\),/.test(src), 'serializeLevel saves the turret instances');
assert((src.match(/if\(Array\.isArray\(level\.turrets\)\) for\(const T of level\.turrets\) buildTurret\(T\)/g)||[]).length >= 2, 'both load paths rebuild turrets');

// ---- editor: a placeable, selectable target + Add/Delete + gizmo move ----
assert(/turrets: \{[\s\S]*?isTurret: true,[\s\S]*?addable: true,[\s\S]*?noun: 'Turret',/.test(src), 'editor has a Turrets target');
assert(/add\.innerHTML=_icn\('plus'\)\+'Add turret';/.test(src) && /addSceneTurret\(\)/.test(src), 'Add turret button wired (build 816: SVG icon)');
assert(/else if\(tgt\.isTurret\) deleteSelectedTurret\(\);/.test(src), 'delete handles turrets');
assert(/if\(editorActive==='turrets'\)\{ const g=editorTargets\.turrets\.obj\(\); return g\?g\.position:null; \}/.test(src), 'gizmo reads the turret position');
assert(/\|\| editorActive==='turrets'\);/.test(src), 'turret is gizmo-movable');
assert(/setTurretMarkersVisible\(true\);/.test(src) && /setTurretMarkersVisible\(false\);/.test(src), 'editor markers show in-editor and hide in play');

// ---- executable: _turretOpts serializes a turret group (with default fallbacks) ----
const TURRET_DEFAULT = { scale:1, yawArc:120, pitchMin:-15, pitchMax:35, eye:[0,1.45,0.4] };
const opts = new Function('TURRET_DEFAULT','return ('+extractFunction('_turretOpts')+')')(TURRET_DEFAULT);
const g = { position:{x:1.5,y:0,z:-2.5}, rotation:{y:0.5}, userData:{ turret:{ scale:2, yawArc:90, pitchMin:-10, pitchMax:20, eye:[0,1,0] } } };
const o = opts(g);
eq(o.x,1.5,'x'); eq(o.z,-2.5,'z'); eq(o.yaw,0.5,'yaw'); eq(o.scale,2,'scale'); eq(o.yawArc,90,'arc'); eq(o.pitchMin,-10,'pitchMin'); eq(o.pitchMax,20,'pitchMax');
const o2 = opts({ position:{x:0,y:0,z:0}, rotation:{y:0}, userData:{ turret:{} } });
eq(o2.yawArc,120,'arc falls back to default'); eq(o2.pitchMin,-15,'pitchMin default'); eq(o2.pitchMax,35,'pitchMax default');

done();
