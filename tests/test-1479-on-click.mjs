// build 1479 — a prop can answer the mouse.
//
// Build 1467 gave the player a real cursor and 1468 gave them clickable HUD buttons, and NOTHING IN THE
// WORLD answered a click. A prop could trigger on being destroyed, hit, walked up to and pressed E, or
// having something placed on it — so a point-and-click adventure, a tycoon where you click a building, a
// card game whose cards are props and an RTS were all missing the one trigger they are built on.

import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. the resolver, EXECUTED
{
  // build 1480 lifted the resolution into `_clkResolve` so the hover cue and the click cannot disagree
  // about what is clickable. Both are lifted from source, never restated — this rig's subject is the
  // resolution, and it followed the function.
  const fn = extractFunction('_clkResolve', src) + '\n' + extractFunction('_propClick', src);
  const RANGE = +extractConst('CLICK_RANGE', src);
  eq(RANGE, 60, 'the reach is a named constant');

  const mk = (over) => {
    const O = { fired: null, ctx: null, far: null, cam: null, ndc: null, recurse: null };
    const env = {
      propModels: over.props,
      renderer: { domElement: { getBoundingClientRect: () => over.rect || { left:0, top:0, width:800, height:600 } } },
      document: { pointerLockElement: over.locked ? {} : null },
      camera: { name:'cam' },
      THREE: null,
      _clkRay: { far: 0,
        setFromCamera(v, c){ O.ndc = [v.x, v.y]; O.cam = c && c.name; },
        intersectObjects(list, rec){ O.recurse = rec; O.far = this.far; return over.hits || []; } },
      _clkV2: { x:0, y:0, set(a,b){ this.x=a; this.y=b; } },
      _firstSolidHit: over.solid || ((h) => h.find(x => !x.ghost) || null),
      _lgPropEvent: (o, w, c) => { O.fired = [o.name, w]; O.ctx = c; },
      _propCtx: (o) => ({ x:o.position.x, z:o.position.z, hp:0, hpf:0 }),
    };
    // the reach is LIFTED from source, never restated — a rig that restates a constant keeps passing
    // against a stale copy
    const run = new Function(...Object.keys(env),
      'const CLICK_RANGE = ' + extractConst('CLICK_RANGE', src) + ';\n' + fn + '; return _propClick;')(...Object.values(env));
    return { run, O };
  };

  const prop = (name, sigs) => {
    const o = { name, position:{ x:3, z:-4 }, userData:{ signals: sigs }, parent: null };
    o.mesh = { name: name+'.mesh', parent: o };
    return o;
  };

  // a clickable prop fires, with its payload
  {
    const p = prop('door', [{ when:'clicked', do:'toggle', target:'d1' }]);
    const { run, O } = mk({ props:[p], hits:[{ object:p.mesh }] });
    eq(run({ clientX:400, clientY:300 }), true, 'a prop carrying an On-click signal answers the click');
    eq(JSON.stringify(O.fired), '["door","clicked"]', '...by name, through the prop-event path');
    eq(O.ctx.x, 3, '...carrying its own payload, so `#here` resolves in a click chain (build 1397)');
  }

  // a prop with no click signal is silent — every level that exists is unchanged
  {
    const p = prop('crate', [{ when:'damaged' }]);
    const { run, O } = mk({ props:[p], hits:[{ object:p.mesh }] });
    eq(run({ clientX:400, clientY:300 }), false, 'a prop with other signals is NOT clickable');
    eq(O.fired, null, '...and fires nothing at all');
  }
  {
    const p = prop('plain', undefined);
    const { run } = mk({ props:[p], hits:[{ object:p.mesh }] });
    eq(run({ clientX:1, clientY:1 }), false, 'a prop with no signals at all is silent');
  }

  // the hit walks UP to the prop root, like every other consumer
  {
    const p = prop('rig', [{ when:'clicked' }]);
    const deep = { name:'leaf', parent: { name:'mid', parent: p.mesh } };
    const { run, O } = mk({ props:[p], hits:[{ object: deep }] });
    eq(run({ clientX:0, clientY:0 }), true, 'a hit on a nested mesh resolves to the prop that owns it');
    eq(JSON.stringify(O.fired), '["rig","clicked"]');
  }

  // build 1236: nothing the renderer does not draw may answer a click
  {
    const p = prop('door', [{ when:'clicked' }]);
    const ghost = { name:'volume', parent: p.mesh, ghost:true };
    const { run, O } = mk({ props:[p], hits:[{ object:ghost, ghost:true }] });
    eq(run({ clientX:0, clientY:0 }), false,
      'an invisible collision volume is not clickable — it is not a thing the player can see to click');
    eq(O.fired, null);
  }

  // the cursor decides the ray, and the reach is applied
  {
    const p = prop('d', [{ when:'clicked' }]);
    const free = mk({ props:[p], hits:[{ object:p.mesh }], locked:false });
    free.run({ clientX:600, clientY:150 });
    eq(JSON.stringify(free.O.ndc), '[0.5,0.5]', 'free cursor: the ray goes through the real pointer');
    eq(free.O.far, RANGE, '...bounded by the reach');
    eq(free.O.cam, 'cam', '...from the play camera');
    eq(free.O.recurse, true, '...recursively, since a prop is a subtree');

    const lock = mk({ props:[p], hits:[{ object:p.mesh }], locked:true });
    lock.run({ clientX:600, clientY:150 });
    eq(JSON.stringify(lock.O.ndc), '[0,0]',
      'captured: the crosshair IS the cursor, so the event coordinates are ignored');
  }

  // degenerate inputs cannot throw out of a mousedown handler
  {
    eq(mk({ props:[] }).run({ clientX:0, clientY:0 }), false, 'no props: nothing happens');
    const p = prop('d', [{ when:'clicked' }]);
    eq(mk({ props:[p], hits:[], rect:{ left:0, top:0, width:0, height:0 } }).run({ clientX:0, clientY:0 }), false,
      'a zero-size canvas cannot produce a NaN ray');
    eq(mk({ props:[p], hits:[] }).run({ clientX:0, clientY:0 }), false, 'a miss is a miss');
    const thrower = mk({ props:[p], hits:[{ object:p.mesh }], solid: () => { throw new Error('x'); } });
    let threw = false;
    try { thrower.run({ clientX:0, clientY:0 }); } catch(e){ threw = true; }
    eq(threw, true, 'a throwing filter is NOT swallowed here — only the raycast is guarded');
  }

  assert(/propModels\.filter\(Boolean\)/.test(extractFunction('_clkResolve', src)),
    'the null holes build 1167 leaves in propModels are skipped, or a failed model url takes the click ' +
    'handler down with it');
}

// ---------------------------------------------------------------- 2. where it sits, and what it does NOT do
{
  // NOT scoped by a character count — that is the trap this file records under build 1149, and my first
  // draft walked into it: the block grew and the match came back null.
  const gate = src.match(/if\(shopOpen \|\| editorOpen \|\| paused \|\| mapOpen \|\| duelDead \|\| invOpen \|\| _modalOpen\) return;[\s\S]*?ads = true;/);
  assert(gate, 'the play mousedown handler is found');
  if(!gate) throw new Error('the mousedown gate could not be located — every assertion below it would ' +
    'be measuring nothing');
  assert(/if\(e\.button===0\)\{ if\(!_propClick\(e\)\) _cmClickGround\(e\); \}/.test(gate[0]),
    'the click is resolved on LMB... (build 1481 put click-to-move behind it: a click the world ANSWERS is ' +
    'not also a move order)');
  assert(gate[0].indexOf('_propClick(e)') > gate[0].indexOf('_modalOpen) return;'),
    '...AFTER the gate, so a click cannot reach the world through an open modal, the map, the inventory, ' +
    'the shop, the editor, a pause or while eliminated');
  assert(gate[0].indexOf('_propClick(e)') < gate[0].indexOf('firing=true'),
    '...and before the shot, so a click that opens a door is not lost to the trigger');
  assert(/if\(e\.button===0\)\{ if\(heldProp\)\{ throwHeld\(\); return; \} firing=true; \}/.test(gate[0]),
    'the firing branch is left intact beside it rather than replaced');

  // it does not swallow — the decision, asserted as an absence
  const clickLine = gate[0].slice(gate[0].indexOf('_propClick(e)'));
  assert(!/_propClick\(e\)\)\s*return/.test(clickLine) && !/if\(_propClick/.test(clickLine),
    'a resolved click does NOT return early: it never swallows the shot, because a prop you can no longer ' +
    'shoot with nothing on screen saying so is the surprise a creator cannot undo');
}

// ---------------------------------------------------------------- 3. it is a peer of On E, not of On hit
{
  // `destroyed` and `damaged` are host-gated because they are consequences of the SIMULATION; `interacted`
  // and now `clicked` are local player actions and fire wherever the player is.
  assert(/if\(typeof NET==='undefined' \|\| NET\.mode!=='client'\)\{ try\{ _lgPropEvent\(obj, 'destroyed'/.test(src),
    'destroyed is still host-gated');
  const fn = extractFunction('_clkResolve', src) + extractFunction('_propClick', src);
  assert(!/NET/.test(fn),
    'clicked is NOT — it inherits On E’s locality, and _applySignalAction’s own routing rather than a ' +
    'second one beside it');
  assert(/try\{ fireSignals\(obj, 'interacted'\); \}catch\(e\)\{\}/.test(src),
    '...which is exactly how On E has always fired');
}

// ---------------------------------------------------------------- 4. the locked answer covers it
{
  const fs = extractFunction('fireSignals', src);
  assert(/if\(when==='interacted' \|\| when==='clicked'\)\{/.test(fs),
    'a click at a locked prop says LOCKED — NEEDS X, exactly as E does; silence would read as the prop ' +
    'being broken rather than locked');
  assert(/if\(s\.needItem\)\{/.test(fs), '...through build 706’s existing gate, not a second one');
}

// ---------------------------------------------------------------- 5. the door (1348), and it travels
{
  assert(/\['interacted','On E'\],\['clicked','On click'\],\['contact','On object placed'\]/.test(src),
    'the trigger is offered in the signal editor, beside On E where a creator looking for it would look');
  assert(/clicked:'clicked'/.test(src), '...and the signal summary can name it');

  // build 1397 established there is no allow-list of trigger names anywhere, which is why neither loader
  // needed a line — asserted rather than assumed, because a sanitizer that dropped it would make this a
  // feature that works until you save.
  const san = src.match(/w:String\(s\.when[^\n]*/) || src.match(/when:\s*String\([^\n]*/);
  assert(!/destroyed|interacted|contact/.test(String(san && san[0])),
    'the `when` field round-trips verbatim — no allow-list to add to');
  assert(/_sigPack|SIG_KEYS/.test(src), '...through build 1406’s one table');
}

done('build 1479 (asked for from play): AN "ON CLICK" SIGNAL. Build 1467 gave the player a real mouse cursor and 1468 gave them clickable HUD buttons — and NOTHING IN THE WORLD answered a click. A prop could trigger on being destroyed, on being hit, on being walked up to and having E pressed, or on having something placed on it; a point-and-click adventure, a tycoon where you click a building, a card game whose cards are props and an RTS are all built on the one trigger that was missing. The ray goes through the CURSOR — the real pointer when it is free, screen centre when it is captured, which is where the player is pointing in either case and needs no new state — bounded at a named 60 units, resolved recursively and walked UP to the prop that owns the mesh, with build 1236’s rule carried over so an invisible collision volume inside a GLB is not a thing the player can click. It fires LOCALLY like `interacted` rather than host-gated like `destroyed`, because a click is a local player action, and it inherits that trigger’s authority model and `_applySignalAction`’s own routing rather than inventing a second one — and it carries the prop payload, so `#here` and `#self` resolve in a click chain. It does NOT swallow the shot, and that is the decision rather than an oversight: a prop you can no longer shoot, with nothing on screen saying so, is the surprise a creator cannot undo from the editor, and a level that wants pure point-and-click authors no weapon, which is how this engine already says that. A prop with no On-click signal is silent, so every level ever saved is byte-identical');
