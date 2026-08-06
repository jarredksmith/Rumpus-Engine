// Does a prop SIGNAL survive being saved?
//
// Found while scoping the AI booth's next gap. `serializeLevel` writes a prop's signals through an
// EXPLICIT short-key list — w, d, t, c, n, f, ci, tx, ni, nc, cn, so — and the signal editor writes
// etype, n, at, pk, item, once, who, amt, stat, mul, ewho, cmd on top of that. Nothing carries the second
// list, so the question is simply whether a world verb on a prop signal comes back as what was authored.
//
// The probe authors one signal per verb, runs the REAL serializeLevel, and reads the entry back. No
// interpretation: the answer is a field-by-field diff.
import { withGame } from './driver.mjs';

await withGame(async (P) => {
  const r = await P(`(function(){
    /* one signal per world verb, each carrying every parameter its editor row can write */
    const SIGS = [
      { when:'used', do:'spawn',    etype:'brute', n:'3',  at:'gate' },
      { when:'used', do:'pickup',   pk:'item', item:'redKey', at:'plinth', once:1 },
      { when:'used', do:'damage',   who:'enemies', amt:'40' },
      { when:'used', do:'heal',     who:'player',  amt:'25' },
      { when:'used', do:'kill',     who:'nearest' },
      { when:'used', do:'teleport', who:'player',  at:'vault' },
      { when:'used', do:'give',     item:'coin',   n:'5' },
      { when:'used', do:'take',     item:'coin',   n:'2' },
      { when:'used', do:'stat',     stat:'speed',  mul:'2' },
      { when:'used', do:'music',    sound:'https://example.org/a.mp3' },
      { when:'used', do:'command',  ewho:'nearest', cmd:'hold', at:'post1' },
      { when:'used', do:'view',     vmode:'fixed', vtag:'cam1', vtrack:1 },
      { when:'used', do:'moveprop', target:'crate', at:'gate' },
      { when:'used', do:'pushprop', target:'ball',  at:'me', amt:'30' },
      { when:'used', do:'spawnprop',prefab:'turret', at:'pad' },
      { when:'used', do:'objective',text:'Reach the vault' },
      /* the control: a TAG verb, whose only parameters are ones the short-key list does carry */
      { when:'used', do:'anim', target:'door', clip:'Open' }
    ];

    const host = propModels.find(o => o && o.userData && !o.userData._lgSpawned);
    if(!host) return { err:'no prop to hang signals on' };
    const keep = host.userData.signals;
    host.userData.signals = SIGS.map(s => Object.assign({}, s));

    const lvl = serializeLevel();
    const ent = (lvl.props||[]).find(p => Array.isArray(p.sg) && p.sg.length === SIGS.length);
    host.userData.signals = keep;
    if(!ent) return { err:'the signals did not reach the level file at all' };

    /* read it back through the ENGINE'S OWN loader, not a copy of it. The first draft pasted the loader's
       body into the probe, so after the fix the serializer carried every field and the probe still
       reported them lost — it was measuring its own stale copy of the thing under test. */
    const back = (typeof _sigUnpack==='function')
      ? ent.sg.map(_sigUnpack)
      : ent.sg.map(sg => { const x={ when:sg.w, do:sg.d, target:sg.t };
          if(sg.c) x.clip=sg.c; if(sg.n) x.cs=sg.n; if(sg.f) x.from=sg.f; if(sg.ci) x.contain=true;
          if(sg.tx) x.text=sg.tx; if(sg.ni) x.needItem=sg.ni; if(sg.nc) x.needConsume=true;
          if(sg.cn) x.consume=true; if(sg.so) x.sound=sg.so; return x; });

    const rows = [];
    for(let i=0;i<SIGS.length;i++){
      const want = SIGS[i], got = back[i] || {}, lost = [];
      for(const k of Object.keys(want)){
        if(k==='when' || k==='do') continue;
        if(String(got[k]==null?'':got[k]) !== String(want[k])) lost.push(k + '=' + want[k]);
      }
      rows.push({ verb: want.do, lost });
    }
    return { rows, keys: Object.keys(ent.sg[0]).join(','),
             short: JSON.stringify(ent.sg[10]), shortView: JSON.stringify(ent.sg[11]) };
  })()`);

  if (r.err) { console.log('  ' + r.err); return; }
  console.log('\n  PROP SIGNAL ROUND TRIP — authored, serialized, read back\n  ' + '='.repeat(70));
  let bad = 0;
  for (const row of r.rows) {
    const ok = row.lost.length === 0;
    if (!ok) bad++;
    console.log('    ' + (ok ? 'ok  ' : 'LOST') + '  ' + row.verb.padEnd(11) +
      (ok ? '' : row.lost.join(', ')));
  }
  console.log('\n  short keys emitted per signal: ' + r.keys);
  console.log('  "command nearest -> hold @post1"  ->  ' + r.short);
  console.log('  "view fixed on cam1, tracking"    ->  ' + r.shortView);
  console.log('\n  ' + (r.rows.length - bad) + '/' + r.rows.length + ' survive' +
    (bad ? '   <-- ' + bad + ' LOSE PARAMETERS' : ''));
}, { settleMs: 8000 });
