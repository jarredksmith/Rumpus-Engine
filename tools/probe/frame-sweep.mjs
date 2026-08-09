// build 1460 — the two per-frame costs, measured in the live game.
//
// The unit test drives the functions. This counts what a real frame actually pays, on a real level, and
// includes the item that was DECLINED so the decision rests on a number rather than a hunch.
import { withGame } from './driver.mjs';

const P = (s) => `(function(){ ${s} })()`;

await withGame(async (probe) => {
  const say = (k, v) => console.log(String(k).padEnd(30), JSON.stringify(v));

  const r = await probe(P(`
    const R = {};
    paused = true; _tabHidden = true;

    let seed = 77; const rnd = () => (seed = (seed*1103515245+12345) & 0x7fffffff)/0x7fffffff;
    const before = propModels.length;
    for(let i = 0; i < 500; i++){
      const a = rnd()*Math.PI*2, d = 30 + rnd()*200;
      spawnProp('box', [Math.cos(a)*d, 0, Math.sin(a)*d, 0, rnd()*3, 0, 1.5, 2, 1.5]);
    }
    R.props = propModels.length;
    R.added = propModels.length - before;

    /* ---- 1. the LOD tick: count traverses with ONE prop levelled, as the audit's case has it ---- */
    let traverses = 0;
    const wrap = (o) => { if(o.__wrapped) return; o.__wrapped = 1; const t = o.traverse.bind(o);
      o.traverse = function(fn){ traverses++; return t(fn); }; };
    for(const o of propModels) if(o) wrap(o);

    /* pretend one prop carries a level, exactly as the simplifier would leave it */
    const victim = propModels[10];
    victim.userData._hasGeoLod = true;
    const savedN = _lodGeoN; _lodGeoN = 1;
    const savedEd = editorOpen; editorOpen = false;

    _lodGeoCursor = 0;
    traverses = 0; _lodGeoTick(); const withFlag = traverses;

    /* and the pre-1460 behaviour, replayed: no flag means every examined prop traversed */
    delete victim.userData._hasGeoLod;
    traverses = 0;
    { const n = propModels.length, lim = Math.min(n, 128);
      for(let i = 0; i < lim; i++){ const o = propModels[i]; if(o && o.traverse) o.traverse(()=>{}); } }
    const without = traverses;

    /* the cursor ROLLS (LOD_BUDGET props a frame), so the control has to look at the same window or it
       examines a different 128 props and legitimately finds nothing. My first run asserted 1 and got 0
       for exactly that reason — the engine was right and the control was pointed elsewhere. */
    victim.userData._hasGeoLod = true;
    _lodGeoCursor = 0;
    traverses = 0; _lodGeoTick(); const control = traverses;
    _lodGeoN = savedN; editorOpen = savedEd;
    R.lod = { pre1460: without, post1460: withFlag, control: control, budget: 128 };

    /* ---- 2. the vehicle walk: the DECLINED item, measured ---- */
    let vehIter = 0;
    { const t0 = performance.now();
      for(let f = 0; f < 600; f++){ for(const p of propModels){ vehIter++; if(p && p.userData && p.userData.vehicle){} } }
      R.vehicle = { propsPerFrame: propModels.length, iterations600Frames: vehIter,
                    msFor600Frames: +(performance.now()-t0).toFixed(2) };
      R.vehicle.msPerFrame = +(R.vehicle.msFor600Frames/600).toFixed(4);
    }
    return R;
  `));

  say('props in the level', { total: r.props, added: r.added });
  console.log('');
  say('LOD traverses per frame', r.lod);
  console.log('   -> one levelled model cost ' + r.lod.pre1460 + ' traverses a frame; it now costs ' + r.lod.post1460);
  console.log('');
  say('the DECLINED vehicle walk', r.vehicle);
  console.log('   -> ' + r.vehicle.msPerFrame + ' ms/frame over ' + r.vehicle.propsPerFrame +
              ' props. Arithmetic, not a hotspot — which is why it was left alone.');

  const ok = r.lod.pre1460 >= 100 && r.lod.post1460 === 1 && r.lod.control === 1
          && r.vehicle.msPerFrame < 0.1;
  console.log('\n' + (ok ? 'PASS' : 'FAIL') + ' — the LOD tick skips props with no level; the vehicle walk is measured arithmetic');
  if (!ok) process.exitCode = 1;
}, { settleMs: 3000 });
