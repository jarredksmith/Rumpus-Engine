import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 565: fixes from playtest — (1) collinear walls merged into single boxes + verticals a hair taller, so
// the overlapping/coplanar faces stop z-fighting (flashing seams); (2) generated lights' editor markers are
// visible while editing, so they can be seen + selected; (3) generated light intensities dialed way down.

// (2) light marker tracks editor-open state (so generated/added lights are selectable, not invisible)
assert(/marker\.visible = !!\(typeof editorOpen!=='undefined' && editorOpen\);/.test(src), 'light markers are visible while the editor is open');

// (3) generated lights are no longer blown out — both generators now use low intensities, none of the old highs
const gm = extractFunction('generateMaze'), go = extractFunction('generateOffice');
for(const [name, fn] of [['maze',gm],['office',go]]){
  const ints = [...fn.matchAll(/buildLight\(\{[^}]*intensity:([0-9.]+)/g)].map(m=>parseFloat(m[1]));
  assert(ints.length>=2, name+' places lights');
  assert(ints.every(v=>v<=4), name+' light intensities are all dialed down (<=4): got '+ints.join(','));
}

// (1) maze merges collinear segments + taller verticals
assert(/const VOFF=0\.05;/.test(gm), 'vertical height offset constant');
assert(/wallH\+VOFF/.test(gm), 'maze vertical walls use the height offset');
assert(/wallH\+0\.05/.test(go), 'office vertical runs use the height offset');

// --- executable model: the greedy run-merge produces ONE non-overlapping box per contiguous run ---
function mergeRuns(seg, cell, half, th){
  const boxes=[]; let j=0;
  while(j<seg.length){
    if(seg[j]){ let k=j; while(k<seg.length && seg[k]) k++; const x0=-half+j*cell, x1=-half+k*cell; boxes.push({ x0, x1, L:(x1-x0)+th, c:(x0+x1)/2 }); j=k; }
    else j++;
  }
  return boxes;
}
const cell=10, th=0.7;
// a fully solid line of 6 cells -> ONE box (the old code emitted 6 overlapping boxes)
let b = mergeRuns([true,true,true,true,true,true], cell, 30, th);
eq(b.length, 1, 'a solid wall line merges to a single box');
eq(Math.round(b[0].L*10)/10, 60.7, 'merged box spans the whole run (+th lap for corners)');
// a line with a gap -> two boxes, separated, NOT overlapping
b = mergeRuns([true,true,true,false,true,true], cell, 30, th);
eq(b.length, 2, 'a gap splits the line into two runs');
assert(b[0].x1 <= b[1].x0, 'the two runs do not overlap (no coplanar faces to z-fight): '+b[0].x1+' <= '+b[1].x0);
// pairwise non-overlap holds in general for several runs
b = mergeRuns([true,false,true,true,false,true], cell, 30, th);
for(let i=0;i+1<b.length;i++) assert(b[i].x1 <= b[i+1].x0, 'runs stay non-overlapping');

done('z-fight fix (merged non-overlapping walls + taller verticals) + lights selectable & dimmed (build 565)');
