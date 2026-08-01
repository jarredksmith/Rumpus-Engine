import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
assert(/gun\.visible = \(editorActive==='gun' \|\| editorActive==='aim' \|\| editorActive==='grenade'\);/.test(src), 'viewmodel stays visible in free-fly while editing gun/aim (build 1264: and the grenade throw pose)');
assert(/id=\\?"edDock\\?"/.test(src) && /id=\\?"edCollapse\\?"/.test(src), 'editor has dock + collapse buttons');
assert(/ed\.classList\.toggle\('dockLeft'\)/.test(src), 'dock toggles side + persists');
assert(/ed\.classList\.toggle\('collapsed'\)/.test(src), 'collapse toggle wired');
done('editor-mobile');
