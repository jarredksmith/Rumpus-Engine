// (build 806) The part-hover highlight could get stuck: a chip's mouseleave never fires when the editor panel is torn down
// mid-hover (the DOM node is removed), so _clearPartHighlight never ran and the mesh stayed lit until a browser refresh.
// renderEditorFields now clears any active highlight before it rebuilds the panel, so a stuck highlight always self-heals.
import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();

const re = extractFunction('renderEditorFields');
assert(/if\(typeof _clearPartHighlight==='function'\) _clearPartHighlight\(\);/.test(re), 'the panel rebuild clears any orphaned part highlight');
// it runs up-front (right after the scroll capture), before the panel is rebuilt, so a removed chip can't leave it stuck
assert(/const _edScroll = editorEl\.scrollTop;[\s\S]{0,520}?if\(typeof _clearPartHighlight==='function'\) _clearPartHighlight\(\);/.test(re), 'the clear happens up-front, before the rebuild');

// _clearPartHighlight is still the single restore path (restores the saved emissive + drops the ref)
const ch = extractFunction('_clearPartHighlight');
assert(/if\(_partFlash\)\{ for\(const r of _partFlash\) if\(r\.mat && r\.mat\.emissive\) r\.mat\.emissive\.setHex\(r\.hex\); _partFlash=null; \}/.test(ch), 'clearing restores the saved emissive and clears the tracker');

// build 807: leaving the whole parts-list container clears the highlight, even if an individual chip's mouseleave is missed
assert(/pl\.onmouseleave=\(\)=>\{ if\(typeof _clearPartHighlight==='function'\) _clearPartHighlight\(\); \};/.test(src), 'moving out of the parts list clears the highlight (build 807)');

done('build 806/807: part-hover highlight self-heals (panel rebuild + list-leave)');
