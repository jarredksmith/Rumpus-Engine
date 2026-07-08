// (build 909) CONTROLLER RESCUE — the audit found three pad SOFT-LOCKS: the upgrade picker
// (mouse-only; pad kept firing reload/interact behind the frozen overlay), the supply cache
// (pollGamepad early-returned before reading Y, trapping the pad inside), and the campaign
// transition card (keyboard/click only). Plus: no pause binding, no disconnect handling, no pad
// settings at all. All verified live with a synthetic gamepad (Y closes the cache, D-pad+A buys,
// RB+A takes an upgrade, Digit1 keyboard-picks, Start pauses/resumes, D-pad-up opens the bag).
import { gameSource, html, extractFunction, evalDecl, assert, eq, done } from './harness.mjs';

const src = gameSource();
const pg = extractFunction('pollGamepad', src);

// overlay handling sits AHEAD of the old shop/editor idle
const iInter = pg.indexOf('_interActive'), iUp = pg.indexOf('choosingUpgrade'), iShop = pg.indexOf('if(shopOpen)'), iEd = pg.indexOf('if(editorOpen)');
assert(iInter>0 && iUp>iInter && iShop>iUp && iEd>iShop, 'pad input order: campaign card -> upgrade picker -> Start -> shop -> editor idle');
assert(/if\(edge9\(1\)\|\|edge9\(3\)\) closeShop\(\);/.test(pg), 'B/Y close the supply cache (Y used to be swallowed — a pad was trapped)');
assert(/if\(edge9\(0\)\) buyFromShop\(_shopSelIdx\);/.test(pg), 'A buys the focused cache item');
assert(/if\(edge9\(0\)\) _upgradePickFocused\(\);/.test(pg), 'A takes the focused upgrade');
assert(/getElementById\('interGo'\); if\(g\) g\.click\(\);/.test(pg), 'any button continues the campaign card');
assert(/if\(edge9\(9\)\)/.test(pg) && /openPause/.test(pg) && /toggleMatchMenu/.test(pg), 'Start opens pause (solo) / match menu (MP)');
assert(/if\(paused\)\{ if\(edge9\(9\)[\s\S]{0,60}resumeGame/.test(pg), 'Start resumes from pause; gameplay reads are suppressed while paused');

// on-foot D-pad quartet
assert(/edge\(12\)[\s\S]{0,60}toggleInventory/.test(pg) && /edge\(13\)[\s\S]{0,80}openBigMap/.test(pg) &&
       /edge\(14\)[\s\S]{0,60}meleeAttack/.test(pg) && /edge\(15\)[\s\S]{0,60}toggleFlashlight/.test(pg),
  'D-pad: inventory / map / melee / flashlight (all were keyboard-only)');

// prefs: persisted, applied to deadzone + look (with ADS scale + invert)
assert(/localStorage\.getItem\('breach_pad'\)/.test(src) && /function savePadPrefs/.test(src), 'controller prefs persist under breach_pad');
assert(/padPrefs\.dead>0\.02/.test(extractFunction('padDead', src)), 'deadzone honors the pref');
assert(/padPrefs\.invertY\?-1:1/.test(pg) && /padPrefs\.ads/.test(pg), 'look applies sens, ADS scale and invert-Y');
assert(/id="padSensRng"/.test(html) && /id="padInvCb"/.test(html), 'the pause menu carries the controller panel (markup)');

// disconnect auto-pauses a solo run
assert(/gamepaddisconnected[\s\S]{0,400}openPause\(\)/.test(src), 'losing the pad pauses a solo run');

// keyboard: digits take an upgrade (the picker trapped keyboard-only players too)
assert(/choosingUpgrade && !e\.repeat\)\{ const _um=e\.code\.match\(\/\^Digit/.test(src), '1..9 pick an upgrade from the keyboard');

// executable: focus cycling wraps and highlights
const cards=[0,1,2].map(()=>({ style:{}, click(){ this.clicked=true; } }));
const deps={ document:{ getElementById:()=>({ querySelectorAll:()=>cards }) }, Array, _upSel:-1 };
const fset=evalDecl(extractFunction('_upgradeFocusSet', src)+'\n'+extractFunction('_upgradeCards', src), '_upgradeFocusSet', deps);
fset(1); // focus card 1
assert(cards[1].style.borderColor==='var(--accent)' && cards[0].style.borderColor!=='var(--accent)', 'focus highlights exactly one card');
fset(3); // wraps to 0
assert(cards[0].style.borderColor==='var(--accent)', 'focus wraps around the row');

done('build 909: a controller can pause, shop, take upgrades, continue the campaign, and tune itself');
