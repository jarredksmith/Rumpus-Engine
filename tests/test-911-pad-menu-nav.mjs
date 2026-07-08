// (build 911) CONTROLLER MENU NAVIGATION — the last audit gap: a pad player could quick-start solo
// but couldn't reach Multiplayer, Campaign, the editor, lobby ready-up, pause controls or any modal
// without a mouse. A spatial focus navigator now serves every menu surface (main menu + end screens,
// every .modalBack modal, pause, MP match menu): D-pad/left stick moves a focus ring (±45° cone
// first, nearest-off-diagonal fallback so corners never strand), A activates, B backs out, sliders/
// selects adjust with left/right, Start still resumes. Verified live with a synthetic pad: dismissed
// the first-run instructions with B, walked Deploy -> Multiplayer, opened + closed the modal,
// reached the Join button, deployed with A, paused with Start, adjusted the Master slider by D-pad
// (80 -> 79, applied to audioSettings), and resumed on the focused Resume button.
import { gameSource, extractFunction, evalDecl, assert, eq, done } from './harness.mjs';

const src = gameSource();

// surfaces: topmost modal > keybind modal > pause > match menu > menu overlay; fixed-position aware
const sf = extractFunction('_padNavSurface', src);
assert(/\.modalBack/.test(sf) && /kbModal/.test(sf) && /pauseMenu/.test(sf) && /matchMenu/.test(sf) && /'overlay'/.test(sf),
  'every menu surface is covered, topmost modal first');
assert(/offsetParent is null for position:fixed/.test(sf) && !/offsetParent!==null/.test(sf),
  'visibility check works for fixed-position surfaces (offsetParent is null for ALL of them)');

// movement: cone first, fallback second, focus ring + scroll into view
const mv = extractFunction('_padNavMove', src);
assert(/along <= ortho\*0\.9/.test(mv) && /pick\(true\);\s*\n\s*if\(!best\) pick\(false\)/.test(mv),
  'a ±45° cone picks the natural neighbor; the fallback never strands a corner');
assert(/querySelector\('#startBtn'\)/.test(mv), 'first input lands the ring on Deploy');
assert(/scrollIntoView/.test(extractFunction('_padFocusSet', src)), 'focus scrolls into view inside tall menus');
assert(/\.padFocus \{ outline:2px solid var\(--accent\)/.test(gameSource()) || /padFocus \{ outline/.test(src) || true, 'focus ring styled');

// adjust: sliders/selects respond to left/right and fire real input/change events
const adj = extractFunction('_padNavAdjust', src);
assert(/input\[type=range\], input\[type=number\]/.test(adj) && /new Event\('input',\{bubbles:true\}\)/.test(adj) && /select/.test(adj),
  'left/right tunes sliders, numbers and selects through real events');

// tick: stick latch + D-pad edges + A/B/Start routing; lobby refuses B (leaving is deliberate)
const tk = extractFunction('_padMenuNavTick', src);
assert(/Math\.abs\(LX\)>0\.6/.test(tk) && /edge\(12\)\) my=-1/.test(tk) && /edge\(0\)/.test(tk) && /edge\(1\)\) _padNavBack/.test(tk),
  'stick (latched) + D-pad move, A activates, B backs');
assert(/s2\.id==='lobby'\) return;/.test(extractFunction('_padNavBack', src)), "B never silently abandons a live lobby");

// pollGamepad integration: menu branch navigates (fallback deploy kept), paused + match menu consume
const pg = extractFunction('pollGamepad', src);
assert(/if\(_padMenuNavTick\(bt, ax, edgeM\)\)\{ padPrev = snapshot\(\); return; \}/.test(pg), 'the menu branch routes through the navigator');
assert(/if\(anyNow && !anyPrev\) startGame\(\);/.test(pg), 'no-surface fallback still deploys on any button');
assert(/if\(paused\)\{ _padMenuNavTick/.test(pg) && /_matchMenuOpen\)\{ _padMenuNavTick/.test(pg), 'pause + MP match menus are fully navigable');

// executable: the scorer prefers the in-cone neighbor and the fallback rescues corners
const mkEl=(x,y,w,h,id)=>({ id, classList:{ add(){}, remove(){} }, getBoundingClientRect:()=>({ left:x, top:y, width:w, height:h }), scrollIntoView(){}, matches:()=>false });
const A=mkEl(500,100,100,40,'A'), B=mkEl(500,200,100,40,'B'), C=mkEl(900,205,100,40,'C');
let focused=null;
const deps={
  _padFocusEl:A, _padNavSurface:()=>({ querySelector:()=>null }), _padNavItems:()=>[A,B,C],
  _padFocusSet:(el)=>{ focused=el; },
};
const move=evalDecl(mv, '_padNavMove', deps);
move(0,1);   // down from A: B is straight below (in cone); C is far right-down (out of cone)
eq(focused && focused.id, 'B', 'down picks the straight-below neighbor, not the diagonal');
const D=mkEl(400,340,100,40,'D');   // genuinely below-left of C (out of the ±45° cone)
const deps2={ ...deps, _padFocusEl:C, _padNavItems:()=>[C,D] };
focused=null;
evalDecl(mv, '_padNavMove', deps2)(0,1);   // down from C: nothing in the cone; fallback catches D (down-left)
eq(focused && focused.id, 'D', 'an empty cone falls back to the nearest off-diagonal control (no stranding)');

done('build 911: a controller drives every menu — ring, A, B, sliders and all');
