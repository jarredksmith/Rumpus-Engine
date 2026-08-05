// build 1400: the level's game settings, applied in ONE place — and five of them applied at all.
//
// Found by SWEEPING what `serializeLevel` writes against what the loaders read, after build 1398 turned out
// to be a serializer/loader mismatch. Five top-level settings were written with every level and never read
// back by either runtime loader:
//
//   pvp, pvpTarget   build 1265 — mine. The whole feature is "a level says which mode it is for", so it
//                    worked until you saved.
//   fallDamage       authored, serialized, never restored
//   crushDamage      likewise
//   crosshair        likewise
//
// They are not merely lost, they LEAK: nothing reset them, so opening a second level kept the first one's
// fall damage and crosshair. That is build 1325's finding for keyNames/pickupModels, and it is why the probe
// needed a control — restoring the SAME level and reading the values back proves nothing when the loader
// never cleared them. Stripping a field and watching it SURVIVE is the measurement that works.
//
// The block was TWO byte-identical 2,862-character copies, in `loadLevelFromNet` and `restoreLevel` — build
// 1280's defect, which is precisely the mechanism that lets a fix land on one path only.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------------------- one applier, two callers ----
{
  eq((src.match(/if\(level\.game\) _applyGameCfg\(level\.game\);/g) || []).length, 2,
    'both loaders call the shared applier');
  eq((src.match(/if\(level\.game\)\{ gameCfg\.mode/g) || []).length, 0,
    'and NEITHER carries its own copy of the block any more — 2,862 identical characters in two places is ' +
    'how a field ends up restored on one path and not the other');
  eq((src.match(/function _applyGameCfg\(/g) || []).length, 1, 'the applier is written once');

  const fn = extractFunction('_applyGameCfg');
  assert(/^function _applyGameCfg\(g\)\{\s*\n\s*if\(!g\) return;/.test(fn),
    'it refuses a level with no game block rather than throwing — the two callers already guard, so this is ' +
    'the guard a third caller will not have to remember');
  assert(!/level\./.test(fn),
    'and it reads only its argument: a stray `level.` inside would tie it to a variable its callers happen ' +
    'to have, which is exactly the kind of coupling that makes a block un-extractable next time');
}

// ------------------------------------------------- the five that were never read ----
{
  const fn = extractFunction('_applyGameCfg');
  for (const [k, needle] of [
    ['pvp',         /gameCfg\.pvp = /],
    ['pvpTarget',   /gameCfg\.pvpTarget = /],
    ['fallDamage',  /gameCfg\.fallDamage  = _dmgRuleFrom\(g\.fallDamage,  24, 1\.4\)/],
    ['crushDamage', /gameCfg\.crushDamage = _dmgRuleFrom\(g\.crushDamage,  7, 2\.2\)/],
    ['crosshair',   /gameCfg\.crosshair   = _crosshairFrom\(g\.crosshair\)/],
  ]) assert(needle.test(fn), k + ' is restored');

  // ALWAYS ASSIGNED, never "if present" — that is the half that stops the leak, and it is the half a
  // careless fix would miss while still making the round trip pass.
  for (const k of ['pvp', 'pvpTarget', 'fallDamage', 'crushDamage', 'crosshair'])
    assert(!new RegExp('if\\(g\\.' + k + '[^)]*\\)\\s*gameCfg\\.' + k).test(fn),
      k + ' is assigned unconditionally, so a level that does not mention it RESETS it rather than ' +
      'inheriting the last level\'s value');
}

// ----------------------------------------------- the two rules share one reader ----
{
  const fn = extractFunction('_dmgRuleFrom');
  const rule = new Function(fn + '\nreturn _dmgRuleFrom;')();
  const fall = rule(undefined, 24, 1.4);
  eq(fall.on, false, 'an absent rule is off...');
  eq(fall.player, true, '...applies to the player...'); eq(fall.ai, true, '...and to the AI...');
  eq(fall.minSpeed, 24, '...at the caller\'s own defaults'); eq(fall.perUnit, 1.4);
  eq(rule({ on: 1, ai: 0, minSpeed: 11, perUnit: 3.3 }, 24, 1.4).ai, false, 'an explicit false is honoured...');
  eq(rule({ on: 1, ai: 0, minSpeed: 11 }, 24, 1.4).perUnit, 1.4, '...and an omitted field still defaults');
  // level data is untrusted input (build 1325)
  eq(rule({ minSpeed: -50, perUnit: 1e9 }, 24, 1.4).minSpeed, 0, 'a negative speed clamps to 0');
  eq(rule({ minSpeed: -50, perUnit: 1e9 }, 24, 1.4).perUnit, 999, '...and an absurd rate to the cap');
  eq(rule({ minSpeed: 'x' }, 24, 1.4).minSpeed, 0, 'and a non-number is 0, never NaN (build 1169)');
  eq((src.match(/function _dmgRuleFrom\(/g) || []).length, 1,
    'fall damage and crush damage share ONE reader — two copies of a five-field clamp is how they stop ' +
    'agreeing about the same shape');
}

// ------------------------------------------------------- the crosshair, executed ----
{
  const fn = extractFunction('_crosshairFrom');
  const STYLES = JSON.parse(src.match(/const CROSSHAIR_STYLES = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  eq(STYLES.join(','), 'classic,cross,dot,circle,tee,none',
    'the style vocabulary is NAMED — before this build it was a comment beside the boot default and nowhere ' +
    'else, so nothing could validate one arriving from a level file');
  const xh = new Function('CROSSHAIR_STYLES', fn + '\nreturn _crosshairFrom;')(STYLES);

  const d = xh(undefined);
  eq(d.style, 'classic'); eq(d.size, 24); eq(d.thickness, 2); eq(d.gap, 3); eq(d.dot, true); eq(d.color, 'accent');
  eq(xh({ style: 'dot', size: 31, dot: false }).style, 'dot', 'an authored style is kept');
  eq(xh({ style: 'dot', size: 31, dot: false }).dot, false, '...including an explicit false');
  eq(xh({ style: '<script>' }).style, 'classic', 'an unknown style falls back rather than reaching the DOM');
  eq(xh({ size: 1e9 }).size, 80, 'sizes clamp'); eq(xh({ thickness: -4 }).thickness, 1);
  eq(xh({ gap: 1e9 }).gap, 40);
  // the colour reaches CSS, so it is validated rather than escaped (builds 1260/1325)
  eq(xh({ color: 'red;background:url(//x)' }).color, 'redbackgroundurl(x)',
    'a colour cannot carry a semicolon, a colon or a slash, so it cannot close the property it sits in ' +
    'or smuggle a scheme — an invalid colour is simply ignored by the browser');
  eq(xh({ color: 'rgba(255, 0, 0, 0.5)' }).color, 'rgba(255, 0, 0, 0.5)',
    '...while a legitimate rgba() survives intact, which is why parens, commas and dots are permitted');
  eq(xh({ color: ';;;' }).color, 'accent', 'and a colour that sanitizes to nothing falls back');
}

// Probed live through the REAL serializeLevel -> restoreLevel, with the control that makes it mean anything:
//
//   CARRIED    every one of the five round-trips exactly
//   STRIPPED   fallOn false, fallMin 24, crushOn false, xhStyle classic, xhSize 24, pvp '', target 0
//              — they RESET rather than surviving, which is the leak closing. `objective` is the positive
//              control in that row: a field the loader demonstrably always read, and it resets too.
//   HOSTILE    pvp 'nuke' -> '', target 1e9 -> 999, style '<script>' -> classic, size 1e9 -> 80,
//              thickness -4 -> 1, gap 1e9 -> 40, fallMin -50 -> 0, perUnit 1e9 -> 999, player -> true
//
// My FIRST probe restored the same level and read the values back — they all came back, and that proved
// nothing, because the loader never cleared them. A round trip that cannot fail is not a round trip.
//
// Twenty-three harnesses moved. Every one of them counted `2` over a `level.game.X` pattern — they were
// asserting the DUPLICATION, which is build 1280's lesson verbatim: a test that counts copies of a thing is
// a test of the copying. They count 1 now, and what they always meant — this field is restored by the level
// loaders — is stronger, because both loaders provably route through the one function above.
done('build 1400: five level settings that were saved and never loaded, and one loader instead of two');
