// build 1468 — creator-authored modals the logic graph can open.
//
// Asked for from play: "ways to create custom modals that can be triggered open".
//
// A MODAL IS A NAMED GROUP OF HUD WIDGETS, not a parallel system. Every part of a menu already existed —
// text, bars, timers, buttons that fire a logic event, images for card faces and panel frames, per-widget
// anchor/offset/size/colour, a sanitizer, serialization, the editor panel. What was missing was the three
// things that make a group of widgets a MODAL: one name that opens and closes them together, a backdrop,
// and a world that stops taking your clicks while they are up.
//
// So this is one field on a widget and one world verb. A widget with no modal name is byte-identical to
// build 1255's — which is every widget in every level ever saved, and that is the compatibility argument.

import { gameSource, html, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. the field rides the existing sanitizer
{
  const san = new Function('_hwSafeUrl', 'HW_ANCHORS',
    extractFunction('_sanitizeHudWidgets', src) + '; return _sanitizeHudWidgets;')(
    (u) => (typeof u === 'string' ? u : ''), ['tl','tc','tr','ml','mr','bl','bc','br']);

  eq(san([{ kind:'text' }])[0].modal, '', 'no name is the default — an ordinary HUD widget, as before');
  eq(san([{ kind:'text', modal:'  shop  ' }])[0].modal, 'shop', 'trimmed, like every other name field here');
  eq(san([{ kind:'text', modal:'x'.repeat(99) }])[0].modal.length, 24, 'capped — a level file is untrusted input');
  eq(san([{ kind:'text', modal:null }])[0].modal, '', 'a null cannot become the string "null"');
  eq(san([{ kind:'text', modal:7 }])[0].modal, '7', 'a number is coerced rather than thrown');

  // it rides serialization for free, which is the whole reason the modal is a widget field
  assert(/hudWidgets: \(\(typeof hudWidgets!=='undefined' && hudWidgets\.length\) \? _sanitizeHudWidgets\(hudWidgets\)/.test(src),
    'the serializer writes the sanitized widgets whole, so `modal` needed no serializer change at all');
  assert(/hudWidgets = _sanitizeHudWidgets\(level\.hudWidgets\)/.test(src),
    '...and the loader reads them whole, so it needed no loader change either');
}

// ---------------------------------------------------------------- 2. TWO gates, and the first one is opt-in
// This is the compatibility claim, and it is executed rather than asserted: an existing widget must be
// visible in exactly the conditions it was visible in before this build.
{
  const upd = extractFunction('updateHudWidgets', src);
  const line = upd.slice(upd.indexOf('const vis='), upd.indexOf('const vis=') + 120);
  assert(/w\.modal \? _modalOpen===w\.modal : true/.test(line), 'the modal gate is first...');
  assert(/!w\.when \|\| \(\+logicVars\[w\.when\]\|\|0\)!==0/.test(line),
    '...and build 1058\'s `show when` test is byte-identical beside it, so the two compose');

  const vis = new Function('w', '_modalOpen', 'logicVars',
    'return (w.modal ? _modalOpen===w.modal : true) && (!w.when || (+logicVars[w.when]||0)!==0);');

  // a pre-1468 widget: the modal state cannot touch it, in either direction
  for (const open of ['', 'shop', 'pause']) {
    eq(vis({ modal:'', when:'' }, open, {}), true, 'an ordinary widget shows whatever modal is open ("' + open + '")');
    eq(vis({ modal:'', when:'go' }, open, { go:0 }), false, '...and its `show when` still decides, alone');
    eq(vis({ modal:'', when:'go' }, open, { go:1 }), true);
  }
  // a modal widget
  eq(vis({ modal:'shop', when:'' }, '', {}), false, 'a modal widget is hidden while no modal is open');
  eq(vis({ modal:'shop', when:'' }, 'other', {}), false, '...and while a DIFFERENT modal is open');
  eq(vis({ modal:'shop', when:'' }, 'shop', {}), true, '...and shows when its own is');
  eq(vis({ modal:'shop', when:'stocked' }, 'shop', { stocked:0 }), false,
    '...where `show when` still gates it WITHIN the modal — one row of a shop can be sold out');
  eq(vis({ modal:'shop', when:'stocked' }, 'shop', { stocked:1 }), true);
}

// ---------------------------------------------------------------- 3. the membership question
{
  const f = new Function('hudWidgets', extractFunction('_modalWidgets', src) + '; return _modalWidgets;');
  const ws = [{ modal:'shop' }, { modal:'shop' }, { modal:'pause' }, { modal:'' }, null];
  const run = f(ws);
  eq(run('shop'), 2, 'counts exact members');
  eq(run('pause'), 1);
  eq(run('missing'), 0, 'a name nobody carries is zero — which is what the verb refuses on');
  eq(run(''), 0, 'the empty name is never a modal, or every ordinary widget would join one');
  eq(run(null), 0, 'and a null does not throw');
  eq(run('  shop  '), 2, 'trimmed, so what the creator typed in the verb matches what they typed on the widget');
}

// ---------------------------------------------------------------- 4. opening one
{
  const run = (from, to) => {
    const st = { firing:true, firingLatch:true, backs:0, updates:0 };
    const fn = new Function('S', `
      let _modalOpen = ${JSON.stringify(from)};
      let firing = S.firing, firingLatch = S.firingLatch;
      const _modalSyncBack = () => { S.backs++; };
      const updateHudWidgets = () => { S.updates++; };
      ${extractFunction('_modalSet', src)}
      _modalSet(${JSON.stringify(to)});
      return { open:_modalOpen, firing, firingLatch };`);
    const out = fn(st);
    return { open:out.open, firing:out.firing, firingLatch:out.firingLatch, backs:st.backs, updates:st.updates };
  };

  let r = run('', 'shop');
  eq(r.open, 'shop', 'opening sets the state');
  eq(r.firing, false, 'a HELD trigger is dropped — the click gate below stops a NEW shot, this stops the one in flight');
  eq(r.firingLatch, false, '...including the latch, or the next frame re-fires it');
  eq(r.backs, 1, 'the backdrop is synced once');
  eq(r.updates, 1, '...and the widgets repaint immediately rather than on the next frame');

  r = run('shop', 'shop');
  eq(r.backs, 0, 'setting the modal it is already showing does nothing at all');
  eq(r.updates, 0);
  eq(r.firing, true, '...and does not steal a trigger the player is legitimately holding');

  r = run('shop', '');
  eq(r.open, '', 'closing is the empty name');
  eq(r.firing, true, 'CLOSING does not drop the trigger — only opening a menu over the world does');

  eq(run('', '   pad   ').open, 'pad', 'the name is trimmed here too, so the verb and the widget agree');
  eq(run('', 'y'.repeat(99)).open.length, 24, '...and capped, matching the sanitizer');
}

// ---------------------------------------------------------------- 5. the verb refuses rather than dimming the screen
// A modal that opens onto nothing is a dimmed world the player cannot dismiss — the worst outcome this
// verb has, and the one a creator hits first by mistyping a name.
{
  const branch = (() => {
    const a = src.indexOf("  if(s.do==='modal'){");
    assert(a > 0, 'the modal branch is in _applyWorldAction');
    return src.slice(a, src.indexOf('_modalSet(mid); _wactSend(mpay); return; }', a) + 42);
  })();
  assert(/_wactToActor/.test(branch), 'and it is beside the other per-player world verbs');

  const run = (s, widgets, who) => {
    const out = { fails:[], sent:null, actor:null, set:'__untouched' };
    new Function('S', 'O', `
      const s = S.s, who = S.who;
      const hudWidgets = S.widgets;
      const _noteLogicFailure = (m) => { O.fails.push(m); };
      const _modalSet = (v) => { O.set = v; };
      const _wactSend = (p) => { O.sent = p; };
      const _wactToActor = (p) => { O.actor = p; return S.actorOk; };
      ${extractFunction('_modalWidgets', src)}
      ${branch}
      `)({ s, widgets, who: who || 'player', actorOk: (who === 'actor') }, out);
    return out;
  };

  const WS = [{ modal:'shop' }];

  let r = run({ do:'modal', mmode:'show', mid:'shop' }, WS);
  eq(r.set, 'shop', 'a modal with members opens');
  eq(JSON.stringify(r.sent), '{"md":"shop"}', '...and every peer is told');
  eq(r.fails.length, 0);

  r = run({ do:'modal', mmode:'show', mid:'' }, WS);
  eq(r.set, '__untouched', 'THE REFUSAL: an unnamed modal opens nothing...');
  eq(r.sent, null, '...and nothing crosses the wire');
  eq(r.fails.length, 1, '...and it is REPORTED (build 1214), not swallowed');

  r = run({ do:'modal', mmode:'show', mid:'typo' }, WS);
  eq(r.set, '__untouched', 'a name no widget carries opens nothing — a dimmed empty screen is unrecoverable');
  eq(r.fails.length, 1);
  assert(/typo/.test(r.fails[0]), '...and the report names the modal the creator actually typed');

  r = run({ do:'modal', mmode:'hide' }, WS);
  eq(r.set, '', 'CLOSE takes no name...');
  eq(r.fails.length, 0, '...and is never refused — closing must always work, even for a modal that has none');
  eq(JSON.stringify(r.sent), '{"md":""}', '...and the empty name is what closes it on every peer');

  r = run({ do:'modal', mmode:'hide', mid:'shop' }, WS);
  eq(r.set, '', 'a stale name on a CLOSE is ignored rather than reopening it');

  // build 1232: one player, not the room
  r = run({ do:'modal', mmode:'show', mid:'shop', who:'actor' }, WS, 'actor');
  eq(JSON.stringify(r.actor), '{"md":"shop"}', 'who:actor sends it to the one player who tripped the trigger...');
  eq(r.set, '__untouched', '...and does NOT also open it for the host');
  eq(r.sent, null, '...nor broadcast it to everyone else');
}

// ---------------------------------------------------------------- 6. the wire from the node to the handler
// Build 1277: six verbs shipped offered-and-unreachable because the tests pinned the dropdown and the
// handler and never that a node reaches one from the other. Walk the path.
{
  const reached = [];
  const body = extractFunction('_applySignalAction', src) + '; return _applySignalAction;';
  const fn = new Function('_applyWorldAction', 'NET', 'propModels', 'setGoal', 'setCheckpoint',
    'playSample', 'loadSound', 'logicEvent', 'xaToggle', 'broadcastXAnim', 'playPropAnimationOnce',
    'broadcastAnim', 'broadcastUnlock', 'winLevel', 'playCutscene', body)(
    (s) => reached.push(s.do), { mode:'host' }, [], () => {}, () => {},
    () => true, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {});
  try { fn({ do:'modal', mmode:'show', mid:'shop' }, null); } catch (e) { /* unrelated stubs */ }
  assert(reached.includes('modal'), 'a "modal" signal or Do node actually REACHES _applyWorldAction');
  assert(!reached.includes('toggle'), '...and the rig is real — a tag verb still does not go there');
}
{
  const defs = new Function('return ' + extractConst('LG_DEFS', src) + ';')();
  const offered = defs.do.params.find(p => p.k === 'verb').sel.map(o => o[0]);
  assert(offered.includes('modal'), 'the Do node offers it');
  const params = defs.do.params.map(p => p.k);
  assert(params.includes('mmode') && params.includes('mid'),
    '...and declares both of its fields, which since build 1407 IS the wiring');
  const mid = defs.do.params.find(p => p.k === 'mid');
  eq(mid.listId, 'lgModalList', 'the name field offers the modals the level actually has');
  eq(JSON.stringify(mid.ifv2), '["mmode","show"]', '...and is hidden on a CLOSE, which takes no name');
  const who = defs.do.params.find(p => p.k === 'who');
  assert(who.ifv[1].includes('modal'), 'and the audience picker covers it, like the camera and the marker');
}

// ---------------------------------------------------------------- 7. it survives a save (build 1406)
{
  const KEYS = new Function('return ' + extractConst('SIG_KEYS', src) + ';')();
  eq(KEYS.mmode, 'md', 'both fields have a short key...');
  eq(KEYS.mid, 'mj');
  const seen = {};
  for (const k in KEYS) {
    assert(!seen[KEYS[k]], 'no two fields share a short key (' + KEYS[k] + ') — a collision is silent data loss');
    seen[KEYS[k]] = k;
  }
  const pack = new Function('SIG_KEYS', 'SIG_STR_MAX', extractFunction('_sigPack', src) + '; return _sigPack;')(KEYS, 300);
  const unpack = new Function('SIG_UNKEYS', 'SIG_STR_MAX',
    extractFunction('_sigUnpack', src) + '; return _sigUnpack;')(
    (() => { const o = {}; for (const k in KEYS) o[KEYS[k]] = k; return o; })(), 300);
  const sig = { when:'used', do:'modal', mmode:'show', mid:'shop', who:'actor' };
  const back = unpack(pack(sig));
  eq(back.do, 'modal', 'a prop signal carrying this verb round-trips the file...');
  eq(back.mmode, 'show', '...with its mode...');
  eq(back.mid, 'shop', '...and its name — fourteen verbs lost every parameter this way before build 1406');
  eq(back.who, 'actor');
}
{ // ...and it has a row that configures it (build 1406's own rule: offered must mean reachable)
  const a = src.indexOf("  } else if(s.do==='modal'){");
  assert(a > 0, 'the signal editor has a modal row');
  const row = src.slice(a, a + 900);
  assert(/s\.mmode=v/.test(row), 'it sets the mode');
  assert(/s\.mid=v/.test(row), '...and the name');
  assert(/lgModalList/.test(row), '...offering the level\'s own modals');
  assert(/s\.who=v/.test(row), '...and the audience');
}

// ---------------------------------------------------------------- 8. the client
{
  const w = src.slice(src.indexOf("else if(msg.t==='wact'){"), src.indexOf("else if(msg.t==='wact'){") + 2200);
  assert(/if\(msg\.md!=null && typeof _modalSet==='function'\)/.test(w),
    'a client applies the host\'s modal — and the test is `!=null`, because the empty name is CLOSE ' +
    'and a truthiness test would make a modal impossible to shut on anyone but the host');
  assert(/_modalSet\(String\(msg\.md\)\)/.test(w), '...through the same one function the host uses');
}

// ---------------------------------------------------------------- 9. a modal is play state
{
  const ls = extractFunction('logicStart', src);
  assert(/_modalSet\(''\)/.test(ls), 'a deploy closes any open modal — it is match state, like the camera override');
  assert(ls.indexOf("_modalSet('')") < ls.indexOf("if(typeof NET!=='undefined' && NET.mode==='client') return;"),
    '...on a CLIENT too, which returns early — a joiner must not be left staring at a dimmed screen');
}

// ---------------------------------------------------------------- 10. the world stops taking the clicks
{
  // anchored on the gate itself, not on the first `mousedown` listener in a 55,000-line file (build 1392:
  // an indexOf that misses is not an error, it is a wrong answer)
  const gi = src.indexOf('if(shopOpen || editorOpen || paused || mapOpen || duelDead || invOpen');
  assert(gi > 0, 'the in-play input gate is where it always was');
  const md = src.slice(gi, gi + 900);
  assert(/\|\| _modalOpen\) return;/.test(md),
    'shooting, aiming and grabbing are refused while a modal is up — the same gate the shop and the ' +
    'inventory already use, rather than a new one');
  assert(md.indexOf('_modalOpen') >= 0 && md.indexOf('_modalOpen') < md.indexOf('firing=true'),
    '...before the trigger, or the first click of every menu fires a round');
}

// ---------------------------------------------------------------- 11. the backdrop
{
  const b = extractFunction('_modalSyncBack', src);
  assert(/z-index:3;/.test(b), 'it sits BELOW the widget host (z-index 4), or the menu would be behind its own dimmer');
  assert(/pointer-events:auto/.test(b), '...and takes the pointer, so the world behind is not hovered');
  assert(/editorOpen/.test(b) && /paused/.test(b),
    '...and never appears while authoring or paused — it is a property of PLAY');
  assert(/if\(_modalBack && _modalBack\.parentNode\) return;/.test(b),
    '...and is built once, not rebuilt every frame');
  assert(/_modalBack\.remove\(\)/.test(b), '...and removes itself when the modal closes');

  const upd = extractFunction('updateHudWidgets', src);
  assert(upd.indexOf('_modalSyncBack()') >= 0 && upd.indexOf('_modalSyncBack()') < upd.indexOf('if(!hudWidgets.length)'),
    'the frame calls it BEFORE the no-widgets early return, so opening the editor over a modal still clears it');

  // the cursor: an open modal frees the mouse whether or not it happens to contain a button
  assert(/_hwSyncCursor\(\(_btnVis \|\| !!_modalOpen\)/.test(upd),
    'an open modal frees the mouse on its own — a panel you cannot point at is not a menu');
  assert(/typeof editorOpen!=='undefined' && editorOpen\)\);/.test(upd),
    '...and build 1255\'s own conditions are unchanged beside it');
}

// ---------------------------------------------------------------- 12. the door (build 1348)
{
  const opt = new Function('hudWidgets', extractFunction('_lgModalOptions', src) + '; return _lgModalOptions;');
  const got = opt([{ modal:'shop' }, { modal:'shop' }, { modal:'pause' }, { modal:'' }, null])();
  eq(JSON.stringify(got), '[{"v":"pause","n":1},{"v":"shop","n":2}]',
    'the name list is read off the WIDGETS — where a modal is actually defined — with a count and a stable order');
  eq(JSON.stringify(opt([])()), '[]', 'a level with no modals offers none');

  assert(/const ml=mk\('lgModalList'\)/.test(extractFunction('_lgRefreshDatalists', src)),
    'and the datalist is built beside the others');

  assert(/l5\.appendChild\(document\.createTextNode\('in modal'\)\)/.test(src),
    'the widget editor has the field — a capability nobody can find does not exist');
  assert(/none \\u2014 always on the HUD/.test(src), '...whose placeholder says what leaving it blank means');
  assert(/opens and closes together, over a dimmed backdrop/.test(src),
    '...and a hint naming what the group buys');
  assert(/blank this field to lay it out/.test(src),
    '...including the authoring papercut it shares with `show when`, stated rather than left to be discovered');
}

done('build 1468 (asked for from play): CREATOR-AUTHORED MODALS the logic graph can trigger open. "Even ways to create custom modals that can be triggered open." A modal is a NAMED GROUP OF HUD WIDGETS rather than a parallel system — every part of a menu already existed (text, bars, timers, buttons that fire a logic event, images for card faces and panel frames, per-widget anchor/offset/size/colour, a sanitizer, the level file, the editor panel), and what was missing was the three things that make a group of widgets a MODAL: one name that opens and closes them together, a backdrop that separates them from the world, and a world that stops taking your clicks while they are up. So it is ONE field on a widget and ONE world verb, which is also the compatibility argument: a widget with no modal name has no first gate at all, so every widget in every level ever saved is byte-identical — executed here across three modal states rather than asserted. The two gates COMPOSE, and that is the design: the modal decides whether the menu is up, `show when` still decides each row within it, so one shelf of a shop can be sold out while the shop is open. Three refusals, because a modal that opens onto nothing is a dimmed world the player cannot dismiss — the worst outcome this verb has and the first one a creator hits by mistyping: an unnamed modal, and a name no widget carries, each open nothing, send nothing and are REPORTED by name through build 1214\'s channel; a CLOSE is never refused, because closing must work even for a modal that has no members. The path from the node to the handler is WALKED rather than pinned at both ends (build 1277), the signal row exists in the same build that adds the dropdown entry (build 1406\'s rule, applied on the way in rather than a build later), and `who:\'actor\'` opens it for the one player who tripped the trigger — what a shop terminal in a co-op level means — without also opening it for the host');
