// The county-fair hub — builds 1410, 1411 and 1412 driven TOGETHER, the way a gauntlet uses them.
//
// Each of the three shipped with its own probe and each passed alone. This asks the question none of
// those could: do they compose? A fair hub is signs labelling booths, markers pointing at those booths,
// a live score on both, and the camera changing per booth — all at once, with the same tags.
//
// Nothing here is a new feature. Everything it finds is an integration defect, which is the class the
// single-feature probes structurally cannot reach.
import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

const out = [];
const P = (ok, what, detail) => { out.push({ ok, what, detail }); };

await withGame(async (probe) => {
  const r = await probe(DRIVE_RIG + `
  (function(){
    const R = {}, made = [];
    __ungate();
    gameCfg.objective = 'puzzle';
    __wavesOff(); __clearEnemies();

    function prop(kind, tag, x, z, sy){
      let o = null; spawnProp(kind,[x, 0, z, 0,0,0, 2, sy||3, 1],(b)=>{o=b;});
      if(!o) throw new Error('spawnProp did not build synchronously: ' + kind);
      o.userData.tag = tag; made.push(o); return o;
    }

    /* THREE BOOTHS, well clear of the stock level (build 1323's rule), each with a sign, a post the
       marker points at, and — for the range — a bank of two security cameras under one tag. */
    const B = [
      { tag:'range',   x: 40, z:-40 },
      { tag:'physics', x:-40, z:-40 },
      { tag:'course',  x:  0, z: 45 }
    ];
    for(const b of B){
      b.post = prop('box', b.tag, b.x, b.z);
      b.sign = prop('sign', b.tag+'Sign', b.x+3, b.z);
      Object.assign(b.sign.userData.sign, { text: b.tag.toUpperCase() + '\\nHits {hits}' });
      _signRender(b.sign);
    }
    const cam1 = prop('box','seccam', 44, -46, 1); cam1.position.y = 6;
    const cam2 = prop('box','seccam', 36, -46, 1); cam2.position.y = 6;

    player.pos.x = 0; player.pos.z = 0; player.yaw = 0; player.pitch = 0;
    logicVars['hits'] = 0;
    __drive(20, 1/60);

    /* ---- 1. a tag can be BOTH a marker target and a sign's neighbour ------------------ */
    for(const b of B) _applySignalAction({ do:'marker', mkmode:'show', at:b.tag, text:b.tag.toUpperCase() }, null);
    __drive(20, 1/60);
    R.markers = _markers.length;
    R.markerTags = _markers.map(m=>m.tag).sort().join(',');
    R.signsDrawn = B.filter(b=>b.sign.material && b.sign.material.map).length;

    /* ---- 2. one variable, two surfaces, both live ------------------------------------- */
    function signText(b){ return String(b.sign.userData._signKey||'').split('|')[0]; }
    function markerText(t){ const m=_markers.filter(x=>x.tag===t)[0]; return m && m.el ? m.el._tx.textContent : ''; }
    R.sign0 = signText(B[0]);
    logicVars['hits'] = 7;
    __drive(30, 1/60);
    R.sign7 = signText(B[0]);
    R.marker7 = markerText('range');   /* the marker's own label has no {var} here — it must NOT change */

    /* and a marker label that DOES interpolate follows the same variable */
    _applySignalAction({ do:'marker', mkmode:'show', at:'range', text:'RANGE {hits}' }, null);
    __drive(4, 1/60);
    R.markerInterp = markerText('range');

    /* ---- 3. the camera bank runs while markers are up --------------------------------- */
    _applySignalAction({ do:'view', vmode:'fixed', vtag:'seccam', vtrack:1, vdwell:'1' }, null);
    __drive(4, 1/60);
    R.viewNow = _viewNow();
    R.bankSize = _viewOv && _viewOv.mounts ? _viewOv.mounts.length : 0;

    /* Markers must still project — through the MOUNTED camera, which is not where the player is.
       Sample across two dwells so at least one cut happens underneath them. */
    const seen = [];
    for(let i=0;i<12;i++){
      __drive(20, 1/60);
      seen.push({
        cam: [Math.round(camera.position.x), Math.round(camera.position.z)],
        mk: _markers.map(m=>m.el && m.el.style.display!=='none' ? [Math.round(parseFloat(m.el.style.left)), Math.round(parseFloat(m.el.style.top))] : null)
      });
    }
    R.camCuts = [...new Set(seen.map(s=>s.cam.join(',')))].length;
    R.allShown = seen.every(s=>s.mk.every(p=>p !== null));
    R.allOnScreen = seen.every(s=>s.mk.every(p=>p[0] >= 0 && p[0] <= innerWidth && p[1] >= 0 && p[1] <= innerHeight));
    /* the markers must MOVE when the camera cuts — otherwise they are projecting through a stale camera */
    R.movedOnCut = new Set(seen.map(s=>s.mk[0].join(','))).size > 1;

    /* ---- 4. and through a TOP-DOWN view too ------------------------------------------- */
    _applySignalAction({ do:'view', vmode:'top' }, null);
    __drive(20, 1/60);
    R.topView = _viewNow();
    R.topShown = _markers.every(m=>m.el && m.el.style.display!=='none');
    R.topOnScreen = _markers.every(m=>{ const x=parseFloat(m.el.style.left), y=parseFloat(m.el.style.top);
      return x>=0 && x<=innerWidth && y>=0 && y<=innerHeight; });

    /* ---- 5. destroying a booth takes its marker and leaves the others -------------------- */
    _applySignalAction({ do:'view', vmode:'normal' }, null);
    __drive(4, 1/60);
    const pi = propModels.indexOf(B[2].post); if(pi>=0) removeProp(pi);
    __drive(10, 1/60);
    R.afterKill = _markers.filter(m=>m.el && m.el.style.display!=='none').length;
    R.survivors = _markers.filter(m=>m.el && m.el.style.display!=='none').map(m=>m.tag).sort().join(',');
    R.otherSignsFine = B.slice(0,2).every(b=>b.sign.material && b.sign.material.map);

    /* ---- 6. a deploy clears the play state and leaves the level alone -------------------- */
    logicStart();
    __drive(6, 1/60);
    R.afterDeployMarkers = _markers.length;
    R.afterDeployView = _viewNow();
    R.signsSurvive = B.slice(0,2).every(b=>propModels.indexOf(b.sign) >= 0 && b.sign.material.map);

    /* ---- 7. it all round-trips through the serializer ------------------------------------ */
    const e = propEntry(B[0].sign);
    R.serialized = !!(e.sgn && e.sgn.text.indexOf('{hits}') > 0 && e.tg === 'rangeSign');

    /* ---- teardown ------------------------------------------------------------------------ */
    _markersClear();
    for(const o of made){ const i = propModels.indexOf(o); if(i>=0) removeProp(i); }
    delete logicVars['hits'];
    logicFailures.clear();
    R.leftOver = propModels.filter(o=>o&&o.userData&&/^(range|physics|course|seccam)/.test(o.userData.tag||'')).length;
    __release();
    return R;
  })()`);

  P(r.markers === 3 && r.markerTags === 'course,physics,range',
    'three booths, three markers — a tag serves the marker and the sign beside it at once', r.markerTags);
  P(r.signsDrawn === 3, 'and all three signs drew', r.signsDrawn);

  P(r.sign0.indexOf('Hits 0') > 0, 'a booth sign shows the live score', JSON.stringify(r.sign0));
  P(r.sign7.indexOf('Hits 7') > 0, '...and follows it', JSON.stringify(r.sign7));
  P(/^RANGE\s+\d+m$/.test(r.marker7 || ''),
    '...while a marker whose label has no variable in it does NOT change', r.marker7);
  P(/^RANGE 7\s+\d+m$/.test(r.markerInterp || ''),
    '...and one that does resolves the SAME variable through the same interpolation', r.markerInterp);

  P(r.viewNow === 'fixed' && r.bankSize === 2, 'the security bank arms with markers already up', r.bankSize);
  P(r.camCuts >= 2, 'the bank cuts between its two mounts underneath them', r.camCuts);
  P(r.allShown, 'every marker stays visible through a mounted camera');
  P(r.allOnScreen, '...and inside the viewport, clamped');
  P(r.movedOnCut, '...and MOVES when the camera cuts, so it is projecting through the live camera');

  P(r.topView === 'top', 'switching to top-down');
  P(r.topShown && r.topOnScreen, '...markers survive that too', r.topOnScreen);

  P(r.afterKill === 2 && r.survivors === 'physics,range',
    'destroying one booth drops only its marker', r.survivors);
  P(r.otherSignsFine, '...and leaves the other signs drawn');

  P(r.afterDeployMarkers === 0 && r.afterDeployView === 'fps',
    'a deploy clears the markers and the camera override — both are play state');
  P(r.signsSurvive, '...and leaves the SIGNS, which are level content, untouched');
  P(r.serialized, 'and the sign round-trips with its tag and its live text');
  P(r.leftOver === 0, 'teardown removed every fixture', r.leftOver);
}, { settleMs: 2500 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
