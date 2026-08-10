// The INTERACTION booth survives the file — the state builds 1468-1486 added, through the real loader
//
// This repo's most productive probe shape: author it, SAVE it, reload it through the real loader, then PLAY
// what came out. It has found a real bug every time it has been run — 1398 (a shootable target that saved and
// was never read back), 1400 (five game settings written and never loaded), 1401 (thirteen sections a joiner
// never received), 1406 (fourteen of seventeen signal verbs losing every parameter), 1427 (the fuse).
//
// Builds 1468-1486 added a lot of state on three different roads: HUD widgets (their own sanitizer), prop
// signals (SIG_KEYS' short-key table, the road 1406 found broken), and gameCfg/worldCfg scalars (the road
// 1400 found broken). Every field is authored at a NON-DEFAULT value, because a field that happens to equal
// its default cannot tell a working loader from a missing one.

import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

let pass = 0, fail = 0;
const ck = (ok, what, got) => { if(ok) { pass++; } else { fail++; console.log('   FAIL  ' + what + (got !== undefined ? '   got ' + JSON.stringify(got) : '')); } };

await withGame(async (probe) => {
  const P = (js) => probe(js);
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  console.log('settled  ', JSON.stringify(await P(`(function(){ __drive(240); return { gameOn }; })()`)));

  // ---------------------------------------------------------------- author the booth
  const authored = await P(`(function(){
    // two clickable props: one opens a FROZEN modal, one emits a logic event
    const mk = (x, z, name, sig) => {
      spawnProp('box', [0,0,0, 0,0,0, 2,2,2]);
      const o = propModels[propModels.length-1];
      o.position.set(x, 0, z); o.updateMatrixWorld(true); refreshPropCollider(o);
      o.userData.name = name; o.userData.tag = 'booth'; o.userData.signals = [sig];
      return o;
    };
    mk(60, -55, 'Prize Counter',
       { when:'clicked', do:'modal', mmode:'show', mid:'shop', mfrz:1 });
    mk(64, -55, 'Ticket Booth',
       { when:'clicked', do:'emit', text:'ticket' });

    hudWidgets = _sanitizeHudWidgets([
      { id:'wBuy',  kind:'button', modal:'shop', label:'Buy a prize', event:'buy',
        /* a REAL anchor (HW_ANCHORS): my first fixture wrote 'cc', which the sanitizer correctly rejected
           back to the default 'tc' — so that column round-tripped a default and tested nothing, which is
           this probe's own rule turned on itself */
        anchor:'br', dx:-40, dy:60, size:26, color:'#ffcc00', bg:false,
        img:'https://example.org/card.png', iw:220, ih:140, alpha:0.8 },
      { id:'wTime', kind:'timer',  label:'Run', value:'clock', tfmt:'sec2', anchor:'tr', dx:12, dy:9, size:21 },
      { id:'wBar',  kind:'bar',    label:'Fill', value:'score', max:'goal', anchor:'bc', size:15, color:'#00ff88' },
      { id:'wArt',  kind:'image',  modal:'shop', img:'https://example.org/art.png', iw:300, ih:200, alpha:0.5 },
      { id:'wOnly', kind:'text',   label:'Tickets {tickets}', when:'showTickets', anchor:'tl', dx:7, dy:5 },
    ]);

    gameCfg.clickMove = true; gameCfg.freeCursor = true;
    worldCfg.airJumps = 2; worldCfg.wallJump = 14; worldCfg.jumpCut = 0.35; worldCfg.airDash = 22;
    applyWorldCfg();

    return { props: propModels.filter(o=>o&&o.userData&&o.userData.tag==='booth').length,
             widgets: hudWidgets.length, AIR_JUMPS, WALL_JUMP, jumpCut: worldCfg.jumpCut };
  })()`);
  console.log('authored ', JSON.stringify(authored));

  // ---------------------------------------------------------------- save, and look at what was WRITTEN
  const written = await P(`(function(){
    const L = serializeLevel();
    window.__lvl = JSON.parse(JSON.stringify(L));
    const boothSigs = (L.props||[]).filter(p=>p.tg==='booth').map(p=>p.sg);
    return { sigs: boothSigs, names: (L.props||[]).filter(p=>p.tg==='booth').map(p=>p.nm),
             widgets: (L.hudWidgets||[]).length,
             clickMove: L.game && L.game.clickMove, freeCursor: L.game && L.game.freeCursor,
             airJumps: L.world && L.world.airJumps, wallJump: L.world && L.world.wallJump };
  })()`);
  console.log('written  ', JSON.stringify(written));

  ck(Array.isArray(written.sigs) && written.sigs.length === 2, 'both clickable props serialize a signal');
  const s0 = (written.sigs[0] || [])[0] || {};
  ck(s0.w === 'clicked', "the `clicked` trigger is written (build 1479)", s0.w);
  ck(s0.d === 'modal',   'the modal verb is written', s0.d);
  ck(s0.md === 'show' && s0.mj === 'shop', 'its mode and id ride SIG_KEYS (1468)', [s0.md, s0.mj]);
  ck(s0.mz === 1, 'and the FREEZE flag (1478)', s0.mz);
  ck(written.names && written.names[0] === 'Prize Counter', 'the prop NAME the hover shows (1486)', written.names);
  ck(written.clickMove === true && written.freeCursor === true, 'click-to-move is written (1481)');
  ck(written.airJumps === 2, 'air jumps (1482)', written.airJumps);
  ck(written.wallJump === 14, 'wall jump (1483)', written.wallJump);

  // ---------------------------------------------------------------- RESET everything, then reload
  /* build 1401's rule: restoring the SAME live state proves nothing, because nothing cleared it. Every value
     is driven to a DISTINCT wrong one first, so a value that comes back was applied and a value that still
     reads the reset was not. */
  const reloaded = await P(`(function(){
    hudWidgets = []; _hwRebuild();
    gameCfg.clickMove = false; gameCfg.freeCursor = false;
    worldCfg.airJumps = 0; worldCfg.wallJump = 0; worldCfg.jumpCut = 1; worldCfg.airDash = 0;
    applyWorldCfg();
    const before = { widgets: hudWidgets.length, AIR_JUMPS, WALL_JUMP, clickMove: gameCfg.clickMove };

    restoreLevel(window.__lvl);

    const booth = propModels.filter(o=>o&&o.userData&&o.userData.tag==='booth');
    const byName = (n) => booth.find(o=>o.userData.name===n);
    const counter = byName('Prize Counter'), ticket = byName('Ticket Booth');
    const w = (id) => hudWidgets.find(x=>x.id===id) || null;
    return { before,
      props: booth.length,
      counterSig: counter ? counter.userData.signals[0] : null,
      ticketSig: ticket ? ticket.userData.signals[0] : null,
      names: booth.map(o=>o.userData.name),
      widgets: hudWidgets.map(x=>x.id),
      wBuy: w('wBuy'), wTime: w('wTime') && { kind:w('wTime').kind, tfmt:w('wTime').tfmt, value:w('wTime').value },
      wArt: w('wArt') && { kind:w('wArt').kind, img:w('wArt').img, iw:w('wArt').iw, alpha:w('wArt').alpha },
      wOnly: w('wOnly') && { when:w('wOnly').when, label:w('wOnly').label, modal:w('wOnly').modal },
      clickMove: gameCfg.clickMove, freeCursor: gameCfg.freeCursor,
      AIR_JUMPS, WALL_JUMP, airJumps: worldCfg.airJumps, wallJump: worldCfg.wallJump, jumpCut: worldCfg.jumpCut };
  })()`);
  console.log('the reset', JSON.stringify(reloaded.before), ' <- everything distinct-wrong before the load');
  console.log('reloaded ', JSON.stringify({ props:reloaded.props, names:reloaded.names, widgets:reloaded.widgets,
    clickMove:reloaded.clickMove, AIR_JUMPS:reloaded.AIR_JUMPS, WALL_JUMP:reloaded.WALL_JUMP }));

  const cs = reloaded.counterSig || {};
  ck(reloaded.props === 2, 'both props come back', reloaded.props);
  ck(cs.when === 'clicked', "the `clicked` trigger is READ BACK", cs.when);
  ck(cs.do === 'modal', 'the verb', cs.do);
  ck(cs.mmode === 'show' && cs.mid === 'shop', 'the modal mode and id', [cs.mmode, cs.mid]);
  ck(cs.mfrz === 1 || cs.mfrz === true, 'THE FREEZE FLAG', cs.mfrz);
  ck((reloaded.ticketSig||{}).text === 'ticket', "the emit verb's event name", (reloaded.ticketSig||{}).text);
  ck(reloaded.names.indexOf('Prize Counter') >= 0, 'the prop name', reloaded.names);

  console.log('widgets  ', JSON.stringify({ wBuy: reloaded.wBuy, wTime: reloaded.wTime,
                                            wArt: reloaded.wArt, wOnly: reloaded.wOnly }));
  const b = reloaded.wBuy || {};
  ck(reloaded.widgets.length === 5, 'all five widgets', reloaded.widgets.length);
  ck(b.kind === 'button' && b.event === 'buy', 'the BUTTON kind and its event (1255)', [b.kind, b.event]);
  ck(b.modal === 'shop', 'its MODAL binding (1468)', b.modal);
  ck(b.color === '#ffcc00' && b.bg === false && b.size === 26, 'colour, plate-off and size', [b.color, b.bg, b.size]);
  ck(b.anchor === 'br' && b.dx === -40 && b.dy === 60, 'anchor and offset — placement is authored state too',
     [b.anchor, b.dx, b.dy]);
  ck(b.iw === 220 && b.ih === 140 && Math.abs(b.alpha - 0.8) < 1e-6, 'the art box (1260)', [b.iw, b.ih, b.alpha]);
  ck((reloaded.wTime||{}).tfmt === 'sec2', 'the timer FORMAT (1475)', (reloaded.wTime||{}).tfmt);
  ck((reloaded.wArt||{}).kind === 'image', 'the image kind (1260)', (reloaded.wArt||{}).kind);
  ck((reloaded.wOnly||{}).when === 'showTickets' && (reloaded.wOnly||{}).modal === '',
     'a plain HUD widget keeps its show-when and stays out of the modal', reloaded.wOnly);

  ck(reloaded.clickMove === true && reloaded.freeCursor === true, 'click-to-move is READ BACK (1481)');
  ck(reloaded.AIR_JUMPS === 2, 'AIR_JUMPS reaches the live engine (1482)', reloaded.AIR_JUMPS);
  ck(reloaded.WALL_JUMP === 14, 'WALL_JUMP reaches the live engine (1483)', reloaded.WALL_JUMP);
  ck(Math.abs(reloaded.jumpCut - 0.35) < 1e-6, 'jumpCut survives (1301)', reloaded.jumpCut);

  // ---------------------------------------------------------------- byte-stability across three saves
  const stable = await P(`(function(){
    const a = JSON.stringify(serializeLevel());
    restoreLevel(JSON.parse(a)); const b = JSON.stringify(serializeLevel());
    restoreLevel(JSON.parse(b)); const c = JSON.stringify(serializeLevel());
    return { ab: a === b, bc: b === c, len: a.length };
  })()`);
  console.log('stability', JSON.stringify(stable));
  ck(stable.bc, 'byte-stable across save cycles (build 1420) — a level must not degrade every autosave');

  // ---------------------------------------------------------------- and now PLAY what came out
  const played = await P(`(function(){
    player.pos.set(60, 1.9, -65); player.vel.set(0,0,0); player.yaw = Math.PI; player.pitch = 0;
    __gate(); __drive(30);
    const aimed = !!_clkResolve(0,0);
    const before = { modal:_modalOpen, frozen:_modalFreeze };
    _propClick({ clientX:0, clientY:0 });         // resolves through screen centre: the pointer is locked
    __drive(4);
    return { aimed, before, modal:_modalOpen, frozen:_modalFreeze,
             widgetShown: !!(_hwEls && _hwEls.find && _hwEls.find(r=>r.w && r.w.id==='wBuy')) };
  })()`);
  console.log('PLAY     ', JSON.stringify(played));
  ck(played.aimed, 'the reloaded prop is clickable in the reloaded level');
  ck(played.modal === 'shop', 'clicking it OPENS the modal it saved (1468/1479)', played.modal);
  ck(played.frozen === true, '...and the FREEZE it saved actually freezes (1478)', played.frozen);

  const jumped = await P(`(function(){
    _modalSet('', false); __drive(4);
    player.pos.set(60, 1.9, -20); player.vel.set(0,0,0); player.onGround = false;
    _airJumpsUsed = 0; _wallHas = false; _dashUsed = false; _coyoteT = 0; _jumpBufT = 0;
    _jumpHeldPrev = false; player.jumpCd = 0;
    for(const k in keys) keys[k] = false;
    __drive(120);
    if(!player.onGround) return { landed:false };
    const y0 = player.pos.y;
    keys[BINDS.jump] = true; __drive(20); keys[BINDS.jump] = false; __drive(15);
    keys[BINDS.jump] = true; __drive(3);  keys[BINDS.jump] = false;
    let apex = player.pos.y, f = 0;
    while(!player.onGround && f < 600){ __drive(1); f++; if(player.pos.y > apex) apex = player.pos.y; }
    return { landed:true, rise:+(apex - y0).toFixed(2), airJumpsSpent:_airJumpsUsed };
  })()`);
  console.log('DOUBLE JUMP', JSON.stringify(jumped), ' <- spent from a RELOADED airJumps');
  ck(jumped.landed && jumped.airJumpsSpent >= 1,
     'the reloaded air jump is really spendable in play', jumped.airJumpsSpent);

  await P(`(function(){ _modalSet('', false); __release(); return 1; })()`);
}, { headless: true });

console.log('\n' + pass + '/' + (pass + fail) + (fail ? '   ' + fail + ' FAILED' : '   all good'));
