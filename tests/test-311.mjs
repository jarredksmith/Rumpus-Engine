import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 418: loot boxes can now be PLACED (authored position) with CHOSEN contents, like pickups — instead of
// only spawning at random spots with random items. lootSpots = [{x,z,items:[id,...]}]. Empty items = 3 random.

// data + load
assert(/let lootSpots = \(savedLevel && Array\.isArray\(savedLevel\.loot\)\)/.test(src), 'lootSpots loads from savedLevel.loot');
assert(/items:Array\.isArray\(s\.items\)\?s\.items\.slice\(\):\[\]/.test(src), 'each placed box carries a chosen item list');

// shared item roll + placed spawn
const roll = extractFunction('_rollLootItems');
assert(/ITEM_POOL\.filter\(it => !\(it\.oneTime && owned\.includes\(it\.id\)\)\)/.test(roll), 'item roll respects one-time/owned');
const sp = extractFunction('spawnPlacedLoot');
assert(/const items = \(sp\.items && sp\.items\.length\)[\s\S]*?: _rollLootItems\(3\);/.test(sp), 'placed box uses chosen items, or 3 random when none chosen');
assert(/chests\.push\(\{ id:nextChestId\+\+, mesh, pos:mesh\.position\.clone\(\), items, spin:0, placed:true, glowColor:sp\.glowColor/.test(sp), 'placed boxes are spawned as chests flagged placed (+ glow)');
assert(/if\(typeof isClient!=='undefined' && isClient\) return;/.test(sp), 'host/solo authoritative (clients get the snapshot)');

// spawnChest reuses the shared roll + placed boxes don't eat the random budget
const sc = extractFunction('spawnChest');
assert(/const picks = _rollLootItems\(3\);/.test(sc), 'random spawn reuses the shared roll');
assert(/chests\.length>=2 \+ \(lootSpots\?lootSpots\.length:0\)/.test(sc), 'placed boxes do not count against the random cap');

// spawned at play start
// (build 1100 resets the top-down orbit yaw on the same line before the loot spawn)
assert(/gameOn=true; gameOver=false; shopOpen=false;[\s\S]{0,220}?if\(typeof spawnPlacedLoot==='function'\) spawnPlacedLoot\(\);/.test(src), 'placed loot spawns when gameplay starts');

// serialized
assert(/loot: lootSpots\.map\(s=>\(\{ x:\+s\.x, y:\+\(s\.y\|\|0\), z:\+s\.z, items:\(s\.items\|\|\[\]\)\.slice\(\), glowColor:/.test(src), 'placed loot saved with the level (+ y + glow)');

// editor: add/remove markers + the per-box item picker
const add = extractFunction('addLootSpot');
assert(/lootSpots\.push\(\{ x:[\s\S]*?items:\[\] \}\)/.test(add), 'add places an empty box ahead of the player');
const rm = extractFunction('removeLootSpot');
assert(/lootSpots\.splice\(i,1\)/.test(rm), 'remove deletes a placed box');
const rf = extractFunction('refreshLootMarkers');
assert(/g\.userData\.lootMarker=true/.test(rf) && /g\.visible=!!\(typeof editorOpen!=='undefined'&&editorOpen\)/.test(rf), 'editor markers render only in the editor');
assert(/Placed loot boxes/.test(src), 'loot panel has the placed-boxes section');
assert(/cb\.onchange=\(\)=>\{ pushUndoSnapshot\(\); sp\.items=sp\.items\|\|\[\];/.test(src), 'item checkboxes edit the box contents');
done();
