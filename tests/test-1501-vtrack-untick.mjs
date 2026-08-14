// build 1501: the fixed camera's "follows the player" box can finally be unticked.
//
// Reported from play: "No matter what, I'm not able to untick this toggle." Three sites conspired, and
// any one of them alone keeps the bug: the graph node's checkbox DELETED the key on untick and the
// immediate re-render redrew the default — checked — so the box snapped back under the cursor; the
// signal editor's row deleted too, so the box LOOKED unticked while the runtime read absent as ON (the
// sneakier half); and _sigPack drops falsy, so even an explicit 0 died on the next save. vtrack is the
// ONE field whose zero is meaningful — the runtime read distinguishes absent (default: follow) from an
// authored 0 (hold the prop's own facing) — which is exactly where "falsy is absent" stops being true.
import { gameSource, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------- the graph node checkbox, executed both directions ----
{
  const line = src.match(/else if\(pm\.chk\)\{[^\n]*\n/)[0];
  const drawn = line.match(/inp\.checked=([^;]+);/);
  assert(drawn, 'the redraw formula is found');
  const onchange = line.match(/inp\.onchange=(\(\)=>\{[\s\S]*?\};)/);
  assert(onchange, 'the onchange is found');
  const fire = (p, k, def, checked) => {
    const inp = { checked };
    const n = { p };
    const pm = { k, def };
    new Function('inp','n','pm','_lgDirty','_lgRender', 'const f=' + onchange[1].slice(0, -1) + '; f();')(
      inp, n, pm, () => {}, () => {});
    // the redraw the real _lgRender would perform — this is where the box used to snap back
    const redrawn = new Function('n','pm', 'return (' + drawn[1] + ');')(n, pm);
    return { p, redrawn };
  };

  { // THE REPORT: untick a default-ON box — the value is an explicit 0 and the redraw KEEPS it unticked
    const r = fire({ vtrack: 1 }, 'vtrack', 1, false);
    eq(r.p.vtrack, 0, 'untick stores an explicit 0');
    eq(r.redrawn, false, '...and the re-render shows it unticked — the snap-back is gone');
  }
  { // ticking a default-ON box stores NOTHING — absent means default, so old files stay byte-identical
    const r = fire({ vtrack: 0 }, 'vtrack', 1, true);
    assert(!('vtrack' in r.p), 're-tick deletes the key (absent = the default the runtime uses)');
    eq(r.redrawn, true, '...and redraws checked via the default');
  }
  { // a def-less checkbox (once, mfrz) keeps its pre-1501 bytes exactly
    const t = fire({}, 'once', undefined, true);
    eq(t.p.once, 1, 'tick of a plain box still writes 1');
    const u = fire({ once: 1 }, 'once', undefined, false);
    assert(!('once' in u.p), 'untick of a plain box still deletes — nothing else moved');
  }
}

// --------------------------------------------------- the wire: vtrack's zero survives the pack ----
{
  const rig = new Function(
    'const SIG_KEYS = ' + extractConst('SIG_KEYS') + ';\n' +
    'const SIG_UNKEYS = (function(){ const o={}; for(const k in SIG_KEYS) o[SIG_KEYS[k]]=k; return o; })();\n' +
    'const SIG_STR_MAX = 300;\n' +
    'const SIG_ZERO_KEYS = ' + extractConst('SIG_ZERO_KEYS') + ';\n' +
    (src.match(/function _sigPack\(s\)\{[\s\S]*?\n\}/)[0]) + '\n' +
    (src.match(/function _sigUnpack\(x\)\{[\s\S]*?\n\}/)[0]) + '\n' +
    'return { _sigPack, _sigUnpack };')();
  eq(rig._sigPack({ vtrack: 0 }).vk, 0, 'an authored 0 is EMITTED — this is the byte the untick lost');
  eq(rig._sigPack({ vtrack: 1 }).vk, 1, 'an authored 1 still emits');
  assert(!('vk' in rig._sigPack({})), 'unset still emits nothing — pre-1501 levels are byte-identical');
  assert(!('am' in rig._sigPack({ amt: 0 })), 'the GENERAL rule survives: a zero amount is still absent');
  eq(rig._sigUnpack(rig._sigPack({ vtrack: 0 })).vtrack, 0, 'and the round trip returns the 0');
}

// ------------------------------------------------- the signal editor row: display + writer ----
{
  assert(src.includes("chk('follows the player', (s.vtrack!=null)?!!s.vtrack:true,"),
    'unset displays the ON the runtime will use (1407’s display rule, applied to the signal row)');
  assert(src.includes("v=>{ if(v) delete s.vtrack; else s.vtrack=0; }"),
    'the writer: tick deletes (absent = default), untick writes the explicit 0');
}

// ------------------------------------------------------------- the runtime read, executed ----
{
  const m = src.match(/const tr=\(([^;]+)\);/);
  assert(m, 'the runtime tracking read is found');
  const tr = (s) => new Function('s', 'return (' + m[1] + ');')(s);
  eq(tr({}), true,             'absent -> follow (the default, unchanged)');
  eq(tr({ vtrack: 0 }), false, 'an authored 0 -> hold the prop’s own facing');
  eq(tr({ vtrack: '0' }), false, 'a string zero from an old hand-edited file too');
  eq(tr({ vtrack: 1 }), true,  'an authored 1 -> follow');
}

done('build 1501: unticking "follows the player" stores an explicit 0 that survives the redraw, the ' +
  'save and the wire — and every level authored before it is byte-identical');
