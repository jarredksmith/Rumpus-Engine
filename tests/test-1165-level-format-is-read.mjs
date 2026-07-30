// build 1165: the level format version is finally READ.
//
// `serializeLevel` has written `v:1` since the field existed and nothing ever inspected it. The single-file
// GitHub-Pages model guarantees stale cached clients exist, so "new level opened in old engine" is a normal
// event — and it silently dropped whatever the old client didn't recognise. Now: a newer `v` loads with a
// loud warning naming both versions (tolerance stays the right default); a newer `minV` — the author's
// declaration that a partial read is load-bearing wrong — refuses BEFORE any teardown, so refusal is free.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

const V = +src.match(/const LEVEL_FORMAT_V = (\d+);/)[1];

// ---------------------------------------------------------------- the shape
{
  assert(/v: LEVEL_FORMAT_V,/.test(src), 'serializeLevel writes the named constant, not a magic 1');
  assert(/if\(!_levelFormatCheck\(level\)\.ok\) return;/.test(extractFunction('restoreLevel')),
    'restoreLevel gates on the check FIRST — before the prop teardown, so a refusal costs the player nothing');
  const rl = extractFunction('restoreLevel');
  assert(rl.indexOf('_levelFormatCheck(level)') < rl.indexOf('removeProp'),
    '...verified by position: the check precedes the first destructive call');
}

// ---------------------------------------------------------------- executed
{
  const warns = [], toasts = [];
  const fn = new Function('flashToast', 'console',
    'const LEVEL_FORMAT_V = ' + V + ';\n' + extractFunction('_levelFormatCheck') + '\nreturn _levelFormatCheck;'
  )((m) => toasts.push(m), { warn: (m) => warns.push(m) });

  eq(fn({ v: V }).ok, true, 'a current-format level loads silently');
  eq(toasts.length + warns.length, 0, '...with no message');
  eq(fn({}).ok, true, 'a legacy level with no version at all still loads (the tolerant reader is unchanged)');
  eq(fn(null).ok, true, 'even a null level does not throw here (restoreLevel already guards it)');

  { // newer v: tolerant load + loud warning
    toasts.length = 0; warns.length = 0;
    eq(fn({ v: V + 3 }).ok, true, 'a NEWER-format level still loads — tolerance is the right default');
    assert(toasts.length === 1, '...but says so where the player can see it');
    assert(/v' + '/.test('') || toasts[0].includes('v' + (V + 3)), '...naming the level\'s version');
    assert(toasts[0].includes('v' + V), '...and this engine\'s');
    assert(/[Rr]efresh/.test(toasts[0]), '...and the fix: refresh the page (the single-file model auto-updates)');
  }
  { // minV: the author's hard floor
    toasts.length = 0;
    eq(fn({ v: V + 3, minV: V + 1 }).ok, false, 'a level that DECLARES it cannot survive a partial read is refused');
    assert(toasts.length === 1 && /[Rr]efresh/.test(toasts[0]), '...with the same actionable message');
    eq(fn({ v: V + 3, minV: V }).ok, true, 'but minV at or below this engine loads (the tolerance was authored in)');
  }
}

done('build 1165: level format v is written as a named constant and finally read on load — newer levels load with a loud both-versions warning, an authored minV floor refuses before any teardown, and legacy/current levels are byte-identical in behaviour');
