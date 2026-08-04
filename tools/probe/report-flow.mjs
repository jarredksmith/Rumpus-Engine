// Build 1351: the client half of moderation. The server half (server/api/report.php) exists; this is the
// part a person can reach. Verified against a STUBBED endpoint so every response branch is exercised —
// including the one that matters most, a backend that is not there.
import { withGame } from './driver.mjs';

await withGame(async (P) => {
  // record every request and answer whatever the test asks for
  await P(`window.__reqs = [];
    window.__reply = { status:200, body:{ ok:true, id:'rep_1_abcdef01' } };
    window.__origFetch = window.fetch;
    window.fetch = function(u, o){
      if(String(u).indexOf('report.php') >= 0){
        window.__reqs.push({ url:String(u), body: JSON.parse((o&&o.body)||'{}') });
        if(window.__reply.throw) return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve({ ok: window.__reply.status===200, status: window.__reply.status,
          json: ()=>Promise.resolve(window.__reply.body) });
      }
      return window.__origFetch.apply(window, arguments);
    };
    window.__toasts = []; window.__origToast = flashToast;
    flashToast = function(m){ window.__toasts.push(String(m)); };
    1`);

  const submit = async (label) => {
    await new Promise(r => setTimeout(r, 250));
    await P(`(function(){ const b=[...document.querySelectorAll('.uiDlgBack button')].find(x=>/Submit/.test(x.textContent));
      if(b) b.click(); return 1; })()`);
    await new Promise(r => setTimeout(r, 400));
    const out = await P(`JSON.stringify({ req: window.__reqs[window.__reqs.length-1]||null,
      toast: window.__toasts[window.__toasts.length-1]||null })`);
    console.log('  ' + label + '  ' + out);
  };

  console.log('CHAT report — the text must travel, because the server has no copy');
  await P(`NET.room='ab12cd'; addChatLine('Griefer', 'something awful', false); 1`);
  await new Promise(r => setTimeout(r, 300));
  console.log('  flag rendered on their line: ' + await P(`(function(){
    const rows=[...document.querySelectorAll('#chatLog .chatRow')];
    const last=rows[rows.length-1];
    return JSON.stringify({ rows:rows.length, hasFlag: !!(last && last.querySelector('button')),
      label: last && last.querySelector('button') ? last.querySelector('button').title : null });
  })()`));
  console.log('  MY line gets no flag: ' + await P(`(function(){
    addChatLine('Me', 'hello', true);
    const rows=[...document.querySelectorAll('#chatLog .chatRow')];
    const last=rows[rows.length-1];
    return JSON.stringify({ hasFlag: !!(last && last.querySelector('button')) });
  })()`));
  await P(`(function(){ const rows=[...document.querySelectorAll('#chatLog .chatRow')];
    for(const r of rows){ const b=r.querySelector('button'); if(b && /message/.test(b.title)){ b.click(); return 1; } } return 0; })()`);
  console.log('  the dialog: ' + await P(`(function(){
    const back=document.querySelector('.uiDlgBack'); if(!back) return 'no dialog';
    const sel=back.querySelector('select');
    return JSON.stringify({ title: back.querySelector('div>div') ? back.textContent.slice(0,26) : null,
      reasonIsASelect: !!sel, options: sel ? [...sel.options].map(o=>o.value) : null });
  })()`));
  await submit('sent:');

  console.log('\nevery response branch:');
  await P(`window.__reply={ status:429, body:{ error:'slow down', retry:37 } }; 1`);
  await P(`openReportDialog('level', { what:'a level', target:'lvl_1.json' }); 1`);
  await submit('429:  ');
  await P(`window.__reply={ status:400, body:{ error:'bad kind' } }; 1`);
  await P(`openReportDialog('level', { what:'a level', target:'lvl_1.json' }); 1`);
  await submit('400:  ');
  await P(`window.__reply={ throw:true }; 1`);
  await P(`openReportDialog('level', { what:'a level', target:'lvl_1.json' }); 1`);
  await submit('no backend at all:');

  console.log('\ncancelling sends nothing:');
  await P(`window.__reply={ status:200, body:{ok:true} }; const n=window.__reqs.length;
    openReportDialog('level', { what:'a level', target:'x' }); 1`);
  await new Promise(r => setTimeout(r, 250));
  await P(`(function(){ const b=[...document.querySelectorAll('.uiDlgBack button')].find(x=>/Cancel/.test(x.textContent)); if(b) b.click(); return 1; })()`);
  await new Promise(r => setTimeout(r, 300));
  console.log('  requests after cancel: ' + await P('String(window.__reqs.length)') + ' (was 4)');
  await P(`window.fetch = window.__origFetch; flashToast = window.__origToast; 1`);
}, { settleMs: 6000 });
