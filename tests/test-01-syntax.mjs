// All <script> blocks parse; exactly one BUILD_VERSION; no obviously-broken structure.
import vm from 'vm';
import { scriptBlocks, html, done, assert } from './harness.mjs';
// `vm.SourceTextModule` needs `--experimental-vm-modules`, and run-all does not pass it — so on a stock node
// the ONE `type="module"` block (the Rapier loader) was silently never syntax-checked at all: the harness
// reported a failure whose message was about the instrument, not the source, and the block itself went
// unread. Parse it without the flag by rewriting the module-only syntax into something `new Function` accepts:
// a top-level `import`/`export` is the only thing a function body cannot hold, and `await` is legal in one if
// the wrapper is async. Everything else — every real syntax error — parses identically.
const asFunctionBody = (body) => body
  .replace(/^\s*import\s+[^;]*?from\s*['"][^'"]*['"]\s*;?/gm, '')     // import x from '...'
  .replace(/^\s*import\s*['"][^'"]*['"]\s*;?/gm, '')                  // bare side-effect import
  .replace(/\bimport\.meta\b/g, '({url:""})')                         // import.meta.url
  .replace(/^\s*export\s+default\s+/gm, 'void ')
  .replace(/^\s*export\s+/gm, '');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
let checkedModule = 0;
for (const [i, b] of scriptBlocks().entries()) {
  try {
    if (b.module) {
      if (typeof vm.SourceTextModule === 'function') new vm.SourceTextModule(b.body);
      else new AsyncFunction(asFunctionBody(b.body));                 // dynamic `import()` stays a call, so it survives this
      checkedModule++;
    }
    else new Function(b.body);
    assert(true);
  } catch (e) { assert(false, `script block ${i} syntax: ${e.message}`); }
}
assert(checkedModule >= 1, `the type="module" block is actually parsed (${checkedModule} checked) — not skipped by a missing vm flag`);
{
  // and the rewrite must not be able to swallow a real error: a deliberately broken module body still fails
  let threw = false;
  try { new AsyncFunction(asFunctionBody("import x from 'y';\nfunction f({ { ) }\n")); } catch (e) { threw = true; }
  assert(threw, 'the module-body rewrite still reports a genuine syntax error');
}
const bv = html.match(/const\s+BUILD_VERSION\s*=/g) || [];
assert(bv.length === 1, `exactly one BUILD_VERSION decl (found ${bv.length})`);
done('syntax + script blocks parse');
