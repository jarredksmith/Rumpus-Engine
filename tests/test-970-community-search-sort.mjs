// (build 970) COMMUNITY LIBRARY SEARCH + SORT — a search box (name/author/description substring)
// and a sort dropdown (Newest / Oldest / A–Z / By author) in the community modal. All client-side
// over the already-fetched index. Typing rebuilds only the #commRows container (via _commRenderRows),
// never the controls, so the search input keeps focus while filtering live.
import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- structure: three-function split + focus-safe re-render ----
assert(/let _commFilter='all', _commSearch='', _commSort='new', _commLevels=null;/.test(src),
  'search/sort/catalog state lives beside the filter chip state');
assert(/_commLevels=levels\.map\(\(L,i\)=>Object\.assign\(\{_i:i\}, L\)\);/.test(src),
  'catalog position is captured for Newest/Oldest (index is newest-first)');
const ui = src.match(/function _commRenderUI\(\)\{[\s\S]{0,4000}?\nfunction _commRenderRows/)[0];
assert(/q\.oninput=\(\)=>\{ _commSearch=q\.value; _commRenderRows\(\); \};/.test(ui),
  'typing re-renders ROWS only — the input is never rebuilt, so focus survives');
assert(/s\.onchange=\(\)=>\{ _commSort=s\.value; _commRenderRows\(\); \};/.test(ui),
  'sort change re-renders rows only too');
assert(/\[\['new','Newest'\],\['old','Oldest'\],\['az','A[^']+Z'\],\['author','By author'\]\]/.test(ui),
  'the four sort orders are offered');   // A–Z label uses thin-space dashes; match loosely
assert(/aria-label','Search levels'/.test(ui) && /aria-label','Sort levels'/.test(ui),
  'controls carry aria labels');
assert(/b\.onclick=\(\)=>\{ _commFilter=k; _commRenderUI\(\); \};/.test(ui),
  'objective chips restyle via the UI pass (no refetch)');
assert(!/renderCommunity\(\)/.test(ui), 'no control path refetches the index');

// ---- executable: the filter + sort core, driven with a fake catalog ----
const rr = src.match(/function _commRenderRows\(\)\{[\s\S]{0,900}?shown\.sort\(by\[_commSort\]\|\|by\.new\);/)[0];
const core = rr.slice(rr.indexOf('const q='), rr.length);
const run = new Function('_commSearch','_commFilter','_commSort','_commLevels', core + '\nreturn shown;');
const cat = [
  { _i:0, name:'Neon Circuit',  author:'zed',   desc:'night race',            objective:'race'  },
  { _i:1, name:'Bunker Assault',author:'ada',   desc:'wave survival bunker',  objective:'waves'  },
  { _i:2, name:'Aqua Park',     author:'zed',   desc:'swim and explore',      objective:'explore' },
];
eq(run('','all','new',cat).map(L=>L._i).join(','), '0,1,2', 'Newest = catalog order');
eq(run('','all','old',cat).map(L=>L._i).join(','), '2,1,0', 'Oldest reverses it');
eq(run('','all','az',cat).map(L=>L.name)[0], 'Aqua Park', 'A–Z sorts by name');
eq(run('','all','author',cat).map(L=>L.author).join(','), 'ada,zed,zed', 'By author groups authors');
eq(run('','all','author',cat).filter(L=>L.author==='zed').map(L=>L.name).join(','), 'Aqua Park,Neon Circuit',
  'ties within an author fall back to name');
eq(run('bunker','all','new',cat).length, 1, 'search matches name/desc');
eq(run('ZED','all','new',cat).length, 2, 'search is case-insensitive and matches author');
eq(run('zed','race','new',cat).length, 1, 'search composes with the objective chips');
eq(run('   ','all','new',cat).length, 3, 'whitespace-only search matches everything');
eq(run('xyzzy','all','new',cat).length, 0, 'no match yields an empty set (empty-state message)');

// ---- empty-state message distinguishes a search miss from an empty category ----
assert(/q\?\('Nothing matches “'\+_commSearch\.trim\(\)\+'”\.'\):\('No '\+_commFilter\+' levels yet\.'\)/.test(src),
  'the empty state names the search term when a search caused it');

done('build 970: community library search box + sort dropdown, focus-safe live filtering');
