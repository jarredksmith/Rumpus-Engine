// build 1147: a browser for the assets the level ALREADY uses.
//
// The editor could search the web for models (Poly Pizza / Sketchfab) but had no view of its own content.
// Every other engine's second-most-used panel is exactly that — Unity's Project window, Unreal's Content
// Browser — and without it there is no way to see what a level is built from, to place another of something
// already used without searching for it again, or to act on every instance of one asset at once. A level
// with 57 props was a numbered list you stepped through one prop at a time.
//
// Nothing here is downloaded and nothing is stored in the level: it is propModels' own `src` values, the
// existing GLTF cache, and build 813's offscreen thumbnail renderer.
import { gameSource, extractFunction, html, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the grouping, executed
{
  const fn = new Function('propModels', 'isModelSrc', 'assetShortName',
    extractFunction('sceneAssetList') + '; return sceneAssetList;');
  const isModelSrc = new Function(extractFunction('isModelSrc') + '; return isModelSrc;')();
  const shortName = new Function('decodeURIComponent', extractFunction('assetShortName') + '; return assetShortName;')(decodeURIComponent);
  const P = (s, name) => ({ userData: name ? { src: s, name } : { src: s } });
  const run = (props) => fn(props, isModelSrc, shortName)();

  {
    const list = run([P('a.glb'), P('b.glb'), P('a.glb'), P('a.glb'), P('b.glb')]);
    eq(list.length, 2, 'one entry per distinct asset, not per prop');
    eq(list[0].src, 'a.glb', 'most-used first — the thing a level is made of is the thing you reach for again');
    eq(list[0].count, 3, '...with its instance count');
    eq(list[1].count, 2, '...and the next');
    eq(list[0].objs.length, 3, 'and it keeps the objects, so select-all needs no second pass');
  }
  {
    // primitives are the "Add a shape" row; putting them here would bury the imports among 57 boxes
    const list = run([P('box'), P('sphere'), P('cylinder'), P('wedge'), P('pillar'), P('x.glb')]);
    eq(list.length, 1, 'primitives are not assets');
    eq(list[0].src, 'x.glb', '...only real model sources are');
  }
  {
    // ties break by the name the creator actually reads, so the order is stable between renders
    const list = run([P('zebra.glb'), P('apple.glb')]);
    eq(list.map(e => e.name).join(','), 'apple,zebra', 'equal counts sort by name');
  }
  {
    // an authored name wins over one derived from the url
    const list = run([P('https://x/78846e47-3be2-48f2.glb', 'Assault Rifle')]);
    eq(list[0].name, 'Assault Rifle', 'a prop named by the search browser keeps that name');
  }
  {
    eq(run([]).length, 0, 'an empty level yields nothing');
    eq(run([null, undefined, {}, { userData: {} }]).length, 0, 'and holes in propModels are skipped rather than thrown on');
  }
}

// ---------------------------------------------------------------- the label, executed
{
  const f = new Function('decodeURIComponent', extractFunction('assetShortName') + '; return assetShortName;')(decodeURIComponent);
  eq(f('https://x/y/crate_large.glb'), 'crate large', 'the basename, readable');
  eq(f('barrel-rusty.gltf'), 'barrel rusty', '...for either extension, and dashes too');
  eq(f('https://x/y/wall.glb?v=3#frag'), 'wall', 'a query and a fragment are not part of the name');
  eq(f('https://x/y/my%20crate.glb'), 'my crate', 'and it is url-decoded');
  // Poly Pizza serves bare UUIDs. A hex basename is an ID, not a name, and printing it whole in a 100px
  // tile tells the creator nothing — so it is labelled as an id and truncated deliberately.
  assert(/^model · 78846e/.test(f('https://static.poly.pizza/78846e47-3be2-48f2-a7ce-6b50c09358bb.glb')),
    'a UUID basename is shown as an id, not as a name (' + f('https://static.poly.pizza/78846e47-3be2-48f2-a7ce-6b50c09358bb.glb') + ')');
  assert(/^model · /.test(f('0123456789abcdef0123.glb')), 'a long bare hex string too');
  assert(f('a-very-long-model-name-that-goes-on-and-on-and-on-forever-and-ever.glb').length <= 40,
    'a long name is capped rather than blowing the grid out');
  eq(f(''), 'model', 'an empty source still labels');
  eq(f(null), 'model', '...and a null one does not throw');
  eq(f('https://x/y/.glb'), 'model', '...nor a url with no basename at all');
}

// ---------------------------------------------------------------- select every instance, executed
{
  const fn = extractFunction('selectAssetInstances');
  assert(/selProps\.length = 0; for\(const o of objs\) selProps\.push\(o\);/.test(fn),
    'it fills the multi-selection build 564 already threads through the gizmo, the fields and Delete');
  assert(/editorTargets\.props\.idx = i;/.test(fn), '...and sets a primary, so the transform fields have something to show');
  assert(/if\(typeof _edFrameSelected==='function'\) _edFrameSelected\(\);/.test(fn),
    'and moves the camera to it — build 1137 gave the editor a camera that can go to the selection, and a browser that selects something off screen is the same "nothing happened" this panel exists to fix');
  // executable
  const selProps = [];
  const editorTargets = { props: { idx: -1 } };
  const propModels = [{ userData:{src:'a.glb'} }, { userData:{src:'b.glb'} }, { userData:{src:'a.glb'} }];
  let framed = 0, highlighted = 0, toasted = '';
  const run = new Function('propModels', 'selProps', 'editorTargets', 'editorActive', 'updateSelectionHighlight',
    'syncPropStateFromObj', 'updateGizmo', 'renderEditorFields', '_edFrameSelected', 'flashToast', 'assetShortName',
    extractFunction('selectAssetInstances') + '; return selectAssetInstances;')(
      propModels, selProps, editorTargets, 'props', ()=>{ highlighted++; }, ()=>{}, ()=>{}, ()=>{},
      ()=>{ framed++; }, (m)=>{ toasted = m; }, ()=>'a');
  eq(run('a.glb'), 2, 'both copies of a.glb are selected');
  eq(selProps.length, 2, '...and land in selProps');
  eq(editorTargets.props.idx, 0, 'the first is the primary');
  eq(framed, 1, 'the camera goes to them');
  eq(highlighted, 1, 'and the selection outline is refreshed');
  assert(/^Selected 2 /.test(toasted), 'the creator is told what happened: ' + JSON.stringify(toasted));
  eq(run('nope.glb'), 0, 'an asset with no instances selects nothing');
  eq(selProps.length, 2, '...and leaves the existing selection alone rather than clearing it');
}

// ---------------------------------------------------------------- the thumbnail
{
  const fn = extractFunction('_renderAssetThumb');
  assert(/const k = 'asset\|' \+ url;/.test(fn), 'cached by url alone, so re-rendering the panel is free after the first paint');
  assert(/if\(_thumbCache\[k\]\)\{ apply\(_thumbCache\[k\]\); if\(onDone\) onDone\(true\); return; \}/.test(fn), '...and a cache hit is synchronous');
  assert(/_thumbCachePut\(k, u\);/.test(fn), 'and it goes through the LRU put, not straight into the map');
  assert(/if\(!_ensureThumbR\(\)\)\{ if\(onDone\) onDone\(false\); return; \}/.test(fn),
    'a device where a second WebGL context fails keeps an empty tile rather than breaking the panel');
  assert(/const maxd=Math\.max\(size\.x,size\.y,size\.z\)\|\|1/.test(fn),
    'framed by the largest dimension, so a crate and a museum show at the same apparent size whatever their units');
  assert(/_thumbScene\.remove\(root\);/.test(fn), 'and the temporary root leaves the shared thumbnail scene');
  assert(/catch\(e\)\{ if\(onDone\) onDone\(false\); \}/.test(fn), 'a broken GLB reports rather than throwing into the render');
  // it must be the ASSET framing, not the character bust — that one takes a whole cfg and aims at a chest
  assert(!/opts && opts\.bust/.test(fn), 'it is not the portrait path');
  assert(/_ensureThumbR|_thumbCache/.test(src), 'and it shares build 813\'s renderer rather than making a third context');
}

// ---------------------------------------------------------------- the panel
{
  assert(/subfold\('In this level', 'o_assets', '<div id="edAssets"><\/div>', true\)/.test(src),
    'it has its own fold, open by default');
  // ORDER matters: the asset you want next is most often one you already used
  assert(src.indexOf("subfold('In this level'") < src.indexOf("subfold('Model &amp; texture'"),
    'and it sits ABOVE the web search rather than below it');
  assert(/if\(assetsHost\)\{ assetsHost\.innerHTML=''; if\(tgt\.addable && tgt\.urlField && typeof renderSceneAssets==='function'\) renderSceneAssets\(assetsHost\); \}/.test(src),
    'it renders on the Props target only, like the search browser beside it');
  const fn = extractFunction('renderSceneAssets');
  assert(/if\(!items\.length\) return;/.test(fn), 'an empty level shows the hint and stops');
  assert(/No imported models yet/.test(fn), '...and the hint says what to do instead');
  assert(/grid-template-columns:repeat\(3,1fr\)/.test(fn), 'a three-column thumbnail grid, matching the search results below it');
  assert(/badge\.textContent = '×' \+ e\.count;/.test(fn), 'each tile carries its instance count');
  assert(/ev\.preventDefault\(\); ev\.stopPropagation\(\); selectAssetInstances\(e\.src\);/.test(fn),
    'select-all stops the event, so clicking it can never ALSO add another copy');
  assert(/pick\.setAttribute\('role','button'\); pick\.tabIndex=0;/.test(fn) && /pick\.onkeydown/.test(fn),
    'and it is reachable and operable from the keyboard, since it is a span rather than a button');
  assert(/cap\.title = e\.name \+ '  \\u2014  ' \+ e\.src;/.test(fn),
    'the full name and url are in the tooltip, because a 100px tile cannot show a Poly Pizza id');
  assert(/addSceneProp\(e\.src, \{ name:e\.name \}\)/.test(fn), 'and adding another carries the name forward');
}
{
  // the existing web search is untouched — this is the other half of a pair, not a replacement
  assert(/function renderModelBrowser\(host\)/.test(src), 'the web search still exists');
  assert(/<b>Search free models<\/b>/.test(src), '...with its own heading');
  assert(/id="edModels"/.test(src), '...and its own host');
}

done('build 1147: the editor can see what the level is built from — every imported model, with a thumbnail, its instance count, add-another and select-all');
