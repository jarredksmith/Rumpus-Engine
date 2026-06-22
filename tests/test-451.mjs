import { gameSource, extractFunction, extractConst, assert, done } from './harness.mjs';
const src = gameSource();
// build 597: placeable, collectible inventory-item pickups that grant invCatalog entries via giveItem.

// kind registered + author-pickable
assert(/item:   \{ c:0xffd166, label:'ITEM' \}/.test(extractConst('POWERUP_KINDS')), "POWERUP_KINDS has 'item'");
assert(/\['item','Inventory Item'\]/.test(extractConst('PICKUP_KIND_OPTS')), 'editor dropdown offers Inventory Item');

// visual: item pickups load the catalog model
const bm = extractFunction('buildPowerupMesh');
assert(/function buildPowerupMesh\(kind, itemId\)/.test(src), 'buildPowerupMesh takes the item id');
assert(/else if\(kind==='item'\)\{/.test(bm) && /invCatalog\[itemId\]/.test(bm), 'item pickup builds from the catalog model');

// spawn + markers carry the item id
assert(/buildPowerupMesh\(sp\.kind, sp\.item\)/.test(src), 'editor markers pass the item id');
assert(/buildPowerupMesh\(spot\.kind, spot\.item\)/.test(src) && /kind:spot\.kind, item:spot\.item/.test(src), 'spawned pickup carries the item id');

// collection grants the item, one-shot
const ap = extractFunction('applyPowerupLocal');
assert(/function applyPowerupLocal\(kind, item\)/.test(src), 'applyPowerupLocal takes the item id');
assert(/if\(kind==='item'\)\{ if\(item && typeof giveItem==='function'\) giveItem\(item\); return; \}/.test(ap), 'collecting an item pickup calls giveItem');
const up = extractFunction('updatePowerups');
assert(/grantPowerup\(near, p\.kind, p\.item\)/.test(up), 'proximity grant passes the item');
assert(/\|\|p\.kind==='item'\)\?1e9:POWERUP_COOLDOWN/.test(up), 'item pickups are one-shot (no respawn)');

// multiplayer path carries the item id
assert(/sendToPlayer\(playerEntry\.id, \{ t:'power', k:kind, item:item \}\)/.test(extractFunction('grantPowerup')), 'remote grant sends the item');
assert(/applyPowerupLocal\(msg\.k, msg\.item\)/.test(src), 'remote client grants the item');

// persistence: item id saved + reloaded with the spot
assert(/\.\.\.\(s\.item!=null\?\{item:s\.item\}:\{\}\)/.test(extractFunction('serializeLevel')), 'pickup item id saves with the level');
assert(/kind:s\.kind\|\|'health', item:s\.item/.test(src), 'pickup item id reloads with the level');

// editor: per-spot item selector + place-ahead default
assert(/if\(sp\.kind==='item'\)\{ isel=document\.createElement\('select'\)/.test(src), 'placed item spot gets an item dropdown');
assert(/if\(spot\.kind==='item'\)\{ const ids=Object\.keys\(invCatalog\); spot\.item=ids\[0\]/.test(extractFunction('addPickupSpot')), 'placing an item pickup defaults to the first catalog item');

done('item pickups: place in world, carry catalog id, giveItem on touch, one-shot, persisted, MP-safe (build 597)');
