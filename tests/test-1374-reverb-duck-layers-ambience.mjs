// build 1374: the room, the duck, the layered score, and the ambience bed (audio review #5/#9 + papercut).
// Every sound was bone dry (zero ConvolverNode - an interior and an open arena were sonically identical),
// the music sat ~22 dB under the loudest SFX with no ducking anywhere, intensity was one scalar fader on
// the 260 ms metronome, and the world was SILENT between events. Executed with the 1208/1363 fake-graph
// pattern: the reverb send topology + its clean skip when unsupported, the sidechain dip + exponential
// recovery, the layer gates at 0.3/0.5/0.75 on the existing step boundary, and the bed lifecycle (starts
// and stops with the music system, never in the editor), plus the 1211 compressor and 1208 panner
// fallbacks pinned unchanged.
import { gameSource, extractFunction, done, assert, eq, near } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- fake WebAudio graph (the 1208/1363 pattern)
function mkCtx(opts){
  opts = opts || {};
  const made = [];
  function param(v){ return { value:v, sets:[],
    setValueAtTime(x,t){ this.sets.push(['set',x,t]); },
    setTargetAtTime(x,t,tau){ this.sets.push(['target',x,t,tau]); },
    linearRampToValueAtTime(x,t){ this.sets.push(['lin',x,t]); },
    exponentialRampToValueAtTime(x,t){ this.sets.push(['exp',x,t]); },
    cancelScheduledValues(t){ this.sets.push(['cancel',t]); } }; }
  function node(kind, extra){
    const n = Object.assign({ kind, outs:[], started:false, stopped:false,
      connect(t){ this.outs.push(t); return t; },
      disconnect(){},
      start(){ this.started=true; }, stop(){ this.stopped=true; } }, extra||{});
    made.push(n); return n;
  }
  const ctx = {
    currentTime: 0, sampleRate: 8000,
    destination: { kind:'dest' },
    createGain(){ return node('gain', { gain:param(1) }); },
    createOscillator(){ return node('osc', { type:'sine', frequency:param(440) }); },
    createBiquadFilter(){ return node('filt', { type:'lowpass', frequency:param(350) }); },
    createDynamicsCompressor(){ return node('comp', { threshold:param(0), knee:param(0), ratio:param(0), attack:param(0), release:param(0) }); },
    createBuffer(ch, len, sr){ const data=[]; for(let i=0;i<ch;i++) data.push(new Float32Array(len));
      return { numberOfChannels:ch, length:len, sampleRate:sr, duration:len/sr, getChannelData(i){ return data[i]; } }; },
    createBufferSource(){ return node('bufsrc', { buffer:null, loop:false }); },
    _made: made,
  };
  if(!opts.noConvolver && !opts.throwConvolver) ctx.createConvolver = function(){ return node('conv', { buffer:null }); };
  if(opts.throwConvolver) ctx.createConvolver = function(){ throw new Error('nope'); };
  return ctx;
}

const constLine    = src.match(/const REVERB_WET=[^\n]*\n/)[0];
const ambConstLine = src.match(/const AMB_GAIN=[^\n]*\n/)[0];
const fnIR    = extractFunction('_makeReverbIR');
const fnBuses = extractFunction('buildAudioBuses');
const fnDuck  = extractFunction('_duckMusic');
const fnStep  = extractFunction('_musicStepFn');
const fnProc  = extractFunction('_startProcMusic');
const fnStart = extractFunction('startMusic');
const fnStop  = extractFunction('stopMusic');
const fnAmbStart = extractFunction('_startAmbience');
const fnAmbStop  = extractFunction('_stopAmbience');
const fnAmbArm   = extractFunction('_ambArm');
const fnAmbShot  = extractFunction('_ambOneShot');

// ---------------------------------------------------------------- 1. the reverb send + duck topology (executed)
function busRig(mode){
  const ax = mkCtx({ noConvolver: mode==='none', throwConvolver: mode==='throw' });
  const body =
    'let masterBus=null, sfxBus=null, musicBus=null, _musicDuck=null, _sfxVerb=null, _sfxVerbGain=null;\n' +
    constLine +
    'const applyAudioSettings=()=>{};\n' +
    fnIR + '\n' + fnBuses + '\n' +
    'buildAudioBuses();\n' +
    'const madeAfterFirst = actx._made.length;\n' +
    'buildAudioBuses();\n' +
    'return { masterBus, sfxBus, musicBus, _musicDuck, _sfxVerb, _sfxVerbGain, madeAfterFirst };';
  const r = new Function('actx', body)(ax);
  r.ax = ax; return r;
}
{ // the full graph, convolver available
  const r = busRig('full');
  assert(r.masterBus && r.masterBus.outs[0] === r.ax.destination, 'master feeds the destination');
  const comp = r.sfxBus.outs[0];
  eq(comp.kind, 'comp', 'the DRY path still goes sfx -> compressor first (1211, untouched)');
  assert(comp.outs[0] === r.masterBus, '...and the compressor still feeds master');
  eq(r.sfxBus.outs.length, 2, 'sfxBus has exactly two outputs: the dry compressor and the wet SEND');
  const conv = r.sfxBus.outs[1];
  eq(conv.kind, 'conv', 'the second output is the convolver - a parallel send, never inserted into the dry chain');
  assert(r._sfxVerb === conv, 'the send is the recorded _sfxVerb');
  const wet = conv.outs[0];
  eq(wet.kind, 'gain', 'convolver -> wet gain');
  near(wet.gain.value, 0.18, 1e-9, 'the wet mix is the shipped REVERB_WET, executed from the real const line');
  assert(wet.outs[0] === r.masterBus, 'wet gain -> master (the send taps the bus, so the SFX volume slider scales the reverb too)');
  const ir = conv.buffer;
  eq(ir.numberOfChannels, 2, 'the IR is stereo');
  eq(ir.length, 2*r.ax.sampleRate, 'the IR is exactly 2 s at the context rate');
  const a = ir.getChannelData(0), b = ir.getChannelData(1);
  let diff=0; for(let i=0;i<1000;i++) if(a[i]!==b[i]) diff++;
  assert(diff > 900, 'the two channels are decorrelated (independent noise: ' + diff + '/1000 samples differ)');
  const n = ir.length, q = [0,0,0,0];
  for(let k=0;k<4;k++){ let sum=0; for(let i=k*n/4; i<(k+1)*n/4; i++) sum += Math.abs(a[i]); q[k]=sum/(n/4); }
  for(let k=0;k<3;k++){ const ratio=q[k]/q[k+1]; assert(ratio>4 && ratio<8, 'quarter '+k+'/'+(k+1)+' amplitude ratio '+ratio.toFixed(2)+' matches an exponential tail (analytic 5.62 for -60 dB over 2 s)'); }
  assert(q[0]/q[3] > 60, 'the tail decays by orders of magnitude end to end - exponential, not linear');
  assert(r.musicBus.outs.length === 1 && r.musicBus.outs[0] === r._musicDuck, 'musicBus feeds ONLY the duck - no direct-to-master path remains');
  eq(r._musicDuck.kind, 'gain', 'the duck is a gain node');
  assert(r._musicDuck.outs[0] === r.masterBus, 'duck -> master');
  eq(r.ax._made.length, r.madeAfterFirst, 'buildAudioBuses stays idempotent (the masterBus guard)');
}
{ // no ConvolverNode: skip cleanly, everything else identical
  const r = busRig('none');
  assert(r._sfxVerb === null && r._sfxVerbGain === null, 'no createConvolver -> the send is skipped');
  eq(r.sfxBus.outs.length, 1, '...and sfxBus keeps ONLY its dry path');
  eq(r.sfxBus.outs[0].kind, 'comp', 'the dry compressor chain is unchanged');
  assert(r.musicBus.outs[0] === r._musicDuck && r._musicDuck.outs[0] === r.masterBus, 'the duck is unaffected by the missing convolver');
}
{ // a THROWING createConvolver also degrades cleanly (the catch path)
  const r = busRig('throw');
  assert(r._sfxVerb === null, 'a throwing convolver constructor is caught');
  eq(r.sfxBus.outs.length, 1, '...leaving the dry chain intact');
  assert(r._musicDuck && r._musicDuck.outs[0] === r.masterBus, '...and the duck intact');
}

// ---------------------------------------------------------------- 2. the sidechain dip + exponential recovery (executed)
function duckRig(hasNode, t){
  const sets = [];
  const body =
    constLine +
    'const actx={currentTime:T};\n' +
    'const _musicDuck = HAS ? { gain:{' +
    '  setValueAtTime:(v,tt)=>SETS.push(["set",v,tt]),' +
    '  setTargetAtTime:(v,tt,tau)=>SETS.push(["target",v,tt,tau]),' +
    '  cancelScheduledValues:(tt)=>SETS.push(["cancel",tt]) } } : null;\n' +
    fnDuck + '\n_duckMusic();\nreturn SETS;';
  return new Function('HAS','T','SETS', body)(hasNode, t, sets);
}
{
  const sd = duckRig(true, 7);
  eq(sd.length, 3, 'a duck is three scheduled param ops and nothing else');
  eq(sd[0][0], 'cancel', 'pending recovery is cancelled first, so rapid fire re-dips instead of stacking schedules');
  eq(sd[1][0], 'set', 'then the dip lands instantly'); near(sd[1][1], 0.45, 1e-9, '...to the mandated ~0.45'); eq(sd[1][2], 7, '...at now');
  eq(sd[2][0], 'target', 'then the recovery is scheduled as setTargetAtTime - which IS an exponential approach');
  eq(sd[2][1], 1, 'recovering to unity');
  assert(sd[2][3] >= 0.08 && sd[2][3] <= 0.15, 'tau ' + sd[2][3] + ' puts ~95% recovery at 3*tau = ' + (3*sd[2][3]).toFixed(2) + ' s (~350 ms)');
  eq(duckRig(false, 0).length, 0, 'no duck node (buses not built yet) -> a clean no-op');
}
{ const fd = extractFunction('_duckMusic');
  assert(!fd.includes('setInterval') && !fd.includes('setTimeout') && !fd.includes('requestAnimationFrame'), 'the duck does NO per-frame work - audio-thread param scheduling only'); }
assert(src.includes('shoot(){ _duckMusic(); if(playSample'), 'SFX.shoot dips the music before any path (sample, suppressed or synth)');
assert(src.includes('explode(at){ _duckMusic(); if(playSample'), 'SFX.explode dips it too');
eq(src.split('_duckMusic();').length - 1, 2, 'exactly the two mandated call sites - shoot and explode');

// ---------------------------------------------------------------- 3. the layers, gated on the existing step (executed)
function stepRig(inten, step){
  const ax = mkCtx();
  const dn = ()=>({ g:{ gain:{ sets:[], setTargetAtTime(v,t,tau){ this.sets.push([v,t,tau]); } } } });
  const D=[dn(),dn(),dn()], C=dn();
  const body =
    'let _musicOn=true, _musicInt=I, _musicTarget=I, _musicStep=S;\n' +
    'const MUSIC_ROOT=110; const musicBus={};\n' +
    fnStep + '\n_musicStepFn();\n';
  new Function('actx','I','S','_musicDrone','_musicCntr', body)(ax, inten, step, D, C);
  const created = ax._made;
  return {
    D, C,
    bass: created.find(nd => nd.kind==='osc' && nd.type==='sawtooth'),
    hat:  created.find(nd => nd.kind==='bufsrc'),
    bassGain: created.find(nd => nd.kind==='gain' && nd.gain.sets.some(sv => sv[0]==='lin')),
    hatHp: created.find(nd => nd.kind==='filt' && nd.type==='highpass'),
  };
}
{ // silence: the drone still hums (the always-on floor), nothing else plays
  const r = stepRig(0, 0);
  assert(r.D[0].g.gain.sets.length === 1 && r.D[0].g.gain.sets[0][0] > 0.02, 'at intensity 0 the drone holds a real floor (' + r.D[0].g.gain.sets[0][0].toFixed(3) + ') - the world between events is no longer silent');
  assert(!r.bass, 'no bass at 0');
  assert(!r.hat, 'no hat at 0');
  assert(r.C.g.gain.sets.length === 1 && r.C.g.gain.sets[0][0] <= 0.0001, 'the counter-drone is parked at silence');
}
{ // 0.2: below the NEW bass gate (the old gate was 0.04, i.e. effectively always on - nothing ever ENTERED)
  const r = stepRig(0.2, 0);
  assert(!r.bass, 'no bass at 0.2 - the bass now has a real entry at 0.3');
  assert(r.D[0].g.gain.sets[0][0] > stepRig(0,0).D[0].g.gain.sets[0][0], 'the drone still tracks intensity above its floor');
}
{ // 0.4: bass in, hat still out even on an off-beat
  const r = stepRig(0.4, 1);
  assert(r.bass, 'bass enters past 0.3');
  eq(r.bass.frequency.value, 55, 'the bass line itself is unchanged (MUSIC_ROOT*0.5 on this beat)');
  near(r.bassGain.gain.sets.find(sv=>sv[0]==='lin')[1], 0.15*0.4, 1e-9, 'bass gain is 0.15*inten - the ~8 dB parity raise (was 0.06)');
  assert(!r.hat, 'no hat at 0.4 (its gate is 0.5 now, was 0.35)');
}
{ // 0.6 on an off-beat: hat enters; the counter-drone still waits
  const r = stepRig(0.6, 1);
  assert(r.bass && r.hat && r.hatHp && r.hatHp.frequency.value === 6000, 'bass + hat at 0.6 on beat 1');
  const hatGain = r.hat.outs[0].outs[0];
  near(hatGain.gain.value, 0.10*0.6, 1e-9, 'hat gain is 0.10*inten (was 0.04)');
  assert(r.C.g.gain.sets[0][0] <= 0.0001, 'counter-drone still silent at 0.6');
}
{ // 0.6 on a DOWN-beat: no hat (off-beats only, unchanged)
  const r = stepRig(0.6, 0);
  assert(r.bass && !r.hat, 'the hat still lives on the off-beats only');
}
{ // 0.8: the fifth-above counter-drone finally enters
  const r = stepRig(0.8, 3);
  near(r.C.g.gain.sets[0][0], 0.05*0.8, 1e-9, 'past 0.75 the counter-drone fades in (0.05*inten)');
  assert(r.bass && r.hat, 'over the full stack');
}
{ // full intensity: the parity raise on the drone itself
  const r = stepRig(1, 0);
  near(r.D[0].g.gain.sets[0][0], 0.11, 1e-6, 'lead drone tops out at 0.11 (was 0.045 - the ~8 dB raise toward parity)');
}
// entries land on the EXISTING step boundary: every gate lives inside the 260 ms step fn
assert(fnStep.includes('inten>0.3') && fnStep.includes('inten>0.5 && (beat===1||beat===3)') && fnStep.includes('inten>0.75'), 'all three gates live inside _musicStepFn, so every entry lands on a step');
assert(src.includes('_musicTimer=setInterval(_musicStepFn, 260);'), 'the metronome is the existing 260 ms step, unchanged');
eq(src.split('_musicCntr.g.gain.setTargetAtTime').length - 1, 2, 'the counter-drone gain has exactly two writers: the step fn and the stopMusic fade');
assert(src.includes('music:_clamp01(j.music!=null?j.music:0.6)'), 'musicBus stays at the authored 0.6 default - parity comes from element gains + the duck, not a louder bus');

// ---------------------------------------------------------------- 4. the counter-drone is seated WITH the stack (executed)
{
  const ax = mkCtx(); const iv=[];
  const body =
    'let _musicOn=false,_musicInt=9,_musicStep=9,_musicDrone=null,_musicCntr=null,_musicTimer=null;\n' +
    'const MUSIC_ROOT=110; const musicBus={};\n' +
    'const _musicStepFn=()=>{};\n' +
    'const setInterval=(fn,ms)=>{ IV.push(ms); return 1; };\n' +
    fnProc + '\n_startProcMusic();\nreturn { drone:_musicDrone, cntr:_musicCntr, on:_musicOn };';
  const r = new Function('actx','IV',body)(ax, iv);
  eq(r.drone.length, 3, 'the three-voice drone stack is unchanged');
  eq(r.cntr.o.frequency.value, 330, 'the counter-drone sits a fifth above the octave (MUSIC_ROOT*3 = 330 Hz)');
  eq(r.cntr.g.gain.value, 0, 'it starts silent like every drone voice');
  assert(r.cntr.o.started, 'its oscillator runs from the start - existence is fixed at start, the gain does the gating');
  eq(iv[0], 260, 'the step interval is untouched');
  assert(r.on, 'proc music marks itself on');
}

// ---------------------------------------------------------------- 5. the bed starts with the music system, never in the editor (executed)
function smRig(opts){
  const log=[];
  const body =
    'let _musicOn=OP.on||false;\n' +
    'const actx={}, musicBus={};\n' +
    'const editorOpen=!!OP.editor;\n' +
    'const curMusicUrl=()=>OP.url||"";\n' +
    'const _startAmbience=()=>LOG.push("amb");\n' +
    'const _startProcMusic=()=>{ LOG.push("proc"); };\n' +
    'const loadSound=(u,cb)=>LOG.push("load:"+u);\n' +
    fnStart + '\nstartMusic();\nreturn LOG;';
  return new Function('OP','LOG', body)(opts, log);
}
eq(smRig({editor:true}).join(','), '', 'the editor gate sits ABOVE the bed: editing starts neither music nor ambience');
eq(smRig({}).join(','), 'amb,proc', 'the proc path starts the bed first, then the score');
eq(smRig({url:'x.mp3'}).join(','), 'amb,load:x.mp3', 'the CUSTOM-track path starts the bed too - it is not a proc-score feature');
eq(smRig({on:true}).join(','), '', 'already-on stays idempotent');
{ const iGate=fnStart.indexOf("editorOpen) return;"), iAmb=fnStart.indexOf('_startAmbience();'), iMurl=fnStart.indexOf('const murl');
  assert(iGate>=0 && iAmb>iGate && iMurl>iAmb, 'order in source: editor gate, then the bed, then the track choice'); }
assert(fnStop.includes('_stopAmbience(); }'), 'stopMusic tears the bed down, so every silence path (win, death, editor open, track switch) inherits it');
assert(fnStop.includes('_musicCntr.g.gain.setTargetAtTime(0.0001') && fnStop.includes('_musicCntr=null;'), 'stopMusic fades and releases the counter-drone like the drone stack');
assert(src.includes('musicBus.gain.setTargetAtTime(_editing?0:audioSettings.music, t, 0.02)'), 'the bed rides musicBus, which applyAudioSettings already mutes while editing (belt beside the lifecycle gate)');

// ---------------------------------------------------------------- 6. the bed itself + the sparse one-shots (executed)
function ambRig(){
  const ax = mkCtx();
  const musicBus = { kind:'musicBus' };
  const T=[], CL=[], calls=[];
  const body =
    'let _ambOn=false,_ambSrc=null,_ambLfo=null,_ambGain=null,_ambFilt=null,_ambTimer=null,_ambBuf=null;\n' +
    ambConstLine +
    'let gameOn=false, editorOpen=false, RND=null;\n' +
    'const setTimeout=(fn,ms)=>{ T.push({fn,ms}); return T.length; };\n' +
    'const clearTimeout=(id)=>{ CL.push(id); };\n' +
    'const camera={ position:{x:10,y:2,z:-5} };\n' +
    'const tone=(o)=>CALLS.push(["tone",o]);\n' +
    'const noise=(o)=>CALLS.push(["noise",o]);\n' +
    'const Math=Object.create(globalThis.Math); Math.random=()=>RND==null?globalThis.Math.random():RND;\n' +
    fnAmbStart + '\n' + fnAmbStop + '\n' + fnAmbArm + '\n' + fnAmbShot + '\n' +
    'return { start:_startAmbience, stop:_stopAmbience, shot:_ambOneShot, arm:_ambArm,' +
    '  set:(k,v)=>{ if(k==="g") gameOn=v; else if(k==="e") editorOpen=v; else RND=v; },' +
    '  st:()=>({ on:_ambOn, src:_ambSrc, lfo:_ambLfo, gain:_ambGain, timer:_ambTimer }) };';
  const r = new Function('actx','musicBus','T','CL','CALLS', body)(ax, musicBus, T, CL, calls);
  r.ax=ax; r.musicBus=musicBus; r.T=T; r.CL=CL; r.calls=calls; return r;
}
{
  const r = ambRig();
  r.start();
  const st = r.st();
  assert(st.on, 'the bed is on');
  assert(st.src && st.src.loop === true && st.src.started, 'one LOOPING noise source, started');
  eq(st.src.buffer.numberOfChannels, 1, 'a mono bed - the reverb send is what widens the room');
  const filt = st.src.outs[0];
  eq(filt.kind, 'filt', 'source -> filter'); eq(filt.type, 'lowpass', '...a lowpass');
  assert(filt.frequency.value >= 400 && filt.frequency.value <= 900, 'base cutoff ' + filt.frequency.value + ' sits inside the mandated 400-900 band');
  assert(filt.outs[0] === st.gain, 'lowpass -> bed gain');
  assert(st.gain.gain.value > 0 && st.gain.gain.value <= 0.03, 'the bed is a whisper (' + st.gain.gain.value + ')');
  assert(st.gain.outs[0] === r.musicBus, 'the bed rides musicBus: editor mute, music slider and the duck all apply');
  assert(st.lfo && st.lfo.started && st.lfo.frequency.value < 1, 'a sub-Hz LFO runs the wander');
  const lg = st.lfo.outs[0];
  assert(lg && lg.kind === 'gain' && lg.outs[0] === filt.frequency, 'LFO -> depth gain -> the FILTER FREQUENCY param: the wander is audio-thread only, zero JS per frame');
  assert(filt.frequency.value - lg.gain.value >= 400 && filt.frequency.value + lg.gain.value <= 900, 'the wander stays inside the band (' + (filt.frequency.value-lg.gain.value) + '-' + (filt.frequency.value+lg.gain.value) + ' Hz)');
  eq(r.T.length, 1, 'one pending one-shot timer');
  assert(r.T[0].ms >= 6000 && r.T[0].ms <= 18000, 'armed inside the mandated 6-18 s (' + r.T[0].ms.toFixed(0) + ' ms)');
  const madeBefore = r.ax._made.length;
  r.start();
  eq(r.ax._made.length, madeBefore, 'a second start creates nothing (idempotent)');
  // the one-shots: gated on gameOn and not-editing, but ALWAYS re-armed
  r.set('r', 0.25);
  r.shot();
  eq(r.calls.length, 0, 'not in a game: the shot is skipped');
  eq(r.T.length, 2, '...but the schedule re-arms - a gated skip must not end it');
  r.set('g', true); r.set('e', true);
  r.shot();
  eq(r.calls.length, 0, 'editing: skipped too (the one-shots ride the SFX path, which the editor does not mute)');
  r.set('e', false);
  r.shot();
  eq(r.calls.length, 1, 'live game: one distant sound fires');
  eq(r.calls[0][0], 'noise', 'random 0.25 picks the rumble branch');
  const at = r.calls[0][1].at;
  assert(at && Math.abs(Math.hypot(at.x-10, at.z+5) - 30) < 1e-6, 'positioned ~30 m out at a random azimuth (the caller hands _spatialOut a world position)');
  eq(at.y, 2, '...at ear height (the camera y)');
  assert(r.calls[0][1].vol <= 0.08, 'low volume even before the 30 m rolloff applies');
  r.set('r', 0.75);
  r.shot();
  eq(r.calls[1][0], 'tone', 'random 0.75 picks the whistle branch');
  assert(r.calls[1][1].vol <= 0.04 && Math.abs(Math.hypot(r.calls[1][1].at.x-10, r.calls[1][1].at.z+5) - 30) < 1e-6, 'the whistle is quiet and also ~30 m out');
  r.set('r', 0); r.arm(); eq(r.T[r.T.length-1].ms, 6000, 'random 0 arms at exactly 6 s');
  r.set('r', 0.9999); r.arm(); assert(r.T[r.T.length-1].ms > 17990 && r.T[r.T.length-1].ms <= 18000, 'random ~1 arms at ~18 s');
  const preT = r.T.length;
  r.stop();
  const s2 = r.st();
  assert(!s2.on && s2.src === null && s2.lfo === null, 'stop releases the bed');
  assert(r.CL.length > 0, 'the pending timer is cleared');
  r.shot();
  eq(r.T.length, preT, 'a stray fire after stop never re-arms');
  eq(r.calls.length, 2, '...and never sounds');
}

// ---------------------------------------------------------------- 7. the 1211 compressor + 1208 panner fallbacks, pinned unchanged
assert(src.includes('try{ const _cmp=actx.createDynamicsCompressor(); _cmp.threshold.value=-18; _cmp.knee.value=12; _cmp.ratio.value=4; _cmp.attack.value=0.003; _cmp.release.value=0.12; sfxBus.connect(_cmp); _cmp.connect(masterBus); }'), 'the 1211 sfx compressor block is byte-identical');
assert(src.includes('catch(e){ sfxBus.connect(masterBus); }'), '...with its plain-connect fallback');
assert(src.includes('const bus = sfxBus || (actx && actx.destination);'), 'the 1208 panner bus fallback is untouched');
assert(src.includes("if(!at || !actx || !actx.createStereoPanner || typeof camera==='undefined' || !camera) return bus;"), '...and its no-createStereoPanner early return');
assert(src.includes('}catch(err){ return bus; }'), '...and its catch-all fallback to the plain bus');

done('build 1374: the reverb send is a parallel convolver path with a generated 2 s stereo-decorrelated exponential IR that skips cleanly (absent OR throwing createConvolver) while the 1211 dry chain stays byte-identical; the sidechain duck (musicBus -> duck -> master) dips to 0.45 and recovers exponentially with zero per-frame work, fired from exactly shoot + explode; the score is layers on the existing 260 ms step - always-on drone floor, bass past 0.3, hat past 0.5, a fifth-above counter-drone past 0.75, gains ~8 dB toward parity with musicBus at its authored 0.6; and the ambience bed (looping 400-900 Hz filtered noise on a sub-Hz audio-thread LFO at a whisper into musicBus, plus 6-18 s one-shots at ~30 m through the spatial path) starts and stops with the music system, never in the editor, and its one-shots gate on gameOn');
