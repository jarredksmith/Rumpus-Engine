import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// builds 339/340: "+ Add" palette in the editor top bar; non-blocking Level check list in Save.

// --- 339: palette structure ---
assert(/<button id="edAdd"/.test(src) && /<div id="edAddMenu"/.test(src), 'palette button + menu in the top bar');
const pi = src.indexOf('// "+ Add" palette:');
assert(pi > 0, 'palette binding block exists');
/* build 1320: this was `src.slice(pi, pi + 7600)` and it broke the moment the block grew — with every
   assertion inside it still TRUE. That is exactly the failure CLAUDE.md records under "a source pin must
   not be scoped by a character count". The block is not a function, so it cannot use extractFunction;
   it ends on a statement that has been its last line since build 342, so anchor on THAT. */
const _pEnd = src.indexOf("document.addEventListener('click', ()=>{ addMenu.style.display='none'; });", pi);
assert(_pEnd > pi, 'the palette block still ends on its outside-click handler');
const pb = src.slice(pi, _pEnd + 200);
for(const item of ['Light','Turret','Enemy spawn','Pickup pad'])
  assert(pb.indexOf(item) > 0, 'palette offers: '+item);
/* build 1320: the shapes and the zones are no longer written out here — the menu iterates PRIM_SHAPES and
   ZONE_TYPES, which is the whole point of that build (this block offered 6 of the 10 shapes and 7 of the 8
   zones, each a hand-kept copy that had drifted). Assert the same offering through the tables. */
{ const shapes = (new Function('return ('+(src.match(/const PRIM_SHAPES = (\[[\s\S]*?\n\]);/)||[])[1]+')'))();
  const common = shapes.filter(r=>r[3]).map(r=>r[1]);
  for(const item of ['Box','Sphere','Cylinder','Cone'])
    assert(common.indexOf(item) >= 0, 'palette offers: '+item);
  assert(/const ADD_ITEMS = PRIM_SHAPES\.filter\(_s=>_s\[3\]\)/.test(pb), '...by iterating the shape table');
  assert(/\['audiozones','\\ud83d\\udd0a','Audio'\]/.test(src) && /of ZONE_TYPES\)\{ menuItem\(icon\+' '\+label/.test(pb),
    'palette offers: Audio zone'); }
assert(/jump\('enemies','spawns'\); addSceneSpawn\(\);/.test(pb), 'spawn item jumps to the Enemies tab first');
assert(/\[glyph\+' '\+label, \(\)=>\{ jump\('build','props'\); addSceneProp\(src\); \}\]/.test(pb), 'shape items jump to Build/props');
// build 343: the pickup entry opens a kind submenu instead of blind-placing
assert(/\['\\u25c6 Pickup pad \\u25b8',  '_pickupSub'\]/.test(pb), 'pickup entry routes to a submenu');
assert(/const buildPickups=\(\)=>\{/.test(pb) && /menuItem\('\\u2039 Back', buildMain\);/.test(pb), 'submenu lists kinds with a Back row');
assert(/newPickupKind=k; jump\('rules'\); addPickupSpot\(k\);/.test(pb), 'choosing a kind places it and remembers the choice');
assert(/if\(opening\) buildMain\(\);/.test(pb), 'reopening always starts at the top level');
// build 344: the zone panel is repainted by its own renderer, not renderEditorFields
// build 1445 gave the audio zone a NAMED adder — it had been inlined here and in the panel button, two
// copies of one object literal. The claim is unchanged and now sits in the one place a zone is added.
{ const add = extractFunction('addAudioZone', src);
  assert(/audioZones\.push\(\{[^}]+\}\);/.test(add) && /refreshAudioZoneMarkers\(\); if\(typeof renderAudioZonesPanel==='function'\) renderAudioZonesPanel\(\);/.test(add),
    'palette zone add repaints the zones panel (options + delete row appear)');
  // the palette reaches it through the table now, which is build 1445's whole point — the menu no longer
  // carries its own copy of how a zone is created
  assert(/const _d=ZONE_EDIT\[type\]; if\(_d && _d\.add\) _d\.add\(\);/.test(pb), '...and the palette asks the table');
  assert(/addAudioZone\(_dp\.x, _dp\.z\)/.test(src), '...which asks the one adder'); }
assert(!/audioZones\.push\(\{[^}]+\}\); refreshAudioZoneMarkers\(\); renderEditorFields\(\);/.test(pb), 'no longer calls the wrong renderer');

// build 650: the + menu is the single way to add anything — all five zone tools + turret join it
assert(/\['\\u25c8 Zone \\u25b8',        '_zoneSub'\]/.test(pb), 'a Zone submenu entry exists');
assert(/const buildZones=\(\)=>\{/.test(pb) && /for\(const \[type,icon,label\] of ZONE_TYPES\)\{ menuItem\(icon\+' '\+label/.test(pb), 'the Zone submenu lists every volume type');
/* build 1320: ZONE_ADD was a SECOND copy of ZONE_TYPES and had drifted by one entry — triggers, the volume
   the logic graph is built on, could not be added from "the ONE place to add anything placeable". The menu
   iterates the picker's own list now, so this assertion covers all EIGHT and cannot go stale again. */
assert(!/const ZONE_ADD=\[/.test(pb), 'the duplicate zone list is gone');
{ const zt = (new Function('return ('+(src.match(/const ZONE_TYPES = (\[[\s\S]*?\]);/)||[])[1]+')'))();
  assert(zt.map(z=>z[0]).join(',')==='triggers,audiozones,deathzones,jumppads,ladders,firezones,waterzones,fxzones',
    'the + menu covers every placeable volume, triggers included');
  // build 1445: the adders live in ZONE_EDIT now, so the claim is asserted against the whole source
  const zoneTable = src.match(/const ZONE_EDIT = \{[\s\S]*?\n\};/)[0];
  for(const t of zt){ const row = zoneTable.split('\n').find(l=>l.trim().startsWith(t[0]+':')) || '';
    assert(/add:\(\)=>/.test(row), 'addZone wires '+t[0]); } }
assert(/const addZone=\(type\)=>\{/.test(pb), 'a shared addZone helper routes each zone type to its add fn');
for(const fn of ['addDeathZone','addJumpPad','addLadder','addFireZone']) assert(src.indexOf(fn)>0, 'addZone wires '+fn);
assert(/jump\('build','turrets'\); if\(typeof addSceneTurret==='function'\) addSceneTurret\(\);/.test(pb), 'Turret can be added from the + menu');
assert(/_zoneSub:\(\)=>buildZones\(\)/.test(pb) && /if\(typeof act==='string'\)\{ const sub=SUBS\[act\]; if\(sub\) menuItem\(label, sub\); continue; \}/.test(pb),
  'the main menu routes the Zone entry to its submenu');
/* build 1320: and the two things the menu could never reach — an imported MODEL (the commonest thing a
   level is made of) and build 1250's six emitters. */
assert(/Model\\u2026', \(\)=>\{ jump\('build','props'\); if\(typeof _edRevealHost==='function'\) _edRevealHost\('edModels'\); \}/.test(pb),
  'a Model entry that lands ON the model browser, not just its tab');
assert(/_fxSub:\(\)=>buildFx\(\)/.test(pb) && /const buildFx=\(\)=>\{/.test(pb), 'and the effect emitters');
assert(/_shapeSub:\(\)=>buildShapes\(\)/.test(pb) && /const buildShapes=\(\)=>\{/.test(pb), 'and the four uncommon shapes');
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
  // build 1300: levelIssues records WHERE each issue is, beside the message. This rig runs it in an
  // empty scope, so it supplies an inert recorder — the locators are build 1300's own test's business.
  'const _issueFind = new Map(); const _issueAt = (m)=>m;\n' +
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
