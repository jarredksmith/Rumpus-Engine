import { gameSource, extractFunction, evalIn, assert, near, done } from './harness.mjs';
const src = gameSource();

// data + serialize + restore round-trip presence
assert(/let audioZones = \(savedLevel && Array\.isArray\(savedLevel\.audioZones\)\)/.test(src), 'audioZones not declared/loaded from savedLevel');
assert(/audioZones: audioZones\.map\(z=>\(\{ x:\+z\.x, z:\+z\.z, r:\+z\.r, url:z\.url\|\|'', vol:\+z\.vol, loop:!!z\.loop \}\)\)/.test(src), 'audioZones not serialized');
assert((src.match(/audioZones = Array\.isArray\(level\.audioZones\)/g)||[]).length === 2, 'audioZones must restore in BOTH loadLevelFromNet and restoreLevel');

// the loop drives proximity each frame, self-silencing off-play
assert(/if\(typeof updateAudioZones==='function'\) updateAudioZones\(\);/.test(src), 'updateAudioZones not hooked into the loop');

// proximity volume math: full at center, ~0 at edge, 0 outside, scaled by max volume
const mkUpdate = (px, zoneVol) => {
  const fn = extractFunction('updateAudioZones');
  const captured = [];
  const fakeGain = { gain: { setTargetAtTime:(v)=>captured.push(v), value:0 } };
  const player = { pos:{ x:px, y:0, z:0 } };
  const actx = { currentTime:0, createBufferSource:()=>({ buffer:null, loop:false, connect:()=>({connect:()=>{}}), start:()=>{} }), createGain:()=>fakeGain };
  const zones = [ { x:0, z:0, r:10, url:'a.mp3', vol:zoneVol, loop:true } ];
  const rt = [ { src:{}, gain:fakeGain, playing:true, inside:false } ];   // pretend the source is already playing
  evalIn(fn, {
    audioZones: zones, _zoneRT: rt, actx, sfxBus:{}, player,
    gameOn:true, editorOpen:false, gameOver:false,
    _soundBuffers:{ 'a.mp3': { duration:2 } }, loadSound:()=>{}, Math
  })();
  return captured.length ? captured[captured.length-1] : null;
};
near(mkUpdate(0, 1.0), 1.0, 1e-6);    // dead center, full volume
near(mkUpdate(5, 1.0), 0.5, 1e-6);    // halfway out -> half volume
near(mkUpdate(10, 1.0), 0.0, 1e-6);   // at the edge -> silent
near(mkUpdate(20, 1.0), 0.0, 1e-6);   // outside -> silent
near(mkUpdate(0, 0.4), 0.4, 1e-6);    // max-volume scales the whole curve

// editor panel + markers + lifecycle
assert(/function renderAudioZonesPanel\(\)/.test(src), 'renderAudioZonesPanel missing');
assert(/sec\('Zones', 'zones',/.test(src) && /id="edAudioZones" class="zoneHost" data-zone="audiozones"/.test(src), 'Audio zones host registered under the grouped Zones section (build 649)');
assert(/function refreshAudioZoneMarkers\(\)/.test(src) && /RingGeometry/.test(extractFunction('refreshAudioZoneMarkers')), 'ring marker not built');
assert(/function stopAudioZones\(\)/.test(src), 'stopAudioZones missing');
done();
