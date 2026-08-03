// build 1319 (editor audit 4.8) — "a `local:` src fails the test and gets 'Part editing works on direct
// .glb models', which is both true and useless. And the whole feature requires _uploadAsset -> the founder's
// cPanel upload.php: offline or host-down, a creator cannot recolor a part of their OWN model."
//
// NOTE ON WHAT THIS CAN AND CANNOT SHOW: the bake needs gltf-transform, which is fetched from a CDN, and a
// real .glb to repack. Neither is available here. So this probe proves the two things this build actually
// changes — that a `local:` model's BYTES come back for the bake to read, and that the panel gate lets it
// through — and stops at the library boundary, which it reports rather than papering over.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('store a local model:', JSON.stringify(await P(`(async function(){
    const bytes = new Uint8Array([0x67,0x6c,0x54,0x46, 2,0,0,0, 12,0,0,0]);   /* a glTF magic header */
    await _localModelPut('abc123/my-crate.glb', new Blob([bytes]));
    const back = await _localModelGet('abc123/my-crate.glb');
    return { stored: !!back, size: back ? back.size : 0 };
  })()`)));

  console.log('bake reads it :', JSON.stringify(await P(`(async function(){
    const buf = await _bakeSourceBytes('local:abc123/my-crate.glb');
    const u8 = new Uint8Array(buf);
    return { bytes: buf.byteLength, magic: String.fromCharCode(u8[0],u8[1],u8[2],u8[3]) };
  })()`)));

  console.log('missing one  :', JSON.stringify(await P(`(async function(){
    try{ await _bakeSourceBytes('local:nope/gone.glb'); return { threw:false }; }
    catch(e){ return { threw:true, says:String(e.message).slice(0,60) }; }
  })()`)));

  console.log('\\n--- THE PANEL GATE ---');
  console.log(JSON.stringify(await P(`(function(){
    const mk = (src) => {
      const host = document.createElement('div');
      const obj = { userData:{ src }, traverse:(f)=>f(obj), isMesh:false, children:[] };
      try{ renderModelParts(host, { obj:()=>obj }); }catch(e){ return { src, err:String(e.message).slice(0,50) }; }
      const txt = host.textContent || '';
      return { src, built: host.children.length > 0,
               refused: /Part editing works on|can\\u2019t be re-edited/.test(txt),
               note: txt.slice(0, 56) };
    };
    return [ mk('local:abc123/my-crate.glb'), mk('https://x.example/a.glb'),
             mk('sketchfab:1234'), mk('https://x.example/a.obj') ];
  })()`)));

  console.log('\\n--- THE BAKE GETS PAST THE URL CHECK ---');
  console.log(JSON.stringify(await P(`(async function(){
    const said = [];
    await _bakeModelEdits('local:abc123/my-crate.glb', { del:{}, tint:{}, add:[] }, 'my-crate.glb',
      (m)=>said.push(String(m)), ()=>{});
    return { said };
  })()`)));
  console.log('  (reaching "Reading model…" and then the LIBRARY is the point — the old code refused at the url)');
  console.log(JSON.stringify(await P(`(async function(){
    const said = [];
    await _bakeModelEdits('sketchfab:1234', { del:{}, tint:{}, add:[] }, 'x', (m)=>said.push(String(m)), ()=>{});
    return { unfetchableStillRefused: said };
  })()`)));

  console.log('\\n--- A LOCAL EDIT IS STILL LOCAL ---');
  console.log(JSON.stringify(await P(`(function(){
    const b = String(_bakeModelEdits);
    return { savesLocally: /_localModelPut\\(key, new Blob\\(\\[bytes\\]\\)\\)/.test(b),
             returnsLocalScheme: /done\\('local:'\\+key/.test(b),
             uploadsOnlyWhenNotLocal: b.indexOf("if(_isLocal){") < b.indexOf("_uploadAsset(file"),
             tellsTheCreator: /this device only/.test(b) };
  })()`)));

  console.log('\\npublish still warns:', JSON.stringify(await P(`(function(){
    /* build 1177's Level Check warning must still fire — a local model cannot travel, edited or not */
    const has = /local:/.test(String(levelIssues));
    return { levelIssuesKnowsAboutLocal: has };
  })()`)));
}, { settleMs: 9000 });
