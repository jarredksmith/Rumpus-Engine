// (build 1077) ENEMY HOOKS — the graph can finally hear an enemy, and talk back to one.
// The AI had exactly one connection to the logic graph: On enemy killed. Everything an enemy did before dying
// was invisible, and nothing a rule decided could reach it. So there was no alarm that goes off when a guard
// sees you, no boss that changes at half health, no "the lights come on and every patrol converges on the vault",
// and no stealth loop at all — because nothing could tell an enemy to forget about you.
// Two entry nodes and one verb close that loop. Every command drives state the AI already reads, so a commanded
// enemy behaves like an authored one from the very next frame: there is no parallel "scripted" mode to diverge.
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the two entry nodes exist and are entries
{
  const defs = new Function('return ' + extractConst('LG_DEFS', src) + ';')();
  eq(defs.onspot.t, 'On enemy spots you', 'the sight hook is named in the second person, like the rest of the palette');
  eq(defs.onhurt.t, 'On enemy damaged', 'and the damage hook says what happened, not which function fired');
  eq(defs.onspot.cat, 'ev', 'both are EVENTS...');
  eq(defs.onhurt.cat, 'ev', '...in the same colour as On start and On enemy killed');
  eq(defs.onspot.ins, undefined, 'nothing wires INTO an entry');
  eq(defs.onhurt.ins, undefined, '...either of them');
  eq(defs.onspot.outs.length, 1, 'and each has one output to chain from');
  eq(defs.onspot.params.length, 0, 'no parameters — the enemy that did it is the one you were already watching');
}

// ---------------------------------------------------------------- the awareness EDGE
// Four different things can make an enemy aware (seeing you, hearing gunfire, a blast, a rule). The edge is
// watched in ONE place so every one of them fires the hook, and none of them fires it twice.
const E = new Function(`
  let fired=0, mode='off';
  const NET={ mode:'off' };
  const logicGraph={ nodes:[{ id:'n1', type:'onspot' }, { id:'n2', type:'onhurt' }] };
  function _lgFireEvents(kind){ fired++; }
  ` + extractFunction('_lgEnemyEvent', src)
  + `\nreturn { ev:_lgEnemyEvent, count:()=>fired, reset:()=>{ fired=0; },
      client:(b)=>{ NET.mode=b?'client':'off'; }, wipe:()=>{ logicGraph.nodes.length=0; } };`)();
{
  E.reset();
  E.ev('onspot'); eq(E.count(), 1, 'a wired hook fires');
  E.ev('onhurt'); eq(E.count(), 2, '...and so does the other one');
  E.client(true); E.ev('onspot');
  eq(E.count(), 2, 'a multiplayer CLIENT never fires it — the host owns the graph, as with every other event source');
  E.client(false);
  E.wipe(); E.ev('onspot');
  eq(E.count(), 2, 'a level with no such node on the board costs nothing at all — the hook returns before doing any work');
}
// the edge itself, as the update loop runs it
{
  const step = new Function(`
    let fired=0;
    function _lgEnemyEvent(){ fired++; }
    return { run:(en,aware)=>{ en.aware=aware;
        if(en.aware && !en._wasAware){ en._wasAware=1; _lgEnemyEvent('onspot'); }
        else if(!en.aware && en._wasAware) en._wasAware=0;
        return fired; } };`)();
  const en = {};
  eq(step.run(en, false), 0, 'an oblivious enemy fires nothing');
  eq(step.run(en, true), 1, 'the frame it notices you, it fires');
  eq(step.run(en, true), 1, '...once, not every frame it is hunting you');
  eq(step.run(en, false), 1, 'losing you fires nothing');
  eq(step.run(en, true), 2, '...and noticing you again fires again');
}
assert(/if\(en\.aware && !en\._wasAware\)\{ en\._wasAware=1; _lgEnemyEvent\('onspot'\); \}/.test(src),
  'that edge is watched in the update loop, after the AI has decided');
assert(/else if\(!en\.aware && en\._wasAware\) en\._wasAware=0;/.test(src), '...and re-arms when they give up');
{
  const fn = extractFunction('enemyHurt', src);
  assert(fn.indexOf('killEnemy') < fn.indexOf("_lgEnemyEvent('onhurt')"),
    'a killing blow fires On-enemy-KILLED, not On-enemy-damaged — the two hooks never both fire for one hit');
  assert(/if\(typeof _lgEnemyEvent==='function'\) _lgEnemyEvent\('onhurt'\);/.test(fn), 'a survived hit fires the damage hook');
}

// ---------------------------------------------------------------- the Command verb
const CMDS = new Function('return ' + src.match(/const LG_CMDS = \{[^}]*\};/)[0].replace('const LG_CMDS = ', '') + ';')();
eq(Object.keys(CMDS).join(','), 'hunt,patrol,hold,alert,calm,post', 'six commands');
eq(CMDS.calm, 'Lose the player', 'the stealth one is named for what the player experiences, not for a flag');

const W = new Function(`
  const EYE=1.6, alerts=[];
  const player={ pos:{x:0,y:1.6,z:0,set(){}}, vel:{set(){}}, extVel:{set(){}}, hp:50, maxHp:100 };
  const playerSpawn={x:0,y:0,z:0};
  const NET={ mode:'off', conns:{} };
  const scene={ add(){} };
  let enemies=[], propModels=[], triggerZones=[], powerups=[], _puId=1, _lgMusic=null;
  const ENEMY_TYPES={};
  const LG_STATS={};
  let _lgStatOn={};
  function terrainHeightAt(){ return 0; }
  function _maxTerrainOver(){ return 0; }
  function _spawnFloorAt(){ return 0; }
  function alertEnemy(en,sx,sz){ alerts.push([en.tag,sx,sz]); en.aware=true; en.lkp={x:sx,z:sz}; en._alertedT=1; }
  function spawnEnemy(){}
  function buildPowerupMesh(){ return {}; }
  function _applyPickupXform(){}
  function applyEnemyDamageToSelf(){}
  function enemyHurt(){}
  function giveItem(){} function takeItem(){}
  function updateHUD(){} function releaseHeld(){}
  function _lgApplyStat(){} function _lgSetMusic(){}
  ` + src.match(/const LG_CMDS = \{[^}]*\};/)[0] + '\n'
  + extractFunction('_lgPlaceAt', src) + '\n' + extractFunction('_lgEnemyTargets', src) + '\n'
  + extractFunction('_lgPlacePlayer', src) + '\n' + extractFunction('_wactSend', src) + '\n'
  + extractFunction('_applyWorldAction', src)
  + `\nreturn { run:(s)=>{ alerts.length=0; _applyWorldAction(s); return { enemies, alerts }; },
      set:(e,p)=>{ enemies=e; propModels=p||[]; } };`)();

const mkEnemy = (tag, x, z, extra) => Object.assign({
  tag, hp: 30, mode: 'hold', aware: true, lkp: { x: 1, z: 1 }, lostAt: 5, _alertedT: 9, _wasAware: 1,
  wp: { x: 3, z: 3 }, wpUntil: 999, home: null, route: [{ x: 1, z: 1 }], routeIdx: 2,
  mesh: { position: { x, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } } } }, extra || {});

{ // mode commands
  const a = mkEnemy('a', 5, 5), b = mkEnemy('b', 40, 0);
  W.set([a, b]);
  W.run({ do: 'command', ewho: 'enemies', cmd: 'hunt' });
  eq(a.mode + ',' + b.mode, 'hunt,hunt', 'Hunt sets every enemy hunting');
  eq(a.wp, null, '...and drops the stale waypoint, so they re-decide from where they are standing');
  eq(a.home, null, 'hunting needs no post');
  W.run({ do: 'command', ewho: 'enemies', cmd: 'hold' });
  eq(a.mode, 'hold', 'Hold sets them holding');
  eq(a.home.x + ',' + a.home.z, '5,5', '...and an enemy with no post gets one where it stands, so it has something to hold');
  const c = mkEnemy('c', 9, 9, { home: { x: 1, z: 2 } });
  W.set([c]); W.run({ do: 'command', ewho: 'enemies', cmd: 'patrol' });
  eq(c.home.x + ',' + c.home.z, '1,2', '...while an enemy that already has one keeps it');
}
{ // nearest
  const near1 = mkEnemy('near', 2, 0), far = mkEnemy('far', 90, 0);
  W.set([near1, far]);
  W.run({ do: 'command', ewho: 'nearest', cmd: 'hunt' });
  eq(near1.mode + ',' + far.mode, 'hunt,hold', '"nearest" commands exactly one of them');
}
{ // alert
  const a = mkEnemy('a', 0, 0, { aware: false, lkp: null });
  W.set([a], [{ userData: { tag: 'vault' }, position: { x: 30, y: 0, z: -7 } }]);
  const r = W.run({ do: 'command', ewho: 'enemies', cmd: 'alert', at: 'vault' });
  eq(r.alerts.length, 1, 'Alert routes through the SAME call gunfire uses...');
  eq(r.alerts[0][1] + ',' + r.alerts[0][2], '30,-7', '...pointing them at the place');
  eq(a.aware, true, '...so they are awake and converging, exactly as if they had heard a shot');
  const before = JSON.stringify(a);
  W.run({ do: 'command', ewho: 'enemies', cmd: 'alert', at: 'nowhere-at-all' });
  eq(JSON.stringify(a), before, 'an alert to a place that does not exist does nothing rather than sending them to the origin');
}
{ // calm — the stealth reset
  const a = mkEnemy('a', 0, 0);
  W.set([a]);
  W.run({ do: 'command', ewho: 'enemies', cmd: 'calm' });
  eq(a.aware, false, 'they forget you');
  eq(a.lkp, null, '...including where they last saw you');
  eq(a.lostAt + ',' + a._alertedT, '0,0', '...and the give-up timers, so they do not immediately re-search');
  eq(a._wasAware, 0, '...and the hook re-arms, so noticing you again really does fire On-enemy-spots-you');
}
{ // post
  const a = mkEnemy('a', 0, 0);
  W.set([a], [{ userData: { tag: 'gate' }, position: { x: -12, y: 3, z: 4 } }]);
  W.run({ do: 'command', ewho: 'enemies', cmd: 'post', at: 'gate' });
  eq(a.home.x + ',' + a.home.z, '-12,4', 'a guard can be reassigned to a new post');
  eq(a.route, null, '...and their authored patrol route gives way to it, rather than fighting it');
  eq(a.routeIdx, 0, '...reset, so re-authoring a route later starts clean');
}
{ // bad input
  const a = mkEnemy('a', 0, 0);
  W.set([a]);
  W.run({ do: 'command', ewho: 'enemies', cmd: 'do-a-dance' });
  eq(a.mode, 'hunt', 'an unknown command falls back to hunt rather than doing something unpredictable');
  W.set([]);
  W.run({ do: 'command', ewho: 'enemies', cmd: 'hunt' });   // no enemies at all
  assert(true, 'commanding an empty field is not an error');
  const b = mkEnemy('b', 0, 0), dead = mkEnemy('d', 1, 0, { hp: 0 });
  W.set([b, dead]);
  W.run({ do: 'command', ewho: 'enemies', cmd: 'hunt' });
  eq(dead.mode, 'hold', 'a corpse takes no orders');
}

// ---------------------------------------------------------------- wiring
assert(/v==='music'\|\|v==='command'/.test(extractFunction('_isWorldVerb', src)), 'command is a world verb');
assert(/s\.do==='music'\|\|s\.do==='command'\)\{/.test(extractFunction('_applySignalAction', src)),
  '...so a prop signal can issue it too — an alarm lever really is a lever');
eq((src.match(/\['command','Command enemies'\]/g) || []).length, 2, 'it appears in the graph node AND the prop-signal editor');
assert(/\{k:'ewho',l:'',w:100,ifv:\['verb','command'\],sel:\[\['enemies','All enemies'\],\['nearest','Nearest enemy'\]\]\}/.test(src),
  'the node asks WHICH enemies — and does not offer "the player", which would mean nothing here');
assert(/\{k:'cmd',l:'',w:120,ifv:\['verb','command'\],sel:\[\['hunt','Hunt the player'\],\['patrol','Patrol'\],\['hold','Hold position'\],\['alert','Alert them to'\],\['calm','Lose the player'\],\['post','Move their post to'\]\]\}/.test(src),
  '...and all six commands in plain English');
assert(/ifv:\['verb',\['spawn','pickup','teleport','command','moveprop'\]\],listId:'lgPlaceList'/.test(src),   // build 1170
  'it shares the place field with the other verbs that point somewhere');
assert(/ewho:p\.ewho\|\|'enemies', cmd:p\.cmd\|\|'hunt'/.test(src), 'the Do-action node passes them through');
{
  const fn = extractFunction('_sigWorldRow', src);
  assert(/sel\(Object\.keys\(LG_CMDS\)\.map\(k=>\[k, LG_CMDS\[k\]\]\), s\.cmd\|\|'hunt'/.test(fn), 'the Signals fold offers the commands too');
  assert(/if\(\(s\.cmd\|\|'hunt'\)==='alert' \|\| s\.cmd==='post'\)\{ txt\('place'/.test(fn),
    '...and only asks for a place when the command actually needs one');
}

done('build 1077: an enemy can finally tell your graph it saw you, and your graph can tell it to look away');
