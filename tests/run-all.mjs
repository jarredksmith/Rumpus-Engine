// Runs every test-*.mjs as its own process; prints a summary; exits non-zero if any fail.
import { readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
// Some harnesses import the real npm packages (three, rapier). Without `npm install` they die at the
// module loader and read as 20+ mystery failures — catch that here and say the actual fix instead.
try { await import('three'); }
catch (e) {
  console.error('\n✕ Test dependencies are not installed (cannot import "three").');
  console.error('  Run:  cd tests && npm install\n');
  process.exit(2);
}
const files = readdirSync(dir).filter(f => /^test-.*\.mjs$/.test(f)).sort();
let pass = 0, fail = 0;
console.log(`BREACH test suite — ${files.length} harnesses\n`);
for (const f of files) {
  const r = spawnSync('node', ['--experimental-vm-modules', path.join(dir, f)], { encoding: 'utf8' });
  const out = (r.stdout || '').trim();
  const lines = out.split('\n').filter(l => !/ExperimentalWarning|--trace-warnings|node --/.test(l));
  process.stdout.write(lines.join('\n') + '\n');
  if (r.status === 0) pass++; else { fail++; if (r.stderr && r.stderr.trim()) console.log('         stderr: ' + r.stderr.trim().split('\n')[0]); }
}
console.log(`\n${pass}/${files.length} harnesses passed${fail ? `, ${fail} FAILED` : ''}`);
process.exit(fail ? 1 : 0);
