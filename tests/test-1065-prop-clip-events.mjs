// (build 1065) PROP CLIPS FIRE THEIR EVENTS — the follow-up flagged in 1064: timeline events
// (sounds / logic signals) authored on a clip only fired on character rigs, because the event
// scan walked mixers via userData.stateActions. Prop mixers keep an ARRAY (userData.animActions)
// instead; the scan now walks both, and playModelAnimations marks event-carrying prop mixers
// with the same zero-cost _caHasEv flag. A door-creak sound or a "doorOpened" logic signal
// authored on a prop clip now fires wherever that clip plays — Auto, E, Signals, or Logic.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- the scan, executed against stubbed character + prop mixers ----
const fired = [];
const glue = `
const _caFireSpan=(evs,prev,now,previewOnly)=>{ FIRED.push([prev,now,evs.length,previewOnly]); };
const _mixerRoot=(m)=>m.__root;
let mixers=[];
${extractFunction('_caScanClipEvents', src)}
return { scan:_caScanClipEvents, setMixers:(m)=>{ mixers=m; } };`;
const env = new Function('FIRED', glue)(fired);

const clipWithEv = { duration: 1, _caEvents: [{ t: 0.5, type: 'sound', snd: 'x' }] };
const mkPropAction = () => ({
  time: 0.2, paused: false, _run: true,
  getClip() { return clipWithEv; },
  isRunning() { return this._run; },
  getEffectiveWeight() { return 1; },
});
{
  const a = mkPropAction();
  const propMixer = { _caHasEv: true, __root: { userData: { animActions: [a] } } };
  env.setMixers([propMixer]);
  env.scan();
  eq(fired.length, 0, 'first pass ARMS the prop action without replaying history');
  a.time = 0.7;
  env.scan();
  eq(fired.length, 1, 'the second pass fires the covered span');
  eq(fired[0][0], 0.2, '...from the armed time');
  near(fired[0][1], 0.7, 1e-9, '...to the current time');
  eq(fired[0][3], false, 'live (not preview-only) — signals reach the logic graph');
  a._run = false;
  env.scan();
  eq(fired.length, 1, 'a stopped prop action fires nothing');
  a._run = true; a.time = 0.1;
  env.scan();
  eq(fired.length, 1, 're-running re-ARMS first (no replayed history after a stop)');
  a.time = 0.4;
  env.scan();
  eq(fired.length, 2, '...then fires normally again');
}
{
  // a character mixer still works through stateActions — the old branch is intact
  fired.length = 0;
  const a = { time: 0.1, enabled: true, paused: false,
    getClip() { return clipWithEv; }, getEffectiveWeight() { return 1; } };
  const charMixer = { _caHasEv: true, __root: { userData: { stateActions: { idle: a } } } };
  env.setMixers([charMixer]);
  env.scan(); a.time = 0.6; env.scan();
  eq(fired.length, 1, 'character rigs scan exactly as before');
}
{
  // unflagged mixers cost nothing
  fired.length = 0;
  env.setMixers([{ _caHasEv: false, __root: { userData: { animActions: [mkPropAction()] } } }]);
  env.scan(); env.scan();
  eq(fired.length, 0, 'mixers without the _caHasEv mark are skipped entirely');
}

// ---- wiring pins ----
assert(/mixer\._caHasEv = clips\.some\(c=>c && c\._caEvents && c\._caEvents\.length\);/.test(src),
  'playModelAnimations marks event-carrying prop mixers at build time (zero cost otherwise)');
assert(/const pacts=root\.userData\.animActions;/.test(src) && /if\(!a\.isRunning\(\) \|\| a\.paused \|\| a\.getEffectiveWeight\(\)<0\.3\)\{ a\._caLastT=null; continue; \}/.test(src),
  'the scan walks prop action arrays, gated on genuinely-running actions');

done('build 1065: a prop clip’s authored moments — creaks, footsteps, logic signals — fire wherever the clip plays');
