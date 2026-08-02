// How big is the 20Hz world snapshot, really? The backpressure threshold has to be stated in terms of it —
// "how many snapshots deep may a client's send queue get before we stop feeding it" is the only unit that
// means anything here.
import { withGame } from './driver.mjs';
await withGame(async (P, page) => {
  console.log(JSON.stringify(await P(`(function(){
    /* serializeWorld only fills in what exists, so give it a realistic population first */
    const out={ enemies:(typeof enemies!=='undefined')?enemies.length:0, props:propModels.length,
                dyn:dynamicProps.length, coins:(typeof coins!=='undefined')?coins.length:0 };
    const sizes=[];
    for(let i=0;i<24;i++){ const w=serializeWorld(); sizes.push({ full:!w.dl, n:JSON.stringify(w).length }); }
    out.keyframes = sizes.filter(s=>s.full).map(s=>s.n);
    out.deltas = sizes.filter(s=>!s.full).map(s=>s.n);
    out.keyframeMax = Math.max.apply(null, out.keyframes.concat([0]));
    out.deltaMax = Math.max.apply(null, out.deltas.concat([0]));
    out.perSecond = Math.round((out.keyframeMax + 9*out.deltaMax) / 10 * 20);
    return out;
  })()`), null, 1));
}, { settleMs: 8000 });
