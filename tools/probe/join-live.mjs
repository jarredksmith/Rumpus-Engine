import { withGame } from './driver.mjs';
await withGame(async (P) => {
  // capture every lobby PUT so the announcement can be read rather than assumed
  await P(`(()=>{ window.__puts=[]; const of=window.fetch;
    window.fetch=function(u,o){ try{ if(o && o.method==='PUT' && String(u).indexOf('lobbies')>=0) __puts.push(JSON.parse(o.body)); }catch(e){}
      if(o && (o.method==='PUT'||o.method==='DELETE')) return Promise.resolve({ok:true,json:()=>Promise.resolve({})});
      return of.apply(this,arguments); }; return 'hooked'; })()`);

  console.log('cap        ', await P(`JSON.stringify({ duel:_maxPlayersFor('duel'), coop:_maxPlayersFor('coop'), tdm:_maxPlayersFor('tdm'),
     live:(()=>{ NET.gameMode='duel'; const a=_maxPlayersFor(); NET.gameMode='coop'; return [a,_maxPlayersFor()]; })() })`));

  console.log('\nlobby PUT  ', await P(`(()=>{ __puts.length=0;
     NET.mode='host'; NET.myId=0; NET.roomCode='ab12cd'; NET.phase='lobby'; NET.gameMode='coop'; NET.name='Jarred';
     NET.conns={1:{open:true},2:{open:true}};
     announceRoom(); const b=__puts[__puts.length-1];
     return JSON.stringify({ live:b.live, players:b.players, max:b.max, mode:b.mode, hasKey:!!b.key }); })()`));

  console.log('kickoff    ', await P(`(()=>{ __puts.length=0; NET.phase='playing'; announceRoom();
     const b=__puts[__puts.length-1];
     return JSON.stringify({ live:b.live, players:b.players, max:b.max, note:'still announced, marked live' }); })()`));

  console.log('duel cap   ', await P(`(()=>{ __puts.length=0; NET.gameMode='duel'; announceRoom();
     const b=__puts[__puts.length-1]; NET.gameMode='coop'; return JSON.stringify({ max:b.max, players:b.players }); })()`));

  console.log('left       ', await P(`(()=>{ __puts.length=0; NET.phase='menu'; announceRoom();
     return JSON.stringify({ putsAfterLeaving:__puts.length, note:'no phase but lobby/playing announces' }); })()`));

  // the browser: full rooms, live rooms, and a server that has not been updated yet
  console.log('\nlist       ', await P(`(()=>{
     renderGamesList([
       { code:'aaa111', name:'Waiting',  mode:'coop', players:3, max:8, live:0 },
       { code:'bbb222', name:'Running',  mode:'coop', players:5, max:8, live:1 },
       { code:'ccc333', name:'Packed',   mode:'coop', players:8, max:8, live:1 },
       { code:'ddd444', name:'OldServer',mode:'duel', players:2 },
       { code:'eee555', name:'OldCoop',  mode:'coop', players:4 } ]);
     return JSON.stringify([...document.querySelectorAll('#mpGames .gameRow')].map(r=>({
       name:r.children[0].textContent, meta:r.children[1].textContent,
       btn:r.children[2].textContent, off:!!r.children[2].disabled, tip:r.children[2].title }))); })()`));
}, { settleMs: 2000 });
