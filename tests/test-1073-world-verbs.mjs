// (build 1073) THE WORLD VERBS — spawn / pickup / damage / heal / kill / teleport.
// Every verb the graph had before this changed a PROP (open it, animate it, unlock it) or the UI (a
// message, an objective). None of them could make an enemy, hurt anybody, or move somebody. That's the
// difference between a logic graph that is a switch panel and one that is a game: an author could detect
// anything and decide anything, and then had almost nothing to *do* about it.
// A "place" is a TAG — the naming system props already use — so authors point at something they can see
// and select in the viewport, and a build-1072 trigger volume answers to its own event name, which means
// the zone that fires a rule can also be the spot it acts on.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- places
const PLACE_GLUE = `
  const EYE=1.6;
  const player={ pos:{x:5,y:1.6+2,z:-7,set(a,b,c){this.x=a;this.y=b;this.z=c;}}, vel:{set(){}}, extVel:{set(){}}, onGround:true, hp:50, maxHp:100 };
  const playerSpawn={ x:100, y:0.5, z:200 };
  function terrainHeightAt(){ return 3; }
  let propModels=[], triggerZones=[];
`;
const P = new Function(PLACE_GLUE + extractFunction('_lgPlaceAt', src)
  + '\nreturn { at:_lgPlaceAt, props:(v)=>{propModels=v;}, trigs:(v)=>{triggerZones=v;} };')();
{
  const me = P.at('');
  eq(me.x, 5, 'a blank place means "where the player is" — the commonest thing an author wants');
  eq(me.y, 2, '...at their FEET, not their eyes, so a spawn lands on the floor');
  eq(P.at('  ME  ').x, 5, '"me" is spelled however you like');
  const st = P.at('start');
  eq(st.x, 100, '"start" is the level\'s player start');
  eq(st.y, 3.5, '...snapped onto the terrain there, plus the start\'s own offset');
}
{
  P.props([{ userData: { tag: 'vault' }, position: { x: 30, y: 4, z: 8 } },
           { userData: { tag: 'other' }, position: { x: -1, y: 0, z: -1 } }]);
  const v = P.at('vault');
  eq(v.x + ',' + v.y + ',' + v.z, '30,4,8', 'a tag resolves to the prop carrying it, height included');
  eq(P.at('nobody-has-this'), null, 'an unknown tag does NOTHING — it never silently acts at the world origin');
  eq(P.at('VAULT'), null, '...and tags stay case-exact, matching how they are matched everywhere else');
}
{ // several props share a tag -> a squad scatters between them instead of stacking on one
  P.props([{ userData: { tag: 'gate' }, position: { x: 0, y: 0, z: 0 } },
           { userData: { tag: 'gate' }, position: { x: 50, y: 0, z: 0 } },
           { userData: { tag: 'gate' }, position: { x: 0, y: 0, z: 50 } }]);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(P.at('gate').x + '/' + P.at('gate').z);
  assert(seen.size > 1, 'a tag on three props picks between them, so "spawn at gate" scatters');
}
{ // build 1072's trigger volumes double as destinations, by their own event name
  P.props([]);
  P.trigs([{ ev: 'reachedVault', x: 12, y: 1, z: -3 }]);
  const t = P.at('reachedVault');
  eq(t.x + ',' + t.z, '12,-3', 'a trigger volume is a place too — the zone that fires a rule is the spot it acts on');
}

// ---------------------------------------------------------------- who gets hit
const T = new Function(`
  const player={ pos:{x:0,y:0,z:0} };
  let enemies=[];
  ` + extractFunction('_lgEnemyTargets', src)
  + '\nreturn { pick:(who,list)=>{ enemies=list; return _lgEnemyTargets(who); } };')();
{
  const near1 = { hp: 10, mesh: { position: { x: 3, z: 0 } } };
  const far = { hp: 10, mesh: { position: { x: 40, z: 0 } } };
  const dead = { hp: 0, mesh: { position: { x: 1, z: 0 } } };
  const bodiless = { hp: 10, mesh: null };
  const all = [far, dead, near1, bodiless];
  eq(T.pick('enemies', all).length, 2, '"all enemies" skips corpses and half-built bodies');
  eq(T.pick('nearest', all)[0], near1, '"nearest" is nearest to the PLAYER, and is never a corpse');
  eq(T.pick('nearest', [dead]).length, 0, '...and resolves to nobody rather than to a corpse');
  eq(T.pick('enemies', []).length, 0, 'an empty field is not an error');
}

// ---------------------------------------------------------------- the verbs
const WORLD_GLUE = `
  const EYE=1.6, log=[];
  const player={ pos:{x:0,y:1.6,z:0,set(a,b,c){this.x=a;this.y=b;this.z=c;}}, vel:{set(){}}, extVel:{set(){}}, onGround:true, hp:40, maxHp:100 };
  const playerSpawn={x:0,y:0,z:0};
  const ENEMY_TYPES={ grunt:{hp:30}, brute:{hp:90}, boss:{hp:900} };
  let enemies=[], powerups=[], _puId=1, propModels=[], triggerZones=[];
  const NET={ mode:'off', conns:{} };
  const scene={ add(){} };
  function terrainHeightAt(){ return 0; }
  function _maxTerrainOver(){ return 0; }
  function _spawnFloorAt(){ return 7; }
  function spawnEnemy(sp){ log.push(['spawn',sp]); enemies.push({ hp:ENEMY_TYPES[sp.type].hp, maxHp:ENEMY_TYPES[sp.type].hp, mesh:{ position:{x:sp.x||0,z:sp.z||0,set(a,b,c){this.x=a;this.y=b;this.z=c;}} } }); }
  function buildPowerupMesh(k,it){ return { k, it }; }
  function _applyPickupXform(m,sp){ m.sp=sp; }
  function applyEnemyDamageToSelf(d){ log.push(['self',d]); player.hp-=d; }
  function enemyHurt(e,d){ log.push(['hurt',d]); e.hp-=d; if(e.hp<=0) log.push(['killed']); }
  function updateHUD(){}
  function releaseHeld(){ log.push(['released']); }
`;
const W = new Function(WORLD_GLUE
  + extractFunction('_lgPlaceAt', src) + '\n' + extractFunction('_lgEnemyTargets', src) + '\n'
  + extractFunction('_lgPlacePlayer', src) + '\n' + extractFunction('_wactSend', src) + '\n'
  + extractFunction('_applyWorldAction', src)
  + `\nreturn { run:(s)=>{ _applyWorldAction(s); return { log, enemies, powerups, hp:player.hp, pos:{x:player.pos.x,y:player.pos.y,z:player.pos.z} }; },
       reset:(e)=>{ log.length=0; enemies=e||[]; powerups=[]; player.hp=40; player.pos.set(0,1.6,0); propModels=[]; triggerZones=[]; },
       props:(v)=>{ propModels=v; } };`)();

// --- spawn ---
{
  W.reset();
  const r = W.run({ do: 'spawn', etype: 'brute', n: '3', at: '' });
  eq(r.enemies.length, 3, 'Spawn makes the number of enemies you asked for');
  assert(r.enemies.every(e => e.hp === 90), '...of the type you asked for');
  const pts = r.enemies.map(e => e.mesh.position.x + ',' + e.mesh.position.z);
  eq(new Set(pts).size, 3, '...scattered, never three bodies stacked on one point');
  for (const e of r.enemies) {
    const d = Math.hypot(e.mesh.position.x, e.mesh.position.z);
    assert(d >= 1.5 && d <= 4.1, 'each lands within a squad-sized ring of the place (' + d.toFixed(2) + ')');
  }
}
{
  W.reset();
  eq(W.run({ do: 'spawn', etype: 'brute', n: '1', at: '' }).enemies[0].mesh.position.x, 0,
    'a single spawn lands exactly on the place — no jitter when there is nothing to scatter');
}
{
  W.reset();
  eq(W.run({ do: 'spawn', etype: 'wyvern', n: '1' }).enemies[0].hp, 30, 'an unknown enemy type falls back to a grunt, never a crash');
  W.reset();
  eq(W.run({ do: 'spawn', n: '9999' }).enemies.length, 20, 'the count is bounded — "spawn 9999" is a typo, not a design');
  W.reset();
  eq(W.run({ do: 'spawn', n: '0' }).enemies.length, 1, '...and a blank/zero count still spawns one');
  W.reset();
  eq(W.run({ do: 'spawn', n: '2', at: 'nowhere' }).enemies.length, 2,
    'a place nobody carries falls through to spawnEnemy\'s own placement, rather than piling everyone on 0,0');
  assert(W.run({ do: 'spawn', n: '1', at: 'nowhere' }).log.some(l => l[0] === 'spawn' && l[1].x == null),
    '...by leaving x/z off the descriptor entirely');
}

// --- pickup ---
{
  W.reset(); W.props([{ userData: { tag: 'ledge' }, position: { x: 9, y: 6, z: 2 } }]);
  const r = W.run({ do: 'pickup', pk: 'shield', at: 'ledge' });
  eq(r.powerups.length, 1, 'Spawn pickup drops one');
  eq(r.powerups[0].kind, 'shield', '...of the kind asked for');
  eq(r.powerups[0].x + ',' + r.powerups[0].z, '9,2', '...at the place');
  eq(r.powerups[0].mesh.sp.y, 6, '...and at the height of a raised place, so a balcony pickup is ON the balcony');
  assert(r.powerups[0].ready && !r.powerups[0].interact, '...live and walk-over, like any authored pickup');
}
{
  W.reset();
  eq(W.run({ do: 'pickup', pk: 'item', item: 'brassKey', at: '' }).powerups[0].item, 'brassKey', 'an inventory item carries its id');
  W.reset();
  eq(W.run({ do: 'pickup', pk: 'health', item: 'brassKey', at: '' }).powerups[0].item, undefined,
    '...and a non-item pickup never carries a stray one');
  W.reset();
  eq(W.run({ do: 'pickup', pk: 'health', at: 'nowhere' }).powerups.length, 0,
    'a pickup asked for at a place that does not exist is skipped, not dropped at the origin');
}

// --- damage / heal / kill on the player ---
{
  W.reset();
  eq(W.run({ do: 'damage', who: 'player', amt: '15' }).hp, 25, 'Damage the player goes through the normal hurt path');
  W.reset();
  eq(W.run({ do: 'heal', who: 'player', amt: '30' }).hp, 70, 'Heal adds');
  W.reset();
  eq(W.run({ do: 'heal', who: 'player', amt: '9999' }).hp, 100, '...and never past max health');
  W.reset();
  assert(W.run({ do: 'kill', who: 'player' }).log.some(l => l[0] === 'self' && l[1] === 99999),
    'Kill the player routes through the same defeat flow a death zone uses');
  W.reset();
  eq(W.run({ do: 'damage', who: 'player', amt: '' }).log.length, 0, 'a blank amount does nothing at all — no zero-damage flinch');
  W.reset();
  eq(W.run({ do: 'damage', who: 'player', amt: '-40' }).hp, 40, '...and a negative amount can never heal through the damage verb');
}

// --- damage / heal / kill on enemies ---
{
  const mk = () => [{ hp: 30, maxHp: 30, mesh: { position: { x: 2, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } } } },
                    { hp: 90, maxHp: 90, mesh: { position: { x: 60, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } } } }];
  W.reset(mk());
  const r = W.run({ do: 'damage', who: 'enemies', amt: '20' });
  eq(r.enemies.map(e => e.hp).join(','), '10,70', 'Damage all enemies hits every one of them');
  W.reset(mk());
  eq(W.run({ do: 'damage', who: 'nearest', amt: '20' }).enemies.map(e => e.hp).join(','), '10,90', '...and "nearest" hits exactly one');
  W.reset(mk());
  const k = W.run({ do: 'kill', who: 'enemies' });
  eq(k.log.filter(l => l[0] === 'killed').length, 2, 'Kill enemies goes through the real death — drops, kill feed, On-enemy-killed all fire');
  assert(k.log.filter(l => l[0] === 'hurt').every(l => l[1] > 0), '...by dealing exactly enough damage, never a negative');
  W.reset(mk().map(e => (e.hp = 5, e)));
  eq(W.run({ do: 'heal', who: 'enemies', amt: '10' }).enemies.map(e => e.hp).join(','), '15,15', 'Heal works on enemies too');
  W.reset(mk().map(e => (e.hp = 25, e)));
  eq(W.run({ do: 'heal', who: 'enemies', amt: '999' }).enemies.map(e => e.hp).join(','), '30,90', '...capped at each one\'s own max');
}

// --- teleport ---
{
  W.reset(); W.props([{ userData: { tag: 'exit' }, position: { x: 40, y: 12, z: -5 } }]);
  const r = W.run({ do: 'teleport', who: 'player', at: 'exit' });
  eq(r.pos.x + ',' + r.pos.z, '40,-5', 'Teleport moves the player to the place');
  eq(r.pos.y, 13.6, '...standing ON it — the place is feet height, the player is eye height');
  assert(r.log.some(l => l[0] === 'released'), '...and drops whatever they were carrying, so nothing is left behind');
}
{
  W.reset([{ hp: 30, mesh: { position: { x: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } } } }]);
  W.props([{ userData: { tag: 'pit' }, position: { x: 8, y: 0, z: 8 } }]);
  const r = W.run({ do: 'teleport', who: 'enemies', at: 'pit' });
  eq(r.enemies[0].mesh.position.x + ',' + r.enemies[0].mesh.position.z, '8,8', 'enemies can be teleported too');
  eq(r.enemies[0].mesh.position.y, 8.4, '...onto the real spawn floor there, not buried in it');
  eq(r.enemies[0].wp, null, '...and their stale pathing waypoint is dropped, so they re-decide from where they now are');
}
{
  W.reset(); const before = W.run({ do: 'teleport', who: 'player', at: 'nowhere' }).pos;
  eq(before.x + ',' + before.z, '0,0', 'a teleport to a place that does not exist does nothing — never a fall through the world');
}

// ---------------------------------------------------------------- wiring
{
  const fn = extractFunction('_applySignalAction', src);
  assert(/if\(s\.do==='spawn'\|\|s\.do==='pickup'\|\|s\.do==='damage'\|\|s\.do==='heal'\|\|s\.do==='kill'\|\|s\.do==='teleport'\|\|s\.do==='give'/.test(fn),
    'the world verbs branch out of the shared action dispatcher — so PROP SIGNALS get them too, not just the graph');
  assert(/if\(\(typeof NET==='undefined' \|\| NET\.mode!=='client'\) && typeof _applyWorldAction==='function'\)/.test(fn),
    '...on the authoritative side only: the host owns spawns, damage and positions and streams the results');
}
assert(/etype:p\.etype\|\|'grunt', n:p\.n, pk:p\.pk\|\|'health', item:p\.item\|\|'', who:p\.who\|\|'player', amt:p\.amt, at:String\(p\.at==null\?'':p\.at\)\.trim\(\)/.test(src),
  'the Do-action node passes the new params through');
assert(/\['spawn','Spawn enemies'\],\['pickup','Spawn pickup'\],\['damage','Damage'\],\['heal','Heal'\],\['kill','Kill'\],\['teleport','Teleport'\]/.test(src),
  'all six appear in the node\'s verb list, in plain English');
eq((src.match(/\['spawn','Spawn enemies'\]/g) || []).length, 2, '...in BOTH the graph node and the prop-signal editor');
assert(/\{k:'at',l:'at',w:84,ifv:\['verb',\['spawn','pickup','teleport','command','moveprop','spawnprop'\]\],listId:'lgPlaceList'\}/.test(src),   // build 1170: moveprop points somewhere too; build 1216: so does spawnprop
  'the place field appears for exactly the verbs that need one, and offers a dropdown of real places');
assert(/\{k:'who',l:'',w:104,ifv:\['verb',\['damage','heal','kill','teleport','give','take'\]\]/.test(src), 'and the who field for exactly those');   // build 1232: give/take joined — the actor option is how a key reaches the player who earned it
assert(/\{k:'item',l:'item',w:76,ifv:\['verb','pickup'\],ifv2:\['pk','item'\]/.test(src),
  'the inventory-item field needs BOTH conditions — it only shows for an item pickup');

// the param renderer had to learn three things to make that readable
{
  const fn = extractFunction('_lgRenderNode', src) || src;
  assert(/const _pval=\(k\)=>\{ const raw=String\(n\.p\[k\]==null\?'':n\.p\[k\]\); if\(raw\) return raw;/.test(src),
    'an untouched select reads as the option the browser is SHOWING, so a fresh node does not hide its own fields');
  assert(/return Array\.isArray\(c\[1\]\) \? c\[1\]\.indexOf\(v\)>=0 : v===c\[1\];/.test(src), 'a condition can name several values');
  assert(/if\(!_cond\(pm\.ifv\) \|\| !_cond\(pm\.ifv2\)\) continue;/.test(src), '...and a field can require two of them');
  assert(/const ov=Array\.isArray\(o\)\?o\[0\]:o, ot=Array\.isArray\(o\)\?o\[1\]:o;/.test(src),
    'select options carry a label, so sixteen verbs read as English instead of as identifiers');
  assert(/max-width:'\+\(pm\.w\|\|100\)\+'px;/.test(src), '...and a long one is allowed the room to show it');
}
{
  const fn = extractFunction('_lgPlaceOptions', src);
  assert(/\{ v:'me', l:'the player' \}, \{ v:'start', l:'the level start' \}/.test(fn), 'the place dropdown leads with the two built-ins');
  assert(/l:'trigger volume'/.test(fn), '...then every tag in the level, then every trigger volume');
}
assert(/const pl=mk\('lgPlaceList'\);/.test(src) && /const il=mk\('lgItemList'\);/.test(src), 'both new dropdowns are built with the rest');

// co-op: one message carries every verb that lands on a remote player
{
  const fn = extractFunction('_wactSend', src);
  assert(/if\(typeof NET==='undefined' \|\| NET\.mode!=='host'\) return;/.test(fn), 'only the host sends world effects to players');
  assert(/Object\.assign\(\{ t:'wact' \}, o\)/.test(fn), '...as one message type, not one per verb');
}
assert(/else if\(msg\.t==='wact'\)\{/.test(src), 'and clients apply it');
{
  const i = src.indexOf("else if(msg.t==='wact')");
  const blk = src.slice(i, i + 620);
  assert(/if\(msg\.tp && typeof _lgPlacePlayer==='function'\) _lgPlacePlayer\(/.test(blk), 'a teammate gets teleported by the same rule that moved the host');
  assert(/if\(msg\.k\) try\{ applyEnemyDamageToSelf\(99999/.test(blk), '...killed');
  assert(/else if\(msg\.d>0\)/.test(blk), '...hurt');
  assert(/if\(msg\.h>0\)\{ player\.hp=Math\.min\(player\.maxHp/.test(blk), '...and healed');
}
assert(/_wactSend\(\{ tp:\[at\.x, at\.y, at\.z\] \}\); return; \}/.test(src), 'the host tells them about a teleport');

done('build 1073: the graph can finally make enemies, hurt people and move them — a switch panel becomes a game');
