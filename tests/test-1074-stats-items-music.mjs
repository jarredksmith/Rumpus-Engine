// (build 1074) WORLD VERBS, PART 2 — give / take item, set player stat, play music.
// Build 1073 gave the graph a body: it could make enemies, hurt people, move them. This gives it the
// quieter half a real game needs — hand out the quest item, take the fuse back when it's spent, make the
// player slow in the swamp and fast on the boost pad, and change the music when the boss door opens.
// It also closes the hole 1073 left: prop signals could SELECT the world verbs but had no fields to
// configure them, so a prop that said "Spawn enemies" silently spawned one grunt on the player.
import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- stats are multipliers of the AUTHORED value
const STAT_GLUE = `
  const worldCfg={ walk:8, crouch:3, jump:9, grav:26 };
  const player={ hp:180, maxHp:200 };
  let run={ dmgMul:1 };
  let SPEED=8, SPRINT=1.6, JUMP=9, GRAV=26, CROUCH_SPEED=3;
  function updateHUD(){}
`;
const S = new Function(STAT_GLUE + src.match(/const LG_STATS = \{[^}]*\};/)[0] + '\nlet _lgStatOn = {};\n'
  + extractFunction('_lgApplyStat', src) + '\n' + extractFunction('_lgResetStats', src)
  + `\nreturn { set:_lgApplyStat, reset:_lgResetStats, touched:()=>Object.keys(_lgStatOn),
       perk:()=>{ player.maxHp+=25; },
       read:()=>({ speed:SPEED, crouch:CROUCH_SPEED, jump:JUMP, grav:GRAV, maxhp:player.maxHp, hp:player.hp, dmg:run.dmgMul }) };`)();
{
  S.set('speed', 0.5);
  eq(S.read().speed, 4, 'half speed is half of what the LEVEL authored, not half of whatever it is right now');
  eq(S.read().crouch, 1.5, '...and crouching scales with it, so it stays slower than walking');
  S.set('speed', 0.5);
  eq(S.read().speed, 4, 'applying it twice does NOT compound — a repeating rule cannot slow you to a stop');
  S.set('speed', 1);
  eq(S.read().speed, 8, 'x1 puts it back exactly — there is always an obvious "undo" value');
}
{
  S.set('jump', 2); eq(S.read().jump, 18, 'Jump height doubles');
  S.set('gravity', 0.4); near(S.read().grav, 10.4, 1e-9, 'low gravity is a multiplier too');
  S.set('dmg', 3); eq(S.read().dmg, 3, 'Damage dealt drives the run multiplier the perk system already uses');
}
{
  S.set('maxhp', 1.5);
  eq(S.read().maxhp, 150, 'Max health is a multiple of the engine baseline of 100');
  eq(S.read().hp, 150, '...and current health is pulled down with it, never left above the bar');
  S.set('maxhp', 3); eq(S.read().hp, 150, '...but raising the ceiling does not secretly heal you');
}
{ // bounds
  S.set('speed', 0); eq(S.read().speed, 8, 'a zero/blank multiplier reads as x1 — the same "unset means no change" rule the rest of the fields use');
  S.set('speed', 0.001); near(S.read().speed, 0.4, 1e-9, '...and a genuinely tiny one clamps to a floor: a rule can never freeze the player solid');
  S.set('speed', 9999); eq(S.read().speed, 80, '...and a runaway one clamps at the top');
  S.set('speed', 1);
  const before = S.read();
  S.set('wallet', 5);
  eq(JSON.stringify(S.read()), JSON.stringify(before), 'an unknown stat does nothing at all');
}
{ // the reset only touches what a rule actually drove
  S.reset();                                     // a clean slate, as at any match start
  S.set('speed', 0.5); S.set('jump', 2);
  eq(S.touched().sort().join(','), 'jump,speed', 'the engine remembers exactly which stats a rule bent');
  S.perk();                                      // meanwhile the perk system raises max HP, as it always could
  const withPerk = S.read().maxhp;
  S.reset();
  const r = S.read();
  eq(r.speed, 8, 'a fresh match springs speed back to the authored value');
  eq(r.jump, 9, '...and jump');
  eq(r.maxhp, withPerk, '...and leaves a stat NO rule touched alone, so the perk system keeps its +25');
  eq(S.touched().length, 0, '...and forgets, so the next match starts clean');
}

// ---------------------------------------------------------------- the verbs
const W_GLUE = `
  const EYE=1.6, log=[];
  const player={ pos:{x:0,y:1.6,z:0,set(a,b,c){this.x=a;this.y=b;this.z=c;}}, vel:{set(){}}, extVel:{set(){}}, hp:40, maxHp:100 };
  const playerSpawn={x:0,y:0,z:0};
  const worldCfg={ walk:8, crouch:3, jump:9, grav:26 };
  const ENEMY_TYPES={ grunt:{hp:30} };
  let SPEED=8, JUMP=9, GRAV=26, CROUCH_SPEED=3, run={ dmgMul:1 };
  let enemies=[], powerups=[], _puId=1, propModels=[], triggerZones=[], _lgMusic=null, sent=[];
  const NET={ mode:'host', conns:{ a:{ send(m){ sent.push(m); } } } };
  const scene={ add(){} };
  function terrainHeightAt(){ return 0; }
  function _maxTerrainOver(){ return 0; }
  function _spawnFloorAt(){ return 0; }
  function spawnEnemy(){}
  function buildPowerupMesh(){ return {}; }
  function _applyPickupXform(){}
  function applyEnemyDamageToSelf(){}
  function enemyHurt(){}
  function updateHUD(){}
  function releaseHeld(){}
  function giveItem(id,n){ log.push(['give',id,n]); }
  function takeItem(id,n){ log.push(['take',id,n]); }
  function stopMusic(){ log.push(['stop']); }
  function startMusic(){ log.push(['start', _lgMusic]); }
`;
const W = new Function(W_GLUE + src.match(/const LG_STATS = \{[^}]*\};/)[0] + '\nlet _lgStatOn = {};\n'
  + extractFunction('_lgApplyStat', src) + '\n' + extractFunction('_lgResetStats', src) + '\n'
  + extractFunction('_lgSetMusic', src) + '\n' + extractFunction('_lgPlaceAt', src) + '\n'
  + extractFunction('_lgEnemyTargets', src) + '\n' + extractFunction('_lgPlacePlayer', src) + '\n'
  + extractFunction('_wactSend', src) + '\n' + extractFunction('_applyWorldAction', src)
  + `\nreturn { run:(s)=>{ log.length=0; sent.length=0; _applyWorldAction(s); return { log, sent:sent.slice(), music:_lgMusic, speed:SPEED }; } };`)();

// --- give / take ---
{
  let r = W.run({ do: 'give', item: 'brassKey' });
  eq(r.log[0].join(','), 'give,brassKey,1', 'Give item hands over one by default');
  r = W.run({ do: 'give', item: '  rope  ', n: '3' });
  eq(r.log[0].join(','), 'give,rope,3', '...trims the id and honours a count');
  r = W.run({ do: 'take', item: 'fuse', n: '2' });
  eq(r.log[0].join(','), 'take,fuse,2', 'Take item is the mirror — the fuse is spent, not kept forever');
  eq(W.run({ do: 'give', item: '' }).log.length, 0, 'a blank item id does nothing rather than inventing an item');
  eq(W.run({ do: 'give', item: 'x', n: '9999' }).log[0][2], 99, 'the count is bounded');
  eq(W.run({ do: 'give', item: 'x', n: '0' }).log[0][2], 1, '...and a zero count still hands over one');
}
{ // co-op: a quest reward reaches the whole team
  const r = W.run({ do: 'give', item: 'brassKey', n: '2' });
  eq(JSON.stringify(r.sent[0]), '{"t":"wact","gi":["brassKey",2]}', 'the host tells every teammate to take the reward too');
  eq(JSON.stringify(W.run({ do: 'take', item: 'fuse' }).sent[0]), '{"t":"wact","ti":["fuse",1]}', '...and to spend it');
}

// --- stat ---
{
  const r = W.run({ do: 'stat', stat: 'speed', mul: '0.5' });
  eq(r.speed, 4, 'the stat verb drives the live value');
  eq(JSON.stringify(r.sent[0]), '{"t":"wact","st":["speed",0.5]}', '...and every teammate slows down with you');
  eq(W.run({ do: 'stat', stat: 'nonsense', mul: '2' }).sent[0].st[0], 'speed', 'an unknown stat falls back rather than doing nothing surprising');
  eq(W.run({ do: 'stat', stat: 'jump' }).sent[0].st[1], 1, 'a blank multiplier means x1 — a no-op, never a zero');
}

// --- music ---
{
  let r = W.run({ do: 'music', sound: 'https://x/boss.mp3' });
  eq(r.music, 'https://x/boss.mp3', 'Play music overrides the track for this match');
  eq(r.log.map(l => l[0]).join(','), 'stop,start', '...by stopping what was playing and starting the new one');
  eq(JSON.stringify(r.sent[0]), '{"t":"wact","mu":"https://x/boss.mp3"}', '...for the whole lobby');
  r = W.run({ do: 'music', sound: '  ' });
  eq(r.music, '', 'a blank URL is a real choice: deliberate silence');
  eq(r.log.map(l => l[0]).join(','), 'stop', '...so nothing is started');
}

// ---------------------------------------------------------------- the override never poisons the level
{
  const fn = extractFunction('curMusicUrl', src);
  assert(/if\(_lgMusic!=null\) return _lgMusic;/.test(fn), 'the rule-set track wins while it is set');
  assert(/audioSettings\.musicUrl/.test(fn), '...and the level\'s own track is still there underneath');
}
assert(/let _lgMusic=null;/.test(src), 'the override starts unset, meaning "whatever the level authored"');
assert(!/_lgSetMusic[\s\S]{0,400}audioSettings\.musicUrl=/.test(src),
  'setting music from a rule NEVER writes audioSettings — a boss theme played in a playtest must not be saved as the level\'s track');
{
  const fn = extractFunction('logicStart', src);
  assert(/if\(typeof _lgResetStats==='function'\) _lgResetStats\(\);/.test(fn), 'a fresh match springs every bent stat back');
  assert(/if\(typeof _lgMusic!=='undefined'\) _lgMusic=null;/.test(fn), '...and gives the level its own music back');
}

// ---------------------------------------------------------------- wiring
// build 1277: the list grew by the six PROP verbs, which had been implemented and offered but never
// routed. The assertion is unchanged in intent — every world verb leaves through this one dispatcher.
{
  const _disp = extractFunction('_applySignalAction', src);
  for (const v of ['spawn','pickup','damage','heal','kill','teleport','give','take','stat','music','command'])
    assert(_disp.includes("s.do==='" + v + "'"),
      'every world verb routes out of the shared dispatcher, so prop signals get them too (' + v + ')');
}
eq((src.match(/\['give','Give item'\],\['take','Take item'\],\['stat','Set player stat'\],\['music','Play music'\]/g) || []).length, 2,
  'the four new verbs appear in BOTH the graph node and the prop-signal editor');
assert(/\{k:'item',l:'item',w:88,ifv:\['verb',\['give','take'\]\],listId:'lgItemList'\}/.test(src), 'give/take offer the item dropdown');
assert(/\{k:'n',l:'\\u00d7',w:28,ifv:\['verb',\['spawn','give','take'\]\]\}/.test(src), '...and share the count field with spawn');
assert(/\{k:'stat',l:'',w:104,ifv:\['verb','stat'\],sel:\[\['speed','Move speed'\],\['jump','Jump height'\],\['gravity','Gravity'\],\['maxhp','Max health'\],\['dmg','Damage dealt'\]\]\}/.test(src),
  'the stat picker names all five in plain English');
assert(/\{k:'mul',l:'\\u00d7',w:38,ifv:\['verb','stat'\]\}/.test(src), '...with a multiplier beside it');
assert(/\{k:'sound',l:'url',w:96,ifv:\['verb',\['sound','music'\]\],listId:'lgSndList'\}/.test(src), 'music reuses the sound-URL field and its dropdown');
/* build 1407 replaced the hand-written forwarding literal with a derivation over the node's own
   parameter table — which is what stopped `once` and `r` being silently dropped. The intent here is
   unchanged and now stronger: these fields reach the handler because EVERY declared param does. */
assert(/k:'stat'/.test(src) && /k:'mul'/.test(src) &&
       /const _args=_lgDoArgs\(p\)/.test(extractFunction('_lgPulse')), 'the Do-action node passes them through');

// clients apply their half
{
  // build 1412: this was `src.slice(i, i + 1200)` — a character budget, and this build's own line pushed
  // two still-true assertions past the end of it. `wact` is the LAST case in its handler, so there is no
  // next case to end on; extractFunction BRACE-MATCHES the handler and cannot drift at all, which is
  // build 1149's preferred answer rather than its fallback.
  const blk = extractFunction('handleHostMsg');
  assert(/else if\(msg\.t==='wact'\)/.test(blk), 'the wact case is in the client handler');
  assert(/if\(msg\.gi && typeof giveItem==='function'\)/.test(blk), 'a teammate receives a given item');
  assert(/if\(msg\.ti && typeof takeItem==='function'\)/.test(blk), '...and loses a taken one');
  assert(/if\(msg\.st && typeof _lgApplyStat==='function'\)/.test(blk), '...and moves at the same speed');
  assert(/if\(msg\.mu!=null && typeof _lgSetMusic==='function'\)/.test(blk), '...and hears the same music');
}

// ---------------------------------------------------------------- the hole build 1073 left in the Signals fold
{
  const fn = extractFunction('_sigWorldRow', src);
  assert(/\['grunt','Grunt'\]/.test(fn) && /lab\('at'\)/.test(fn), 'a prop signal that spawns can now say which enemy, how many, and where');
  assert(/sel\(PICKUP_KIND_OPTS, s\.pk\|\|'health'/.test(fn), 'a pickup signal offers the same kinds the Pickups section does');
  assert(/if\(\(s\.pk\|\|'health'\)==='item'\)\{ lab\('item'\)/.test(fn), '...and asks which item only when the kind IS an item');
  assert(/const WHO=\[\['player','The player'\],\['enemies','All enemies'\],\['nearest','Nearest enemy'\]\];/.test(fn), 'damage/heal/kill/teleport share one who picker');
  assert(/lab\('\(\\u00d71 puts it back\)'\)/.test(fn), 'the stat row says out loud what the undo value is');
  assert(/txt\('music URL \(blank = silence\)'/.test(fn), '...and the music row says what blank means');
  assert(/'lgPlaceList'/.test(fn) && /'lgItemList'/.test(fn), 'both rows reuse the graph\'s own dropdowns, so names are picked and not retyped');
}
/* build 1489 split the one flag into two questions — "does it act on a tag" and "does it have parameters" —
   because `view` and `marker` answer differently and the single flag could not say so. Both intents below are
   unchanged; they are asserted against the question each one actually meant. */
assert(/if\(_sigTakesTag\(s\.do\)\) r\.appendChild\(ti\);/.test(src),
  'and the target-tag box is HIDDEN for a world verb — an ignored field is worse than no field');
assert(/if\(_sigNeedsRow\(s\.do\)\) sgBody\.appendChild\(_sigWorldRow\(s, rerender\)\);/.test(src), '...replaced by the row that actually matters');
{
  const fn = extractFunction('_isWorldVerb', src);
  for (const v of ['spawn', 'pickup', 'damage', 'heal', 'kill', 'teleport', 'give', 'take', 'stat', 'music'])
    assert(new RegExp("v==='" + v + "'").test(fn), 'the editor knows ' + v + ' is a world verb');
  assert(!/v==='toggle'/.test(fn), '...and that the prop verbs are not');
}

done('build 1074: the quiet half — hand out the quest item, bend the rules of movement, change the music');
