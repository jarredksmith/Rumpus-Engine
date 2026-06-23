import { gameSource, extractFunction, evalIn, assert, eq, done } from './harness.mjs';
const src = gameSource();

// data + serialize + restore (both load paths)
assert(/let charRoster = \(savedLevel && Array\.isArray\(savedLevel\.roster\)\)/.test(src), 'charRoster not declared from savedLevel');
assert(/let myRosterIdx = -1;/.test(src), 'myRosterIdx not declared');
assert(/roster: charRoster\.map\(c=>\(\{ name:c\.name, url:c\.url, scale:c\.scale/.test(src), 'roster not serialized');
assert((src.match(/charRoster = Array\.isArray\(level\.roster\) \? level\.roster\.map\(_sanitizeCharCfg\)/g)||[]).length === 2, 'roster must restore in BOTH load paths');

// myCharCfg returns the picked roster character when one is selected, else the player model
const mk = (idx) => evalIn(extractFunction('myCharCfg'), {
  myRosterIdx: idx,
  charRoster: [ { url:'hero.glb', scale:2, face:0, rx:0, rz:0, xoff:0, yoff:0, zoff:0, clips:{} } ],
  playerModelCfg: { url:'default.glb', scale:1, clips:{} },
  CHARACTERS: [ { color:0xff0000 } ], myCharIdx: 0
})();
eq(mk(0).url, 'hero.glb', 'picked roster char should drive myCharCfg');
eq(mk(0).scale, 2, 'roster scale used');
eq(mk(-1).url, 'default.glb', 'no pick -> default player model');
eq(mk(0).tint, 0xff0000, 'tint still comes from the color selection');

// editor authoring + section/mode
assert(/function renderCharRosterPanel\(\)/.test(src), 'roster editor panel missing');
assert(/function _snapshotPlayerCharCfg\(name\)/.test(src), 'snapshot helper missing');
assert(/sec\('Characters', 'characters'/.test(src), 'Characters editor section missing');
assert(/player:\s*\['gizmo','object','transform','characters'\]/.test(src), 'Characters section lives in the Player mode (build 652)');

// lobby picker
assert(/function selectRosterChar\(i\)/.test(src), 'roster picker selector missing');
const sel = extractFunction('selectRosterChar');
assert(/myRosterIdx=\(i>=0 && charRoster\[i\]\)\?i:-1/.test(sel), 'selectRosterChar should clamp + allow Default');
assert(/broadcastMyChar\(\)/.test(sel), 'picking a character should broadcast it');
assert(/charRoster\.forEach\(\(c,i\)=> mk\(i, c\.name/.test(extractFunction('renderCharGrid')), 'picker grid does not list roster characters');
done();
