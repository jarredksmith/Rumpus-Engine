// (build 846) THE CUTSCENE EDITOR MOVES TO THE GAMEPLAY TAB. It was buried inside World > Environment —
// a section whose own subtitle says 'terrain, sky, fog' — as one of NINE collapsed groups. Story authoring is
// gameplay, and the audit ranked this the deepest-buried major tool. It now renders into its own 'Cutscenes'
// section on the Gameplay tab (open by default), via subSec's new optional-host parameter; fold state persists.
import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();

assert(/sec\('Cutscenes', 'cutscenes', '<div id="edCutscenes"><\/div>'\)/.test(src), 'Cutscenes is its own section');
assert(/rules:\s*\['game','pickups','loot','invitems','buildmenu','cutscenes'\]/.test(src), '...owned by the Gameplay tab');
assert(/cutscenes:\s*'Author camera cutscenes — play them from signals or on level start\.'/.test(src), '...with a plain-language subtitle');
assert(/const subSec = \(title, key, collapsedDefault, host\)=>/.test(src), 'subSec takes an optional host');
assert(/\(host\|\|worldHost\)\.appendChild\(sec\);/.test(src), '...defaulting to the World panel for every other group');
assert(/const _cutHost=editorEl\.querySelector\('#edCutscenes'\); if\(_cutHost\) _cutHost\.innerHTML='';/.test(src), 'the host clears on each render (no duplicate stacking)');
assert(/subSec\('Cinematic','cine',false, _cutHost\);/.test(src), 'the cinematic group renders there, open by default');

done('build 846: cutscene authoring lives on the Gameplay tab, out of the World > Environment pile');
