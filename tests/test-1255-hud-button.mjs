import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1255: the HUD becomes an INTERFACE (the audit's #1 gameplay gap — no authorable clickable UI).
// A `button` widget fires a named logic event; the graph already owns credits, inventory, spawning and
// win conditions, so a shop is one button plus nodes a creator can already write. Executed here: the
// real _hwFire and _hwSyncCursor in a stubbed scope, plus the sanitizer.

// --- the sanitizer -----------------------------------------------------------------------------------
const san = new Function('HW_ANCHORS', extractFunction('_hwSafeUrl') + extractFunction('_sanitizeHudWidgets') + '; return _sanitizeHudWidgets;')(['tl','tc','tr','ml','mr','bl','bc','br']);
{
  const [b] = san([{ kind:'button', label:'BUY', event:' buyTurret ', when:'shopOpen' }]);
  eq(b.kind, 'button', 'the button kind survives');
  eq(b.event, 'buyTurret', 'its event is trimmed');
  const [t] = san([{ kind:'nonsense' }]);
  eq(t.kind, 'text', 'unknown kinds still fall back to text');
  eq(t.event, '', 'and carry an empty event');
  const [long] = san([{ kind:'button', event:'e'.repeat(200) }]);
  eq(long.event.length, 60, 'a hostile event name is clamped to 60 chars (the same bound the host applies)');
  for (const k of ['text','timer','bar','button']) eq(san([{ kind:k }])[0].kind, k, `${k} is a valid kind`);
}

// --- _hwFire ------------------------------------------------------------------------------------------
function fireRig(opts = {}) {
  const world = { events: [], sent: [], sfx: 0, t: 1000 };
  const mk = new Function('gameOn','paused','editorOpen','NET','logicEvent','SFX','performance','_hwCd','world',
    extractFunction('_hwFire') + '; return _hwFire;');
  const fn = mk(
    opts.gameOn === false ? false : true,
    !!opts.paused, !!opts.editorOpen,
    opts.client ? { mode:'client', conn:{ send:(m)=>world.sent.push(m) } } : { mode: opts.host ? 'host' : 'off' },
    (n) => world.events.push(n),
    { swap: () => world.sfx++ },
    { now: () => world.t },
    opts.cd || {},
    world);
  return { fn, world };
}
{ // solo/host: straight into the graph
  const { fn, world } = fireRig();
  fn({ id:'w1', event:'buyTurret' });
  eq(world.events.length, 1, 'a click fires the logic event locally');
  eq(world.events[0], 'buyTurret', '...by name');
  eq(world.sfx, 1, 'and it clicks audibly');
}
{ // a client reuses build 1071's actEv — no new message type, and the host already clamps it
  const { fn, world } = fireRig({ client: true });
  fn({ id:'w1', event:'buyTurret' });
  eq(world.events.length, 0, 'a client never runs the graph itself');
  eq(world.sent.length, 1, 'it sends instead');
  eq(world.sent[0].t, 'actEv', 'reusing build 1071’s message — no new type, no new handler, inherits the host’s validation');
  eq(world.sent[0].n, 'buyTurret', 'carrying the event name');
}
{ // the cooldown: a held/spammed button must not flood the graph's pulse budget
  const cd = {}; const { fn, world } = fireRig({ cd });
  const w = { id:'w1', event:'x' };
  fn(w); fn(w); fn(w);
  eq(world.events.length, 1, 'three rapid clicks fire once');
  world.t += 149; fn(w);
  eq(world.events.length, 1, 'still held off at 149 ms');
  world.t += 2; fn(w);
  eq(world.events.length, 2, 'and free again at 151 ms');
}
{ // every gate
  for (const [name, opts] of [['not playing', { gameOn:false }], ['paused', { paused:true }], ['editor open', { editorOpen:true }]]) {
    const { fn, world } = fireRig(opts);
    fn({ id:'w1', event:'x' });
    eq(world.events.length, 0, `${name}: the button does nothing`);
  }
  const { fn, world } = fireRig();
  fn({ id:'w1', event:'   ' });
  eq(world.events.length, 0, 'a button with no event name is inert (never fires an empty event)');
}

// --- _hwSyncCursor ------------------------------------------------------------------------------------
function curRig(opts = {}) {
  const world = { exits: 0, locks: 0 };
  const mk = new Function('isTouch','gameOn','paused','invOpen','editorOpen','safeExitPointerLock','tryPointerLock','world',
    `let _hwCursorFree = ${opts.free ? 'true' : 'false'};
     ${extractFunction('_hwSyncCursor')}
     return { fn:_hwSyncCursor, free:()=>_hwCursorFree };`);
  const r = mk(!!opts.touch, opts.gameOn === false ? false : true, !!opts.paused, !!opts.invOpen, !!opts.editorOpen,
    () => world.exits++, () => world.locks++, world);
  r.world = world; return r;
}
{ // a visible button frees the mouse — a menu you cannot click is not a menu
  const r = curRig();
  r.fn(true);
  eq(r.world.exits, 1, 'the pointer lock is released (the openInventory precedent)');
  assert(r.free(), 'and the state is remembered');
  r.fn(true); r.fn(true);
  eq(r.world.exits, 1, 'staying open costs nothing — no per-frame churn');
  r.fn(false);
  eq(r.world.locks, 1, 'hiding the last button gives the mouse back');
  r.fn(false);
  eq(r.world.locks, 1, 'and staying closed costs nothing');
}
{ // it must not steal the pointer back from something else that legitimately holds it
  for (const [name, opts] of [['inventory open', { invOpen:true }], ['paused', { paused:true }], ['editor open', { editorOpen:true }], ['not playing', { gameOn:false }]]) {
    const r = curRig({ free:true, ...opts });
    r.fn(false);
    eq(r.world.locks, 0, `${name}: the pointer is not re-locked out from under it`);
  }
  const r = curRig({ touch:true });
  r.fn(true);
  eq(r.world.exits, 0, 'touch devices never lock the pointer, so nothing to release');
}

// --- wiring pins --------------------------------------------------------------------------------------
assert(/const isBtn = \(w\.kind==='button'\);/.test(src) && /document\.createElement\(isBtn\?'button':'div'\)/.test(src),
  'a button widget is a REAL <button> — focus and Enter/Space come free');
assert(/el\.style\.pointerEvents='auto'; el\.style\.cursor='pointer';/.test(src),
  'it opts into pointer events (the widget host is pointer-events:none so it never eats clicks)');
assert(/el\.onclick=\(ev\)=>\{ ev\.preventDefault\(\); ev\.stopPropagation\(\); _hwFire\(w\); \};/.test(src),
  'clicking fires — and the click never reaches the world behind it');
assert(/if\(vis && w\.kind==='button'\) _btnVis=true;/.test(src), 'the frame pass tracks whether any button is VISIBLE (show-when gates the menu)');
assert(/_hwSyncCursor\(_btnVis && \(typeof gameOn!=='undefined' && gameOn\)/.test(src), 'and drives the cursor from it');
assert(/if\(!hudWidgets\.length\)\{[\s\S]{0,120}?_hwSyncCursor\(false\); return; \}/.test(src), 'a level with no widgets releases the claim too');
assert(/if\(typeof hudWidgets!=='undefined'\) for\(const w of hudWidgets\)\{ if\(w && w\.kind==='button' && w\.event\) set\.add/.test(src),
  'a button’s event name joins the graph’s known events — On event autocompletes what you just authored');
assert(/\['button','Button'\],\['image','Image'\]\], w\.kind/.test(src), 'the editor offers the kind (build 1260 added Image beside it)');
assert(/lb\.appendChild\(inp\(w\.event,'e\.g\. buyTurret',120, v=>\{ w\.event=v\.trim\(\)\.slice\(0,60\); \}, 'lgEvtList'\)\);/.test(src),
  'with an event field that autocompletes from the graph');
assert(/mkAdd\('\+ Button', \{ kind:'button'/.test(src), 'and a + Button that lands a working shop-style example');

// The live-probe finding: releasing the pointer AUTO-OPENED THE PAUSE MENU, which both failed
// _hwFire's own `paused` gate and drew the menu over the button — making the button clickable was
// itself what made the game reject the click. The unlock handler's "a UI is legitimately open"
// whitelist (chat/map/inventory/shop) now includes the button cursor, exactly as invOpen does.
assert(/!invOpen && !\(typeof _hwCursorFree!=='undefined' && _hwCursorFree\)\) openPause\(\)/.test(src),
  'a deliberately freed cursor does NOT trip the pause-on-unlock (live-probed: without this the button was inert)');
{
  const sync = extractFunction('_hwSyncCursor');
  assert(sync.indexOf('_hwCursorFree = anyBtn;') < sync.indexOf('safeExitPointerLock'),
    'the flag is raised BEFORE the pointer is released — the pointerlockchange handler reads it (the openInventory ordering)');
}

done('build 1255: the HUD button — fire path executed (local, client-over-actEv, cooldown, four gates), cursor release/restore proven not to steal focus, sanitizer and editor wiring pinned');
