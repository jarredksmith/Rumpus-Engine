import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// builds 336/337: editor scroll preserved across rerenders; the three heaviest prop-inspector
// groups (Mechanism, Waypoint path, Physics & destruction) are collapsible folds with remembered state.

// --- 336: scroll preservation ---
const ref = extractFunction('renderEditorFields');
// build 1302: this was `sI < 900` — a CHARACTER BUDGET, which build 1149 recorded as the wrong way to scope
// a source pin. Adding a comment above the line broke it while the assertion stayed true. What it means is
// an ORDER: after build 818's coalescing gate, before anything is rebuilt.
const sI = ref.indexOf('const _edScroll = editorEl.scrollTop;');
const gateI = ref.indexOf('if(_rnow - _refLast < 8)');
const buildI = ref.indexOf("editorEl.querySelectorAll('.tab')");
assert(sI > 0 && gateI > 0 && buildI > 0, 'the gate, the capture and the first rebuild are all present');
assert(sI > gateI, 'scroll is captured AFTER the coalescing gate (build 818) — a deferred call must not capture it');
assert(sI < buildI, '...and before any rebuild, or it would read the post-teardown scroll');
// build 818: same-frame rebuild bursts collapse into one deferred rebuild
assert(/if\(_refQueued\) return;/.test(ref) && /if\(_rnow - _refLast < 8\)\{ _refQueued = true; requestAnimationFrame\(/.test(ref), 'burst rebuilds coalesce to one rAF rebuild');
assert(/queueMicrotask\(\(\)=>\{ try\{ if\(editorEl\) editorEl\.scrollTop = _edScroll; \}catch\(e\)\{\} try\{ renderLevelIssues\(\); \}catch\(e\)\{\} \}\);/.test(ref), 'restored after the pass regardless of return path (build 340: issues list piggybacks the same microtask)');

// --- 337: edFold primitive ---
const ef = extractFunction('edFold');
assert(/_edFolds\[id\]!=null\) \? !!_edFolds\[id\] : !openDefault/.test(ef), 'stored collapsed-state wins over the default');
assert(/localStorage\.setItem\('breach_editor_folds'/.test(ef), 'fold state persists');
assert(/head\.onclick/.test(ef) && /sec\.classList\.toggle\('collapsed'\)/.test(ef), 'click toggles the collapsed class');

// --- the three folds exist with stable ids ---
for(const [id, title] of [['mech','Mechanism'],['waypath','Waypoint path'],['physdest','Physics & destruction']]){
  const re = new RegExp("edFold\\(motionHost, '"+id+"', '"+title+"'");   // build 989: these three live in Motion & physics now
  assert(re.test(src), id+' fold created');
}

// --- scope safety (the 332-class check, automated): every fold-body append sits inside
// --- the block where its const was declared ---
function scopeEnd(s, pos){ let d=0; for(let i=pos;i<s.length;i++){ const c=s[i]; if(c==='{')d++; else if(c==='}'){ d--; if(d<0) return i; } } return s.length; }
for(const v of ['xBody','wpBody','pdBody']){
  const decl = src.indexOf('const '+v+' = edFold');
  assert(decl > 0, v+' declared');
  const end = scopeEnd(src, decl);
  let i = -1, uses = 0, bad = 0;
  while((i = src.indexOf(v+'.appendChild', i+1)) >= 0){ uses++; if(!(i>decl && i<end)) bad++; }
  assert(uses >= 4 && bad === 0, v+': all '+uses+' appends in scope');
}
// nothing in the folded slices still appends straight to animHost between the Mechanism marker and the debris note
const mi = src.indexOf('// ---- Mechanism: move/rotate');
const si = src.indexOf('pdBody.appendChild(snote);');
assert(mi > 0 && si > mi, 'fold region located');
assert(src.slice(mi, si).indexOf('animHost.appendChild(') < 0, 'no stray direct appends left inside the folded groups');
// build 338: user-facing tab names (internal keys untouched)
assert(/MODE_LABEL = \{ build:'Build', scene:'World', player:'Player', enemies:'Enemies', rules:'Gameplay', kit:'Weapons', hud:'HUD', files:'Save', settings:'Settings' \}/.test(src), 'tabs read Build / World / Player / Enemies / Gameplay / Weapons / HUD / Save / Settings');
assert(/EDITOR_MODES = \['build','scene','player','enemies','rules','kit','hud','files','settings'\]/.test(src), 'internal mode keys unchanged (HUD build 665, Settings build 1066)');
done();
