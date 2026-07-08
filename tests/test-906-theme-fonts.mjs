// (build 906) "It's not saving font choices for the main theme and system." It WAS saving — it
// wasn't re-APPLYING. applyUiTheme() runs at boot before `let _extraFontsReq` initialized; with a
// non-default saved font it called the hoisted _ensureHudFonts(), hit the TDZ, and the try/catch
// swallowed the ReferenceError — so none of the CSS vars (--ui-font/--display-font/--accent) were
// set on load. Default-font themes skipped that call, which is why exactly "font choices" looked
// unsaved. Fixed by declaring the flag above the boot call AND moving the lazy font pull into its
// own guard after the vars, so no loader hiccup can ever block the theme apply again.
import { gameSource, extractFunction, evalDecl, assert, eq, done } from './harness.mjs';

const src = gameSource();

// boot order: the flag initializes before the boot-time apply
const declAt = src.indexOf('let _extraFontsReq=false;');
const bootAt = src.indexOf('applyUiTheme();   // apply saved look immediately on load');
assert(declAt > 0 && bootAt > 0 && declAt < bootAt,
  '_extraFontsReq is initialized before the boot applyUiTheme() call (no TDZ on the hoisted _ensureHudFonts)');

// inside applyUiTheme, the vars are set BEFORE the font-pack pull, in separate guards
const fn = extractFunction('applyUiTheme', src);
assert(fn.indexOf("--display-font") >= 0 && fn.indexOf('_ensureHudFonts') >= 0 &&
       fn.indexOf("--display-font") < fn.indexOf('_ensureHudFonts'),
  'the CSS vars are applied before the lazy font pull');
assert(/\}catch\(e\)\{\}\s*\n\s*try\{ if\(typeof _ensureHudFonts/.test(fn),
  'the font pull sits in its OWN try/catch — a loader failure cannot block the theme');

// executable: a THROWING font loader must not stop the saved theme from applying
const run = (theme, loader)=>{
  const set={}; let acc=null;
  const f=evalDecl(fn, 'applyUiTheme', {
    uiTheme: theme,
    UI_THEME_DEFAULT: { accent:'#38f5b5', uiFont:"'Chakra Petch', monospace", displayFont:"'Major Mono Display', monospace" },
    UI_ACCENT:'', UI_ACCENT_RGB:'',
    _hexToRgbTriplet:(h)=>'0,0,0',
    _ensureHudFonts: loader,
    document:{ documentElement:{ style:{ setProperty:(k,v)=>{ set[k]=v; } } } },
  });
  f();
  return set;
};
const CUSTOM={ accent:'#ff4477', uiFont:"'Orbitron', sans-serif", displayFont:"'Orbitron', sans-serif" };
{
  const set=run(CUSTOM, ()=>{ throw new Error('font pack down'); });
  eq(set['--ui-font'], "'Orbitron', sans-serif", 'saved UI font applies even when the font pack pull throws');
  eq(set['--display-font'], "'Orbitron', sans-serif", 'saved display font applies too');
  eq(set['--accent'], '#ff4477', '...and the accent');
}
{
  let pulls=0;
  run(CUSTOM, ()=>{ pulls++; });
  eq(pulls, 1, 'a customised font still pulls the lazy font pack (build 817 behavior kept)');
}
{
  let pulls=0;
  run({ accent:'#38f5b5', uiFont:"'Chakra Petch', monospace", displayFont:"'Major Mono Display', monospace" }, ()=>{ pulls++; });
  eq(pulls, 0, 'the all-default theme never pays for the extra font download');
}

done('build 906: saved theme fonts (and accent) survive a reload');
