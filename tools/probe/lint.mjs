// A one-second check for the trap that has cost eleven debugging cycles in this repo.
//
// Every probe passes its page code as a TEMPLATE LITERAL. Writing `like this` in a comment INSIDE one
// closes the literal, and the failure surfaces as a Node parse error pointing at a completely innocent
// line (`window.__B = ${B};`, usually) with the message "missing ) after argument list". It is recorded
// against builds 1328, 1342, 1357 and again through this session's booth sweeps, and each time it was
// re-diagnosed from scratch, because the error names neither the file's real problem nor its location.
//
//     node tools/probe/lint.mjs            check every probe
//     node tools/probe/lint.mjs a.mjs …    check the ones named
//
// It also flags an unterminated literal, which is the same mistake one step further along.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(HERE).filter(f => f.endsWith('.mjs') && f !== 'lint.mjs').map(f => join(HERE, f));

let bad = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const lineOf = (i) => src.slice(0, i).split('\n').length;

  /* Walk the file's OPENING backticks rather than pairing them up: a probe's page code always starts
     with the same shape, and the first stray backtick inside is what ends the literal early. */
  const open = /`\(\s*(?:function\s*\(\s*\)\s*\{|async\s*\(\s*\)\s*=>)/g;
  let m;
  while ((m = open.exec(src))) {
    const start = m.index + 1;
    const close = src.indexOf('})()`', start);
    if (close < 0) {
      console.log(`  ${basename(f)}:${lineOf(m.index)}  UNTERMINATED page-code literal`);
      bad++; break;
    }
    /* Two backticks are legal in here and both are common, so this walks rather than searching:
       an ESCAPED one, and one inside a ${...} interpolation, where a nested template is ordinary JS. */
    let depth = 0;
    for (let i = start; i < close; i++) {
      const c = src[i];
      if (c === '\\') { i++; continue; }
      if (c === '$' && src[i + 1] === '{') { depth++; i++; continue; }
      if (c === '}' && depth > 0) { depth--; continue; }
      if (c === '`' && depth === 0) {
        const at = lineOf(i);
        console.log(`  ${basename(f)}:${at}  BACKTICK inside page code — it closes the literal`);
        console.log(`        ${src.split('\n')[at - 1].trim().slice(0, 100)}`);
        bad++; break;
      }
    }
    open.lastIndex = close;
  }
}
console.log(bad ? `\n  ${bad} problem(s) — write the identifier as plain prose inside page code`
                : `  ${files.length} probe(s) clean`);
process.exit(bad ? 1 : 0);
