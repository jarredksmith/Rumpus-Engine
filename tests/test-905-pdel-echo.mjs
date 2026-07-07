// (build 905) DUEL-HOST PROPS VANISHED ("only shadows and no meshes on mine"). netApplyAddProp claims
// NET.sentProps immediately but spawns the model ASYNC — the reconciler's missing-check then read
// "claimed but still downloading" as "deleted here" and answered every incoming pAdd of a slow model
// with {t:'pDel'} within one 0.08s tick, deleting the SENDER's prop. A host that finished loading its
// big models after the client connected (hard refresh -> slow re-downloads) watched its own level get
// emptied while the static shadow map kept the baked shadows painted on the ground. Fix: an in-flight
// nid registry (_nidPending) the reconciler skips; a pDel that races the download flags the entry so
// the landing object is discarded instead of resurrected. Bonus: finalizeProp regenerates DUPLICATE
// nids from stored levels (props copied across saves) so nid-keyed sync can't hit the wrong prop.
import { gameSource, extractFunction, evalDecl, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- wiring pins ----
const addFn = extractFunction('netApplyAddProp', src);
assert(/_nidSpawnStart\(d\.nid\);/.test(addFn), 'netApplyAddProp marks the spawn in flight');
assert(/if\(_nidSpawnEnd\(d\.nid, obj\)\) return;/.test(addFn), 'a pDel that raced the download discards the landing object');
assert((src.match(/_nidSpawnStart\(p\.nid\); spawnProp\(p\.src, p\.t/g)||[]).length===2,
  'BOTH level loaders (loadLevelFromNet + restoreLevel) track their spawns as in flight');
assert(/if\(nid && typeof propByNid==='function' && propByNid\(nid\)\) nid = genNid\(\);/.test(extractFunction('finalizeProp', src)),
  'finalizeProp regenerates a nid already owned by another live prop (duplicate nids in stored levels)');

// ---- executable: the reconciler never pDels a claim whose model is still downloading ----
const mkRecon = (sentProps, pending, props)=>{
  const sent=[];
  const f=evalDecl(extractFunction('reconcileProps', src), 'reconcileProps', {
    NET:{ mode:'client', sentProps },
    propSyncTimer:0,
    propModels:props,
    _nidPending:pending,
    _remoteDrivenNids:{},
    netSendProp:(m)=>sent.push(m),
    propTuple:(o)=>o.userData.tup,
    propEntry:(o)=>({ nid:o.userData.nid }),
    tupleEq:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
  });
  f(1);
  return sent;
};
const TUP=[0,0,0,0,0,0,1,1,1];
{ // claimed + still downloading -> silence, claim retained
  const sp=new Map([['h-1',TUP.slice()]]), pend=new Map([['h-1',{del:false}]]);
  const sent=mkRecon(sp, pend, []);
  eq(sent.length, 0, 'in-flight claim: no pDel while the model is downloading');
  assert(sp.has('h-1'), 'in-flight claim survives (the peer keeps its prop)');
}
{ // claimed + NOT downloading -> a real local delete still propagates
  const sp=new Map([['h-2',TUP.slice()]]);
  const sent=mkRecon(sp, new Map(), []);
  eq(sent.length, 1, 'genuinely removed prop still emits exactly one message');
  eq(sent[0] && sent[0].t, 'pDel', '...and it is the pDel');
  assert(!sp.has('h-2'), '...and the claim is dropped');
}
{ // landed prop without a claim -> normal pAdd catch-up (the late-loading host prop path)
  const o={ userData:{ nid:'h-3', tup:TUP.slice() } };
  const sent=mkRecon(new Map(), new Map(), [o]);
  eq(sent.length, 1, 'a late-landing prop is announced once');
  eq(sent[0] && sent[0].t, 'pAdd', '...as a pAdd');
}

// ---- executable: pDel racing the download flags the entry; the landing object is discarded ----
{
  const delFn=evalDecl(extractFunction('netApplyDelProp', src), 'netApplyDelProp', {
    NET:{ sentProps:new Map([['h-9',TUP.slice()]]) },
    _nidPending:new Map([['h-9',{del:false}]]),
    propIndexByNid:()=>{ throw new Error('must not reach the live-prop path while pending'); },
    removeProp:()=>{ throw new Error('must not remove while pending'); },
    netFixSelection:()=>{},
  });
  eq(delFn('h-9'), true, 'a pDel for a still-downloading prop is accepted (and relayable)');
}
{
  const pend=new Map([['h-9',{del:true}]]);
  const obj={ userData:{ nid:'h-9' } };
  const removed=[];
  const endFn=evalDecl(extractFunction('_nidSpawnEnd', src), '_nidSpawnEnd', {
    _nidPending:pend, propModels:[obj],
    removeProp:(i)=>removed.push(i),
    NET:{ sentProps:new Map([['h-9',TUP.slice()]]) },
  });
  eq(endFn('h-9', obj), true, 'the landing object is discarded when the delete raced the download');
  eq(removed.length, 1, '...via removeProp');
  assert(!pend.has('h-9'), '...and the pending entry is cleared');
}
{
  const pend=new Map([['h-9',{del:false}]]);
  const endFn=evalDecl(extractFunction('_nidSpawnEnd', src), '_nidSpawnEnd', {
    _nidPending:pend, propModels:[], removeProp:()=>{ throw new Error('no delete -> no removal'); }, NET:{ sentProps:new Map() },
  });
  eq(endFn('h-9', { userData:{} }), false, 'an undisturbed landing proceeds normally');
}

done('build 905: a slow model download never deletes the prop on the machine that HAS it');
