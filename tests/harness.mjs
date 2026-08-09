// Shared harness for BREACH regression tests.
// The game lives inside `window.GAME_START = function(){ ... }` and leans on window.THREE,
// the DOM, scene/camera, etc. We can't import its functions directly, so we pull individual
// self-contained declarations out of the source by brace-matching and eval them against the
// REAL three.js (r149) / Rapier, mocking only what a given function actually touches.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const HTML_PATH = path.resolve(__dirname, '..', 'breach.html');
export const html = fs.readFileSync(HTML_PATH, 'utf8');

// --- split out the <script> blocks (attrs + body) ---
export function scriptBlocks() {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    out.push({ attrs: m[1] || '', body: m[2], module: /type\s*=\s*["']module["']/.test(m[1] || '') });
  }
  return out;
}

// The big game block is the last (and largest) plain script.
export function gameSource() {
  const blocks = scriptBlocks().filter(b => !b.module);
  return blocks.sort((a, b) => b.body.length - a.body.length)[0].body;
}

// Find the matching close brace/paren/bracket for an opener at `open` in `s`.
function matchDelim(s, open) {
  const pairs = { '{': '}', '(': ')', '[': ']' };
  const close = pairs[s[open]];
  let depth = 0, inStr = null, inTpl = false, inLine = false, inBlock = false;
  for (let i = open; i < s.length; i++) {
    const c = s[i], n = s[i + 1], p = s[i - 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
    if (inTpl) { if (c === '`' && p !== '\\') inTpl = false; continue; }
    if (c === '/' && n === '/') { inLine = true; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '`') { inTpl = true; continue; }
    if (c === s[open]) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
  }
  throw new Error('no matching ' + close + ' from index ' + open);
}

// Extract a top-level `function NAME(...){...}` including signature.
export function extractFunction(name, src = gameSource()) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(', 'g');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  const paren = src.indexOf('(', m.index);
  const parenEnd = matchDelim(src, paren);
  const brace = src.indexOf('{', parenEnd);
  const braceEnd = matchDelim(src, brace);
  return src.slice(m.index, braceEnd + 1);
}

// Extract the RHS of `const NAME = <literal>;` (object/array literal).
export function extractConst(name, src = gameSource()) {
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*', 'g');
  const m = re.exec(src);
  if (!m) throw new Error('const not found: ' + name);
  let i = m.index + m[0].length;
  while (/\s/.test(src[i])) i++;
  if (src[i] === '{' || src[i] === '[') {
    const end = matchDelim(src, i);
    return src.slice(i, end + 1);
  }
  // primitive: read to the terminating semicolon
  const semi = src.indexOf(';', i);
  return src.slice(i, semi);
}

// Extract the source span between two marker substrings (markers excluded). Lets tests run inline
// code (e.g. a loop body inside the main tick) that isn't wrapped in its own function.
export function extractBetween(startMarker, endMarker, src = gameSource()) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('start marker not found: ' + startMarker);
  const b = src.indexOf(endMarker, a + startMarker.length);
  if (b < 0) throw new Error('end marker not found: ' + endMarker);
  return src.slice(a + startMarker.length, b);
}

// Eval an extracted function/literal in a sandbox. `deps` becomes in-scope locals.
export function evalIn(code, deps = {}) {
  const keys = Object.keys(deps);
  const vals = keys.map(k => deps[k]);
  // eslint-disable-next-line no-new-func
  const factory = new Function(...keys, '"use strict";\nreturn (' + code + ');');
  return factory(...vals);
}

// Eval a statement-style snippet (e.g. a function declaration) and return a named binding.
export function evalDecl(code, returnName, deps = {}) {
  const keys = Object.keys(deps);
  const vals = keys.map(k => deps[k]);
  // eslint-disable-next-line no-new-func
  const factory = new Function(...keys, '"use strict";\n' + code + '\nreturn ' + returnName + ';');
  return factory(...vals);
}

// --- tiny test runner ---
let _pass = 0, _fail = 0;
const _fails = [];
// ---------------------------------------------------------------------------------------------------
// build 1454: a level's non-prop sections (zones, fx, logic, persistence, rigs, HUD, roster...) used to
// be written out TWICE - once in loadLevelFromNet, once in restoreLevel - and 25 harnesses asserted a
// COUNT OF 2 over the source to mean "restored on both load paths". That is build 1280's own finding:
// a test that counts copies of a thing is a test of the copying. Worse, those pins made REMOVING the
// duplication fail the suite, so the defect was test-enforced - and it had already drifted (the net
// copy refreshed the extraction marker, the editor copy did not).
//
// This states the property the pins always meant: the statement lives ONCE, inside the one applier,
// and every loader reaches that applier. It cannot be satisfied by a second copy appearing elsewhere.
export function appliedOnceByBothLoaders(re, msg, src = gameSource()) {
  const fn = extractFunction('_applyLevelSections', src);
  const inFn = (fn.match(re) || []).length;
  if (inFn !== 1) throw new Error(msg + ' - expected exactly one occurrence inside _applyLevelSections, found ' + inFn);
  const whole = (src.match(re) || []).length;
  if (whole !== 1) throw new Error(msg + ' - it also appears OUTSIDE the one applier (' + whole + ' engine-wide); the duplication is back');
  for (const loader of ['loadLevelFromNet', 'restoreLevel']) {
    const body = extractFunction(loader, src);
    if (!/_applyLevelSections\(level\)/.test(body)) throw new Error(msg + ' - ' + loader + ' does not reach _applyLevelSections');
  }
}

export function assert(cond, msg) {
  if (cond) { _pass++; }
  else { _fail++; _fails.push(msg || 'assertion failed'); }
}
export function eq(a, b, msg) {
  assert(a === b, (msg || 'eq') + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}
export function near(a, b, eps, msg) {
  assert(Math.abs(a - b) <= (eps ?? 1e-6), (msg || 'near') + ` (got ${a}, want ${b}±${eps ?? 1e-6})`);
}
export function done(label) {
  if (_fail === 0) {
    console.log(`  PASS  ${label}  (${_pass} checks)`);
    process.exit(0);
  } else {
    console.log(`  FAIL  ${label}  (${_pass} ok, ${_fail} failed)`);
    for (const f of _fails) console.log('         - ' + f);
    process.exit(1);
  }
}
