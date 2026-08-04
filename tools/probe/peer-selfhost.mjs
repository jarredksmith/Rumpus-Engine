// Build 1354: a self-hoster can point the game at their own broker. Verified as a PROPERTY of the options
// every `new Peer` site already builds, plus the CSP the block switch installs — because a policy that
// omits the broker would silently kill multiplayer for exactly the people who ran their own infrastructure.
import { withGame } from './driver.mjs';

await withGame(async (P) => {
  console.log('unset (what everyone who configures nothing must keep getting):');
  console.log('  ' + await P(`(function(){ localStorage.removeItem('breach_peer');
    const o=_peerOpts();
    return JSON.stringify({ server:_peerServer(), host:o.host||null, hasIce: !!(o.config&&o.config.iceServers&&o.config.iceServers.length) }); })()`));

  console.log('\nconfigured:');
  console.log('  ' + await P(`(function(){
    localStorage.setItem('breach_peer', JSON.stringify({ host:'peer.example.org', port:9000, path:'/rumpus' }));
    const o=_peerOpts();
    return JSON.stringify({ host:o.host, port:o.port, path:o.path, secure:o.secure,
      iceStillThere: !!(o.config&&o.config.iceServers&&o.config.iceServers.length) }); })()`));

  console.log('\nrubbish falls through to the cloud broker rather than breaking multiplayer:');
  for (const v of ['{"port":9000}', 'not json at all', '{}', 'null', '{"host":""}'])
    console.log('  ' + JSON.stringify(v).padEnd(20) + await P(`(function(){
      localStorage.setItem('breach_peer', ${JSON.stringify(v)});
      return JSON.stringify({ server:_peerServer() }); })()`));

  console.log('\nclamps:');
  console.log('  ' + await P(`(function(){
    localStorage.setItem('breach_peer', JSON.stringify({ host:'h'.repeat(400), port:999999, secure:false }));
    const s=_peerServer();
    return JSON.stringify({ hostLen:s.host.length, port:s.port, secure:s.secure }); })()`));

  console.log('\nthe local script is first in the loader:');
  console.log('  ' + await P(`(function(){
    const f=String(ensurePeerJS);
    const m=f.match(/const cdns=\\[([^\\]]*)\\]/);
    const list=m?m[1].split(',').map(s=>s.replace(/'/g,'').trim()):[];
    return JSON.stringify({ first:list[0], count:list.length,
      localCarriesNoIntegrity: /_local\\)\\{ s\\.crossOrigin/.test(f) || /if\\(!_local\\)/.test(f) }); })()`));
  console.log('  it is actually served: ' + await P(`fetch('peerjs.min.js').then(r=>r.ok?r.text():'').then(t=>JSON.stringify({ ok:t.length>1000, bytes:t.length }))`));

  await P(`localStorage.removeItem('breach_peer'); 1`);
}, { settleMs: 6000 });
