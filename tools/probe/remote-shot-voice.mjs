// build 1455 — a relayed shot carries its own weapon's voice.
//
// The unit test drives _shotVoice and SFX.shootAt directly. That proves the voice; it does not prove
// the WIRE, and build 1277's rule is that pinning the two ends of a wire proves nothing about the wire
// (six logic verbs shipped and never worked because only the ends were pinned). So this fires the REAL
// `remoteFire` — the function the network handler calls — and reads back what actually reached the
// audio graph.
//
// The control is a relayed shot with NO weapon: it must still sound (falling back to the rifle patch),
// because a silent remote shot would be a worse regression than a generic one.
import { withGame } from './driver.mjs';

const P = (s) => `(function(){ ${s} })()`;

await withGame(async (probe) => {
  const say = (k, v) => console.log(String(k).padEnd(30), JSON.stringify(v));

  // ---- install a recorder over the two synth primitives, inside the closure ----
  say('audio live', await probe(P(`
    window.__log = [];
    if(!window.__wrapped){
      window.__wrapped = 1;
      const t0 = tone, n0 = noise;
      tone  = function(o){ window.__log.push({ k:'tone',  freq:o.freq, dur:o.dur, at: o.at ? [+o.at.x.toFixed(1), +o.at.z.toFixed(1)] : null }); return t0.apply(null, arguments); };
      noise = function(o){ window.__log.push({ k:'noise', dur:o.dur, filterFreq:o.filterFreq, type:o.type, at: o.at ? [+o.at.x.toFixed(1), +o.at.z.toFixed(1)] : null }); return n0.apply(null, arguments); };
    }
    return { hasActx: !!actx, hasBus: !!sfxBus, wrapped: !!window.__wrapped };
  `)));

  const fire = (wep) => probe(P(`
    window.__log = [];
    var o = [12, 1.6, -4], d = [0, 0, -1];
    remoteFire(99, o, d, ${wep === null ? 'undefined' : JSON.stringify(wep)});
    var L = window.__log.filter(function(e){ return e.k==='tone' || e.k==='noise'; });
    var tones = L.filter(function(e){ return e.k==='tone'; });
    var cracks = L.filter(function(e){ return e.k==='noise'; });
    return { layers: L.length,
             body: tones.length > 1 ? Math.round(tones[1].freq) : null,
             crackType: cracks.length ? cracks[0].type : null,
             crackDur: cracks.length ? cracks[0].dur : null,
             positioned: L.length ? L.every(function(e){ return e.at && e.at[0]===12; }) : false };
  `));

  const sniper = await fire('sniper');   say('remoteFire sniper', sniper);
  const smg    = await fire('smg');      say('remoteFire smg', smg);
  const shotgun= await fire('shotgun');  say('remoteFire shotgun', shotgun);
  const none   = await fire(null);       say('remoteFire NO weapon', none);

  say('distinguishable bodies', { sniper: sniper.body, smg: smg.body, shotgun: shotgun.body });
  say('positioned at the shot origin', sniper.positioned && smg.positioned);

  // the crack filter is the thing an ear actually identifies a weapon by
  say('crack differs', { sniper: sniper.crackType + '/' + sniper.crackDur, smg: smg.crackType + '/' + smg.crackDur });

  // ---- and the local gun must be UNCHANGED and unpositioned ----
  const local = await probe(P(`
    window.__log = [];
    SFX.shoot();
    var L = window.__log.filter(function(e){ return e.k==='tone' || e.k==='noise'; });
    return { layers: L.length, anyPositioned: L.some(function(e){ return !!e.at; }), wep: curWep };
  `));
  say('local SFX.shoot', local);

  const ok = sniper.layers >= 3 && smg.layers >= 3
          && sniper.body && smg.body && sniper.body !== smg.body
          && sniper.crackType !== smg.crackType
          && sniper.positioned && smg.positioned
          && none.layers >= 3                    // the control: never silent
          && local.layers >= 3 && !local.anyPositioned;
  console.log('\n' + (ok ? 'PASS' : 'FAIL') + ' — a relayed shot carries its own weapon, positioned; the local gun is unchanged');
  if (!ok) process.exitCode = 1;
}, { settleMs: 3000 });
