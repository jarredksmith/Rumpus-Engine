// (build 1079) TWO REPORTED BUGS.
// 1. "Action bindings don't let you choose any custom animations you've created, only what's already loaded."
//    An action could only name one of the ~30 ANIM_SLOTS. The slots are a fixed taxonomy — there is nowhere
//    honest in it for "Backflip" — so a clip authored in the animation editor was unreachable until you gave
//    up an unrelated slot for it. An action can now name a CLIP directly, with the slot left behind it as the
//    fallback for a model that doesn't carry it.
// 2. "The animation editor sometimes stretches the model horizontally in the preview window."
//    The drawing buffer and camera aspect were only recomputed on a WINDOW resize. #aeView is flex:1 beside a
//    panel that changes width on its own, so the canvas's CSS box could move with nothing to correct it.
import { gameSource, html, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- what an action plays
const A = new Function(extractFunction('actionState', src) + '\nreturn actionState;')();
eq(A({ slot: 'dodge', clip: '' }), 'dodge', 'with no clip named, an action still plays its slot — nothing that already worked changed');
eq(A({ slot: 'dodge', clip: 'Backflip' }), 'clip:Backflip', 'a clip named by the author wins');
eq(A({ slot: 'parry' }), 'parry', 'a bind saved before this build has no clip field at all, and is unaffected');
eq(A(null), '', 'and nothing at all is not a crash');
assert(/\(a && a\.clip\) \? \('clip:'\+a\.clip\)/.test(extractFunction('actionState', src)),
  'the slot stays behind the clip as a fallback, so swapping to a model without it degrades to a pose rather than to nothing');

// ---------------------------------------------------------------- the clip is real, and built once
{
  const fn = extractFunction('_ensureClipAction', src);
  assert(/if\(!v \|\| !v\.userData \|\| String\(state\|\|''\)\.indexOf\(CLIP_STATE\)!==0\) return;/.test(fn),
    'only a clip:-prefixed state does anything here — every existing state takes the untouched path');
  assert(/if\(!acts \|\| !mixer \|\| acts\[state\]\) return;/.test(fn),
    'the action is built ONCE: carrying fifty clips costs nothing until one is actually fired');
  assert(/const clip=\(v\.userData\.animClips\|\|\[\]\)\.find\(c=>\(c\.name\|\|''\)===name\); if\(!clip\) return;/.test(fn),
    'it is looked up by exact name among the clips the model really carries');
  assert(/a\.loop=THREE\.LoopOnce; a\.clampWhenFinished=true;/.test(fn), 'a bound clip plays once rather than looping forever');
  assert(/a\.setEffectiveWeight\(0\); a\.play\(\);/.test(fn), '...and starts silent, exactly like every slot action');
  assert(/try\{[\s\S]*\}catch\(e\)\{\}/.test(fn), 'a malformed clip can never take the frame down with it');
}
assert(/root\.userData\.animClips = gltf\.animations;/.test(extractFunction('playEnemyStates', src)),
  'the model keeps its full clip list, so a clip NOT mapped to a slot is still reachable');
assert(/_ensureClipAction\(v, state\);/.test(extractFunction('setEnemyAnimState', src)),
  'one hook in the shared state setter — so the local avatar, a co-op teammate and an enemy all get it');
{
  const fn = extractFunction('setEnemyAnimState', src);
  assert(fn.indexOf('_ensureClipAction') < fn.indexOf('_stateActionKey'),
    '...placed BEFORE the resolve, so the very first press plays the clip instead of falling through to idle');
}

// ---------------------------------------------------------------- a clip picked by name runs to its own end
const DUR = new Function(`
  const _ownAvatar={ userData:{ visual:{ userData:{
    stateActions:{ idle:{}, melee:{ getClip:()=>({duration:1.5}) } },
    animClips:[{ name:'Backflip', duration:2.4 }, { name:'Wave', duration:0.8 }],
    animCfg:{ clipSpeed:{ 'clip:Backflip':2 } } } } } };
  function _stateActionKey(acts, s){ return acts[s]?s:'idle'; }
  ` + extractFunction('_ownSlotDurMs', src) + '\nreturn _ownSlotDurMs;')();
eq(DUR('clip:Backflip'), 1200, 'a clip named by the author runs its FULL length, divided by its own speed (2.4s at x2)');
eq(DUR('clip:Wave'), 800, '...whatever that length is');
eq(DUR('clip:NotHere'), 0, 'a clip the model does not carry measures nothing, so the caller keeps its default');
eq(DUR('idle'), 0, 'and a plain slot still only extends for a genuine attack clip — an idle must never lengthen the window');

// ---------------------------------------------------------------- the editor
{
  const fn = extractFunction('renderEditorFields', src);
  assert(/const gc=document\.createElement\('optgroup'\); gc\.label='Clips in this level';/.test(fn),
    'every clip the avatar carries is offered — the animation editor writes into that same list');
  assert(/const names=\(typeof playerModelClips!=='undefined'\) \? playerModelClips\.slice\(\) : \[\];/.test(fn),
    '...read from the model that is actually loaded');
  assert(/if\(a\.clip && names\.indexOf\(a\.clip\)<0\) names\.push\(a\.clip\);/.test(fn),
    '...plus the current pick, so opening the panel before the model finishes loading cannot silently drop it');
  assert(/og\.label='Slot \\u00b7 '\+sl\.g;/.test(fn), 'the named slots are still there, labelled as slots so the two kinds are distinguishable');
  assert(/if\(ssel\.value\.indexOf\('clip:'\)===0\) a\.clip=ssel\.value\.slice\(5\)\.slice\(0,40\);\s*\n\s*else \{ a\.clip=''; a\.slot=ssel\.value; \}/.test(fn),
    'picking a clip sets the clip; picking a slot CLEARS it, so the two can never disagree');
  assert(/w\.textContent='\\u26a0 This model has no clip called \\u201c'\+a\.clip\+'\\u201d \\u2014 it will fall back to '\+a\.slot\+'\.';/.test(fn),
    'and a bind left pointing at a clip the current model lacks says so, instead of quietly playing something else');
  assert(/including ones you made in the <b>animation editor<\/b>/.test(fn), 'the panel text says where the clips come from');
}
assert(/clip:String\(x\.clip==null\?'':x\.clip\)\.slice\(0,40\)/.test(extractFunction('_sanitizeActions', src)),
  'the pick is bounded and serialises with the level, like every other field on a bind');

// ---------------------------------------------------------------- the stretched preview
{
  const fn = extractFunction('_aeResize', src);
  assert(/const w=Math\.max\(1, holder\.clientWidth\|\|640\), h=Math\.max\(1, holder\.clientHeight\|\|480\);/.test(fn),
    'the size comes from the viewport element itself');
  assert(/if\(!force && w===_aeVW && h===_aeVH\) return;/.test(fn),
    'and nothing is rebuilt while nothing moves — this runs every frame, so it has to be free');
  assert(/_aeCam\.aspect=w\/h; _aeCam\.updateProjectionMatrix\(\);/.test(fn), 'the camera aspect follows the buffer, which is what stops the stretch');
  assert(/_aeR\.setPixelRatio\(Math\.min\(2, window\.devicePixelRatio\|\|1\)\);/.test(fn),
    '...and the buffer follows the device, so the preview is sharp on a retina screen and bounded on a 3x phone');
}
assert(/_aeResize\(\);\s+\/\/ build 1079: costs two integer reads until something actually moves\n\s*_aeR\.render\(_aeScene, _aeCam\);/.test(src),
  'it is checked every frame, immediately before the render — a window resize is NOT the only thing that changes that box');
assert(/addEventListener\('resize', \(\)=>\{ if\(_aeEl && _aeEl\.style\.display!=='none'\) _aeResize\(true\); \}\);/.test(src),
  'a window resize still forces it through');
assert(/#animEd #aeView \{ flex:1;/.test(html), 'the viewport really is flex:1 beside a panel — which is why it can move without the window moving');

done('build 1079: an action can play any clip you authored, and the preview stops stretching when the panel beside it moves');
