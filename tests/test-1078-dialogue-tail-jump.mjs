// (build 1078) "-> end" WHERE PEOPLE ACTUALLY WRITE IT, and a warning when a branch runs on.
// Build 1076 only accepted a jump on a row of its own. An author wrote this, which is the natural way:
//     #sassy
//     Feeling sassy, eh?
//     I felt sassy once. -> end
// ...and the arrow was treated as literal text, so the row said "I felt sassy once. -> end" on screen and
// then fell straight through into the next branch, and the next — every reply led to every answer.
// Two fixes. A jump is now recognised at the END of any row, anchored to a single bare label so an arrow
// used as punctuation mid-sentence is untouched. And the editor calls out the two mistakes you can only
// otherwise find by playing the level: a jump to a label that doesn't exist, and a branch with no ending.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const GLUE = `
  let logicVars={}, inventory=[];
  let _dlg={ open:false, script:[], i:0, name:'' };
`;
const DLG_MARKS = src.match(/function _dlgMarks\(txt\)\{[\s\S]*?\n\}/)[0];
const D = new Function(GLUE
  + src.match(/const DLG_OPS = \[[^\]]*\];/)[0] + '\n'
  + src.match(/const DLG_TAIL = .*\n/)[0] + extractFunction('_dlgTail', src) + '\n'
  + extractFunction('_dlgExpr', src) + '\n' + extractFunction('_dlgVal', src) + '\n'
  + extractFunction('_dlgTest', src) + '\n' + DLG_MARKS + '\n'
  + extractFunction('_dlgParse', src) + '\n' + extractFunction('_dlgOptions', src) + '\n'
  + extractFunction('_dlgNextFrom', src) + '\n' + extractFunction('_dlgGoto', src) + '\n'
  + extractFunction('_dlgLint', src)
  + `\nreturn { parse:_dlgParse, tail:_dlgTail, lint:_dlgLint,
      load:(rows)=>{ _dlg={ open:true, script:_dlgParse(rows), i:0, name:'' }; return _dlg.script; },
      goto:(l)=>_dlgGoto(l), next:(i)=>_dlgNextFrom(i) };`)();

// ---------------------------------------------------------------- the tail rule
{
  eq(D.tail('I felt sassy once. -> end').t, 'I felt sassy once.', 'the arrow comes off the spoken text');
  eq(D.tail('I felt sassy once. -> end').to, 'end', '...and is read as the jump');
  eq(D.tail('Take it -> gotIt').to, 'gotIt', 'a label works the same way');
  eq(D.tail('Take it->gotIt').to, 'gotIt', '...with or without spaces');
  eq(D.tail('Take it -> got-it_2').to, 'got-it_2', '...and labels may carry hyphens, digits and underscores');
  eq(D.tail('Nothing here').to, '', 'a row with no arrow is untouched');
  eq(D.tail('Nothing here').t, 'Nothing here', '...and keeps its text');
}
{ // the reason it is anchored and single-word: an arrow is also punctuation
  eq(D.tail('The hall -> the vault is that way.').to, '', 'a multi-word tail is prose, not a jump');
  eq(D.tail('The hall -> the vault is that way.').t, 'The hall -> the vault is that way.', '...and survives intact');
  eq(D.tail('Go -> gotIt, then run.').to, '', 'an arrow in the MIDDLE of a sentence is prose too');
  eq(D.tail('a -> b -> c').to, 'c', 'the LAST arrow wins when several are written');
}

// ---------------------------------------------------------------- the author's actual script
const SPIDEY = [
  'Hello Spiderman. How are you today?',
  '> Feeling sassy -> sassy',
  '> All webbed out -> out',
  '> Bloated -> bloated',
  '#sassy',
  'Feeling sassy, eh?',
  'I felt sassy once. -> end',
  '#out',
  'Wait, you can run out?',
  'Gross. -> end',
  '#bloated',
  'Bloated?',
  "I'm always bloated, brother.  -> end",
];
{
  const s = D.load(SPIDEY);
  eq(s.length, 7, 'seven spoken rows: the question and three two-line answers');
  eq(s[0].ch.length, 3, 'the question carries all three replies');
  eq(s[2].t, 'I felt sassy once.', 'the arrow is NOT part of what the NPC says any more');
  eq(s[2].end, 1, '...it ends the conversation, which is what the author wrote');
  eq(s[4].end, 1, 'so does the second branch');
  eq(s[6].t, "I'm always bloated, brother.", '...and the third, trailing spaces and all');
  eq(s[6].end, 1, '...which also ends');
  // walk each reply and prove it dead-ends instead of running on
  for (const [reply, label, lastLine] of [[0, 'sassy', 'I felt sassy once.'], [1, 'out', 'Gross.'], [2, 'bloated', "I'm always bloated, brother."]]) {
    const j = D.goto(s[0].ch[reply].to);
    eq(s[j].id, label, `reply ${reply + 1} jumps to #${label}`);
    const k = D.next(j + 1);
    eq(s[k].t, lastLine, `...speaks its second line`);
    eq(s[k].end, 1, `...and STOPS there instead of walking into the next answer`);
  }
}

// ---------------------------------------------------------------- the warnings
{
  eq(D.lint(SPIDEY).length, 0, 'the fixed script is clean');
}
{ // exactly the bug, as it was written before the fix: no endings at all
  const RUNON = SPIDEY.map(r => r.replace(/\s*->\s*end$/, ''));
  const msgs = D.lint(RUNON);
  eq(msgs.length, 2, 'two branches run on into the next one (the last has nothing after it to run into)');
  assert(/runs straight on into #out/.test(msgs[0]), 'and it names which branch and where it leaks to');
  assert(/-> end/.test(msgs[0]), '...and says exactly what to type to fix it');
  assert(/I felt sassy once/.test(msgs[0]), '...quoting the line it happens on, so you can find it');
}
{ // a jump to a label nobody wrote
  const msgs = D.lint(['Q', '> Yes -> yep', '> No -> nope', '#yep', 'Good. -> end']);
  eq(msgs.length, 1, 'one broken jump');
  assert(/there is no #nope to jump to/.test(msgs[0]), '...named plainly (' + msgs[0] + ')');
  eq(D.lint(['Q', '> A -> gone', '> B -> gone']).length, 1, 'the same missing label is only reported once');
}
{
  eq(D.lint([]).length, 0, 'an empty script has nothing to say');
  eq(D.lint(['Just one line.']).length, 0, 'a plain one-line NPC is never nagged');
  eq(D.lint(['Hello.', 'Goodbye.']).length, 0, '...nor a plain flat script, which never had branches to leak between');
  eq(D.lint(['A', '#b', 'B', 'C']).length, 0, 'a label nothing jumps to can only be REACHED by falling through, so falling through is never a mistake');
  eq(D.lint(['A', '> go -> b', '> stay -> c', '#b', 'B', '#c', 'C']).length, 1, '...but once something jumps to #c, the branch leaking into it is real');
  eq(D.lint(['A -> end', '#b', 'B']).length, 0, 'an explicit end is respected');
  eq(D.lint(['A', '> go -> b', '#b', 'B']).length, 0, 'a row that ends in replies cannot fall through — it waits');
  eq(D.lint(['A -> b', '#b', 'B']).length, 0, '...and neither can one that jumps');
  const many=[]; for(let i=0;i<10;i++) many.push('jump '+i+' -> L'+i);
  for(let i=0;i<10;i++){ many.push('#L'+i); many.push('answer '+i); }
  eq(D.lint(many).length, 6, 'the warning list is bounded rather than burying the box under nine of the same thing');
}

// ---------------------------------------------------------------- wiring
assert(/const DLG_TAIL = \/\\s\*->\\s\*\(\[\\w#-\]\{1,40\}\)\\s\*\$\/;/.test(src),
  'the rule is anchored to the end of the row and to a single bare label');
{
  const fn = extractFunction('_dlgParse', src);
  assert(/const tl=_dlgTail\(mk\.t\);/.test(fn), 'a spoken row is checked for a trailing jump');
  assert(/if\(tl\.to\)\{ if\(\/\^end\$\/i\.test\(tl\.to\)\) node\.end=1; else node\.to=tl\.to; \}/.test(fn), '...and end / a label are both honoured');
  assert(/const tl=_dlgTail\(mk\.t\); c=tl\.t;/.test(fn), 'and a reply uses the same rule');
  assert(!/lastIndexOf\('->'\)/.test(fn), '...instead of the loose scan it used to, which swallowed a multi-word tail');
  assert(/if\(t\.slice\(0,2\)==='->'\)\{/.test(fn), 'a jump on a row of its own still works — nothing that already parsed has changed');
}
{
  const fn = extractFunction('renderEditorFields', src);
  assert(/const dLint=\(\)=>\{/.test(fn), 'the editor checks the script as you write it');
  assert(/ta\.onchange=[\s\S]{0,400}dLint\(\);/.test(fn), '...on every edit');
  assert(/dBody\.appendChild\(ta\); dBody\.appendChild\(dw\); dLint\(\);/.test(fn), '...and on the way in, so an existing broken script announces itself');
  assert(/replace\(\/\[&<>\]\/g/.test(fn), 'the warning escapes the line it quotes back');
  assert(/color:#ffbf7a/.test(fn), '...and reads as a warning, not as body text');
  assert(/at the end of a row \(or on its own row\) jumps/.test(fn), 'the fold documents where a jump can go');
  assert(/<b>-&gt; end<\/b> stops the conversation there/.test(fn), '...and what end does');
}

done('build 1078: "-> end" works where people write it, and the editor says so when a branch has no ending');
