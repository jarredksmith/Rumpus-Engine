// build 1502: the in-game build menu is an OPTION.
//
// Requested from use: "Make the in-game build menu an option with a toggle. Some games won't need or use
// that mechanic." Verified before building: the radial existed in every level unconditionally, and the
// only off was emptying the slot list — which the panel itself refuses (remove is disabled at one slot).
// The toggle is a gameCfg boolean, defaulting ON, gated at the ONE chokepoint every input door calls.
import { gameSource, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---------------------------------------------------------- the chokepoint, executed ----
{
  const fn = src.match(/function openRadial\(\)\{[\s\S]*?\n\}/)[0];
  const gi = fn.indexOf("gameCfg.buildMenu===false");
  const oi = fn.indexOf('if(!gameOn ||');
  assert(gi > 0 && oi > gi, 'the opt-out gate is the FIRST question openRadial asks');
  // all three input doors route through it — none opens the radial its own way
  assert(/if\(e\.code===BINDS\.radial\)\{[^\n]*openRadial\(\)/.test(src), 'keyboard -> openRadial');
  assert(/if\(radNow && !padRadialPrev\) openRadial\(\)/.test(src), 'gamepad -> openRadial');
  assert(/if\(radialOpen\) closeRadial\(false\); else openRadial\(\)/.test(src), 'touch BUILD -> openRadial');

  // execute the gate: a disabled level never opens, an enabled one still does
  const head = fn.slice(fn.indexOf('{') + 1, fn.indexOf('radialOpen=true'));
  const opens = (buildMenu) => {
    let reached = true;
    try {
      new Function('gameCfg','gameOn','editorOpen','shopOpen','paused','duelDead','radialOpen',
        head + '; return 1;')({ buildMenu }, true, false, false, false, false, false);
    } catch (e) { reached = false; }
    // the head ends in returns only — reaching the end means no early return fired
    return reached;
  };
  eq(opens(false), true, '(rig sanity: the head evaluates)');
  const ret = (buildMenu) => new Function('gameCfg','gameOn','editorOpen','shopOpen','paused','duelDead','radialOpen',
    head + '; return "OPENS";')({ buildMenu }, true, false, false, false, false, false);
  eq(ret(false), undefined, 'buildMenu:false -> the radial never opens');
  eq(ret(true), 'OPENS', 'buildMenu:true -> exactly the old behaviour');
  eq(ret(undefined), 'OPENS', 'absent -> ON: every level authored before this build is unchanged');
}

// ------------------------------------------------- the always-assign rule (build 1400) ----
{
  const ap = src.match(/function _applyGameCfg\(g\)\{[\s\S]*?\n\}/)[0];
  assert(/gameCfg\.buildMenu\s+= g\.buildMenu !== false;/.test(ap),
    'the one applier ALWAYS assigns it — an if-present field leaks from the previous level');
  assert(/buildMenu: !\(savedLevel && savedLevel\.game && savedLevel\.game\.buildMenu===false\)/.test(src),
    'the boot default is ON unless the level says otherwise');
  assert(/buildMenu: \(gameCfg\.buildMenu===false\) \? false : undefined/.test(src),
    'the serializer emits it only when OFF — an untouched level is byte-identical');
}

// ------------------------------------------------------- the button and the coach follow ----
{
  assert(src.includes("&& gameCfg.buildMenu!==false);   // nothing to place, or the level opted out -> no BUILD"),
    'the touch BUILD button hides when the level opted out');
  const tut = src.match(/const steps=TUT_STEPS\.filter\([^\n]+/)[0];
  assert(tut.includes("!(st.id==='build' && gameCfg.buildMenu===false)"),
    'the tutorial never coaches "hold Tab" for a menu the level disabled');
}

// --------------------------------------------------------------- the panel says why ----
{
  const p = src.match(/function renderBuildMenuPanel\(\)\{[\s\S]{0,2400}/)[0];
  assert(p.includes("'Players can open the build menu'"), 'the toggle lives with the thing it governs');
  assert(/never opens in this level/.test(p) && /slots below are kept/.test(p),
    'off names its consequence AND that nothing authored is lost (1348: a control whose consequence is invisible)');
  assert(/pushUndoSnapshot\(\); gameCfg\.buildMenu=cb\.checked/.test(p),
    'the flip is undoable like its Gameplay-tab siblings');
}

done('build 1502: a level can decline the deploy radial — one gate at the chokepoint, absent means ON, ' +
  'the button and the coach follow, and the slots survive the off state');
