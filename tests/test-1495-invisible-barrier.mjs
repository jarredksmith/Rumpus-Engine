// build 1495 — an invisible barrier
//
// Reported from play: "is there a way to create an invisible barrier so players can't walk into certain
// areas? Primitive opacity doesn't go totally transparent."
//
// It did not, and the reason was a literal: `Math.max(0.15, ...)` clamped every opacity to a 15% floor, in
// TWO places. Build 871 chose that floor when opacity meant "glass", where a pane you cannot see is
// indistinguishable from a prop that failed to load; it is exactly wrong for the other thing creators want
// from the same slider. The floor is 0 now, and 0 means barrier — no new concept, no new serialized field,
// and it is the control the creator already reached for.

import { readFileSync } from 'node:fs';
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();
const three = readFileSync(new URL('./node_modules/three/build/three.cjs', import.meta.url), 'utf8');

/* ================================================================= the premise, in the real three build */
{
  /* `material.visible` is what hides a barrier, and it has to do BOTH jobs: skip the draw and skip the
     SHADOW. An invisible wall casting a shadow would give itself away instantly, so this is asserted
     against the shipped library rather than assumed — an upgrade that stopped honouring it must fail here
     and not in somebody's level. */
  assert(/result\.visible = material\.visible;/.test(three),
    'r149 copies material.visible onto the depth material used for the shadow pass');
  assert(/\} else if \( material\.visible \) \{/.test(three),
    '...and gates the shadow render on it');
}

/* ================================================================= the derivation, executed */
const op = (function(){
  const body = [ extractFunction('_propOpacity', src) ].join('\n');
  return new Function(body + '; return _propOpacity;')();
})();
const INVIS = parseFloat(extractConst('PROP_INVIS', src));
const GHOST = parseFloat(extractConst('PROP_GHOST', src));

{
  eq(op({}), 1, 'a prop that never touched the slider is fully opaque');
  eq(op({ op: 1 }), 1, 'and so is one set to 1');
  eq(op({ op: 0.4 }), 0.4, 'a real value passes through');
  /* THE ZERO-SWALLOW, which is the half that would have made the floor removal useless. `+ud.op || 1`
     turns 0 into 1 (build 1329's recorded trap), so a saved barrier would have loaded back SOLID and
     VISIBLE with nothing failing anywhere. */
  eq(op({ op: 0 }), 0, 'zero is zero, not one — the || default is gone');
  /* Asserted as the PROPERTY rather than the absence of a string: both sites now route through the one
     derivation and neither carries the 15% floor. A bare `!/\+ud\.op \|\| 1/` was the first draft and it
     FAILED against correct code — this build's own comments quote the shape they removed, which is the
     prose-defeats-a-pin trap this file records under 1421, 1493 and now here for the third build running. */
  const blendSrc = extractFunction('_applyPropBlend', src), setSrc = extractFunction('applyPropOpacity', src);
  assert(/const op = _propOpacity\(ud\);/.test(blendSrc), 'the blend asks the one derivation');
  assert(!/Math\.max\(0\.15/.test(blendSrc), '...and the 15% floor is gone from it');
  assert(!/Math\.max\(0\.15/.test(setSrc), '...and from the setter');
  assert(/Math\.max\(0, Math\.min\(1, v\)\)/.test(setSrc), 'which clamps to a floor of ZERO');
  /* hostile input: a level file is untrusted (build 1325) */
  eq(op({ op: NaN }), 1, 'NaN falls back to opaque rather than making everything invisible');
  eq(op({ op: 'x' }), 1, 'and so does a string');
  eq(op({ op: -5 }), 0, 'negative clamps to the barrier, never below');
  eq(op({ op: 99 }), 1, 'and an absurd value clamps to opaque');
  assert(INVIS > 0 && INVIS < 0.1, 'the barrier threshold is a small positive number: ' + INVIS);
  assert(GHOST > INVIS && GHOST < 1, 'and the editor ghost is visible without being solid: ' + GHOST);
}

{
  /* the threshold is the one build 1236 already uses, or the two would come to different answers about the
     same prop — one hiding it, the other still stopping bullets on it */
  const ghost = extractFunction('_shotGhost', src);
  assert(/<= 0\.02/.test(ghost), "build 1236's ghost test still uses 0.02");
  eq(INVIS, 0.02, '...and PROP_INVIS is the same number');
  assert(/m\.visible === false/.test(ghost),
    'and it reads material.visible, so a barrier is a ghost to shots by the engine\'s own rule');
}

/* ================================================================= the blend */
{
  const blend = extractFunction('_applyPropBlend', src);
  assert(/const barrier = \(cut <= 0\) && \(op <= PROP_INVIS\)/.test(blend),
    'a barrier is an opacity of zero AND no cutout');
  /* a CUTOUT wins, and must: it is opaque by design (build 1340) and sets opacity to 1 itself, so a
     cutout prop can never be mistaken for a barrier however its opacity slider was left */
  assert(blend.indexOf('if(cut > 0)') < blend.indexOf('} else if(barrier)'),
    'the cutout branch is tested first');
  assert(/m\.visible = !barrier \|\| !!editorOpen;/.test(blend),
    'hidden in play, shown while authoring — one expression, so the two can never disagree');
  assert(/m\.opacity = PROP_GHOST/.test(blend), 'and it renders as a faint ghost in the editor');
  /* every other prop must be byte-identical: this is a floor removal, not a re-render of every level */
  assert(/m\.transparent = op < 1; m\.opacity = op; m\.depthWrite = op >= 0\.6;/.test(blend),
    'the ordinary branch is unchanged, so nothing already authored moves');
}
{
  /* the editor toggle is the only thing that changes what a barrier should look like */
  const sync = extractFunction('_syncBarrierProps', src);
  assert(/_applyPropBlend\(o\)/.test(sync), 'the toggle re-runs the blend');
  assert(/_isBarrier\(o\)/.test(sync), '...for barriers only, so an ordinary level pays one predicate a prop');
  const tog = extractFunction('toggleEditor', src);
  assert(tog.indexOf('editorOpen = !editorOpen') < tog.indexOf('_syncBarrierProps'),
    'called AFTER the flag flips, which is what lets ONE site serve both directions');
}

/* ================================================================= it is still solid */
{
  /* nothing in this build may touch the collider path — that is the whole feature */
  const rc = extractFunction('refreshPropCollider', src);
  assert(!/PROP_INVIS|_isBarrier|userData\.op/.test(rc),
    'the engine collider never asks about opacity: a barrier collides exactly like the wall it replaces');
  const asc = extractFunction('addStaticColliderFor', src);
  assert(!/PROP_INVIS|_isBarrier/.test(asc), 'and so does the Rapier body');
}
{
  /* an enemy bolt agrees with a bullet. Build 1236 made every raycast shot pass through anything invisible;
     the bolt is the one shooter that does not raycast, so without this it would eat fire the player's own
     rounds fly through — the same wall behaving two ways depending on who pulled the trigger. */
  const shots = extractFunction('updateEnemyShots', src);
  assert(/_isBarrier\(c\)\) continue;/.test(shots), 'an enemy bolt passes through a barrier');
  assert(shots.indexOf('_isBarrier(c)') < shots.indexOf('userData.boxes||[b0]'),
    '...before the box test, or it would already have died');
}

/* ================================================================= the door */
{
  /* a capability nobody can find is one that does not exist (build 1348) */
  assert(/slider\('Opacity'/.test(src), 'the control is the one the creator already reached for');
  const sl = extractFunction('renderEditorFields', src) || src;
  assert(/Invisible barrier \\u2014 not drawn in play, but still completely solid/.test(src),
    'and a barrier says what it is, where it is');
  assert(/Opacity 0 makes an INVISIBLE BARRIER/.test(src),
    '...with the surface-finish hint naming it before you get there');
  /* the hint fires only for a real barrier, so it is not noise on every glass pane */
  assert(/_propOpacity\(selObj\.userData\) <= PROP_INVIS && !\(\+selObj\.userData\.cut > 0\)/.test(src),
    'the barrier note is shown only when the prop actually is one');
}

/* ================================================================= round trip */
{
  /* 0 < 1, so the existing only-when-changed rule already carries it — no serializer change, and no level
     that never used it grows a key */
  assert(/if\(o\.userData\.op!=null && \+o\.userData\.op < 1\) m\.op = \+o\.userData\.op;/.test(src),
    'zero serializes through the rule that was already there');
  const apply = extractFunction('applyStoredMaterial', src);
  assert(/if\(mat\.op!=null\) applyPropOpacity\(obj, mat\.op\);/.test(apply),
    'and restores through the setter, whose own zero-swallow is fixed above');
}

done('build 1495 — opacity reaches 0, and 0 is an invisible barrier: not drawn and casting no shadow in ' +
     'play, a faint clickable ghost in the editor, and exactly as solid as the wall it replaces');
