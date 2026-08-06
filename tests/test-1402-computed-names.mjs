// build 1402 — the logic graph can act on a name it COMPUTED.
//
// Found by asking what the gauntlet's shooting gallery actually needs and checking rather than assuming. A
// gallery is N plates popped one at a time in a random order. Every piece was already there — `showprop` /
// `hideprop` / `resetprop` by tag (1170/1391), a random integer from Set variable, the `damaged` event to
// score with (1397) — and the JOIN between them was not: every field that names a thing in the world took a
// LITERAL, so "show plate<n>" was unsayable. Eight plates meant eight hand-wired branches, and a ninth meant
// editing the graph.
//
// `{score}` interpolation had existed since the toast node and reached NOTHING else.
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---------------------------------------------------------------- the interpolator, executed ----
const NAME = extractFunction('_lgName');
const MAX = +/const LG_NAME_MAX = (\d+);/.exec(src)[1];

function mk(vars, pid) {
  return new Function('logicVars', '_lgCtx', 'LG_NAME_MAX',
    extractFunction('_lgVarKey') + '\n' + NAME + '\nreturn _lgName;')(vars, { pid: pid || 0 }, MAX);
}

{
  const n = mk({ n: 3, score: 42.5, big: 1234567 });
  eq(n('plate{n}'), 'plate3', 'a counter names a prop — the whole point of the build');
  eq(n('plate3'), 'plate3', 'a literal is untouched');
  eq(n(''), '', 'and so is nothing');
  eq(n(null), '', 'a missing field is an empty name, never "null"');
  eq(n('  plate{n}  '), 'plate3', 'trimmed, exactly as the old inline String().trim() was');
  eq(n('{n}'), '3', 'a name can be nothing but the variable');
  eq(n('lane{n}_target{n}'), 'lane3_target3', 'and it can appear more than once');
  eq(n('plate{missing}'), 'plate0',
    'an unset variable reads 0 — the same rule the toast has always had, so the resulting name simply ' +
    'resolves to nothing and gets REPORTED by build 1214 rather than throwing');

  // rounding: for the counters this exists to serve, `plate3` and not `plate3.00`
  eq(n('plate{score}'), 'plate42.5', 'a fraction survives to 2 dp...');
  eq(mk({ x: 3.0 })('p{x}'), 'p3', '...and a whole number has no decimal tail');
  eq(mk({ x: 1 / 3 })('p{x}'), 'p0.33', '...with the toast\'s own 2 dp rounding');

  // IDEMPOTENT — which is what lets it sit at a dispatch site AND inside the resolver below it
  eq(n(n('plate{n}')), 'plate3', 'resolving a resolved name changes nothing');

  // build 1231's per-player scoping rides along, because it is _lgVarKey that does the lookup
  eq(mk({ 'lane@2': 7 }, 2)('plate{lane@}'), 'plate7', 'a per-player variable names a per-player prop');
  eq(mk({ 'lane@2': 7 }, 3)('plate{lane@}'), 'plate0', '...and another player gets their own, not this one');

  // bounded: a variable is a number, so this only ever catches a pathological repeat
  const many = 'x{n}'.repeat(40);
  assert(mk({ n: 1 })(many).length <= MAX, 'the result is bounded at LG_NAME_MAX');
  eq(MAX, 64, 'which is 64 — long enough for any real tag, short enough that nothing can balloon');

  // things that are NOT a variable reference stay literal
  eq(n('a{b c}d'), 'a{b c}d', 'a brace pair with a space is not a name and is left alone');
  eq(n('{'), '{', 'an unclosed brace is left alone');
  eq(n('50%{n}'), '50%3', 'and the rest of the string is untouched');
}

// ------------------------------------------------- one implementation, not two ----
{
  eq((src.match(/function _lgName\(/g) || []).length, 1, 'the interpolator is written once');
  // The toast node had its own inline copy. Two implementations of one syntax is how the two drift, and a
  // creator who learns `{score}` in a toast must get the same answer in a tag.
  eq(src.match(/logicVars\[_lgVarKey\(k\)\][^\n]*100\)\s*\/\s*100/g).length, 1,
    'and there is exactly ONE place that turns a logic variable into text');
  const toast = src.slice(src.indexOf("case 'toast':"), src.indexOf("case 'win':"));
  assert(/_lgName\(String\(p\.text\|\|''\)\.slice\(0,120\)\)/.test(toast),
    'the toast routes through it, keeping its own 120-char cap');
  // the HUD widget's interp is deliberately SEPARATE: build 1287 resolves through _hwVarKey, which asks a
  // different question ("what is MY number", outside any event) and must not adopt the event's pid.
  assert(/_hwVarKey\(k\)/.test(src), 'the HUD widget keeps its own resolver, which answers a different question');
}

// ------------------------------------------------- every place field inherits it ----
{
  const pa = extractFunction('_lgPlaceAt');
  assert(/const raw=_lgName\(tag\)/.test(pa),
    'the place resolver interpolates at its own first line, so the goto arrival tag (1394), the prop-position ' +
    'stats (1352) and every spawn/teleport verb inherit it with no list of call sites to keep in step');
  assert(!/String\(tag==null\?''\:tag\)\.trim\(\)/.test(pa), 'and the literal-only form is gone');
  // the reserved words still win, and they contain no braces so the interpolation cannot touch them
  for (const w of ['#here', 'me', 'start']) assert(pa.indexOf(w) > 0, w + ' is still handled');
}

// ------------------------------------------------- the do node's four names ----
{
  const pulse = extractFunction('_lgPulse');
  const doCase = pulse.slice(pulse.indexOf("case 'do':"), pulse.indexOf("case 'toast':"));
  assert(/_tgt=_lgName\(p\.target\)/.test(doCase), 'the tag interpolates');
  assert(doCase.indexOf('_tgt=_lgName(p.target)') < doCase.indexOf('_lgTagExists(_tgt)'),
    '...BEFORE the tag check, so a computed tag that resolves to nothing is reported by the name it ' +
    'actually resolved to rather than by the template');
  for (const f of ['prefab', 'text', 'item', 'at'])
    /* build 1407: the four moved from hand-written call sites into _LG_NAME_FIELDS, which the derived
       forwarder consults — one list instead of one call per field, and the reason a fifth name field
       cannot be added without interpolating. */
    assert(new RegExp("'" + f + "'").test(extractConst('_LG_NAME_FIELDS')) &&
           /_LG_NAME_FIELDS\.has\(k\) \? _lgName\(v\)/.test(extractFunction('_lgDoArgs')),
      f + ' interpolates');
  // and the enums / urls deliberately do NOT — interpolating an enum can only ever produce an invalid one
  for (const f of ['clip', 'sound', 'etype', 'pk', 'who', 'stat', 'ewho', 'cmd'])
    assert(!new RegExp(f + ':_lgName').test(doCase), f + ' is an enum or a url and stays literal');
}

// Probed live (tools/probe/tag-interp.mjs) against the real graph, with a literal tag as the control:
//
//   BEFORE   literal `plate2` hid plate2; `plate{n}` with n=2 hid NOTHING;
//            _lgPlaceAt('mark7') -> {60,60} while _lgPlaceAt('mark{k}') -> null
//   AFTER    both hide plate2; the place field resolves to the same mark
//   GALLERY  three nodes — event -> Set variable (random 1..3) -> `showprop plate{n}` — drew 24 times and
//            popped plate3 x10, plate1 x7, plate2 x7. THREE nodes instead of one branch per plate.
//   REPORT   a computed tag that resolves to nothing is named by what it resolved TO:
//            'A "hideprop" action targets the tag "plate99", but no placed prop has that tag.'
//
// Two instrument faults, both mine and both familiar. The probe hand-set `.visible` to reset its plates
// between rounds — but show/hide track their own state (build 1170 also drops the collider and the body), so
// the next hide early-returned and the effect read as the feature not working. And a comment inside a
// template literal carried backticks, for the EIGHTH time this session (1328/1342/1357 record it).
done('build 1402: the graph can name a thing it computed — plate{n}, mark{n}, and the gallery that needs it');
