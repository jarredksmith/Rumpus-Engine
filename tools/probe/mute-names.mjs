import { withGame } from './driver.mjs';
await withGame(async (P) => {
  console.log('clean      ', await P(`JSON.stringify([
     _cleanName('  Jarred  ','X'), _cleanName('','X'), _cleanName(null,'X'),
     _cleanName('a'.repeat(60),'X').length,
     _cleanName('Bad\\u0000Na\\u200bme','X'), _cleanName('a   b','X'), _cleanName('\\u200b\\u200b','X') ])`));

  console.log('\ndedup      ', await P(`(()=>{
     NET.mode='host'; NET.myId=0; NET.name='Jarred'; NET.players={}; NET.conns={};
     const out=[];
     out.push(_resolveName('Griefer', 1));
     NET.players[1]={name:'Griefer'};
     out.push(_resolveName('Griefer', 2));
     NET.players[2]={name:'Griefer (2)'};
     out.push(_resolveName('griefer  ', 3));           // case + whitespace insensitive
     out.push(_resolveName('Jarred', 4));              // clashes with the HOST
     out.push(_resolveName('', 5));                    // empty -> Player5
     out.push(_resolveName('Griefer', 1));             // the SAME player re-sending keeps its own name
     return JSON.stringify(out); })()`));

  console.log('\nmute       ', await P(`(()=>{
     localStorage.removeItem('breach_mutes'); _chatMuted.clear(); _chatMutedIds.clear();
     NET.players={1:{name:'Griefer'},2:{name:'Innocent'}};
     const seen=[]; const log=document.getElementById('chatLog');
     sendChat('/mute Griefer');
     const boundId=[..._chatMutedIds][0];
     log.innerHTML='';
     addChatLine('Griefer','hello',false,1);
     addChatLine('Innocent','hi',false,2);
     addChatLine('Griefer','renamed?',false,1);
     const a=log.children.length;
     log.innerHTML='';
     NET.players[1].name='NotGriefer';                 // the troll renames
     addChatLine('NotGriefer','still me',false,1);     // ...and is still muted, by id
     const b=log.children.length;
     log.innerHTML='';
     addChatLine('NotGriefer','from an old host',false);  // no from-id at all -> name-only, so it shows
     const c=log.children.length;
     return JSON.stringify({ stored:JSON.parse(localStorage.getItem('breach_mutes')||'[]'), boundId,
       withMute:a, want:1, afterRename:b, wantAfter:0, oldHostRelay:c }); })()`));

  console.log('persisted  ', await P(`(()=>{ _chatMuted.clear(); _loadMutes();
     return JSON.stringify({ afterReload:[..._chatMuted], note:'a fresh page reads the same set' }); })()`));

  console.log('commands   ', await P(`(()=>{ const t=[]; const of=window.flashToast; window.flashToast=(m)=>t.push(m);
     _chatMuted.clear(); _chatMutedIds.clear(); _saveMutes();
     sendChat('/mute Alice'); sendChat('/mute Bob'); sendChat('/mutes');
     sendChat('/unmute Alice'); sendChat('/mutes');
     sendChat('/unmute all'); sendChat('/mutes');
     window.flashToast=of; return JSON.stringify(t); })()`));

  console.log('\nyourname   ', await P(`(()=>{ const t=[]; const of=window.flashToast; window.flashToast=(m)=>t.push(m);
     NET.mode='client'; NET.name='Griefer'; NET.joined=true;
     handleHostMsg({t:'yourname', n:'Griefer (2)'});
     const a=NET.name;
     handleHostMsg({t:'yourname', n:'Griefer (2)'});   // idempotent, no second toast
     handleHostMsg({t:'yourname', n:''});              // junk is ignored
     window.flashToast=of; NET.mode='off';
     return JSON.stringify({ name:a, still:NET.name, toasts:t }); })()`));
}, { settleMs: 2000 });
