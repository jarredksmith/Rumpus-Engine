// build 1196: cutscene actor tracks, the composable way — each shot fires a logic event as it starts.
//
// The features critic wanted a sequencer. Instead of a parallel keyframe system, every cinematic shot
// gains ONE field: a named logic event fired the moment the shot begins. The graph's 'event' nodes then
// do the acting with verbs the engine already has — moveprop walks a tagged actor to its mark, xa clips
// play, dialogue opens, the ambush spawns. Chained shots become a directed sequence. Host-authoritative
// like every graph pulse; deliberately NOT fired from the editor's preview.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the trigger, executed
{
  const mk = (preview, netMode) => { const fired = [];
    const fn = new Function('_cineEditorPreview', 'logicEvent', 'NET',
      extractFunction('_cineFireShotEv') + '\nreturn _cineFireShotEv;'
    )(preview, (n) => fired.push(n), netMode ? { mode: netMode } : undefined);
    return { fn, fired }; };
  { const t = mk(false, 'off'); t.fn({ ev: 'act1' });
    eq(t.fired.join(','), 'act1', 'a shot with an event pulses the graph'); }
  { const t = mk(false, 'off'); t.fn({ ev: '' }); t.fn(null); t.fn({ ev: null });
    eq(t.fired.length, 0, 'no event, no shot, or a non-string: silence'); }
  { const t = mk(true, 'off'); t.fn({ ev: 'ambush' });
    eq(t.fired.length, 0, 'the editor PREVIEW never fires — framing a shot must not spawn the ambush it frames'); }
  { const t = mk(false, 'client'); t.fn({ ev: 'ambush' });
    eq(t.fired.length, 0, 'a CLIENT never fires — the graph runs host-authoritative and the host\'s results arrive in the snapshot'); }
  { const t = mk(false, 'host'); t.fn({ ev: 'go' });
    eq(t.fired.join(','), 'go', '...and the host does'); }
}

// ---------------------------------------------------------------- threaded through every shot chokepoint
{
  assert(/holdEnd:Math\.max\(0,\+s\.holdEnd\|\|0\), ev:\(typeof s\.ev==='string'\?s\.ev\.slice\(0,60\):''\) \}; \}/.test(src),
    '_resShot (the load normalizer) carries ev, capped at 60 chars against hostile files');
  assert(/holdEnd:Math\.max\(0,\+s\.holdEnd\|\|0\), ev:\(typeof s\.ev==='string'\?s\.ev:''\) \};\n  out\._poly/.test(src),
    '_normCineShot (the playback normalizer) carries it');
  assert(/holdStart:0, holdEnd:0, ev:'' \}; \}/.test(src), '_newCineShot ships the blank field');
  assert(/holdStart:0, holdEnd:0, ev:'', audio:'', shots2:\[\] \}; \}/.test(src), '_newCutscene too');
  assert(/cineCfg\.ev=\(typeof lc\.ev==='string'\)\?lc\.ev\.slice\(0,60\):'';/.test(src) && /cineCfg\.ev='';/.test(src),
    'the primary-cutscene loader parses it and the reset clears it');
  assert(/ev: cineCfg\.ev\|\|undefined, audio: cineCfg\.audio\|\|''/.test(src),
    'the serializer writes the primary shot\'s event (undefined when blank — old levels stay byte-identical)');
  eq((src.match(/holdEnd:s\.holdEnd, ev:s\.ev\|\|undefined \}\)\)/g) || []).length, 2,
    '...and both shots2 maps (primary + other cutscenes)');
  assert(/holdEnd:o\.holdEnd, ev:o\.ev\|\|undefined, shots2:/.test(src), '...and every other cutscene\'s first shot');
}

// ---------------------------------------------------------------- fired at the right moments
{
  assert(/_cineFireShotEv\(_cineData\);   \/\* build 1196: the first shot's event \*\//.test(src),
    'startCinematic fires the FIRST shot\'s event (the advance loop only sees shots 2..n)');
  assert(/_cineShotIdx\+\+; _cineData=_cineShots\[_cineShotIdx\]; _cineT=0; _cineFireShotEv\(_cineData\); \}/.test(src),
    'every hard cut fires the incoming shot\'s event — the chain IS the sequence');
  assert(/On start, fire event/.test(src) && /CS\.ev=ti\.value\.trim\(\)\.slice\(0,60\);/.test(src),
    'the editor field lives beside the holds and trims/caps on write');
}

done('build 1196: each cinematic shot can fire a named logic event as it starts — executed through the real trigger (host fires, client and editor-preview never, blanks are silent), threaded through all six shot chokepoints (_resShot/_normCineShot/_newCineShot/_newCutscene/loader/serializer, blank = byte-identical old levels), fired for the first shot and on every cut — the logic graph is the sequencer');
