import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 556: fire & smoke (fire zones) can now be moved, rotated, and scaled like a prop. Move = x/z gizmo +
// Base Y; rotate + scale = the editor's rotate/scale gizmo (or panel sliders), persisted in the level.

// --- data model carries rotation + scale ---
assert(/rx:\(\+z\.rx\|\|0\), ry:\(\+z\.ry\|\|0\), rz:\(\+z\.rz\|\|0\), sx:\(z\.sx!=null\?\+z\.sx:1\), sy:\(z\.sy!=null\?\+z\.sy:1\), sz:\(z\.sz!=null\?\+z\.sz:1\)/.test(src), '_migrateFireZone adds rotation (deg) + scale, defaulting to identity');
assert(/rx:\(\+z\.rx\|\|0\), ry:\(\+z\.ry\|\|0\), rz:\(\+z\.rz\|\|0\), sx:\(z\.sx!=null\?\+z\.sx:1\), sy:\(z\.sy!=null\?\+z\.sy:1\), sz:\(z\.sz!=null\?\+z\.sz:1\) \}\)\)/.test(src), 'transform persists in the level serialize');

// --- the built group applies the transform ---
const bg = extractFunction('buildFireZoneGroup');
assert(/grp\.rotation\.set\(\(\+z\.rx\|\|0\)\*RAD, \(\+z\.ry\|\|0\)\*RAD, \(\+z\.rz\|\|0\)\*RAD\);/.test(bg), 'the group is rotated from the data (degrees -> radians)');
assert(/grp\.scale\.set\(z\.sx!=null\?\+z\.sx:1, z\.sy!=null\?\+z\.sy:1, z\.sz!=null\?\+z\.sz:1\);/.test(bg), 'the group is scaled from the data');

// --- the gizmo can rotate + scale fire zones (get returns the group transform; set writes it back) ---
assert(/if\(editorActive==='firezones'\)\{ return \(selFireZone>=0 && fireZoneFx\[selFireZone\]\)\?fireZoneFx\[selFireZone\]\.rotation:null; \}/.test(src), 'getSelRot exposes the fire zone for the rotate gizmo');
assert(/if\(editorActive==='firezones'\)\{ return \(selFireZone>=0 && fireZoneFx\[selFireZone\]\)\?fireZoneFx\[selFireZone\]\.scale:null; \}/.test(src), 'getSelScale exposes the fire zone for the scale gizmo');
const ssr = extractFunction('setSelRot');
assert(/editorActive==='firezones'\)\{[\s\S]*?g\.rotation\.copy\(euler\);[\s\S]*?z\.rx=euler\.x\*DEG; z\.ry=euler\.y\*DEG; z\.rz=euler\.z\*DEG;/.test(ssr), 'rotating writes the live group + stores rx/ry/rz (no rebuild mid-drag)');
const ssc = extractFunction('setSelScale');
assert(/editorActive==='firezones'\)\{[\s\S]*?g\.scale\.copy\(v\);[\s\S]*?z\.sx=\+v\.x\.toFixed\(3\); z\.sy=\+v\.y\.toFixed\(3\); z\.sz=\+v\.z\.toFixed\(3\);/.test(ssc), 'scaling writes the live group + stores sx/sy/sz');

// --- the gizmo is no longer forced to translate-only for fire zones ---
assert(!/editorActive==='firezones'\) mode='translate'/.test(src), 'fire zones are not forced to translate-only');
assert(/editorActive==='deathzones'\|\|editorActive==='jumppads'\|\|editorActive==='ladders'\) mode='translate'/.test(src), 'flat floor zones (death/jump) + ladders still translate-only');

// --- panel exposes precise rotation + uniform scale ---
const panel = extractFunction('renderFireZonesPanel');
assert(/mkN\('Yaw \\u00b0','ry'/.test(panel) && /mkN\('Pitch \\u00b0','rx'/.test(panel) && /mkN\('Roll \\u00b0','rz'/.test(panel), 'panel has Yaw/Pitch/Roll controls');
assert(/z\.sx=z\.sy=z\.sz=n;/.test(panel), 'panel has a uniform Scale control');

done('fire & smoke can be moved, rotated, and scaled (build 556)');
