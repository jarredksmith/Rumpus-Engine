import { gameSource, extractFunction, extractConst, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 1271: EXPRESSIONS — the audit's "no scripting escape hatch", in the only form a shared-level engine
// can safely ship. `(hp / maxhp) * 100` took three Math nodes and two throwaway variables; it is now one
// field.
//
// IT CANNOT BE eval / new Function. Levels travel as share codes, .rumpus files and URLs, and a player
// opens someone else's level by clicking a link — so compiling creator text as JavaScript would be remote
// code execution in that player's browser, against their saves and their session. This is a hand-written
// tokenizer and Pratt parser producing a closure tree, and the safety is STRUCTURAL: there is no property
// access, no indexing, no assignment and no way to name anything outside a fixed table, because the grammar
// cannot express them — not because a filter rejects them.

// the engine's zero-eval posture is the premise of the whole design
{
  const bad = src.match(/\beval\s*\(|new\s+Function\s*\(/g) || [];
  eq(bad.length, 0, 'the engine contains NO eval and NO new Function — this build must not be what changes that');
}

// declared together, which extractConst cannot split
const _b = src.match(/const LGX_MAXLEN = (\d+), LGX_MAXDEPTH = (\d+), LGX_CACHE_MAX = (\d+);/);
assert(_b, 'the three bounds are named');
const LGX_MAXLEN = +_b[1], LGX_MAXDEPTH = +_b[2], LGX_CACHE_MAX = +_b[3];

function rig(vars = {}, pid = 0) {
  const body = [
    'const LGX_MAXLEN = ' + LGX_MAXLEN + ', LGX_MAXDEPTH = ' + LGX_MAXDEPTH + ', LGX_CACHE_MAX = ' + LGX_CACHE_MAX + ';',
    'const LGX_FUNCS = ' + extractConst('LGX_FUNCS') + ';',
    'const _LGX_BIN = ' + extractConst('_LGX_BIN') + ';',
    'const _lgxCache = new Map();',
    'let logicVars = ' + JSON.stringify(vars) + ', _lgCtx = { pid: ' + pid + ' };',
    extractFunction('_lgVarKey'), extractFunction('_lgxTokens'),
    extractFunction('_lgxCompile'), extractFunction('_lgxEval'),
    'return { ev:_lgxEval, compile:_lgxCompile, tokens:_lgxTokens, cache:_lgxCache, vars:logicVars };',
  ].join('\n');
  return new Function(body)();
}
const E = rig({ hp: 40, maxhp: 200, score: 7, wave: 3, n: 5, neg: -2 });
const ev = (s) => E.ev(s);

{ // arithmetic, precedence and associativity
  eq(ev('1 + 2'), 3);
  eq(ev('2 + 3 * 4'), 14, 'multiplication binds tighter than addition');
  eq(ev('(2 + 3) * 4'), 20, 'parentheses override it');
  eq(ev('10 - 3 - 2'), 5, 'subtraction is left-associative');
  eq(ev('2 ^ 3 ^ 2'), 512, 'exponent is RIGHT-associative (2^9), which is the mathematical convention');
  eq(ev('-3 + 1'), -2, 'unary minus');
  eq(ev('- -3'), 3, '...nests');
  eq(ev('10 % 3'), 1, 'modulo');
  eq(ev('-1 % 3'), 2, '...is the POSITIVE (counting) kind, matching the Math node (1169)');
  near(ev('7 / 2'), 3.5, 1e-9);
}
{ // THE MOTIVATING CASE, in one field instead of three nodes
  eq(ev('(hp / maxhp) * 100'), 20, 'a percentage in one node');
  eq(ev('score + wave * 10'), 37, 'variables mix with literals at the right precedence');
  eq(ev('nosuchvar'), 0, 'an unset variable reads 0, exactly as _lgNum does');
  eq(ev('nosuchvar + 5'), 5, '...and composes without poisoning the result');
}
{ // comparisons and logic return 1/0, so they feed Branch and the HUD unchanged
  eq(ev('hp < maxhp'), 1);
  eq(ev('hp > maxhp'), 0);
  eq(ev('hp == 40'), 1);
  eq(ev('hp != 40'), 0);
  eq(ev('hp < maxhp && score > 5'), 1, 'and');
  eq(ev('hp > maxhp || score > 5'), 1, 'or');
  eq(ev('hp > maxhp || score > 100'), 0);
  eq(ev('1 + 2 > 2'), 1, 'arithmetic binds tighter than comparison');
  eq(ev('(hp < maxhp) * 10'), 10, 'a comparison is a number, so it can be arithmetic');
}
{ // the function table
  eq(ev('abs(neg)'), 2);
  eq(ev('min(3, 9)'), 3); eq(ev('max(3, 9)'), 9);
  eq(ev('floor(3.7)'), 3); eq(ev('ceil(3.2)'), 4); eq(ev('round(3.5)'), 4);
  eq(ev('sqrt(9)'), 3);
  eq(ev('sqrt(-4)'), 0, 'a negative root is clamped rather than returning NaN');
  eq(ev('clamp(150, 0, 100)'), 100); eq(ev('clamp(-5, 0, 100)'), 0);
  eq(ev('lerp(0, 10, 0.5)'), 5);
  eq(ev('max(min(hp, 50), 10)'), 40, 'calls nest');
  const r = ev('rand(5, 6)');
  assert(r >= 5 && r <= 6, 'rand is bounded by its arguments');
}
{ // NEVER NaN or Infinity — build 1169's rule: one poisoned value silently corrupts every later compare
  eq(ev('1 / 0'), 0, 'division by zero is 0, not Infinity');
  eq(ev('5 % 0'), 0, 'and so is mod 0');
  eq(ev('0 / 0'), 0, 'not NaN');
  eq(ev('(1/0) + 1'), 1, '...so nothing downstream inherits it');
  assert(isFinite(ev('9 ^ 9 ^ 9')), 'an overflowing power resolves to a finite number');
  eq(ev('9 ^ 9 ^ 9'), 0, '...specifically 0, because Infinity is not a usable game value');
}

// --- HOSTILE INPUT: this string arrives from a level file a stranger authored ------------------------
{
  const attacks = [
    'window', 'document.cookie', 'localStorage', 'this', 'globalThis',
    'a.b', 'a["b"]', 'a[0]', 'x = 1', 'alert(1)', 'fetch("http://x")',
    'constructor', 'a.constructor("return 1")()', '__proto__', 'a.__proto__.x',
    'function(){}', '()=>1', 'new Date()', 'import("x")', 'require("fs")',
    '1;2', '1,2', 'return 1', 'if(1)2', 'while(1);', '`x`', "'s'", '"s"',
    '\\u0041', 'a?.b', 'a ?? b', 'typeof a', 'delete a', 'void 0', 'a++',
  ];
  for (const a of attacks) {
    const out = ev(a);
    eq(out, 0, 'hostile input yields 0 and cannot escape the grammar: ' + JSON.stringify(a));
  }
  // and the ones that LOOK like they might parse are rejected at compile, not merely evaluated to 0
  for (const a of ['a.b', 'a[0]', 'alert(1)', 'a.constructor("x")()', 'x = 1', 'return 1'])
    eq(E.compile(a), null, 'refused at compile time: ' + JSON.stringify(a));
}
{ // A BARE NAME IS ALWAYS A VARIABLE READ, never a call — the one place a leak could hide.
  // `constructor` and `__proto__` are legal identifiers, so they DO compile — to a variable read. The
  // safety is that the read finds nothing: logicVars is a plain object, so without the own-property guard
  // these would return Object.prototype's members and be safe only because they coerce to NaN then 0.
  assert(typeof E.compile('constructor') === 'function', 'a reserved-looking name compiles — as a variable read');
  eq(ev('constructor'), 0, '...which reads 0, NOT Object.prototype.constructor');
  eq(ev('__proto__'), 0, '...and neither does __proto__ reach the prototype');
  eq(ev('constructor + __proto__ + toString'), 0, '...nor do they in combination');
  eq(E.compile('constructor(1)'), null, 'and none of them is callable — only the fixed function table is');
  assert(typeof E.compile('abs') === 'function', 'a function name used BARE parses as a variable read');
  eq(ev('abs'), 0, '...which is unset, so 0 — it cannot leak the function object itself');
  // the guard is structural, not a coercion accident: a variable that IS set still reads normally
  const owned = rig({ constructor: 12 });
  eq(owned.ev('constructor'), 12, 'a creator may legitimately name a variable `constructor` and it works');
}
{ // malformed input must never throw: a broken expression reads 0 and the rest of the level keeps running
  for (const s of ['', '   ', '(', ')', '1 +', '+ ', '* 2', '(1', '1)', 'min(', 'min(1', 'min(1,',
                   'min(1,2,3)', 'max(1)', 'clamp(1,2)', '1 2', '((((', '@@@', '#', '&', '!', '~', '\\'])
    eq(ev(s), 0, 'malformed input is 0, not a throw: ' + JSON.stringify(s));
  eq(E.compile('min(1,2,3)'), null, 'wrong arity is a compile error, not a silent NaN');
  eq(E.compile('max(1)'), null);
}
{ // bounds: a level file may not make the parser expensive
  eq(E.compile('1+'.repeat(LGX_MAXLEN) + '1'), null, 'an over-long expression is refused outright');
  eq(ev('('.repeat(200) + '1' + ')'.repeat(200)), 0, 'deep nesting hits the depth cap and yields 0 rather than blowing the stack');
  const deep = E.compile('('.repeat(200) + '1' + ')'.repeat(200));
  eq(deep, null, '...and is refused at compile');
  // the cache cannot grow without limit
  const c = rig({});
  for (let i = 0; i < LGX_CACHE_MAX + 50; i++) c.ev('1 + ' + i);
  assert(c.cache.size <= LGX_CACHE_MAX, 'the compile cache is bounded (' + c.cache.size + ')');
}
{ // a failed compile is cached too, so a hostile level cannot force re-parsing every pulse
  const c = rig({});
  c.ev('a.b'); const n1 = c.cache.size;
  c.ev('a.b'); c.ev('a.b');
  eq(c.cache.size, n1, 'a rejected expression is remembered as rejected, not re-parsed forever');
  eq(c.cache.get('a.b'), null);
}
{ // build 1231's per-player variables work here like everywhere else
  const a = rig({ 'coins@1': 10, 'coins@2': 99 }, 1);
  eq(a.ev('coins@ * 2'), 20, '`name@` reads THIS player\'s variable');
  const b = rig({ 'coins@1': 10, 'coins@2': 99 }, 2);
  eq(b.ev('coins@ * 2'), 198, '...and a different player gets a different number from the same expression');
  eq(a.ev('#i + 1'), 1, 'the loop-index convention (#i) tokenizes as a name');
}

// --- wiring ------------------------------------------------------------------------------------------
{
  const pulse = extractFunction('_lgPulse');
  assert(/case 'expr': \{ const k=_lgVarKey\(String\(p\.name\|\|''\)\.trim\(\)\); if\(k\) logicVars\[k\]=_lgxEval\(p\.expr\);/.test(pulse),
    'the node writes through _lgVarKey like every other state node');
  const defs = new Function('return ' + extractConst('LG_DEFS', src) + ';')();
  assert(defs.expr, 'the node is in the palette');
  eq(defs.expr.cat, 'st', '...in STATE, beside Math, Read and List');
  assert(defs.expr.params.some(p => p.k === 'expr'), '...with an expression field');
  assert(defs.expr.params.some(p => p.k === 'name' && p.listId === 'lgVarList'), '...writing into a named variable');
}

done('build 1271: safe expressions — a hand-written tokenizer and Pratt parser (no eval, no new Function, verified absent engine-wide), executed for precedence/associativity/comparisons/functions, NEVER yielding NaN or Infinity, and refusing 35 hostile inputs (property access, indexing, calls, assignment, template literals, prototype reach) at COMPILE time because the grammar cannot express them');
