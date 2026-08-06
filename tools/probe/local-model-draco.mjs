// The reported bug, driven through the SHIPPED function in the running game.
//
// "I get this error on some model imports — THREE.GLTFLoader: No DRACOLoader instance provided."
//
// The Node test executes the retry logic with a fake loader. This asks the other half: in the real game,
// does the local-import path build its loader through `_mkGLTFLoader` (the one function that attaches the
// codecs), and does a Draco-flavoured failure actually recover?
//
// The sandbox cannot reach esm.sh, so the DECODER cannot really be fetched here — `_ensureDraco` is stubbed
// and the loader made to fail once. What that proves is the wiring: the right function is called, in the
// right order, exactly once. Whether jsdelivr serves the decoder is a network fact, not a code one.
import { withGame } from './driver.mjs';

const out = [];
const P = (ok, what, detail) => { out.push({ ok, what, detail }); };

await withGame(async (probe) => {
  const r = await probe(`
  (function(){
    const R = { log: [] };
    const realMk = _mkGLTFLoader, realDraco = _ensureDraco;
    let failNext = true;

    /* a real blob in the real store, so the IndexedDB half is not stubbed */
    const bytes = new Uint8Array([0x67,0x6c,0x54,0x46, 2,0,0,0, 12,0,0,0]);   // "glTF" magic
    const key = 'probe1419/test.glb';

    /* SPY on _mkGLTFLoader: record that it was reached, and hand back a loader that fails once with
       three's own Draco message, then succeeds. */
    _mkGLTFLoader = function(mgr){
      R.log.push('mkGLTFLoader');
      return { parse: function(buf, path, ok, err){
        R.log.push('parse:' + (buf && buf.byteLength));
        if(failNext){ failNext = false; err(new Error('THREE.GLTFLoader: No DRACOLoader instance provided.')); return; }
        ok({ scene: new THREE.Group() });
      } };
    };
    _ensureDraco = function(){ R.log.push('ensureDraco'); return Promise.resolve(null); };

    return _localModelPut(key, new Blob([bytes])).then(function(){
      return new Promise(function(res){
        var settled = false;
        var fin = function(kind, v){ if(settled) return; settled = true;
          _mkGLTFLoader = realMk; _ensureDraco = realDraco;
          R.kind = kind; R.detail = v; res(R); };
        _loadLocalModel('local:' + key, function(g){ fin('ok', !!(g && g.scene)); },
                                        function(e){ fin('err', (e && e.message) || String(e)); });
        setTimeout(function(){ fin('timeout', null); }, 8000);
      });
    });
  })()`);

  console.log('        ' + r.log.join('  ->  ') + '   =>  ' + r.kind + '\n');

  P(r.log.includes('mkGLTFLoader'),
    'the local-import path builds its loader through _mkGLTFLoader in the REAL game — the one function ' +
    'that attaches Draco, KTX2 and meshopt. It used a bare new THREE.GLTFLoader, which is the whole bug',
    r.log[0]);
  P(r.kind === 'ok',
    'and a Draco-flavoured failure RECOVERS: the model loads on the retry instead of surfacing three\'s ' +
    'raw message to the creator', r.kind + ' / ' + r.detail);
  P(r.log.filter(x => x === 'ensureDraco').length === 1,
    '...having pulled the decoder in exactly once', r.log.filter(x => x === 'ensureDraco').length);
  P(r.log.filter(x => x.startsWith('parse')).length === 2,
    '...and parsed exactly twice — the failure, then the retry',
    r.log.filter(x => x.startsWith('parse')).join(','));
  // the log entries are `parse:<bytes>`, so an exact lastIndexOf('parse') is -1 — my own first draft of
  // this assertion failed on a trace that was correct
  const lastParse = r.log.map((x, i) => x.startsWith('parse') ? i : -1).reduce((a, b) => Math.max(a, b), -1);
  P(r.log.indexOf('ensureDraco') >= 0 && r.log.indexOf('ensureDraco') < lastParse,
    '...in that order, so the retry happens after the decoder rather than before it',
    'ensureDraco@' + r.log.indexOf('ensureDraco') + ' < lastParse@' + lastParse);
  const buffers = r.log.filter(x => x.startsWith('parse:'));
  P(buffers.length === 2 && buffers[0] === buffers[1],
    '...and the retry reuses the SAME buffer, so it needs no second trip to IndexedDB', buffers.join(' '));
}, { settleMs: 3000 });

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
