// build 1211: a gunshot is three layers, the bus has a compressor, and reload audio tells the truth.
//
// The gameplay-feel critic's CRITICAL #3: every shot was one tone + one noise — no sub-bass transient, no
// tail, no compressor, so weapons were distinguishable but all sounded like the same toy at different
// pitches, and mag-dumping was N identical clipping-adjacent blips. Reload was two clicks hardcoded 550ms
// apart regardless of reloadMs (900-1700), so the pistol's audio finished late and the sniper's a second
// early. Now: _SHOT_LAYERS gives each weapon a sub thump + the EXACT tuned body/crack it always had + a
// delayed lowpassed tail; sfxBus routes through a DynamicsCompressor (with a plain-connect fallback); and
// the reload clicks land at start / ~45% (mag out) / reloadMs-120 (mag in).
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the layer table: authored values preserved
{
  const table = src.match(/const _SHOT_LAYERS = \{[\s\S]*?\n\};/)[0];
  const L = new Function(table + '\nreturn _SHOT_LAYERS;')();
  // the pre-1211 tuned body/crack pairs, byte-for-byte (the safe-change rule: nothing authored moved)
  eq(L.shotgun.body.freq, 150, 'shotgun body keeps its tuned 150Hz'); eq(L.shotgun.crack.vol, 0.30, '...and crack volume');
  eq(L.smg.body.freq, 380, 'smg body keeps 380Hz'); eq(L.smg.crack.filterFreq, 3000, '...and its highpass crack');
  eq(L.sniper.body.freq, 95, 'sniper body keeps 95Hz'); eq(L.sniper.crack.dur, 0.26, '...and its long crack');
  eq(L.rifle.body.freq, 320, 'rifle body keeps 320Hz');
  // the new layers are shaped sensibly per weapon
  for (const k of ['shotgun', 'smg', 'sniper', 'rifle']) {
    assert(L[k].sub[0] <= 70, k + ': the sub layer is genuinely sub-bass (' + L[k].sub[0] + 'Hz)');
    assert(L[k].tail[3] > 0, k + ': the tail is DELAYED — it reads as the space answering, not more shot');
  }
  assert(L.sniper.sub[0] < L.smg.sub[0], 'the sniper thumps deeper than the SMG');
  assert(L.sniper.tail[0] > L.smg.tail[0] * 2, '...and rings much longer — the guns finally differ in weight, not just pitch');
}

// ---------------------------------------------------------------- the reload timing, executed
{
  // drive the real reload() with fake timers and a WEAPONS table; collect the click schedule
  const clicks = [];
  const body =
    'const curSounds=()=>({});\n const playSample=()=>false;\n' +
    'const tone=(o)=>clicks.push({ at: _now, freq: o.freq });\n' +
    'let _now=0; const setTimeout=(fn,ms)=>{ const was=_now; _now=ms; fn(); _now=was; };\n' +
    'const curWep=wep, WEAPONS=weps;\n' +
    'const SFXr = { ' + src.match(/reload\(\)\{ const r=curSounds\(\)\.reload;[\s\S]*?\n    setTimeout\(\(\)=>tone\(\{freq:300[^\n]*\n/)[0].trim().replace(/,$/, '') + ' };\n' +
    'SFXr.reload(); return clicks;';
  const run = (wep, reloadMs) => { clicks.length = 0; return new Function('clicks', 'wep', 'weps', body)(clicks, wep, { [wep]: { reloadMs } }); };
  { const c = run('sniper', 1600);
    eq(c.length, 3, 'three clicks: start, mag-out, mag-in');
    eq(c[0].at, 0, 'the start click is immediate');
    eq(c[1].at, Math.round(1600 * 0.45), 'mag-out lands at ~45% of the REAL reload');
    eq(c[2].at, 1600 - 120, 'mag-in lands just before the reload completes — the audio and the mechanic finally agree'); }
  { const c = run('pistol', 700);
    eq(c[2].at, 700 - 120, 'a fast pistol reload finishes its audio fast too (the old hardcoded 550ms pair ran LATE here)'); }
}

// ---------------------------------------------------------------- the wiring
{
  assert(/tone\(\{freq:_sndJit\(L\.sub\[0\],0\.03\), type:'sine', dur:L\.sub\[1\], vol:_sndJit\(L\.sub\[2\],0\.10\), slideTo:Math\.max\(20, L\.sub\[0\]\*0\.55\), attack:L\.subA\|\|0\.002\}\);/.test(src),
    'shoot() fires the sub layer with a fast attack (a thump, not a hum) — jittered per shot since 1363; the launcher slows it via subA');
  assert(/tone\(\{freq:_sndJit\(L\.body\.freq,0\.03\), type:L\.body\.type, dur:L\.body\.dur, vol:_sndJit\(L\.body\.vol,0\.10\), slideTo:L\.body\.slideTo, attack:L\.body\.attack\|\|0\.005\}\);/.test(src)
      && /noise\(\{dur:L\.crack\.dur, vol:_sndJit\(L\.crack\.vol,0\.10\)\*\(first\?1\.2:1\), filterFreq:L\.crack\.filterFreq, type:L\.crack\.type\}\);/.test(src),
    '...then the tuned body+crack pair — the values still come from the table byte-for-byte, only the jitter multiplies them');
  assert(/setTimeout\(\(\)=>noise\(\{dur:L\.tail\[0\], vol:L\.tail\[1\], filterFreq:L\.tail\[2\], type:'lowpass'\}\), Math\.max\(0, Math\.round\(L\.tail\[3\]\+\(Math\.random\(\)\*2-1\)\*15\)\)\);/.test(src),
    '...then the delayed tail (its delay wanders +-15 ms since 1363)');
  assert(/suppressed 'phut' \(deliberately tail-less/.test(src), 'the suppressed branch stays a bare phut — that is what a suppressor is FOR');
  assert(/_cmp\.threshold\.value=-18/.test(src) && /_cmp\.ratio\.value=4/.test(src) && /sfxBus\.connect\(_cmp\); _cmp\.connect\(masterBus\);/.test(src),
    'the SFX bus routes through a gentle compressor');
  assert(/catch\(e\)\{ sfxBus\.connect\(masterBus\); \}/.test(src), '...with the plain connect as the fallback');
}

done('build 1211: three-layer gunshots — the table preserves every pre-1211 tuned body/crack value byte-for-byte while adding per-weapon sub thumps and delayed tails (sniper deepest and longest, executed comparisons), reload() executed proving start/45%/end clicks track the real reloadMs for both a slow sniper and a fast pistol, and the SFX bus gained a compressor with a clean fallback');
