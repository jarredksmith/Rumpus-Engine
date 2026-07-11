// (build 928) BUILD MODE — Minecraft-style construction from the radial Deploy menu.
// Picking a slot enters PLACEMENT MODE: a translucent ghost follows the aim, face-snapping flush +
// grid-aligned onto whatever you point at (or a ground grid); FIRE places and STAYS in build mode;
// scroll rotates 90 degrees; right-click toggles snap; Esc / Deploy key / BUILD exits. Per-slot
// UNBREAKABLE and ANCHORED (static block) options join Explosive in the editor, flow through
// _sanitizeRadial (so they save with the level and sync in MP), and the shape picker gains the
// build-871 primitives. Verified live: ghost entered, an anchored+unbreakable block placed at the
// ghost (static, breakable=false), aiming at its top face snapped the ghost exactly one block up
// (stacking), rotate/snap-toggle/Esc all behaved, and placement stayed in build mode throughout.
import { gameSource, html, extractFunction, evalDecl, assert, eq, done } from './harness.mjs';

const src = gameSource();

// 1) the full primitive set is buildable
assert(/const RADIAL_PRIMS = \['box','cylinder','sphere','cone','pillar','wedge','stairs','dome','tube','torus'\]/.test(src),
  'all ten primitives in the slot shape picker');

// 2) slot schema: the two new options survive sanitize (level save + MP both pass through it)
const sr = extractFunction('_sanitizeRadial', src);
assert(/unb:\s*!!s\.unb/.test(sr) && /anc:\s*!!s\.anc/.test(sr), 'unbreakable + anchored are sanitized slot fields');
const fn = evalDecl(sr, '_sanitizeRadial', { DEFAULT_RADIAL: [] });
const out = fn([{ src:'stairs', label:'Steps', unb:true, anc:true, scale:1 }]);
eq(out[0].unb, true, 'unb round-trips'); eq(out[0].anc, true, 'anc round-trips'); eq(out[0].src, 'stairs', 'new prims accepted');

// 3) deployProp honors placement + the options
const dp = extractFunction('deployProp', src);
assert(/function deployProp\(slot, at\)/.test(dp) && /at \? at\.x/.test(dp) && /at \? \(at\.yaw\|\|0\) : 0/.test(dp), 'aimed placement transform');
assert(/if\(!slot\.anc\) setPropDynamic\(obj, true\)/.test(dp), 'anchored slots stay static (no tumble)');
assert(/if\(slot\.unb\) obj\.userData\.breakable = false/.test(dp), 'unbreakable slots opt out of destruction');

// 4) build mode: ghost + face snap + repeat placement
assert(/function enterBuildMode\(slot\)/.test(src) && /function exitBuildMode\(\)/.test(src) && /function placeBuild\(\)/.test(src), 'the mode lifecycle exists');
const tick = extractFunction('_buildModeTick', src);
assert(/if\(firing\)\{ firing=false; firingLatch=false; placeBuild\(\); \}/.test(tick), 'mouse, touch FIRE and pad trigger all place');
assert(/transformDirection\(hit\.object\.matrixWorld\)/.test(tick), 'the hit normal is taken in world space');
assert(/py=hit\.point\.y - b\.foot \+ 0\.001/.test(tick), 'top faces seat the ghost bottom flush (stacking)');
assert(/Math\.round\(px\/gx\)\*gx/.test(tick), 'tangent axes grid-snap to the ghost size (build 929: one global world lattice)');
assert(/enterBuildMode\(radialCfg\[radialSel\]\)/.test(src), 'the radial enters build mode instead of insta-dropping');

// 5) inputs: right-click snap toggle, scroll rotate, Esc + Deploy key + touch BUILD exit
assert(/buildSnap=!buildSnap/.test(src) && /breach_buildsnap/.test(src), 'right-click toggles snap (persisted)');
assert(/buildMode\.yaw \+= \(e\.deltaY>0\?1:-1\)\*Math\.PI\/2/.test(src), 'scroll rotates the ghost 90 degrees');
assert(/e\.code==='Escape' && typeof buildMode!=='undefined' && buildMode/.test(src), 'Esc exits');
assert(/if\(e\.code===BINDS\.radial\)\{ if\(buildMode\)\{ exitBuildMode\(\)/.test(src), 'the Deploy key exits too');
assert(/tap\('tBuild', \(\)=>\{ if\(typeof buildMode!=='undefined' && buildMode\)\{ exitBuildMode\(\)/.test(src), 'touch BUILD exits');

// 6) editor toggles + hint element
eq((src.match(/row\('Unbreakable', cb\)/g)||[]).length, 1, 'editor has the Unbreakable toggle');
eq((src.match(/row\('Anchored \(static\)', cb\)/g)||[]).length, 1, 'editor has the Anchored toggle');
assert(/id="buildHint"/.test(html), 'the build hint element ships');

done('build 928: pick a slot, stack ghost-snapped blocks like Minecraft — breakable and physics per slot');
