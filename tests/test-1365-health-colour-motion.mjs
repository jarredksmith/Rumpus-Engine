// build 1365 — the health bar colour carries hp/maxHp, and the interface moves.
// Executes the three-stop interpolation (healthy #38f5b5 / caution #ffd166 at 50% /
// danger #ff4d6d at and below 25%), proves the lerp has no hue snap at either stop,
// executes _hpBarTick (dynamic paint, pulse class, bucket caching, authored-colour yield),
// and pins the motion tokens, the panel-in keyframe, the reduced-motion guard and the
// kill-feed row wiring in the stylesheet/markup.
import { gameSource, html, extractFunction, extractConst, evalIn, assert, eq, near, done } from './harness.mjs';

const src = gameSource();

// --- the colour function, executed ---
const colorSrc = extractFunction('_hpBarColor', src);
const hpColor = evalIn(colorSrc);
const rgb1 = s => { const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(s); return m ? [+m[1], +m[2], +m[3]] : null; };
const HEALTHY = [56,245,181], CAUTION = [255,209,102], DANGER = [255,77,109];

// 100% is the ACCENT, and provably NOT the danger colour.
eq(JSON.stringify(rgb1(hpColor(1))), JSON.stringify(HEALTHY), 'full health paints the accent #38f5b5');
assert(JSON.stringify(rgb1(hpColor(1))) !== JSON.stringify(DANGER), 'full health is NOT the danger colour');
// 50% is exactly the caution stop.
eq(JSON.stringify(rgb1(hpColor(0.5))), JSON.stringify(CAUTION), '50% is the caution stop #ffd166');
// At and below 25% it is the danger colour, exactly.
eq(JSON.stringify(rgb1(hpColor(0.25))), JSON.stringify(DANGER), '25% is the danger stop #ff4d6d');
eq(JSON.stringify(rgb1(hpColor(0.1))), JSON.stringify(DANGER), 'below 25% stays danger');
eq(JSON.stringify(rgb1(hpColor(0))), JSON.stringify(DANGER), 'zero hp is danger');
// The lerp is real: 75% sits at the midpoint of caution -> healthy per channel (rounding tolerance 1).
{
  const c = rgb1(hpColor(0.75));
  for(let i=0;i<3;i++) near(c[i], (CAUTION[i]+HEALTHY[i])/2, 1, '75% is the caution/healthy midpoint, channel '+i);
}
// No hue snap at either bucket edge: crossing a stop by ±0.01 moves every channel only a few code values.
for(const edge of [0.25, 0.5]){
  const lo = rgb1(hpColor(edge-0.01)), hi = rgb1(hpColor(edge+0.01));
  for(let i=0;i<3;i++) assert(Math.abs(hi[i]-lo[i]) <= 12, 'smooth across the '+edge+' stop, channel '+i+' (moved '+Math.abs(hi[i]-lo[i])+')');
}
// Monotone toward green as hp rises through the caution band (spot the direction, not just closeness).
assert(rgb1(hpColor(0.45))[1] > rgb1(hpColor(0.30))[1], 'green channel rises with hp in the danger->caution band');

// --- the tick, executed: paint, pulse, caching, authored-colour yield ---
const tickSrc = extractFunction('_hpBarTick', src);
const DEFAULT_HUD = evalIn(extractConst('DEFAULT_HUD', src), { HUD_TOGGLES: [], HUD_ELEMENTS: [] });
function mkRig(hudCfgVal){
  let bgWrites = 0, bg = '';
  const el = {
    classList: { _s:new Set(), toggle(c,on){ if(on) this._s.add(c); else this._s.delete(c); }, contains(c){ return this._s.has(c); } },
    style: {}
  };
  Object.defineProperty(el.style, 'background', { get(){ return bg; }, set(v){ bg = v; bgWrites++; } });
  const factory = new Function('$', 'hudCfg', 'DEFAULT_HUD',
    '"use strict";\nvar _hpBarLastKey=\'\';\n' + colorSrc + '\n' + tickSrc + '\nreturn _hpBarTick;');
  return { tick: factory(()=>el, hudCfgVal, DEFAULT_HUD), el, writes: ()=>bgWrites };
}
{
  const r = mkRig(null);   // factory look: dynamic colour drives the bar
  r.tick(1);
  assert(r.el.style.background.indexOf('rgb(56,245,181)') >= 0, 'tick paints the accent at full health');
  assert(!r.el.classList.contains('hpPulse'), 'no pulse at full health');
  r.tick(0.12);
  assert(r.el.style.background.indexOf('rgb(255,77,109)') >= 0, 'tick paints danger below 25%');
  assert(r.el.classList.contains('hpPulse'), 'pulse class ON below 25%');
  r.tick(0.8);
  assert(!r.el.classList.contains('hpPulse'), 'pulse class removed above 25%');
  const n = r.writes();
  r.tick(0.8); r.tick(0.8001);   // same 64-bucket -> the CSS string is NOT rebuilt
  eq(r.writes(), n, 'an unchanged bucket writes no style (cheap per-frame path)');
  r.tick(0.5);
  assert(r.writes() > n, 'a moved bucket repaints');
}
{
  const r = mkRig({ health:'#123456' });   // creator-authored health colour: the var rule must win
  r.tick(1);
  eq(r.el.style.background, '', 'an authored hudCfg.health clears the inline paint (var(--hud-health) rules)');
  r.tick(0.1);
  eq(r.el.style.background, '', '...at every hp');
  assert(r.el.classList.contains('hpPulse'), 'the low-hp pulse still fires on an authored colour (information, not decoration)');
}

// --- wiring pins ---
const hud = extractFunction('updateHUD', src);
assert(/_hpBarTick\(player\.maxHp>0 \? player\.hp\/player\.maxHp : 0\)/.test(hud), 'updateHUD drives the colour off the same hp/maxHp the width uses');
const ah = extractFunction('applyHudCfg', src);
assert(ah.indexOf("_hpBarLastKey=''") >= 0, 'applyHudCfg invalidates the colour latch when the HUD theme changes');
assert(/if\(c\.health\.toLowerCase\(\)!==DEFAULT_HUD\.health\)/.test(ah), 'a custom authored colour clears the dynamic paint immediately');

// --- CSS pins: pulse, tokens, panel-in + reduced-motion guard ---
assert(html.indexOf('@keyframes hpPulse') >= 0 && html.indexOf('#hpFill.hpPulse { animation: hpPulse') >= 0, 'the low-hp pulse keyframe + class exist');
assert(html.indexOf('--ease-out: cubic-bezier(.16,1,.3,1)') >= 0, ':root carries the --ease-out motion token');
assert(html.indexOf('--ease-in: cubic-bezier(.7,0,.84,0)') >= 0, ':root carries the --ease-in motion token');
{
  const iRoot = html.indexOf(':root{'), iRootEnd = html.indexOf('}', iRoot);
  const rootBlk = html.slice(iRoot, iRootEnd);
  assert(rootBlk.indexOf('--ease-out') >= 0 && rootBlk.indexOf('--ease-in') >= 0, 'both tokens live in the :root block itself');
}
// The entry animations sit INSIDE the reduced-motion guard — walk the media block braces to prove containment.
const mediaOpen = html.indexOf('@media (prefers-reduced-motion: no-preference){');
assert(mediaOpen >= 0, 'the build-1365 reduced-motion guard exists');
let depth = 0, mediaClose = -1;
for(let i = html.indexOf('{', mediaOpen); i < html.length; i++){
  const ch = html[i];
  if(ch === '{') depth++;
  else if(ch === '}'){ depth--; if(depth === 0){ mediaClose = i; break; } }
}
assert(mediaClose > mediaOpen, 'the media block closes');
const blk = html.slice(mediaOpen, mediaClose+1);
assert(blk.indexOf('@keyframes panelIn {') >= 0, 'panelIn keyframe is inside the guard');
assert(blk.indexOf('@keyframes panelInCentered {') >= 0, 'the centered variant is inside the guard');
eq(html.split('@keyframes panelIn {').length - 1, 1, 'panelIn is declared exactly once (inside the guard, nowhere else)');
assert(/from \{ opacity:0; transform:translateY\(8px\) scale\(\.98\); \}/.test(blk), 'panel-in: opacity 0->1, 8px rise, .98 scale settle');
assert(blk.indexOf('translate(-50%,-50%) translateY(8px) scale(.98)') >= 0, 'the #shop variant composes its centring transform (never clobbers it)');
{
  const sel = /([^\n{]*)\{ animation: panelIn 180ms var\(--ease-out\); \}/.exec(blk);
  assert(!!sel, 'the shared 180ms var(--ease-out) entry rule exists inside the guard');
  for(const want of ['.modalCard', '#pauseMenu .pauseCard', '#killFeed .kfRow'])
    assert(sel[1].indexOf(want) >= 0, 'entry animation covers ' + want);
}
assert(blk.indexOf('#shop { animation: panelInCentered 180ms var(--ease-out); }') >= 0, '#shop animates through its centered keyframe');
// Kill-feed wiring: a row is CREATED with the very class the animated selector matches,
// so every inserted row plays the entry animation with no further JS.
assert(src.indexOf("const row=document.createElement('div'); row.className='kfRow';") >= 0, 'kfRow rows are created carrying the animated class');

done('build 1365: the health bar carries hp in its colour, and the interface moves');
