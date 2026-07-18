import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// build 414: the prop editor's per-prop sections are now ALL collapsible accordions (edFold), so they're easy
// to scan instead of a long wall. Animation + Lock were loose content above the existing Signals/Mechanism/
// Physics folds; they're now folds too. Each remembers its open/closed state and defaults collapsed.

// the five sections are all edFold accordions, collapsed by default
assert(/edFold\(animHost, 'anim', 'Animation', false, 'Play a model\\u2019s built-in animation clips'\)/.test(src) || /edFold\(animHost, 'anim', 'Animation', false,/.test(src), 'Animation is its own accordion');
assert(/edFold\(behaveHost, 'lock', 'Lock', false, 'Require a key to E-activate this prop'\)/.test(src), 'Lock is its own accordion (in Interaction & logic since build 989)');
assert(/edFold\(behaveHost, 'signals', 'Signals', false,/.test(src), 'Signals accordion');
assert(/edFold\(motionHost, 'mech', 'Mechanism', false,/.test(src), 'Mechanism accordion (in Motion & physics since build 989)');
assert(/edFold\(motionHost, 'physdest',/.test(src), 'Physics & destruction accordion');

// the animation controls now append to the fold body (aHost), not loose to animHost
assert(/const aHost = edFold\(animHost, 'anim'/.test(src), 'animation controls get a fold body');
assert(/aHost\.appendChild\(row\); \};/.test(src) && /cr\.appendChild\(cl\); cr\.appendChild\(csel\); aHost\.appendChild\(cr\);/.test(src), 'animation toggle + clip dropdown go inside the Animation fold');
// the lock controls append to lHost
assert(/const lHost = edFold\(behaveHost, 'lock'/.test(src), 'lock controls get a fold body');
assert(/lr\.appendChild\(lsp\); lr\.appendChild\(lsel\); lHost\.appendChild\(lr\);/.test(src), 'lock row goes inside the Lock fold');

// edFold remembers collapsed state per id (so opening one + reselecting keeps it)
assert(/const collapsed = \(_edFolds\[id\]!=null\) \? !!_edFolds\[id\] : !openDefault;/.test(src) && /_edFolds\[id\]=sec\.classList\.contains\('collapsed'\)/.test(src), 'each accordion remembers its open/closed state');
done();
