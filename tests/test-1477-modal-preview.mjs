// build 1477 — the HUD editor can preview a modal.
//
// Build 1468 made a modal a STACK of widgets gated on `_modalOpen`, and `toggleEditor` closes any open
// modal (build 1471) — so every widget in a modal was INVISIBLE the whole time a creator was authoring it.
//
// The engine said so itself. Build 1468's own hint read: "a widget in a modal is hidden while you author —
// blank this field to lay it out, then put the name back." That is eighteen edits for a nine-widget shop,
// and the moment the name goes back you can no longer see whether build 1476's layering is right.
// A workaround the product instructs you to perform is a missing feature.

import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- 1. the gate, EXECUTED
// The real expression, lifted from the real function rather than restated — a rig that restates the thing
// under test keeps passing against a stale copy.
{
  const upd = extractFunction('updateHudWidgets', src);

  const prevLine = upd.match(/const _hwPrev=[^\n]+/);
  assert(prevLine, 'the preview flag is computed...');
  assert(/classList\.contains\('hudPreview'\)/.test(prevLine[0]),
    '...off the SAME body class build 969 already keys on, so the file has one answer to "is the layout ' +
    'editor on screen" rather than two that can disagree');
  assert(upd.indexOf('const _hwPrev=') < upd.indexOf('for(const e of _hwEls)'),
    '...once, before the loop — not per widget');

  const visSrc = upd.match(/const vis=_hwPrev \?[\s\S]*?!==0\)\);/);
  assert(visSrc, 'the visibility gate branches on it');

  const vis = new Function('_hwPrev', '_hwPrevModal', '_modalOpen', 'logicVars', 'w',
    visSrc[0] + ' return vis;');

  const V = {};                      // no logic variables: the state an editor session is really in
  const PLAY = (w, open = '') => vis(false, 'shop', open, V, w);
  const EDIT = (w, prev) => vis(true, prev, '', V, w);

  // in PLAY nothing moved — this is the whole compatibility argument
  eq(PLAY({}), true, 'play: a plain widget shows');
  eq(PLAY({ modal: 'shop' }), false, 'play: a modal widget is hidden while its modal is shut');
  eq(PLAY({ modal: 'shop' }, 'shop'), true, '...and shown while it is open');
  eq(PLAY({ modal: 'shop' }, 'pause'), false, '...and only for ITS modal');
  eq(PLAY({ when: 'hasKey' }), false, 'play: `show when` still hides on a zero variable');
  eq(PLAY({ when: 'hasKey' }, ''), false);
  V.hasKey = 1;
  eq(PLAY({ when: 'hasKey' }), true, '...and shows on a non-zero one');
  eq(PLAY({ modal: 'shop', when: 'hasKey' }, 'shop'), true, 'play: the two gates still COMPOSE');
  eq(PLAY({ modal: 'shop', when: 'hasKey' }, ''), false);
  delete V.hasKey;

  // the editor answers with the PREVIEW instead
  eq(EDIT({}, ''), true, 'editor: the play HUD shows with nothing previewed');
  eq(EDIT({ modal: 'shop' }, ''), false, '...and a modal widget does not, so the HUD is not a pile');
  eq(EDIT({ modal: 'shop' }, 'shop'), true, 'previewing a modal shows its widgets');
  eq(EDIT({ modal: 'pause' }, 'shop'), false, '...and only its own');
  eq(EDIT({}, 'shop'), true, 'the play HUD stays visible under the modal, which is what a player sees');

  // `show when` is bypassed in the editor — build 969's rule: the layout editor shows everything
  eq(EDIT({ when: 'hasKey' }, ''), true, 'editor: a `show when` widget is visible so it can be arranged');
  eq(EDIT({ modal: 'shop', when: 'hasKey' }, 'shop'), true, '...inside a previewed modal too');
  eq(EDIT({ modal: 'shop', when: 'hasKey' }, ''), false,
    '...but the MODAL gate still decides, or every widget in the level would show at once');

  // the preview cannot leak into play: it is only ever read behind _hwPrev
  eq(vis(false, 'shop', '', V, { modal: 'shop' }), false,
    'a preview left set can never open a modal in play — the flag is the only door');
}

// ---------------------------------------------------------------- 2. it is a VIEW, not an edit
{
  assert(/let _hwPrevModal = '';/.test(src), 'the preview state exists...');
  eq((src.match(/_hwPrevModal/g) || []).length, 8,
    '...and is referenced only where it should be — no stray consumer');

  assert(!/_hwPrevModal[^\n]*serializ/i.test(src) && !/hudWidgets:[^\n]*_hwPrevModal/.test(src),
    'it is never serialized');
  assert(!/prevModal|_hwPrevModal/.test(extractFunction('_sanitizeHudWidgets', src)),
    '...and the sanitizer knows nothing about it, so it cannot ride a level file');

  const pv = src.match(/const previewW=\(\)=>\{[^\n]*\};/);
  assert(pv, 'the preview commit exists');
  assert(/updateHudWidgets/.test(pv[0]), '...and redraws the widgets');
  assert(!/_levelDirty/.test(pv[0]),
    '...without marking the level dirty — looking at a modal is not editing one');
  assert(!/pushUndoSnapshot/.test(pv[0]), '...and takes no undo snapshot');
  assert(/sel\.onchange=\(\)=>\{ _hwPrevModal=sel\.value; previewW\(\); \};/.test(src),
    'the picker goes through it rather than through commitW');
}

// ---------------------------------------------------------------- 3. the picker, and the door (1348)
{
  assert(/add\('', 'the play HUD \(no modal open\)'\);/.test(src),
    'the list leads with the ordinary HUD, so the default is the state a creator is already in');
  assert(/for\(const o of opts\) add\(o\.v, o\.v\+'  \\u2014 '\+o\.n\+\(o\.n===1\?' widget':' widgets'\)\);/.test(src),
    '...and every authored modal is offered with its widget COUNT, since a name alone says nothing');
  assert(/_lgModalOptions/.test(src.slice(src.indexOf('build 1477: the modal preview picker'),
                                          src.indexOf('build 1477: the modal preview picker') + 900)),
    'the options come from build 1468’s own reader — the widgets ARE where a modal is defined');

  assert(/if\(_hwPrevModal && !opts\.some\(o=>o\.v===_hwPrevModal\)\) _hwPrevModal='';/.test(src),
    'a preview whose last widget was deleted resets rather than pointing at nothing');

  assert(/if\(!opts\.length\)\{ sel\.disabled=true; sel\.title=/.test(src),
    'with nothing to pick the control is DISABLED rather than absent — a control that appears only once ' +
    'you already know the feature exists teaches nobody (build 1348)');
  assert(/No widget names a modal yet/.test(src), '...and says how to make one');

  assert(/"show when" is ignored here, so nothing is invisible while you arrange it/.test(src),
    'the hint states the bypass, because a creator would otherwise read it as a bug');
  assert(/The dimmed backdrop is play-only/.test(src),
    '...and states what the preview deliberately does NOT reproduce');
  assert(/it is never saved and never opens the modal in play/.test(src),
    '...and that it is a view rather than a setting');
}

// ---------------------------------------------------------------- 4. naming a modal no longer hides it
{
  assert(/v=>\{ w\.modal=v\.trim\(\)\.slice\(0,24\); if\(w\.modal\) _hwPrevModal=w\.modal; renderHudPanel\(\); \}/.test(src),
    'typing a modal name previews it, so the widget does not vanish at the moment you most need to see it');
  assert(/Use the Preview picker above to lay it out\./.test(src),
    'and the field’s own hint names the control instead of prescribing the workaround');
  assert(!/blank this field to lay it out, then put the name back/.test(src),
    '...which is gone, because it is no longer true');
}

// ---------------------------------------------------------------- 5. the backdrop rule is untouched
{
  const sb = extractFunction('_modalSyncBack', src);
  assert(/const want = !!_modalOpen && !\(typeof editorOpen!=='undefined' && editorOpen\)/.test(sb),
    'the backdrop still keys on the REAL open modal and still refuses in the editor (build 1468)');
  assert(!/_hwPrev/.test(sb), '...and knows nothing about the preview');
}

done('build 1477: THE HUD EDITOR CAN PREVIEW A MODAL. Build 1468 made a modal a stack of widgets gated on `_modalOpen`, and build 1471 has `toggleEditor` close any open modal — so every widget in a modal was INVISIBLE for the whole time a creator was authoring it. The engine said so itself: build 1468’s own hint read "a widget in a modal is hidden while you author — blank this field to lay it out, then put the name back", which is eighteen edits for a nine-widget shop, and the moment the name goes back you can no longer see whether build 1476’s layering is right. A workaround the product instructs you to perform is a missing feature. The preview answers the modal gate in the layout editor and BYPASSES `show when` there, for the reason build 969 already gave for the touch buttons — "the layout editor shows everything so you can arrange it" — while the play path is byte-unchanged, proven by executing the real gate through nine play cases including the two composing. It is a VIEW, not an edit: never serialized, unknown to the sanitizer, no undo snapshot, no dirty flag, and read only behind the `hudPreview` body class, so a preview left set can never open a modal in play. Typing a modal name now previews it rather than making the widget disappear, and the picker is present-but-disabled when there is nothing to pick rather than absent');
