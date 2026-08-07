// build 1425 — does Level Check say the level is too heavy BEFORE you publish it?
//
// Builds 1257 and 1353 made the light budget and texture memory visible on the grounds that they are the
// numbers a creator "most needs and could least discover". Geometry — the third thing content grows — was
// reported nowhere: `levelIssues` mentioned triangles zero times.
//
// The report that produced this build: a 497,912-triangle ramp compressed to 1.72 MB, in a level reaching
// 30 MILLION triangles a frame, with nothing anywhere saying so.
//
// The control at every step is the stock level, which must stay silent — a panel that always complains is
// not read (build 1274).
import { withGame } from './driver.mjs';

const out = [];
const P_ = (ok, what, detail) => out.push({ ok, what, detail });

await withGame(async (P) => {
  const rows = () => P(`levelIssues().filter(m=>/triangle/.test(m))`);
  const census = () => P(`(function(){ const g=_geoCensus();
    return { tris:g.tris, props:g.props, over:g.over, worst:g.worst, worstTris:g.worstTris,
             perModelCap:MOBILE_TRI_BUDGET, levelCap:LEVEL_TRI_SOFT_CAP }; })()`);

  const base = await census();
  console.log('\nstock level    ', JSON.stringify(base));
  P_(base.tris > 0 && base.props > 0, 'the census counts the stock level', [base.tris, base.props]);
  P_(base.over === 0, '...and nothing in it is over the per-model budget', base.over);

  const quiet = await rows();
  P_(quiet.length === 0, 'CONTROL: the stock level says nothing about triangles', quiet);

  // ---- one prop the size of the reported ramp -------------------------------------------------
  const heavy = await P(`(function(){
    const N = 497912;                                  /* the reported model, exactly */
    const pos = new Float32Array(N*9);
    for(let i=0;i<N*9;i+=9){ const x=(i%97)*0.01;
      pos[i]=x; pos[i+1]=0; pos[i+2]=0; pos[i+3]=x+0.01; pos[i+4]=0; pos[i+5]=0;
      pos[i+6]=x; pos[i+7]=0.01; pos[i+8]=0; }
    const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos,3));
    const grp=new THREE.Group(); grp.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial()));
    grp.position.set(400,0,400);
    grp.userData={ src:'https://example.invalid/WoodenRampoptimized.glb', nid:'heavy1', name:'Wooden Ramp' };
    scene.add(grp); propModels.push(grp); window.__heavy=grp;
    return { added:true };
  })()`);
  const c2 = await census();
  console.log('+ the ramp     ', JSON.stringify(c2));
  P_(c2.over === 1, 'one model is flagged over the per-model budget', c2.over);
  P_(c2.worstTris === 497912, '...and it is measured exactly, not estimated', c2.worstTris);
  P_(c2.worst === 'Wooden Ramp', '...and NAMED, so the row is actionable rather than a scolding', c2.worst);
  P_(c2.perModelCap === 40000,
    'the threshold is the engine’s OWN optimizer target, not a number invented for this row', c2.perModelCap);

  const r2 = await rows();
  console.log('\nthe row        ', JSON.stringify(r2).slice(0, 320));
  P_(r2.length === 1, 'Level Check reports it', r2.length);
  P_(/497,912/.test(r2[0] || ''), '...with the real figure', true);
  P_(/Wooden Ramp/.test(r2[0] || ''), '...naming the model', true);
  P_(/File size does not warn you/.test(r2[0] || ''),
    '...and saying why the file size did not warn them — which is the whole trap', true);
  P_(/Optimize/.test(r2[0] || ''), '...and naming the fix, one button away', true);

  // the row must be CLICKABLE, and resolve to the offender (build 1300)
  const click = await P(`(function(){
    const msg = levelIssues().filter(m=>/triangle/.test(m))[0];
    const f = _issueFind.get(msg);
    if(!f) return { clickable:false };
    const got = f();
    return { clickable:true, resolves:got.length, isTheRamp: got[0]===__heavy };
  })()`);
  P_(click.clickable && click.resolves === 1 && click.isTheRamp,
    'the row takes you to the offending prop (build 1300)', click);

  // ---- and the level-total path, which only fires when no single model is the problem ---------
  const many = await P(`(function(){
    const i = propModels.indexOf(__heavy); if(i>=0){ scene.remove(__heavy); propModels.splice(i,1); }
    /* 60 props of 39,000 triangles each: every one UNDER the per-model cap, 2.34M in total */
    window.__many = [];
    for(let k=0;k<60;k++){
      const N=39000, pos=new Float32Array(N*9);
      const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos,3));
      const grp=new THREE.Group(); grp.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial()));
      grp.position.set(400+k, 0, 400); grp.userData={ src:'p'+k, nid:'m'+k };
      scene.add(grp); propModels.push(grp); __many.push(grp);
    }
    return _geoCensus();
  })()`);
  console.log('\n60 x 39k props ', JSON.stringify({ tris: many.tris, over: many.over }));
  P_(many.over === 0, 'no single model is over the per-model budget', many.over);
  const r3 = await rows();
  P_(r3.length === 1 && /draws about/.test(r3[0] || ''),
    '...so the LEVEL TOTAL is what gets reported instead', r3[0] && r3[0].slice(0, 80));
  P_(/Cull below \(px\)/.test(r3[0] || ''),
    '...naming the control that actually exists — I first wrote a label the editor does not have', true);

  // ---- back to silence ------------------------------------------------------------------------
  const back = await P(`(function(){
    for(const o of __many){ const i=propModels.indexOf(o); if(i>=0){ scene.remove(o); propModels.splice(i,1); } }
    return { rows: levelIssues().filter(m=>/triangle/.test(m)).length, census: _geoCensus().tris };
  })()`);
  P_(back.rows === 0, 'CONTROL RETURNS: remove them and the panel is quiet again', back);
}, { settleMs: 4500 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   ' + String(JSON.stringify(o.detail)).slice(0, 150) : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
