// build 1473 — a modal is usable on a phone.
//
// Two defects, both in a feature two builds old, both invisible on a desktop.
//
// 1. `#touchUI` is z-index 40 — TEN TIMES the modal's own backdrop (3) and widget host (4). On a phone the
//    fire button, both sticks and every action button were live and fully visible ON TOP of the dimmed
//    menu, so a tap meant to buy something fired a round instead. Build 1468's gate is a MOUSEDOWN gate
//    and never covered this.
// 2. Build 1471 gave the player Escape. A phone has no Escape key, so on touch the only way out of a modal
//    was one the creator remembered to build — which is exactly the lock-in 1471 exists to make
//    impossible, surviving on the one device that could not fall back to the keyboard.

import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. the premise, in the real stylesheet
{
  /* the LITERAL rule, not the first `#touchUI {` in the file — there are two, and the earlier one is the
     uiScale zoom rule with no z-index in it at all (build 1392's recorded hazard: an indexOf/first-match
     that misses is not an error, it is a wrong answer). */
  assert(/#touchUI \{ position:absolute; inset:0; z-index:40;/.test(html),
    'the touch layer really is at z-index 40');

  const sync = extractFunction('_modalSyncBack', src);
  assert(/z-index:3;/.test(sync), '...against the modal backdrop at 3...');
  assert(/pointer-events:none;z-index:4;/.test(src), '...and the widget host at 4');
  // i.e. without this build the sticks paint over everything the modal draws
}

// ---------------------------------------------------------------- 2. the touch layer stands down
{
  assert(/body\.modalUp #touchUI \{ display: none !important; \}/.test(html),
    'a modal hides the touch controls — the same shape as the cinematic rule, for the same reason');
  assert(/body\.cine #hud,body\.cine #touchUI/.test(src),
    '...and that precedent is intact beside it');

  const sync = extractFunction('_modalSyncBack', src);
  assert(/classList\.toggle\('modalUp', want\)/.test(sync),
    'the class follows `want`, not `_modalOpen`...');
  assert(sync.indexOf("classList.toggle('modalUp'") < sync.indexOf('if(!want)'),
    '...and is set before the early return, so CLEARING it is not skipped');

  // executed: the class tracks the same three conditions the backdrop does
  const run = (S) => {
    const cls = new Set();
    new Function('S', 'body', `
      let _modalOpen = S.open, _modalBack = null, _modalX = null;
      const editorOpen = !!S.editorOpen, paused = !!S.paused;
      const document = { body, getElementById: () => null };
      const want = !!_modalOpen && !(typeof editorOpen!=='undefined' && editorOpen) && !(typeof paused!=='undefined' && paused);
      try{ if(document.body) document.body.classList.toggle('modalUp', want); }catch(e){}
      return want;`)(S, { classList: { toggle: (k, v) => { if (v) cls.add(k); else cls.delete(k); } } });
    return cls.has('modalUp');
  };
  eq(run({ open: 'shop' }), true, 'a modal up stands the sticks down');
  eq(run({ open: '' }), false, 'no modal hands them straight back');
  eq(run({ open: 'shop', editorOpen: true }), false, 'the editor hands them back — authoring is not play');
  eq(run({ open: 'shop', paused: true }), false, '...and so does pausing');
}

// ---------------------------------------------------------------- 3. the way out a phone can reach
{
  const b = extractFunction('_modalCloseBtn', src);
  assert(/_modalSet\(''\)/.test(b), 'the close button closes the modal through the one setter');
  assert(/ev\.stopPropagation\(\)/.test(b),
    '...and stops the event, or the click also lands on the backdrop beneath it');
  assert(/dataset\.close='1'/.test(b), '...and backs out under a gamepad too (build 940)');
  assert(/aria-label','Close'/.test(b), '...and is named for a screen reader');
  assert(/pointer-events:auto/.test(b), '...and opts into pointer events, since the layer around it does not');
  assert(/var\(--accent\)/.test(b) && /var\(--accent-rgb\)/.test(b),
    '...and takes the level\'s accent rather than a hardcoded teal (builds 665/1470)');

  const sync = extractFunction('_modalSyncBack', src);
  assert(/_modalX=_modalCloseBtn\(\); hud\.appendChild\(_modalX\);/.test(sync),
    'it is a SIBLING of the backdrop, appended to #hud...');
  assert(/z-index:5/.test(b),
    '...at z-index 5, above the widget host — the backdrop carries its own stacking context at 3, so a ' +
    'child of it would paint BELOW the widgets and a full-bleed panel image would bury the only way out');
  assert(/if\(_modalX\)\{ _modalX\.remove\(\); _modalX=null; \}/.test(sync),
    '...and it leaves with the modal rather than outliving it');
}

// ---------------------------------------------------------------- 4. and it is NOT a backdrop tap
{
  const sync = extractFunction('_modalSyncBack', src);
  assert(!/_modalBack\.onclick/.test(sync) && !/_modalBack\.addEventListener/.test(sync),
    'the BACKDROP deliberately does not close on tap: a modal\'s widgets sit in a pointer-events:none ' +
    'host, so every non-button pixel of the menu — the panel art, the title, the price list — is backdrop, ' +
    'and dismissing the shop because the player touched its own background is worse than not leaving');
  assert(/dismissing the shop because the player touched its own background/.test(src),
    '...and the reason is recorded where the decision is, not only here');
}

// ---------------------------------------------------------------- 5. nothing from 1468/1471 moved
{
  const sync = extractFunction('_modalSyncBack', src);
  assert(/editorOpen/.test(sync) && /paused/.test(sync), 'build 1468\'s play-only backdrop is intact');
  assert(/if\(_modalBack && _modalBack\.parentNode\) return;/.test(sync), '...and it is still built once');
  assert(/if\(e\.code==='Escape' && !e\.repeat && typeof _modalOpen!=='undefined' && _modalOpen && !editorOpen\)\{/.test(src),
    'build 1471\'s Escape is intact — the desktop route is unchanged');
  assert(/\|\| _modalOpen\) return;/.test(src), 'build 1468\'s mousedown gate is intact');
}

done('build 1473: A MODAL IS USABLE ON A PHONE — two defects in a feature two builds old, both invisible on a desktop. (1) `#touchUI` is z-index 40, TEN TIMES the modal\'s own backdrop (3) and widget host (4), so on a phone the fire button, both sticks and every action button were live and fully visible ON TOP of the dimmed menu: a tap meant to buy something fired a round instead. Build 1468\'s gate is a MOUSEDOWN gate and never covered this. The touch layer now stands down while a modal is up, the same shape as the cinematic rule that stands the same layer down for the same reason — and the class follows the backdrop\'s own `want`, so opening the editor or pausing hands the sticks straight back, executed across all four states. (2) Build 1471 gave the player Escape, and A PHONE HAS NO ESCAPE KEY: on touch the only way out was one the creator remembered to build, which is exactly the lock-in 1471 exists to make impossible, surviving on the one device that could not fall back to the keyboard. The close control is a real BUTTON and deliberately not a tap on the backdrop — a modal\'s widgets sit in a pointer-events:none host, so every non-button pixel of the menu (the panel art, the title, the price list) IS backdrop, and dismissing the shop because the player touched its own background is worse than not being able to leave. It is a SIBLING of the backdrop rather than a child, at z-index 5: the backdrop carries z-index 3 and therefore its own stacking context, so a child of it would paint below the widgets and a full-bleed panel image would bury the only way out');
