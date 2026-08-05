// The probe rig proves WHICH BUILD it is measuring.
//
// This container has rolled back fourteen times. `mkprobe` reads whatever `breach.html` happens to be on
// disk, so a rollback that lands between a build and its probe produces a staging of an OLD build that
// boots fine, renders fine, and answers a question about code that is no longer in the tree — silently.
//
// It HAPPENED, during build 1388's session: a probe staged inside a rollback window reported
// `_odBumpU is not defined` about a constant the tree had declared five builds earlier. Everything
// measured through that staging was about build 1381. The tell was accidental (an identifier that did not
// exist yet); had the rollback been one build shallower, every number would have looked perfectly
// plausible and been wrong.
//
// `docs/frames/README.md` has said "know what BUILD you are measuring — stamp it or diff it" since build
// 1382. This is that, enforced rather than remembered.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, eq, done } from './harness.mjs';

const mk = readFileSync(new URL('../tools/probe/mkprobe.mjs', import.meta.url), 'utf8');
const dv = readFileSync(new URL('../tools/probe/driver.mjs', import.meta.url), 'utf8');

// ------------------------------------------------------------ mkprobe stamps ----
{
  assert(/const _bv = \(src\.match\(\/const BUILD_VERSION = '\(\[\^'\]\*\)'\/\) \|\| \[, 'UNKNOWN'\]\)\[1\];/.test(mk),
    'mkprobe reads the BUILD_VERSION out of the very text it is staging — not out of the repo separately, ' +
    'which would let the two disagree');
  assert(/fs\.writeFileSync\(path\.join\(out, 'BUILD'\), _bv \+ '\\n'\);/.test(mk), '...and writes it beside the probe');
  assert(/probe\.html written to ' \+ out \+ '   \[' \+ _bv \+ '\]'/.test(mk),
    '...and prints it, so a stale staging is visible in the log of the run that made it');
  // it must be stamped from the FINAL text, after every injection, or a staging could be stamped and then
  // rewritten
  assert(mk.indexOf("writeFileSync(path.join(out, 'probe.html')") < mk.indexOf("path.join(out, 'BUILD')") ||
         mk.indexOf('probe.html') < mk.indexOf("'BUILD'"),
    'the stamp is written after the probe itself');
}

// -------------------------------------------------- the driver refuses a stale staging ----
// Executed against the real exported guard, in a temp directory, through every branch.
{
  const { assertFreshStaging } = await import('../tools/probe/driver.mjs');
  const repoBuild = readFileSync(new URL('../breach.html', import.meta.url), 'utf8')
    .match(/const BUILD_VERSION = '([^']*)'/)[1];
  assert(repoBuild && repoBuild.length > 3, 'the repo names a build (' + repoBuild + ')');

  const dir = mkdtempSync(join(tmpdir(), 'probe-stamp-'));
  try {
    // 1. no stamp at all — an old staging from before this guard existed
    let threw = null;
    try { assertFreshStaging(dir); } catch (e) { threw = e.message; }
    assert(threw && /STALE PROBE STAGING/.test(threw), 'an UNSTAMPED staging is refused');
    assert(/rebuild it/.test(threw), '...and the message says so rather than reporting a mystery');
    assert(threw.includes('node tools/probe/mkprobe.mjs'), '...and names the exact command that fixes it');

    // 2. a stamp from another build — the case that actually happened
    writeFileSync(join(dir, 'BUILD'), 'build 1381 \u00b7 2026-08-05\n');
    threw = null;
    try { assertFreshStaging(dir); } catch (e) { threw = e.message; }
    assert(threw && /STALE PROBE STAGING/.test(threw), 'a staging from a DIFFERENT build is refused');
    assert(threw.includes('build 1381'), '...and reports what it found');
    assert(threw.includes(repoBuild), '...and what it wanted, so the direction of the drift is readable');

    // 3. the matching stamp — and this is the case that must NOT throw, or every probe in the repo breaks
    writeFileSync(join(dir, 'BUILD'), repoBuild + '\n');
    assertFreshStaging(dir);
    assert(true, 'a matching stamp passes');

    // 4. trailing whitespace is not a mismatch (the stamp is written with a newline)
    writeFileSync(join(dir, 'BUILD'), '  ' + repoBuild + '  \n\n');
    assertFreshStaging(dir);
    assert(true, 'the comparison is whitespace-insensitive, or the newline it writes would fail its own check');

    // 5. the deliberate escape hatch, for measuring an old build on purpose
    writeFileSync(join(dir, 'BUILD'), 'build 1 \u00b7 ancient\n');
    process.env.PROBE_SKIP_STAMP = '1';
    assertFreshStaging(dir);
    delete process.env.PROBE_SKIP_STAMP;
    assert(true, 'PROBE_SKIP_STAMP is an explicit opt-out, so an intentional old-build measurement is possible');
    // ...and it is OFF by default: the previous four cases ran without it
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ------------------------------------------------------------- it runs before anything else ----
{
  assert(/const dir = opts\.dir \|\| path\.join\(REPO, 'probe-out'\);\s*\n\s*assertFreshStaging\(dir\);/.test(dv),
    'the check runs on the FIRST line of withGame — before the server spawns, before the browser launches, ' +
    'so a stale run costs a second rather than fifteen minutes and a wrong conclusion');
  const guard = dv.indexOf('assertFreshStaging(dir);');
  assert(guard > 0 && guard < dv.indexOf('chromium.launch'), '...ahead of the browser launch');
  assert(guard < dv.indexOf('spawn(\'python3\''), '...and ahead of the file server');
}

// -------------------------------------------------- it degrades rather than blocking ----
// A guard that refuses to run when it cannot decide is worse than no guard: probes are how this repo
// measures anything, and a rig that fails closed on a missing file would stop all of them.
{
  const fn = dv.slice(dv.indexOf('export function assertFreshStaging'), dv.indexOf('export async function withGame'));
  assert(/if \(!fs\.existsSync\(repoHtml\)\) return;/.test(fn), 'no breach.html to compare against: allowed');
  assert(/if \(!want\) return;/.test(fn), 'a breach.html with no BUILD_VERSION: allowed');
  assert(/if \(have === want\) return;/.test(fn), 'and a match is the only silent success');
}

done('build 1389: a probe cannot silently measure a build that is not in the tree');
