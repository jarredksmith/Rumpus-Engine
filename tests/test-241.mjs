import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// builds 339/340: "+ Add" palette in the editor top bar; non-blocking Level check list in Save.

// --- 339: palette structure ---
assert(/<button id="edAdd"/.test(src) && /<div id="edAddMenu"/.test(src), 'palette button + menu in the top bar');
const pi = src.indexOf('// "+ Add" palette:');
assert(pi > 0, 'palette binding block exists');
const pb = src.slice(pi, pi + 7600);   // build 342/650: fab creation + the unified add helpers lengthened the block
for(const item of ['Box','Sphere','Cylinder','Cone','Light','Turret','Enemy spawn','Pickup pad','Audio zone'])
  assert(pb.indexOf(item) > 0, 'palette offers: '+item);
assert(/jump\('enemies','spawns'\); addSceneSpawn\(\);/.test(pb), 'spawn item jumps to the Enemies tab first');
assert(/jump\('build','props'\);\s+addSceneProp\('box'\)/.test(pb), 'shape items jump to Build/props');
// build 343: the pickup entry opens a kind submenu instead of blind-placing
assert(/\['\\u25c6 Pickup pad \\u25b8',  '_pickupSub'\]/.test(pb), 'pickup entry routes to a submenu');
assert(/const buildPickups=\(\)=>\{/.test(pb) && /menuItem\('\\u2039 Back', buildMain\);/.test(pb), 'submenu lists kinds with a Back row');
assert(/newPickupKind=k; jump\('rules'\); addPickupSpot\(k\);/.test(pb), 'choosing a kind places it and remembers the choice');
assert(/if\(opening\) buildMain\(\);/.test(pb), 'reopening always starts at the top level');
// build 344: the zone panel is repainted by its own renderer, not renderEditorFields
assert(/audioZones\.push\(\{[^}]+\}\);[^;]*; refreshAudioZoneMarkers\(\); if\(typeof renderAudioZonesPanel==='function'\) renderAudioZonesPanel\(\);/.test(pb), 'palette zone add repaints the zones panel (options + delete row appear)');
assert(!/audioZones\.push\(\{[^}]+\}\); refreshAudioZoneMarkers\(\); renderEditorFields\(\);/.test(pb), 'no longer calls the wrong renderer');

// build 650: the + menu is the single way to add anything — all five zone tools + turret join it
assert(/\['\\u25c8 Zone \\u25b8',        '_zoneSub'\]/.test(pb), 'a Zone submenu entry exists');
assert(/const buildZones=\(\)=>\{/.test(pb) && /for\(const \[type,icon,label\] of ZONE_ADD\)\{ menuItem\(icon\+' '\+label/.test(pb), 'the Zone submenu lists every volume type');
assert(/const ZONE_ADD=\[\['audiozones'[\s\S]*?'deathzones'[\s\S]*?'jumppads'[\s\S]*?'ladders'[\s\S]*?'firezones'/.test(pb), 'ZONE_ADD covers all five placeable volumes');
assert(/const addZone=\(type\)=>\{/.test(pb), 'a shared addZone helper routes each zone type to its add fn');
for(const fn of ['addDeathZone','addJumpPad','addLadder','addFireZone']) assert(pb.indexOf(fn)>0, 'addZone wires '+fn);
assert(/jump\('build','turrets'\); if\(typeof addSceneTurret==='function'\) addSceneTurret\(\);/.test(pb), 'Turret can be added from the + menu');
assert(/if\(act==='_zoneSub'\)\{ menuItem\(label, buildZones\); continue; \}/.test(pb), 'the main menu routes the Zone entry to its submenu');
assert(/e\.stopPropagation\(\);/.test(pb) && /document\.addEventListener\('click', \(\)=>\{ addMenu\.style\.display='none'; \}\);/.test(pb), 'menu closes on outside click');
// build 342: circular floating button outside the panel, side- and width-aware
assert(/fab\.id='edAddFab'/.test(pb) && /border-radius:50%/.test(pb), 'Add is a floating circle');
assert(/\(ed\.parentNode \|\| document\.body\)\.appendChild\(fab\);/.test(pb), 'fab is a sibling of the panel (not clipped by its overflow)');
assert(/fab\.style\.left = left \? w\+'px' : ''; fab\.style\.right = left \? '' : w\+'px';/.test(pb), 'fab swaps sides with the dock');
assert(/new ResizeObserver\(\(\)=>\{ if\(_fabRaf\) return; _fabRaf=requestAnimationFrame\(\(\)=>\{ _fabRaf=0; placeFab\(\); \}\); \}\)\.observe\(ed\)/.test(pb), 'fab tracks panel resize drags (rAF-coalesced to avoid the ResizeObserver loop warning, build 659)');
assert(/edAddFab'\); if\(fb\) fb\.style\.display='block'/.test(src) && /edAddFab'\); if\(fb\) fb\.style\.display='none'/.test(src), 'fab follows editor open/close');
assert((src.match(/editorEl\.style\.display='none'; \{ const _fb=document\.getElementById\('edAddFab'\); if\(_fb\) _fb\.style\.display='none'; \}/g)||[]).length === 2, 'fab also hides on both direct-close paths (Play level / deploy — build 347)');
assert(/head\.className='edSecHead'/.test(src.slice(src.indexOf('function edFold'), src.indexOf('function edFold')+900)), 'fold headers reuse the polished .edSecHead accordion style (build 415)');

// --- 340: levelIssues, executed against fixtures ---
const li = new Function('propModels','pickupSpots','POWERUP_KINDS','keyDisplayName','pickupsOn','audioZones','cineCfg',
  extractFunction('levelIssues') + '\nreturn levelIssues();');
const PK = { key_red:{ key:'red' }, health:{} };
const KDN = c => c.toUpperCase()+' KEY';
const run = (props, spots, on, zones, cine) => li(props, spots, PK, KDN, on, zones, cine);

assert(run([], [], true, [], { on:false }).length === 0, 'clean level -> no issues');
assert(run([{ userData:{ lockId:'red' } }], [], true, [], { on:false }).length === 1, 'lock without key flagged');
assert(run([], [{ kind:'key_red' }], true, [], { on:false }).length === 1, 'key without lock flagged');
assert(run([{ userData:{ lockId:'red' } }], [{ kind:'key_red' }], true, [], { on:false }).length === 0, 'matched lock+key -> clean');
assert(run([], [{ kind:'health' }], false, [], { on:false }).length === 1, 'pickups off with placed spots flagged');
assert(run([], [], true, [{ url:'  ' }], { on:false }).length === 1, 'empty audio-zone URL flagged');
assert(run([], [], true, [], { on:true, path:[[0,0,0]] }).length === 1, 'cinematic on with <2 path points flagged');
assert(run([], [], true, [], { on:true, path:[[0,0,0],[1,1,1]] }).length === 0, 'cinematic with a real path -> clean');

// --- render wiring: list host in the Save section, repainted after each editor pass ---
assert(/<div id="edIssues"><\/div>/.test(src), 'issues host sits in the Level file section');
assert(/try\{ renderLevelIssues\(\); \}catch\(e\)\{\}/.test(extractFunction('renderEditorFields')), 'issues repaint piggybacks the render microtask');
assert(/saving still works/.test(extractFunction('renderLevelIssues')), 'explicitly non-blocking');
done();
