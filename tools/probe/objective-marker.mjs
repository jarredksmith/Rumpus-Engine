// build 1412 — the objective marker, in the live game.
//
// The whole feature is a PROJECTION: a world position becoming a screen position, clamped to the edge
// when the target is out of frame. A Node harness can check the arithmetic in isolation; only the live
// game can say whether the marker lands where the target actually is, through the real camera, at the
// real viewport size — and in particular whether a target BEHIND the player points backwards, which is
// the one case `project()` gets wrong for you by mirroring both axes.
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

    function post(tag, x, z){
      let o = null; spawnProp('box',[x, 0, z, 0,0,0, 1,3,1],(b)=>{o=b;});
      o.userData.tag = tag; return o;
    }
    // Open ground well away from the stock level's own geometry (build 1323's rule).
    const D = 40;
    const north = post('north',  D, -D-40);
    const south = post('south',  D, -D+40);
    const gone  = post('gone',   D+20, -D);

    // aim the player NORTH (-Z). The engine's forward is (-sin yaw, -cos yaw), so yaw 0 faces -Z.
    player.pos.x = D; player.pos.z = -D; player.yaw = 0; player.pitch = 0;
    __drive(2, 1/60);

    function readAll(){
      const host = document.getElementById('objMarkers');
      if(!host) return [];
      return _markers.map(m=>({
        tag: m.tag,
        shown: !!(m.el && m.el.style.display !== 'none'),
        x: m.el ? Math.round(parseFloat(m.el.style.left)) : null,
        y: m.el ? Math.round(parseFloat(m.el.style.top)) : null,
        glyph: m.el ? m.el._gl.textContent : '',
        text: m.el ? m.el._tx.textContent : '',
        col: m.el ? m.el._gl.style.color : '',
        rot: m.el ? (m.el._gl.style.transform || '') : ''
      }));
    }

    R.W = innerWidth; R.H = innerHeight;

    // --- point at something IN FRONT ------------------------------------------------
    R.setOk = _applySignalAction({ do:'marker', mkmode:'show', at:'north', text:'RANGE', mcol:'#38f5b5' }, null) !== false;
    __drive(2, 1/60);
    const a = readAll();
    R.count = a.length;
    R.aheadGlyph = a[0] && a[0].glyph;
    R.aheadText  = a[0] && a[0].text;
    R.aheadCol   = a[0] && a[0].col;
    R.aheadX = a[0] && a[0].x; R.aheadY = a[0] && a[0].y;
    R.aheadNoRot = a[0] && a[0].rot === '';

    // --- and at something BEHIND ----------------------------------------------------
    _applySignalAction({ do:'marker', mkmode:'show', at:'south', text:'PIT' }, null);
    __drive(2, 1/60);
    const b = readAll();
    R.two = b.length;
    const bs = b.filter(m=>m.tag==='south')[0];
    R.behindGlyph = bs && bs.glyph;
    R.behindY = bs && bs.y;
    R.behindRot = bs && bs.rot !== '';
    /* Behind the player and to the RIGHT in world terms: with yaw 0 the target is at +Z, i.e. straight
       back, so the arrow must sit at the BOTTOM of the screen. project() mirrors both axes behind the
       camera; if the flip is missing this lands at the TOP, pointing exactly the wrong way. */
    R.behindAtBottom = bs && bs.y > innerHeight * 0.6;

    // --- the same tag twice is the SAME marker --------------------------------------
    _applySignalAction({ do:'marker', mkmode:'show', at:'north', text:'RANGE 2' }, null);
    __drive(2, 1/60);
    const c = readAll();
    R.stillTwo = c.length;
    R.updated = c.filter(m=>m.tag==='north')[0].text.indexOf('RANGE 2') === 0;

    // --- the label interpolates ------------------------------------------------------
    logicVars['hits'] = 5;
    _applySignalAction({ do:'marker', mkmode:'show', at:'north', text:'Hits {hits}' }, null);
    __drive(2, 1/60);
    R.interp = readAll().filter(m=>m.tag==='north')[0].text.indexOf('Hits 5') === 0;

    // --- distance is real -------------------------------------------------------------
    R.distText = readAll().filter(m=>m.tag==='south')[0].text;

    // --- it TRACKS a moving prop ------------------------------------------------------
    const beforeX = readAll().filter(m=>m.tag==='north')[0].x;
    north.position.x += 30; __drive(2, 1/60);
    R.tracked = readAll().filter(m=>m.tag==='north')[0].x !== beforeX;
    north.position.x -= 30;

    // --- hide one, clear all ------------------------------------------------------------
    _applySignalAction({ do:'marker', mkmode:'hide', at:'south' }, null);
    __drive(2, 1/60);
    R.afterHide = _markers.map(m=>m.tag).join(',');
    R.hostChildren = document.getElementById('objMarkers').children.length;

    // --- a destroyed target takes its marker with it -------------------------------------
    _applySignalAction({ do:'marker', mkmode:'show', at:'gone' }, null);
    const gi = propModels.indexOf(gone); if(gi>=0) removeProp(gi);
    __drive(3, 1/60);
    R.deadShown = readAll().filter(m=>m.tag==='gone').map(m=>m.shown)[0];

    // --- refusals ------------------------------------------------------------------------
    const before = _markers.length;
    R.badTag = _applySignalAction({ do:'marker', mkmode:'show', at:'nosuchtag' }, null);
    R.badNoAdd = _markers.length === before;
    R.reported = logicFailures.size > 0;

    // --- the cap --------------------------------------------------------------------------
    _markersClear();
    for(let i=0;i<12;i++){ const t='cap'+i; post(t, D+2+i, -D-6); _applySignalAction({ do:'marker', mkmode:'show', at:t }, null); }
    R.capped = _markers.length;

    // --- the editor hides them, and a deploy clears them ------------------------------------
    editorOpen = true; __drive(2, 1/60);
    R.hiddenInEditor = readAll().every(m=>!m.shown);
    editorOpen = false; __drive(2, 1/60);
    R.backAfterEditor = readAll().some(m=>m.shown);

    _markersClear();
    R.cleared = _markers.length === 0 && document.getElementById('objMarkers').children.length === 0;

    // --- teardown ---------------------------------------------------------------------------
    for(const o of propModels.slice()){ if(o && o.userData && /^(north|south|gone|cap\\d+)$/.test(o.userData.tag||'')){ const i=propModels.indexOf(o); if(i>=0) removeProp(i); } }
    delete logicVars['hits']; logicFailures.clear();
    __release();
    return R;
  })()`);

  P(r.setOk && r.count === 1, 'the verb puts a marker up', r.count);
  P(r.aheadGlyph === '◆', 'a target IN FRAME gets a diamond, not an arrow', r.aheadGlyph);
  P(r.aheadNoRot, '...with no rotation, because it is not pointing anywhere');
  P(/^RANGE\s+\d+m$/.test(r.aheadText || ''), '...its label and a real distance', r.aheadText);
  P(/38\s*,?\s*245|#38f5b5|rgb\(56, 245, 181\)/.test(r.aheadCol || ''), '...in the authored colour', r.aheadCol);
  P(r.aheadX > r.W * 0.3 && r.aheadX < r.W * 0.7 && r.aheadY > 0 && r.aheadY < r.H,
    '...and it lands near screen centre, because the player is looking straight at it',
    r.aheadX + ',' + r.aheadY + ' of ' + r.W + 'x' + r.H);
  P(r.two === 2, 'a second marker joins rather than replacing', r.two);
  P(r.behindGlyph === '▲', 'a target BEHIND you gets an arrow', r.behindGlyph);
  P(r.behindRot, '...rotated to point at it');
  P(r.behindAtBottom,
    '...at the BOTTOM of the screen, where the target actually is — project() mirrors both axes behind ' +
    'the camera, so without the flip this points exactly the wrong way',
    'y ' + r.behindY + ' of ' + r.H);
  P(r.stillTwo === 2 && r.updated, 'the same tag twice is the SAME marker, updated — an interval that re-marks cannot fill the cap');
  P(r.interp, 'the label interpolates a live variable, like a sign and a HUD widget');
  P(/\d+m$/.test(r.distText || ''), 'the distance is metres to the target', r.distText);
  P(r.tracked, 'and it TRACKS — moving the prop moves the marker');
  P(r.afterHide === 'north' && r.hostChildren === 1, 'hide drops one and takes its element with it', r.afterHide);
  P(r.deadShown === false, 'a destroyed target stops being pointed at rather than freezing over a corpse');
  /* `_applySignalAction` returns nothing, like every other world verb — so the contract a creator can
     see is the one to test: no marker was added, and the Level Check says why. */
  P(r.badNoAdd && r.reported,
    'a tag nothing answers to is REFUSED and reported (1214) — an arrow pointing nowhere is worse than none',
    'added ' + (!r.badNoAdd) + ', reported ' + r.reported);
  P(r.capped === 8, 'the set is capped', r.capped);
  P(r.hiddenInEditor, 'the editor hides them — a marker over the thing being edited is noise');
  P(r.backAfterEditor, '...and they come back on the way out');
  P(r.cleared, 'and clear-all removes every element, not just the entries');
}, { settleMs: 2500 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
