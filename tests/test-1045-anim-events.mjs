// (build 1045) ANIMATION EVENTS — authored moments on a custom clip that fire while it plays:
// sound events (footsteps, casings, reload clicks — any level sound URL) and signal events
// (melee hit-windows, scripted beats — land in the Logic graph as On-event pulses). Events ride
// the clip data through the sanitizer / level / .rumpusanim, draw as orange timeline ticks,
// fire wrap-aware in the mixer pass, and optionally during editor playback (sounds only).
import { readFileSync } from 'node:fs';
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
const manual = readFileSync(new URL('../breach-help.html', import.meta.url), 'utf8');

// ---- sanitizer: events are validated plain data ----
{
  const san = new Function("let _caRev=0;\nconst CA_SLOTS=['hips','head'];\n"
    + extractFunction('_caNewId', src) + '\n' + extractFunction('_caSanitize', src) + '\nreturn _caSanitize;')();
  const d = san([{ dur: 2, tracks: {}, events: [
    { t: 0.5, type: 'sound', snd: ' https://x.y/step.ogg ' },
    { t: 1.2, type: 'signal', sig: 'meleeHit' },
    { t: 0.1, type: 'sound', snd: '' },                    // empty payload drops
    { t: 99, type: 'signal', sig: 'late' },                // clamps to dur
    { t: 0.3, type: 'evil', run: 'alert(1)' },             // unknown type drops
    { t: NaN, type: 'sound', snd: 'x' },                   // non-finite drops
  ] }])[0];
  eq(d.events.length, 3, 'only valid events survive');
  eq(d.events[0].snd, 'https://x.y/step.ogg', 'sound URLs trim');
  eq(d.events[1].sig, 'meleeHit', 'signal names keep');
  eq(d.events[2].t, 2, 'late events clamp to the clip duration');
  assert(d.events.every(e => /^ce_[a-z0-9]+$/.test(e.id)), 'every event carries a stable id');
  assert(!d.events.some(e => 'run' in e), 'foreign fields are stripped — imported events are inert');
  eq(san([{ dur: 1, tracks: {} }])[0].events, undefined, 'no events, no field (old clips unchanged)');
  const many = san([{ dur: 1, tracks: {}, events: Array.from({ length: 50 }, (_, i) => ({ t: i / 50, type: 'signal', sig: 's' + i })) }])[0];
  eq(many.events.length, 32, 'hard cap at 32 events per clip');
}

// ---- wrap-aware firing ----
{
  const fired = [];
  const env = new Function('playSample', 'logicEvent', 'NET',
    extractFunction('_caFireEvent', src) + '\n' + extractFunction('_caFireSpan', src) + '\nreturn _caFireSpan;')(
    (u) => { fired.push('snd:' + u); return true; }, (n) => { fired.push('sig:' + n); }, { mode: 'off' });
  const EVS = [{ t: 0.2, type: 'sound', snd: 'a' }, { t: 0.8, type: 'signal', sig: 'b' }];
  env(EVS, 0.1, 0.5, false);
  eq(fired.join(','), 'snd:a', 'events inside the span fire once');
  fired.length = 0; env(EVS, 0.5, 0.5, false);
  eq(fired.length, 0, 'no time passed, nothing fires');
  fired.length = 0; env(EVS, 0.7, 0.1, false);   // the loop wrapped; only the tail event is in the covered span
  eq(fired.join(','), 'sig:b', 'a loop wrap fires the tail (0.8 ∈ 0.7→end) but not events outside the span');
  fired.length = 0; env(EVS, 0.9, 0.25, false);  // wrapped further: the head event is now covered
  eq(fired.join(','), 'snd:a', '...and the head after the wrap (0.2 ∈ 0→0.25)');
  fired.length = 0; env(EVS, 0.75, 0.22, false); // spans both sides of the wrap
  eq(fired.sort().join(','), 'sig:b,snd:a', 'a span across the wrap fires tail AND head');
  fired.length = 0; env(EVS, 0.1, 0.9, true);
  eq(fired.join(','), 'snd:a', 'preview mode fires sounds but never signals (no gameplay side effects)');
}
{ // signals are authoritative-side only
  const fired = [];
  const fe = new Function('playSample', 'logicEvent', 'NET',
    extractFunction('_caFireEvent', src) + '\nreturn _caFireEvent;')(
    () => true, (n) => fired.push(n), { mode: 'client' });
  fe({ type: 'signal', sig: 'x' }, false);
  eq(fired.length, 0, 'a multiplayer CLIENT never fires signal events (the host is authoritative)');
}

// ---- runtime wiring ----
{
  const scan = extractFunction('_caScanClipEvents', src);
  assert(/if\(!m \|\| !m\._caHasEv\) continue;/.test(scan), 'only event-carrying mixers get scanned (zero cost otherwise)');
  assert(/a\.getEffectiveWeight\(\)<0\.3\)\{ a\._caLastT=null; continue; \}/.test(scan), 'crossfaded-out clips stay silent and re-arm cleanly');
  assert(/if\(a\._caLastT==null\)\{ a\._caLastT=now; continue; \}/.test(scan), 'a fresh activation arms without replaying history');
}
assert(/if\(typeof _caScanClipEvents==='function'\) _caScanClipEvents\(\);/.test(src), 'the mixer pass dispatches every frame');
assert(/mixer\._caHasEv = Object\.keys\(actions\)\.some/.test(src), 'playEnemyStates marks event-carrying rigs at build time');
assert(/if\(data\.events && data\.events\.length\) clip\._caEvents=data\.events\.map/.test(src), 'built clips carry their events');

// ---- editor wiring ----
assert(/id="aeFireEv" type="checkbox" checked/.test(src) && /_aeFireEv=e\.target\.checked;/.test(src), 'the Fire-events toggle exists (default on)');
assert(/_caFireSpan\(c\._caEvents, _pv, _aeTime, true\);/.test(src), 'editor playback fires through the same span logic, preview-only');
assert(/for\(const ev of _aeClip\.events\)\{ const x=_aeTLx\(ev\.t, g\); ctx\.fillRect/.test(src), 'events draw as ticks on the timeline');
assert(/'\+ Event at playhead'/.test(src), 'the inspector adds events at the playhead');
assert(/\[\['sound','Sound'\],\['signal','Signal'\]\]/.test(src), 'both event types are editable');
assert(/pi\.setAttribute\('list', \(ev\.type==='signal'\)\?'lgEvtList':'lgSndList'\);/.test(src),
  'payload fields reuse the logic-graph datalists (known event names / known sound URLs)');
assert(/timeline events<\/b>/.test(manual), 'the field manual covers events');

// ---- field fixes folded into this build ----
eq((src.match(/back\.className='uiDlgBack';/g)||[]).length, 2, 'both themed dialogs mark their backdrop');
eq((src.match(/position:fixed;inset:0;z-index:400;background:rgba\(3,7,10,0\.66\)/g)||[]).length, 2,
  'dialogs stack ABOVE the fullscreen animation editor (they used to hide behind it)');
assert(/if\(document\.querySelector\('\.uiDlgBack'\)\) return;/.test(extractFunction('_aeKeys', src)),
  'while a dialog is up the editor yields its keys (Escape used to close the whole editor)');
{
  const lbl = new Function('const CA_SLOT_LABEL={ hips:"Hips" };\n' + extractFunction('_caSlotLabel', src) + '\nreturn _caSlotLabel;')();
  eq(lbl('L:leg'), 'Left shin (knee)', 'bone names lead with the joint — "knee" is findable');
  eq(lbl('R:forearm'), 'Right forearm (elbow)', '...same for elbows');
  eq(lbl('L:foot'), 'Left foot (ankle)', '...and ankles');
}

done('build 1045: clips carry authored moments — footsteps, casings and hit-windows fire wherever the clip plays');
