// (build 980) FLOATING VIEWPORT TOOLBAR — gizmo mode (Move/Rotate/Scale), camera (Top/Fly) and
// visibility (enemies/colliders) lived as text buttons inside the panel; real editors put viewport
// controls ON the viewport. Grouped icon pills over the scene view, tooltips via the build-978
// engine, active states synced from the same globals the panel reads. The old in-panel row is gone.
import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();

assert(/function _edToolbarEnsure\(\)/.test(src) && /t\.id='edToolbar'/.test(src), 'the toolbar exists');
assert(/#edToolbar \{ position:fixed; top:calc\(10px \+ env\(safe-area-inset-top\)\);/.test(html), 'fixed over the viewport, safe-area aware');
assert(/body:has\(#editor\.dockLeft\) #edToolbar \{ left:auto; right:/.test(html), 'flips sides when the panel docks left');
assert(/#edToolbar button\.on \{ background:rgba\(var\(--accent-rgb\),0\.25\); color:var\(--accent\); \}/.test(html), 'active state reads at a glance');
// three groups: gizmo, camera, visibility
for (const id of ['tbMove','tbRot','tbScale','tbTop','tbFly','tbHideEn','tbCol'])
  assert(new RegExp("mk\\('"+id+"'").test(src), id+' button built');
assert(/g1\.appendChild/.test(src) && /g2\.appendChild/.test(src) && /g3\.appendChild/.test(src), 'grouped pills, not one soup');
assert(/setAttribute\('data-tip', tip\); b\.setAttribute\('aria-label', tip\)/.test(src), 'every button has a tooltip + aria label');
assert(/if\(typeof _edBindTips==='function'\) _edBindTips\(t\);/.test(src), 'the build-978 tooltip engine serves the toolbar');
// state sync + lifecycle
assert(/on\('tbMove', gizmoMode==='translate'\)/.test(src) && /on\('tbTop', editorTopView\)/.test(src), 'sync reads the same globals as the panel');
assert(/if\(typeof _edToolbarSync==='function'\) _edToolbarSync\(\);/.test(src), 'renderEditorFields keeps it in step');
assert(/_edToolbarShow\(true\);   \/\/ build 980/.test(src) && /_edToolbarShow\(false\);/.test(src), 'shows with the editor, hides on every close path');
assert((src.match(/if\(typeof _edToolbarShow==='function'\) _edToolbarShow\(false\);/g)||[]).length===2, '...including both direct-close paths');
// the old panel row is gone
assert(!/id="edView"/.test(src), 'the in-panel view row is removed');
assert(!/◉ Top view/.test(src), 'no dot-toggle text buttons remain');
done('build 980: viewport toolbar — scene-view chrome like Unity/Unreal, old panel row removed');
