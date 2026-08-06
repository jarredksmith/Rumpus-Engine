// build 1411 — the sign, in the live game.
//
// A canvas texture is the one thing a Node harness structurally cannot check: it can prove the maths
// and the wiring, and only a real 2D context can say whether anything was actually DRAWN. So this probe
// reads the canvas back and counts non-background pixels — and, for the live scoreboard, checks that the
// pixels CHANGE when the variable does, with a static sign beside it as the control.
import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

const out = [];
const P = (ok, what, detail) => { out.push({ ok, what, detail }); };

await withGame(async (probe) => {
  const r = await probe(DRIVE_RIG + `
  (function(){
    const R = {};
    __ungate();
    gameCfg.objective = 'puzzle';
    __wavesOff(); __clearEnemies();

    function sign(x, z, text, extra){
      let o = null; spawnProp('sign',[x, 3, z, 0,0,0, 4,2,1],(b)=>{o=b;});
      if(!o) throw new Error('spawnProp did not build a sign synchronously');
      Object.assign(o.userData.sign, { text }, extra||{});
      _signRender(o);
      return o;
    }
    // --- it is a primitive, and every table knows it -------------------------------
    R.inBuilders = typeof PRIMITIVE_BUILDERS.sign === 'function';
    R.isPrim     = isPrimitive('sign');
    R.notShape   = !isShapePrimitive('sign');     // -> excluded from instancing with no code
    R.notMat     = !isMatPrimitive('sign');       // -> excluded from the colour/texture panel
    R.inShapes   = PRIM_SHAPES.some(s=>s[0]==='sign');
    R.hasIcon    = !!PRIM_ICON.sign;

    // --- a static sign draws --------------------------------------------------------
    const a = sign(40, -40, 'SHOOTING RANGE');
    R.src      = a.userData.src;
    R.hasMap   = !!(a.material && a.material.map);
    R.basic    = a.material && a.material.type === 'MeshBasicMaterial';
    R.doubled  = a.material && a.material.side === THREE.DoubleSide;
    R.noCol    = !!a.userData.noCol;
    R.boxes    = (a.userData.boxes||[]).length;
    R.noRay    = a.raycast !== THREE.Mesh.prototype.raycast;   /* refreshPropCollider stamped _ncNoRay */
    /* and unticking it gives the sign its collision AND its hits back — one writer, both directions */
    delete a.userData.noCol; refreshPropCollider(a);
    R.solidBoxes = (a.userData.boxes||[]).length;
    R.rayBack = a.raycast === THREE.Mesh.prototype.raycast;
    a.userData.noCol = true; refreshPropCollider(a);

    // count text pixels: anything that is not the board colour
    function inkOf(o){
      const cv = o.userData._signCv, cx = cv.getContext('2d');
      const d = cx.getImageData(0,0,cv.width,cv.height).data;
      let ink = 0;
      for(let i=0;i<d.length;i+=4){ if(d[i]>200 && d[i+1]>200 && d[i+2]>200 && d[i+3]>200) ink++; }
      return ink;
    }
    R.wh = [a.userData._signCv.width, a.userData._signCv.height];
    R.aspect = +(R.wh[0]/R.wh[1]).toFixed(2);   // the prop is 4x2, so the canvas should be ~2:1
    R.ink = inkOf(a);

    const blank = sign(44, -40, '');
    R.blankInk = inkOf(blank);

    // --- the canvas follows the SCALE, not a fixed shape ----------------------------
    const tall = sign(48, -40, 'X'); tall.scale.set(1, 4, 1); _signRender(tall);
    R.tallAspect = +(tall.userData._signCv.width/tall.userData._signCv.height).toFixed(2);

    // --- a LIVE sign is a scoreboard ------------------------------------------------
    logicVars['hits'] = 0;
    const live = sign(52, -40, 'Hits {hits}');
    const stat = sign(56, -40, 'Hits 0');           // the CONTROL: same pixels, no braces
    const liveInk0 = inkOf(live), statInk0 = inkOf(stat);
    R.liveMatchesStatic = liveInk0 === statInk0;    // "{hits}" resolved to "0"

    logicVars['hits'] = 7;
    __drive(20, 1/60);                               // past the 4 Hz tick
    R.liveInkMoved = inkOf(live) !== liveInk0;
    R.staticHeld   = inkOf(stat) === statInk0;       // the control must NOT move
    R.liveKeyHas7  = String(live.userData._signKey||'').indexOf('Hits 7') === 0;

    // and it settles: no further work once the variable stops moving
    const settled = live.userData._signKey;
    __drive(40, 1/60);
    R.stableKey = live.userData._signKey === settled;

    // --- per-player scoping goes through the HUD's resolver, not the graph's ---------
    logicVars['coins@' + NET.myId] = 42;
    const mine = sign(60, -40, '{coins@}');
    R.perPlayer = String(mine.userData._signKey||'').indexOf('42|') === 0;

    // --- hostile input --------------------------------------------------------------
    const h = _signCfgSan({ text:'x'.repeat(5000), size:1e9, color:'javascript:alert(1)', bg:'</style>', bga:99, align:'evil' });
    R.san = [h.text.length, h.size, h.color, h.bg, h.bga, h.align];

    // --- the round trip -------------------------------------------------------------
    a.userData.sign.size = 90; a.userData.sign.align = 'left'; _signRender(a);
    const e = propEntry(a);
    R.wrote = e.sgn && [e.sgn.text, e.sgn.size, e.sgn.align];
    let back = null; spawnProp('sign',[70,3,-40, 0,0,0, 4,2,1],(b)=>{back=b;});
    _applyPropEntry(back, e);
    R.read = [back.userData.sign.text, back.userData.sign.size, back.userData.sign.align];
    R.readInk = inkOf(back) > 0;

    // --- teardown --------------------------------------------------------------------
    for(const o of [a, blank, tall, live, stat, mine, back]){ const i = propModels.indexOf(o); if(i>=0) removeProp(i); }
    delete logicVars['hits']; delete logicVars['coins@' + NET.myId];
    __release();
    return R;
  })()`);

  P(r.inBuilders && r.isPrim, 'a sign is a primitive, so every editor door already serves it (1320)');
  P(r.inShapes && r.hasIcon, '...and it is in the shape table and has an icon');
  P(r.notShape, 'it is NOT in SHAPE_PRIMS, so instancing excludes it with no code — each sign owns a canvas');
  P(r.notMat, '...nor in MAT_PRIMS, so the colour/texture panel does not fight the sign panel');
  P(r.basic && r.doubled, 'unlit and double-sided: readable in a dark corner, impossible to lose from behind');
  P(r.hasMap, 'the board carries a texture');
  P(r.ink > 500, 'and there are real text pixels on it', r.ink);
  P(r.blankInk === 0, 'an empty sign draws no text at all — the ink count is measuring text', r.blankInk);
  P(r.noCol && r.boxes === 0 && r.noRay,
    'a label does not stop bullets or make enemies path around it (build 1324\'s noCol, on by default)',
    'boxes ' + r.boxes);
  P(r.solidBoxes === 1 && r.rayBack,
    '...and unticking it gives the board a real collider and its hits back, both from the one writer',
    'boxes ' + r.solidBoxes);
  P(Math.abs(r.aspect - 2) < 0.2, 'the canvas follows the prop\'s 4x2 scale, so text is not stretched', r.aspect);
  P(r.tallAspect < 0.6, '...and a tall sign gets a tall canvas', r.tallAspect);
  P(r.liveMatchesStatic, '"Hits {hits}" with hits=0 renders EXACTLY the same pixels as the literal "Hits 0"');
  P(r.liveInkMoved && r.liveKeyHas7, 'setting hits=7 repaints the board within the tick — a live scoreboard');
  P(r.staticHeld, '...while the static control beside it does not move a pixel');
  P(r.stableKey, '...and it stops working the moment the variable does');
  P(r.perPlayer, '{coins@} resolves through the HUD\'s per-player key, not the graph event\'s (1287)');
  P(String(r.san) === '240,200,#eafff7,#0b1418,1,center',
    'hostile text/size/colour/alpha/align all clamp to something drawable', String(r.san));
  P(r.wrote && r.wrote[1] === 90 && r.wrote[2] === 'left', 'the sign serializes', JSON.stringify(r.wrote));
  P(String(r.read) === 'SHOOTING RANGE,90,left', '...and comes back through the one apply site', String(r.read));
  P(r.readInk, '...already drawn, not blank until something touches it');
}, { settleMs: 2500 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
