import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 607: inventory items that DO something — key (bridges the lock system), heal, ammo; optional consume.

// defaults carry the use fields so older/new items both have them
assert(/useType:'none', useKey:'gold', useAmount:25, useConsume:true/.test(extractFunction('defineItem')), 'defineItem seeds the use defaults');
assert(/window\.useItem=useItem/.test(src), 'useItem is exposed for console/authoring');

// ---- executable: run useItem against stubbed game state ----
const fnSrc = extractFunction('useItem');
let inv = [{id:'medkit',n:1},{id:'goldkey',n:1},{id:'ammobox',n:2}];
const hasItem = (id)=> inv.some(x=>x.id===id && x.n>0);
const takeItem = (id,n)=>{ n=n||1; const s=inv.find(x=>x.id===id); if(!s) return false; s.n-=n; if(s.n<=0) inv=inv.filter(x=>x!==s); return true; };
const invCatalog = {
  medkit:{name:'Medkit', useType:'heal', useAmount:40, useConsume:true},
  goldkey:{name:'Gold Key', useType:'key', useKey:'gold', useConsume:true},
  ammobox:{name:'Ammo', useType:'ammo', useConsume:false},
  rock:{name:'Rock', useType:'none'},
};
const playerKeys = {}; const renderKeyChips=()=>{}; const updateHUD=()=>{}; const toast=()=>{};
const player = { hp:80, maxHp:100 };
const owned = ['rifle']; const WEAPONS = { rifle:{ reserve:0, reserveMax:120 } };
const SFX = { power:()=>{}, pickup:()=>{} };
const useItem = new Function('invCatalog','hasItem','takeItem','playerKeys','renderKeyChips','player','updateHUD','SFX','owned','WEAPONS','toast',
  fnSrc + '; return useItem;')(invCatalog,hasItem,takeItem,playerKeys,renderKeyChips,player,updateHUD,SFX,owned,WEAPONS,toast);

assert(useItem('medkit')===true, 'heal item is usable');
eq(player.hp, 100, 'heal clamps to maxHp (80 + 40 -> 100, not 120)');
assert(!hasItem('medkit'), 'consumable heal is removed on use');

assert(useItem('goldkey')===true, 'key item is usable');
assert(playerKeys.gold===true, 'using a key item sets the matching playerKeys color');
assert(!hasItem('goldkey'), 'consumable key is removed on use');

assert(useItem('ammobox')===true, 'ammo item is usable');
eq(WEAPONS.rifle.reserve, 120, 'ammo use refills owned reserves to max');
assert(hasItem('ammobox'), 'useConsume:false keeps the item after use');

assert(useItem('rock')===false, 'a none-type item is not usable');
assert(useItem('ghost')===false, 'an item not in the catalog / not held is not usable');

// ---- Use button in the inspector ----
const oi = extractFunction('openInspect');
assert(/if\(it\.useType && it\.useType!=='none' && typeof gameOn!=='undefined' && gameOn\)\{/.test(oi), 'Use button only shows for usable items, in-game');
assert(/ub\.onclick=\(\)=>\{ if\(useItem\(id\)\)\{ if\(!hasItem\(id\)\) closeInspect\(\); \} \}/.test(oi), 'Use button uses the item and closes when it is gone');

// ---- authoring UI ----
const ri = extractFunction('renderInvItems');
assert(/\['none','Not usable'\],\['key','Unlock \(acts as a key\)'\],\['heal','Heal the player'\],\['ammo','Refill all ammo'\]/.test(ri), 'authoring offers all four use actions');
assert(/it\.useKey=kI\.value\.trim\(\)\|\|'gold'/.test(ri), 'key color field is editable');
assert(/it\.useAmount=Math\.max\(1,Math\.min\(999,parseInt\(aI\.value\)\|\|25\)\)/.test(ri), 'heal amount field is editable + clamped');
assert(/it\.useConsume=cb\.checked/.test(ri), 'consumed-on-use is a checkbox');

done('inventory use: key/heal/ammo with consume, Use button, authoring (build 607)');
