// Build 1352: the graph can ask WHERE something is, and can move between campaign levels.
// Driven through the real _lgPulse switch, because a node that resolves but never reaches the handler is
// the defect build 1277 found across SIX verbs that had shipped and never worked.
import { withGame } from './driver.mjs';

/* the real node shape is { id, type, p:{...} } — NOT a flat { t, ... }. The first run of this probe used
   the flat form, every read returned nothing, and that looked exactly like a broken build. */
const PULSE = (type, p) => `(function(){
  logicGraph.nodes = [{ id:'n1', type:${JSON.stringify(type)}, x:0, y:0, p:${JSON.stringify(p)} }];
  logicGraph.wires = [];
  logicVars = {};
  if(typeof logicFailures!=='undefined') logicFailures.clear();
  _lgPulse('n1', 'in');
  return JSON.stringify({ vars: logicVars,
    failures: (typeof levelIssues==='function' ? levelIssues().filter(s=>/Logic/.test(s)) : []).slice(0,1) });
})()`;

await withGame(async (P) => {
  console.log('place a tagged prop at a known spot, then ask the graph where it is:');
  console.log('  ' + await P(`(function(){
    const o = propModels.find(p=>p && p.userData);
    o.userData.tag = 'ball';
    o.position.set(12, 3.5, -8);
    player.pos.set(0, 2, 0);
    return JSON.stringify({ tag:o.userData.tag, at:[o.position.x, o.position.y, o.position.z],
      player:[player.pos.x, player.pos.z] });
  })()`));

  for (const stat of ['propx', 'propy', 'propz', 'propdist'])
    console.log('  ' + stat.padEnd(9) + await P(PULSE('read', { stat, item:'ball', name:'out' })));

  console.log('\n  a tag nobody carries must REPORT, not silently read 0:');
  console.log('  ' + await P(PULSE('read', { stat:'propx', item:'nosuchtag', name:'out' })));

  console.log('\n  "me" resolves through the same vocabulary the place field uses:');
  console.log('  ' + await P(`(function(){ player.pos.set(5,2,7); return 1; })()`) &&
    await P(PULSE('read', { stat:'propx', item:'me', name:'out' })));

  console.log('\nGO TO LEVEL — guards first, because every one of them is a silent bug otherwise:');
  console.log('  not in a campaign : ' + await P(`(function(){ campaignActive=false; return 1; })()`) &&
    await P(PULSE('goto', { n:'2' })));
  console.log('  out of range      : ' + await P(`(function(){ campaignActive=true;
    campaign.levels=[{name:'A'},{name:'B'}]; return 1; })()`) &&
    await P(PULSE('goto', { n:'9' })));
  console.log('  zero / negative   : ' + await P(PULSE('goto', { n:'0' })));
  console.log('  a client never    : ' + await P(`(function(){ const was=NET.mode; NET.mode='client';
    logicGraph.nodes=[{id:'n1',type:'goto',x:0,y:0,p:{n:'2'}}]; logicGraph.wires=[];
    window.__loaded=null; const real=_campaignLoad; _campaignLoad=(i)=>{ window.__loaded=i; };
    _lgPulse('n1','in'); _campaignLoad=real; NET.mode=was;
    return JSON.stringify({ loaded: window.__loaded }); })()`));
  console.log('  in range, host    : ' + await P(`(function(){ NET.mode='off'; campaignActive=true;
    campaign.levels=[{name:'A'},{name:'B'},{name:'C'}];
    logicGraph.nodes=[{id:'n1',type:'goto',x:0,y:0,p:{n:'3'}}]; logicGraph.wires=[];
    window.__loaded=null; const real=_campaignLoad; _campaignLoad=(i)=>{ window.__loaded=i; };
    _lgPulse('n1','in'); _campaignLoad=real;
    return JSON.stringify({ askedFor:3, loadedIndex: window.__loaded, campaignIdx }); })()`));
}, { settleMs: 6000 });
