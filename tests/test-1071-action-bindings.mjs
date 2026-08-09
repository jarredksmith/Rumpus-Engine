// (build 1071) ACTION BINDINGS — author: "we have a ton of animation slots the user can add
// animations to, but we don't use all of them, especially in the combat area. How do we make it
// possible that the editor can assign certain animations to certain key/button/touch buttons?"
// Verified before building: SEVEN slots were pickable in the editor and driven by nothing —
// dodge, parry, block, holster, knockdown, getup, idleToCombat. A creator could assign a dodge
// roll and never once see it play. An action binding is the missing trigger: an input, an
// animation, and optionally a Logic event. The action deliberately does NO gameplay itself — it
// plays the clip and pulses the graph, and the graph already owns damage/spawn/score/win, so
// "dodge grants a speed burst" is three visible nodes instead of a hidden checkbox.
import { gameSource, extractFunction, assert, eq, near, done , appliedOnceByBothLoaders } from './harness.mjs';
const src = gameSource();

// ---- the slots this feature exists to reach really had no driver before ----
{
  // each appears in ANIM_SLOTS and in the one-shot set, and (now) in the editor's empty-state copy —
  // but nothing ever CALLED them: no playOwnAnim / setEnemyAnimState / st= assignment
  for (const slot of ['parry', 'dodge', 'holster', 'knockdown', 'getup', 'idleToCombat']) {
    assert(!new RegExp("playOwnAnim\\('" + slot + "'").test(src), slot + ' still has no hardcoded trigger — actions are how you reach it');
    assert(new RegExp("k:'" + slot + "'").test(src), '...and it is still a real, assignable slot');
  }
}

// ---- the sanitizer: level data, so it is validated like everything else that ships in a level ----
const san = new Function('ANIM_SLOTS', 'ACT_KEYS', 'ACT_INPUT_LABEL',
  extractFunction('_sanitizeActions', src) + '\nreturn _sanitizeActions;')(
  [{ k: 'dodge' }, { k: 'parry' }, { k: 'idle' }],
  ['KeyQ', 'KeyZ'], { mouse3: 'Middle mouse', pad0: 'Gamepad A / X' });
eq(san(null).length, 0, 'junk in, nothing out');
eq(san([null, 3, 'x']).length, 0, 'non-object rows are dropped');
{
  const a = san([{ id: 'act_abc123', name: '  Dodge roll  ', slot: 'parry', input: 'KeyZ', event: ' rolled ', cd: 1.234, lock: 1, touch: false }])[0];
  eq(a.id, 'act_abc123', 'a valid id is kept');
  eq(a.name, 'Dodge roll', 'names trim');
  eq(a.slot, 'parry', 'a real slot passes');
  eq(a.input, 'KeyZ', 'a whitelisted key passes');
  eq(a.event, 'rolled', 'the logic event trims');
  eq(a.cd, 1.23, 'cooldown rounds');
  eq(a.lock, true, 'movement lock is a real boolean');
  eq(a.touch, false, 'the touch button can be turned off');
}
{
  const a = san([{ slot: 'nope', input: 'KeyESCAPE', cd: -5 }])[0];
  eq(a.slot, 'dodge', 'an unknown slot falls back to dodge rather than breaking the state machine');
  eq(a.input, '', 'an input outside the whitelist is refused — a level cannot steal Escape or a system key');
  eq(a.cd, 0, 'a negative cooldown clamps');
  eq(a.touch, true, 'the touch button defaults ON (mobile players get the action too)');
  assert(/^act_/.test(a.id), 'a missing id is generated');
}
eq(san([{ input: 'mouse3' }])[0].input, 'mouse3', 'mouse buttons are valid inputs');
eq(san([{ input: 'pad0' }])[0].input, 'pad0', 'gamepad buttons are valid inputs');
eq(san(new Array(20).fill({ slot: 'dodge' })).length, 8, 'hard cap of 8 actions per level');
{
  const two = san([{ id: 'act_dup111' }, { id: 'act_dup111' }]);
  assert(two[0].id !== two[1].id, 'duplicate ids are re-issued');
}

// ---- input dispatch is pure and shared by keyboard, mouse, pad and touch ----
const forInput = new Function(extractFunction('actionForInput', src) + '\nreturn actionForInput;')();
{
  const list = [{ input: 'KeyQ' }, { input: '' }, { input: 'mouse3' }, { input: 'KeyQ' }];
  eq(forInput(list, 'KeyQ'), 0, 'the FIRST match wins (the editor warns about the duplicate)');
  eq(forInput(list, 'mouse3'), 2, 'mouse inputs resolve');
  eq(forInput(list, 'KeyZ'), -1, 'an unbound input resolves to nothing');
  eq(forInput(list, ''), -1, 'an action with no input is never triggered by a stray empty code');
  eq(forInput(null, 'KeyQ'), -1, 'no list is safe');
}

// ---- firing: the rules that keep it from misbehaving ----
{
  const fn = extractFunction('fireAction', src);
  assert(/if\(!gameOn \|\| editorOpen \|\| paused \|\| shopOpen \|\| invOpen \|\| mapOpen \|\| chatOpen\) return false;/.test(fn),
    'actions never fire while editing, paused, shopping, typing or in a menu');
  assert(/if\(player\.hp!=null && player\.hp<=0\) return false;/.test(fn), '...or while dead');
  assert(/if\(a\.cd>0 && now < \(_actCd\[a\.id\]\|\|0\)\) return false;/.test(fn), 'the cooldown is honoured');
  assert(/const ms=\(typeof _ownSlotDurMs==='function' && _ownSlotDurMs\(_st\)\) \|\| 600;/.test(fn),
    'the clip plays for ITS OWN length (build 1062), not a fixed guess');
  assert(/const _st=actionState\(a\);/.test(fn) && /playOwnAnim\(_st, dur\)/.test(fn),
    '...whether that is a named slot or (build 1079) a clip chosen by name');
  assert(/if\(a\.lock\)\{ _actLockUntil=now\+dur; \}/.test(fn), 'lock-movement plants the player for exactly that long');
  assert(/if\(a\.event && typeof logicEvent==='function' && \(typeof NET==='undefined' \|\| NET\.mode!=='client'\)\) logicEvent\(a\.event\);/.test(fn),
    'the logic event pulses the graph where gameplay is authoritative');
  assert(/NET\.conn\.send\(\{ t:'actEv', n:a\.event \}\)/.test(fn), '...and a client relays it to the host instead of firing locally');
  assert(/_actNetCode=\(i\+1\)&15; _actNetSeq=\(_actNetSeq\+1\)&255;/.test(fn), 'a sequence bump tells peers to replay it');
}
assert(/else if\(msg\.t==='actEv'\)\{ if\(typeof logicEvent==='function'\) logicEvent\(String\(msg\.n\|\|''\)\.slice\(0,60\)\); \}/.test(src),
  'the host accepts a client action event (bounded) and runs it through the graph');

// ---- every input path dispatches ----
assert(/if\(!e\.repeat && typeof actionForInput==='function'\)\{ const _ai=actionForInput\(actionBinds, e\.code\); if\(_ai>=0\)\{ fireAction\(_ai\); e\.preventDefault\(\); return; \} \}/.test(src),
  'KEYBOARD: edge-triggered (auto-repeat cannot machine-gun it, same contract as melee in 1059)');
assert(/const _m=\(e\.button===1\)\?'mouse3':\(e\.button===3\)\?'mouse4':\(e\.button===4\)\?'mouse5':'';/.test(src),
  'MOUSE: middle and both side buttons');
assert(/for\(const _b of \[0,1,2,3,12,13\]\)\{   \/\/ build 1071: face \+ up\/down d-pad are available to actions/.test(src),
  'GAMEPAD: the four face buttons and the free d-pad directions');
{
  const fn = extractFunction('refreshActionTouchButtons', src);
  assert(/b\.className='tBtn tActBtn'/.test(fn), 'TOUCH: a real .tBtn, styled like every other touch control');
  assert(/b\.addEventListener\('pointerdown', \(e\)=>\{ fireAction\(i\); e\.preventDefault\(\); \}\);/.test(fn), '...that fires the action');
  assert(/TOUCH_EDITABLE\.push\(id\);/.test(fn), '...and joins the arrangeable set, so players can drag it where they want');
  assert(/for\(const el of \[\.\.\.host\.querySelectorAll\('\.tActBtn'\)\] \) el\.remove\(\);|for\(const el of \[\.\.\.host\.querySelectorAll\('\.tActBtn'\)\]\) el\.remove\(\);/.test(fn),
    'rebuilding clears the previous buttons (no duplicates across level loads)');
  assert(/if\(!a\.touch\) return;/.test(fn), '...and respects the per-action touch toggle');
}

// ---- movement lock reaches the player controller ----
assert(/if\(typeof actionMovementLocked==='function' && actionMovementLocked\(\)\)\{ wish\.set\(0,0,0\); moveScale=0; \}/.test(src),
  'a locking action freezes the wish vector, in with the other legitimate freezes');

// ---- multiplayer: peers replay it, using the same shape as the proven hit-react one-shot ----
assert(/ac:_actNetCode, aq:_actNetSeq \}\];/.test(src), 'the host self-entry carries the action code + sequence');
// build 1298: the client state packet is DROPPABLE — the tail is the backpressure call, not a bare try/catch.
assert(/ac:_actNetCode, aq:_actNetSeq \}, 400\);/.test(src), 'the client state packet carries them too');
assert(/if\(pl\.aq!=null && pl\.aq!==rp\._aq\)\{ rp\._aq=pl\.aq;/.test(src), 'a CHANGED sequence is what triggers the replay (not a level flag)');
assert(/rp\._actSlot=_as; rp\._actT=performance\.now\(\)\+Math\.max\(200, Math\.min\(6000, \(typeof _ownSlotDurMs==='function' && _ownSlotDurMs\(_as\)\)\|\|600\)\);/.test(src),
  '...for the clip’s own measured length on the receiving end, resolved the same way the firing player resolved it');
assert(/if\(rp\._actT && performance\.now\(\) < rp\._actT\) _st=rp\._actSlot;/.test(src), 'and the remote avatar plays that slot');
{
  const i = src.indexOf("if(rp._actT && performance.now() < rp._actT) _st=rp._actSlot;");
  const j = src.indexOf("if(rp._hitT && performance.now() < rp._hitT)");
  const k = src.indexOf("if(rp.hp!=null && rp.hp<=0) _st =");
  assert(i > 0 && j > i && k > j, 'priority is right: an action loses to a hit-react, which loses to death');
}

// ---- it is level data: serialized, restored, sanitized on the way in ----
assert(/let actionBinds = _sanitizeActions\(savedLevel && savedLevel\.actions\);/.test(src), 'actions boot from the saved level');
assert(/actions: \(\(typeof actionBinds!=='undefined' && actionBinds\.length\) \? _sanitizeActions\(actionBinds\) : undefined\),/.test(src),
  'and serialize with it');
appliedOnceByBothLoaders(/actionBinds = _sanitizeActions\(level\.actions\);/g, 'both level-load paths restore them');

// ---- the editor lives on the Player tab, under Animation states ----
{
  const ui = src.slice(src.indexOf('// build 1071: ACTION BINDINGS'), src.indexOf("acHead.innerHTML='<b>Animation states</b>"));
  assert(ui.length > 500, 'the panel is built directly above Animation states on the Player tab');
  assert(/for\(const sl of ANIM_SLOTS\)\{ if\(sl\.g!==g\)\{/.test(ui), 'the slot picker offers EVERY animation slot, grouped');
  assert(/o\.textContent=_actInputLabel\(k\)\+\(taken\[k\]\?\('  \\u2014 used by '\+taken\[k\]\):''\)/.test(ui),
    'the key picker shows which default control already owns a key');
  assert(/is also '\+taken\[a\.input\]\+' \\u2014 the action wins/.test(ui), '...and warns when the author picks one anyway');
  assert(/Also bound to \\u201c'\+actionBinds\[dupe\]\.name/.test(ui), '...and when two actions collide');
  assert(/ev\.setAttribute\('list','lgEvtList'\)/.test(ui), 'the event field shares the logic graph’s event dropdown (build 1060)');
  assert(/if\(actionBinds\.length>=8\)\{ if\(typeof toast==='function'\) toast\('8 actions is the limit'\); return; \}/.test(ui),
    'the editor enforces the same cap as the sanitizer');
  assert(/const free=ACT_KEYS\.find\(k=>\{ for\(const b in BINDS\) if\(BINDS\[b\]===k\) return false; return !actionBinds\.some\(a=>a\.input===k\); \}\)/.test(ui),
    'a new action is pre-bound to a genuinely FREE key, not a collision');
  assert(/have no trigger of their own; an action binding is how you reach them/.test(ui),
    'the empty state names the slots this feature unlocks');
}

done('build 1071: dodge, parry, block and the rest finally have a trigger — bind any slot to a key, mouse, pad or touch button, and let the graph do the rest');
