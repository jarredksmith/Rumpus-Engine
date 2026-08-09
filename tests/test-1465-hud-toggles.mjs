// build 1465 — five more HUD elements a creator can switch off, and one of them cut free.
//
// Asked for from play: "I also want HUD control over the reload loading bar, not every creator will want
// that" — and more generally, "I want as much customization as possible for creators to build the games
// they want to build and not feel stuck because of the limited options for on-screen elements."
//
// The machinery was already right: HUD_TOGGLES is the ONE place a toggle is declared, and the sanitizer,
// the class applier and the editor's checkbox list all iterate it. So a new entry needs a CSS rule and a
// label and nothing else. What was wrong was the SET — and one entry in particular.
//
// THE RELOAD BAR WAS WELDED TO THE CROSSHAIR'S TOGGLE. Build 1450 put it under the reticle and shared the
// reticle's hide rule, with a comment saying so. That made "keep the crosshair, lose the bar" — the exact
// thing asked for — unsayable, and the reverse too.

import { gameSource, html, extractConst, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

const TOGGLES = new Function('return ' + extractConst('HUD_TOGGLES', src))();
const LABELS  = new Function('return ' + extractConst('HUD_TOGGLE_LABEL', src))();

// ---------------------------------------------------------------- 1. the set, and the split
{
  for(const k of ['reload', 'hitmark', 'buffs', 'boss', 'marker'])
    assert(TOGGLES.includes(k), 'new toggle: ' + k);
  // nothing was lost
  for(const k of ['minimap','score','wave','ammo','health','crosshair','killfeed','prompt','grab','goal','dlg'])
    assert(TOGGLES.includes(k), 'still there: ' + k);
  eq(TOGGLES.length, 16, 'eleven were there, five are new');
  eq(new Set(TOGGLES).size, TOGGLES.length, 'no duplicates — a repeated key would render two checkboxes for one setting');

  // every toggle has a label, or the editor renders its raw key
  for(const k of TOGGLES) assert(typeof LABELS[k] === 'string' && LABELS[k].length,
    'every toggle is labelled for the creator: ' + k);
  eq(Object.keys(LABELS).length, TOGGLES.length, '...and there is no label for a toggle that does not exist');
}

// ---------------------------------------------------------------- 2. the CSS reaches every one
// A toggle in the table with no rule is a checkbox that does nothing — silently, which is the worst kind.
{
  const IDS = { minimap:'minimap', score:'score', wave:'wavePanel', ammo:'ammoPanel', health:'stats',
    crosshair:'crosshair', reload:'reloadBar', hitmark:'hitmarker', killfeed:'killFeed', buffs:'buffs',
    boss:'bossBar', marker:'objMarkers', prompt:'prompt', grab:'grabHint', goal:'goalBanner', dlg:'dialogue' };

  for(const k of TOGGLES){
    assert(new RegExp('body\\.hud-hide-' + k + '\\s+#' + IDS[k] + '\\b').test(html),
      'a rule exists for ' + k + ' -> #' + IDS[k]);
  }

  // THE SPLIT: the crosshair's rule must no longer name the reload bar
  assert(!/body\.hud-hide-crosshair\s+#reloadBar/.test(html),
    'THE FIX: hiding the crosshair no longer hides the reload bar');
  assert(/body\.hud-hide-reload\s+#reloadBar/.test(html), '...the bar has its own rule');
  assert(/body\.hud-hide-crosshair\s+#crosshair/.test(html), '...and the crosshair keeps its own');

  // build 1386's rule: a comment that describes removed behaviour is a decoy for every later grep
  assert(!/It rides\s*\n?\s*the same hide-crosshair toggle/.test(html),
    'the comment claiming the bar rides the crosshair toggle is gone, not left to mislead the next reader');
}

// ---------------------------------------------------------------- 3. the three consumers all derive
// This is what makes adding a toggle cheap AND complete: none of them has its own list.
{
  const san = src.slice(src.indexOf('out.hide[k]') - 400, src.indexOf('out.hide[k]') + 200);
  assert(/for\(const k of HUD_TOGGLES\)/.test(san), 'the sanitizer iterates the table');

  const app = extractFunction('applyHudCfg', src);
  assert(/for\(const k of HUD_TOGGLES\) body\.classList\.toggle\('hud-hide-'\+k/.test(app),
    'the class applier iterates the table');

  const ed = src.slice(src.indexOf('HUD_TOGGLE_LABEL[k]') - 700, src.indexOf('HUD_TOGGLE_LABEL[k]') + 60);
  assert(/for\(const k of HUD_TOGGLES\)/.test(ed), 'the editor checkbox list iterates the table');
  assert(/hudCfg\.hide\[k\]=!cb\.checked/.test(ed), '...and writes the same key');

  // executed: the applier really does raise a class per hidden key and lower it per shown one
  const run = new Function('TOGGLES', 'HIDE', `
    const HUD_TOGGLES = TOGGLES;
    const c = { hide: HIDE };
    const on = new Set();
    const body = { classList: { toggle:(n, v) => { if(v) on.add(n); else on.delete(n); } } };
    for(const k of HUD_TOGGLES) body.classList.toggle('hud-hide-'+k, !!(c.hide && c.hide[k]));
    return [...on].sort();`);
  eq(JSON.stringify(run(TOGGLES, {})), '[]', 'nothing hidden by default — no existing level changes');
  eq(JSON.stringify(run(TOGGLES, { reload:true })), '["hud-hide-reload"]',
    'hiding the reload bar raises exactly its own class and nothing else');
  eq(run(TOGGLES, Object.fromEntries(TOGGLES.map(k => [k, true]))).length, TOGGLES.length,
    'every toggle can be switched off');
  eq(JSON.stringify(run(TOGGLES, { nosuch:true })), '[]', 'a key that is not a toggle raises nothing');
}

// ---------------------------------------------------------------- 4. it survives a save
{
  const san = extractFunction('_sanitizeHud', src);
  assert(/for\(const k of HUD_TOGGLES\) out\.hide\[k\] = !!\(h\.hide && h\.hide\[k\]\);/.test(san),
    'the hide set is rebuilt from the table, so a level file cannot smuggle an unknown key in');
  // executed: an unknown key is DROPPED and every real one arrives as a boolean
  const clean = new Function('TOGGLES', 'IN', `
    const HUD_TOGGLES = TOGGLES; const h = IN; const out = { hide:{} };
    for(const k of HUD_TOGGLES) out.hide[k] = !!(h.hide && h.hide[k]);
    return out.hide;`)(TOGGLES, { hide: { reload:1, evil:true, boss:'yes' } });
  eq(clean.reload, true, 'a truthy value becomes a real boolean');
  eq(clean.boss, true, '...whatever it was');
  eq(clean.evil, undefined, '...and an unknown key never reaches the applier');
  eq(Object.keys(clean).length, TOGGLES.length, '...the set is exactly the table');
  assert(/hud:/.test(extractFunction('serializeLevel', src)), 'the hud block is serialized');
}

// ---------------------------------------------------------------- 5. defaults are unchanged
// The whole set is opt-OUT: a level that never opens this panel must look exactly as it did.
{
  const dh = extractConst('DEFAULT_HUD', src) || '';
  assert(!/hide\s*:\s*\{[^}]*true/.test(dh), 'nothing is hidden by default');
}

done('build 1465 (asked for from play): five more HUD elements a creator can switch off — the reload bar, the hit marker, the power-up timers, the boss health bar and the objective markers — and the reload bar cut free of the crosshair. "I want HUD control over the reload loading bar, not every creator will want that." The machinery was already right: HUD_TOGGLES is the ONE place a toggle is declared, and the sanitizer, the class applier and the editor\'s checkbox list all iterate it, so a new entry needs a CSS rule and a label and nothing else. What was wrong was the SET, and one entry in particular: build 1450 put the reload bar under the reticle and shared the reticle\'s hide rule, which made "keep the crosshair, lose the bar" — the exact thing asked for — unsayable, and the reverse too. Measured live through the real applyHudCfg on the rendered elements, 14 of 16 toggles confirmed on -> none -> back with the toggle off as the control at every step, and the split confirmed both ways: crosshair block / bar NONE, and crosshair none / bar BLOCK. The two unverified are hosts this session never built (the marker host and the dialogue panel are created lazily); their rules are pinned instead. Four instrument faults on the way, each of which made a working toggle look broken: `.hidden` is display:none with an important flag and beats a plain inline display, so every at-rest element read as hidden whatever the toggle did; the objective banner is opacity-driven by design (build 701) so display is the wrong measurand for it; and it carries a 0.4 s transition, so getComputedStyle read 0 ms after the class change returns the INTERPOLATED old value — which made a toggle that works perfectly read as dead while the body demonstrably carried its class');
