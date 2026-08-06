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
//
// BUILD 1414 MADE THE STAMP A HASH, and every assertion below moved with it. 1389 keyed the guard on
// BUILD_VERSION — a value this project's workflow bumps LAST, after the edits, the probes and the suite. So
// for the whole life of a build the repo and the staging carried the SAME version string and DIFFERENT
// code, the guard reported fresh, and every probe run during development silently measured the previous
// build. It cost build 1414 a run and looked exactly like its new code being broken. The intent this file
// has always had is unchanged and is now actually enforced; the cases that used to prove a matching
// version passes now prove that a matching version with different BYTES is refused.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, eq, done } from './harness.mjs';

const mk = readFileSync(new URL('../tools/probe/mkprobe.mjs', import.meta.url), 'utf8');
const dv = readFileSync(new URL('../tools/probe/driver.mjs', import.meta.url), 'utf8');

// ------------------------------------------------------------ mkprobe stamps ----
{
  assert(/createHash\('sha256'\)/.test(mk),
    'mkprobe stamps a CONTENT HASH — the only stamp that cannot be defeated by a workflow that bumps the ' +
    'version last (build 1414)');
  assert(/fs\.writeFileSync\(path\.join\(out, 'BUILD'\), _sha \+ '  ' \+ _bv \+ '\\n'\);/.test(mk),
    '...with the version string beside it as a human-readable label, not as the thing being compared');
  assert(/const _bv = \(src\.match\(\/const BUILD_VERSION = '\(\[\^'\]\*\)'\/\) \|\| \[, 'UNKNOWN'\]\)\[1\];/.test(mk),
    '...and that label is read out of the very text being staged, not out of the repo separately, which ' +
    'would let the two disagree');
  assert(/probe\.html written to ' \+ out \+ '   \[' \+ _bv \+ ' \u00b7 ' \+ _sha \+ '\]'/.test(mk),
    '...and both are printed, so a stale staging is visible in the log of the run that made it');
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
  const bytes = readFileSync(new URL('../breach.html', import.meta.url));
  const repoSha = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const repoBuild = bytes.toString('utf8').match(/const BUILD_VERSION = '([^']*)'/)[1];
  assert(repoBuild && repoBuild.length > 3, 'the repo names a build (' + repoBuild + ')');

  const dir = mkdtempSync(join(tmpdir(), 'probe-stamp-'));
  try {
    // 1. no stamp at all — an old staging from before this guard existed
    let threw = null;
    try { assertFreshStaging(dir); } catch (e) { threw = e.message; }
    assert(threw && /STALE PROBE STAGING/.test(threw), 'an UNSTAMPED staging is refused');
    assert(/rebuild it/.test(threw), '...and the message says so rather than reporting a mystery');
    assert(threw.includes('node tools/probe/mkprobe.mjs'), '...and names the exact command that fixes it');

    // 2. a stamp from another build — the case that actually happened at build 1388
    writeFileSync(join(dir, 'BUILD'), 'deadbeefdeadbeef  build 1381 \u00b7 2026-08-05\n');
    threw = null;
    try { assertFreshStaging(dir); } catch (e) { threw = e.message; }
    assert(threw && /STALE PROBE STAGING/.test(threw), 'a staging from a DIFFERENT build is refused');
    assert(threw.includes('build 1381'), '...and reports what it found');
    assert(threw.includes(repoSha), '...and what it wanted, so the direction of the drift is readable');

    // 3. THE CASE THE OLD GUARD WAS BLIND TO, and the reason build 1414 rewrote this: the same version
    //    string, different bytes. Every probe run between a build's first edit and its version bump is
    //    exactly this — which is to say, all of them.
    writeFileSync(join(dir, 'BUILD'), 'aaaaaaaaaaaaaaaa  ' + repoBuild + '\n');
    threw = null;
    try { assertFreshStaging(dir); } catch (e) { threw = e.message; }
    assert(threw && /STALE PROBE STAGING/.test(threw),
      'a staging whose VERSION STRING MATCHES but whose bytes do not is refused — the whole point of a ' +
      'digest, and the case a version-keyed guard reports as fresh');

    // 4. the matching stamp — this must NOT throw, or every probe in the repo breaks
    writeFileSync(join(dir, 'BUILD'), repoSha + '  ' + repoBuild + '\n');
    assertFreshStaging(dir);
    assert(true, 'a matching digest passes');

    // 5. ...and the label beside it is decoration: the right hash with a WRONG version still passes,
    //    because the bytes are what was measured
    writeFileSync(join(dir, 'BUILD'), repoSha + '  build 1 \u00b7 ancient\n');
    assertFreshStaging(dir);
    assert(true, 'the version label does not participate in the comparison');

    // 6. trailing whitespace is not a mismatch (the stamp is written with a newline)
    writeFileSync(join(dir, 'BUILD'), '  ' + repoSha + '  ' + repoBuild + '  \n\n');
    assertFreshStaging(dir);
    assert(true, 'the comparison is whitespace-insensitive, or the newline it writes would fail its own check');

    // 7. the deliberate escape hatch, for measuring an old build on purpose
    writeFileSync(join(dir, 'BUILD'), '0000000000000000  build 1 \u00b7 ancient\n');
    process.env.PROBE_SKIP_STAMP = '1';
    assertFreshStaging(dir);
    delete process.env.PROBE_SKIP_STAMP;
    assert(true, 'PROBE_SKIP_STAMP is an explicit opt-out, so an intentional old-build measurement is possible');
    // ...and it is OFF by default: the previous six cases ran without it
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
  assert(/if \(have === want\) return;/.test(fn), 'and a match is the only silent success');
  // build 1414 removed the `if (!want) return;` escape, and that is strictly stronger rather than a lost
  // case: a hash of the bytes ALWAYS exists, so there is no longer a "cannot decide" branch to fall
  // through. The version string is read only to label the error message.
  assert(!/if \(!want\) return;/.test(fn),
    'there is no undecidable case left — a digest of an existing file is always computable');
  assert(/\|\| \[, '\?'\]\)\[1\]/.test(fn),
    '...so a missing BUILD_VERSION degrades to a label, never to a skipped check');
}

done('build 1389: a probe cannot silently measure a build that is not in the tree');
