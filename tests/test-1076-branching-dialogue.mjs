// (build 1076) BRANCHING DIALOGUE — replies, conditions and jumps.
// Dialogue was a flat list of lines you clicked through: the NPC talked AT you and nothing you did changed it.
// Which meant no quest could be accepted, no answer remembered, no reward gated on carrying the right thing.
// The stored shape is deliberately unchanged — a prop's dialogue is still an ARRAY OF ROWS, so every script
// written before this build parses to exactly what it did before. Four marks turn that list into a conversation:
// #label names the next row, "> reply -> label" adds a button, [if expr] hides a row or a reply, and "-> label"
// jumps. Two inline marks, {set x = 1} and {event name}, are the bridge to the logic graph.
import { gameSource, html, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const GLUE = `
  let logicVars={}, inventory=[], events=[];
  let _dlg={ open:false, script:[], i:0, name:'' };
  function logicEvent(n){ events.push(n); }
`;
// extractFunction's brace matcher can't see through the { } inside these regex literals, so this one is sliced
const DLG_MARKS = src.match(/function _dlgMarks\(txt\)\{[\s\S]*?\n\}/)[0];
const D = new Function(GLUE
  + src.match(/const DLG_OPS = \[[^\]]*\];/)[0] + '\n'
  + extractFunction('_dlgExpr', src) + '\n' + extractFunction('_dlgVal', src) + '\n'
  + extractFunction('_dlgTest', src) + '\n' + extractFunction('_dlgSet', src) + '\n'
  + DLG_MARKS + '\n' + extractFunction('_dlgParse', src) + '\n'
  + extractFunction('_dlgOptions', src) + '\n' + extractFunction('_dlgNextFrom', src) + '\n'
  + extractFunction('_dlgGoto', src)
  + `\nreturn { parse:_dlgParse, val:_dlgVal, test:_dlgTest, set:_dlgSet, opts:_dlgOptions,
      vars:(v)=>{ logicVars=v||{}; }, inv:(v)=>{ inventory=v||[]; }, live:()=>logicVars, events:()=>events,
      load:(rows)=>{ _dlg={ open:true, script:_dlgParse(rows), i:0, name:'' }; return _dlg.script; },
      at:(i)=>{ _dlg.i=i; }, next:(i)=>_dlgNextFrom(i), goto:(l)=>_dlgGoto(l) };`)();

// ---------------------------------------------------------------- a plain script is exactly what it always was
{
  const s = D.parse(['Hello there.', 'Mind the step.']);
  eq(s.length, 2, 'two rows, two lines');
  eq(s[0].t, 'Hello there.', 'the text is the text');
  eq(s[0].ch, undefined, 'no replies');
  eq(s[0].if, undefined, 'no condition');
  eq(D.parse(['  spaced  ', '', '   '])[0].t, 'spaced', 'rows trim and blanks are dropped, as before');
  eq(D.parse(null).length, 0, 'junk parses to nothing, never a crash');
  eq(D.parse('a string').length, 0, '...including a bare string');
}

// ---------------------------------------------------------------- replies
{
  const s = D.parse(['Have you found the key?', '> Here it is. -> gotIt', '> Not yet.', '> Leave. -> end']);
  eq(s.length, 1, 'replies attach to the line above — they are not lines of their own');
  eq(s[0].ch.length, 3, 'all three are on it');
  eq(s[0].ch[0].t, 'Here it is.', 'the arrow is not part of the text');
  eq(s[0].ch[0].to, 'gotIt', '...it is the jump');
  eq(s[0].ch[1].to, undefined, 'a reply with no arrow just carries on');
  eq(s[0].ch[2].end, 1, '"-> end" finishes the conversation');
}
{
  const s = D.parse(['> Nothing said first']);
  eq(s.length, 1, 'a reply with no line above it still works...');
  eq(s[0].t, '', '...as a silent prompt — "what do you do?" with only buttons');
  eq(s[0].ch.length, 1, '...carrying the reply');
}
{
  const s = D.parse(['Pick', '>1', '>2', '>3', '>4', '>5', '>6', '>7', '>8']);
  eq(s[0].ch.length, 6, 'more than six buttons is a menu, not a conversation — the rest are dropped');
}

// ---------------------------------------------------------------- conditions
{
  const s = D.parse(['[if questStage >= 2] Back again, I see.', 'Hello.']);
  eq(s[0].t, 'Back again, I see.', 'the condition is stripped off the text');
  eq(JSON.stringify(s[0].if), '{"v":"questStage","op":">=","b":"2"}', '...and parsed');
  D.vars({}); D.load(['[if questStage >= 2] Back again.', 'Hello.']);
  eq(D.next(0), 1, 'a false condition skips the row');
  D.vars({ questStage: 2 });
  eq(D.next(0), 0, '...and a true one shows it');
}
{
  const s = D.parse(['Q', '> Only if rich [if coins > 100]', '> Always']);
  eq(s[0].ch[0].t, 'Only if rich', 'a reply condition strips off the reply text too');
  D.vars({ coins: 5 });
  eq(D.opts(s[0]).length, 1, 'a reply you cannot afford is not shown at all');
  eq(D.opts(s[0])[0].t, 'Always', '...and the rest keep their order');
  D.vars({ coins: 500 });
  eq(D.opts(s[0]).length, 2, '...and it appears once you can');
}
{ // the shorthand and the operators
  eq(JSON.stringify(D.parse(['[if hasKey] x'])[0].if), '{"v":"hasKey","op":">=","b":"1"}',
    '"[if hasKey]" reads as "it has been set" — the common case needs no operator');
  for (const [op, a, b, want] of [['==', 3, 3, true], ['==', 3, 4, false], ['!=', 3, 4, true],
    ['<', 2, 3, true], ['<=', 3, 3, true], ['>', 4, 3, true], ['>=', 2, 3, false]]) {
    D.vars({ x: a });
    eq(D.test({ v: 'x', op, b: String(b) }), want, `${a} ${op} ${b}`);
  }
}
{ // what a condition can read
  D.vars({ coins: 7 }); D.inv([{ id: 'brassKey', n: 2 }]);
  eq(D.val('coins'), 7, 'a bare name is a logic variable');
  eq(D.val('12'), 12, 'a number is a number');
  eq(D.val('-2.5'), -2.5, '...including negative and fractional');
  eq(D.val('item:brassKey'), 2, 'item:id is how many of it you are carrying');
  eq(D.val('item:nothing'), 0, '...and 0 for something you have never held');
  eq(D.val('neverSet'), 0, 'an unset variable reads as 0, so a condition is never comparing against nothing');
  eq(D.val(''), 0, '...as does a blank');
  eq(D.test(null), true, 'no condition at all means "always"');
  eq(D.test({ v: '' }), true, '...as does an empty one');
}

// ---------------------------------------------------------------- labels and jumps
{
  const s = D.parse(['Ask', '#gotIt', 'The vault is yours.', 'Take it.']);
  eq(s.length, 3, 'a #label is not a line of its own');
  eq(s[1].id, 'gotIt', '...it names the row after it');
  eq(s[0].id, undefined, '...and only that one');
  D.load(['Ask', '#gotIt', 'The vault is yours.']);
  eq(D.goto('gotIt'), 1, 'a jump finds the label');
  eq(D.goto('nowhere'), -1, 'a typo\'d label ends the conversation rather than looping forever');
  eq(D.goto(''), -1, '...as does a blank one');
}
{
  D.vars({});
  D.load(['Ask', '#hid', '[if never] hidden', 'after it']);
  eq(D.goto('hid'), 2, 'jumping to a row whose own condition is false lands on the next row that passes');
}
{
  const s = D.parse(['Goodbye.', '-> end', 'unreachable-ish']);
  eq(s.length, 2, 'a bare jump is not a line');
  eq(s[0].end, 1, '"-> end" on its own row ends after the line above it');
  const j = D.parse(['See you', '-> top']);
  eq(j[0].to, 'top', 'and a bare label jumps');
}

// ---------------------------------------------------------------- the bridge to the logic graph
{
  const s = D.parse(['Take this. {set questStage = 2} {event vaultOpen}']);
  eq(s[0].t, 'Take this.', 'the marks come out of the spoken text');
  eq(JSON.stringify(s[0].set), '{"v":"questStage","op":"=","b":"2"}', 'the set is parsed');
  eq(s[0].ev, 'vaultOpen', '...and the event');
  eq(D.parse(['x {event a} {set b = 1}'])[0].set.v, 'b', 'the marks work in either order');
  eq(D.parse(['{set coins + 5} Here.'])[0].t, 'Here.', '...and anywhere in the row');
}
{
  D.vars({ coins: 10 });
  D.set({ v: 'coins', op: '=', b: '3' }); eq(D.live().coins, 3, '= assigns');
  D.set({ v: 'coins', op: '+', b: '4' }); eq(D.live().coins, 7, '+ adds');
  D.set({ v: 'coins', op: '-', b: '2' }); eq(D.live().coins, 5, '- subtracts');
  D.set({ v: 'coins', op: '+', b: 'bonus' }); eq(D.live().coins, 5, '...and the right-hand side can be another variable');
  D.vars({ coins: 1, bonus: 9 });
  D.set({ v: 'coins', op: '+', b: 'bonus' }); eq(D.live().coins, 10, '...which is read live');
  const before = JSON.stringify(D.live());
  D.set({ v: 'not a name', op: '=', b: '1' }); D.set(null); D.set({ op: '=', b: '1' });
  eq(JSON.stringify(D.live()), before, 'a malformed set writes nothing at all');
}
{
  const s = D.parse(['Q', '> Accept -> yes {set accepted = 1} {event questTaken}']);
  const c = s[0].ch[0];
  eq(c.t, 'Accept', 'a reply carries the same marks');
  eq(c.to, 'yes', '...alongside its jump');
  eq(c.set.v, 'accepted', '...its set');
  eq(c.ev, 'questTaken', '...and its event');
}

// ---------------------------------------------------------------- a whole conversation, walked
{
  const SCRIPT = [
    'Have you found the brass key?',
    '> Here it is. -> gotIt [if item:brassKey >= 1]',
    '> Still looking.  -> notYet',
    '> Leave. -> end',
    '#gotIt',
    'Then the vault is yours. {set questStage = 2} {event vaultOpen}',
    '-> end',
    '#notYet',
    'Keep looking. It glints in the dark.',
  ];
  D.vars({}); D.inv([]);
  let s = D.load(SCRIPT);
  eq(s.length, 3, 'nine rows collapse to three spoken beats — the question, the reward and the brush-off — with the replies hung off the first');
  eq(D.opts(s[0]).length, 2, 'without the key, the "here it is" reply is not offered');
  D.inv([{ id: 'brassKey', n: 1 }]);
  eq(D.opts(s[0]).length, 3, '...and with it, it is');
  // take the good branch
  const c = D.opts(s[0])[0];
  eq(c.to, 'gotIt', 'picking it jumps to the reward');
  const j = D.goto('gotIt');
  eq(s[j].t, 'Then the vault is yours.', '...which is the labelled row');
  eq(s[j].end, 1, '...and it ends the conversation after speaking');
  // the other branch
  eq(s[D.goto('notYet')].t, 'Keep looking. It glints in the dark.', 'the other reply reaches the other row');
}

// ---------------------------------------------------------------- runtime wiring
{
  const fn = extractFunction('openDialogue', src);
  assert(/const script=_dlgParse\(dl\); if\(!script\.length\) return;/.test(fn), 'a conversation is parsed when it opens');
  assert(fn.indexOf("fireSignals(obj, 'interacted')") < fn.indexOf('_dlgShow('),
    "the prop's own On-E signals run BEFORE the first row is picked, so a variable they set is already visible to its [if]");
  assert(/_dlgShow\(_dlgNextFrom\(0\)\);/.test(fn), '...and the first row shown is the first one whose condition passes');
}
{
  const fn = extractFunction('_dlgShow', src);
  assert(/if\(i<0 \|\| i>=_dlg\.script\.length\)\{ closeDialogue\(\); return; \}/.test(fn), 'running off the end closes the box');
  assert(/if\(n\.set\) _dlgSet\(n\.set\);/.test(fn), 'a row\'s {set} runs when it is shown');
  assert(/if\(n\.ev && typeof logicEvent==='function' && \(typeof NET==='undefined' \|\| NET\.mode!=='client'\)\) logicEvent\(n\.ev\);/.test(fn),
    '...and its {event} pulses the graph — on the authoritative side, like every other event source');
}
{
  const fn = extractFunction('advanceDialogue', src);
  assert(/if\(n && _dlgOptions\(n\)\.length\) return;/.test(fn),
    'while a reply is waiting, E and clicks do NOTHING — you cannot skip past a choice by mashing the advance key');
  assert(/if\(n && n\.end\)\{ closeDialogue\(\); return; \}/.test(fn), 'a row marked end closes');
  assert(/if\(n && n\.to\)\{ _dlgShow\(_dlgGoto\(n\.to\)\); return; \}/.test(fn), 'a row with a jump jumps');
}
{
  const fn = extractFunction('pickDialogueChoice', src);
  assert(/const opts=_dlgOptions\(n\); const c=opts\[ci\];/.test(fn), 'a pick indexes the VISIBLE replies, so a hidden one can never be chosen');
  assert(/if\(!c\) return false;/.test(fn), '...and an out-of-range pick is simply ignored');
  assert(/if\(c\.set\) _dlgSet\(c\.set\);/.test(fn) && /logicEvent\(c\.ev\)/.test(fn), 'the reply\'s set and event run');
  assert(/_dlgShow\(c\.to \? _dlgGoto\(c\.to\) : _dlgNextFrom\(_dlg\.i\+1\)\);/.test(fn), '...then it jumps, or carries on');
}
{
  const fn = extractFunction('_renderDialogue', src);
  assert(/_creditEsc\(c\.t\)/.test(fn), 'reply text is escaped — a shared level cannot inject markup through a button');
  assert(/class="dlgNum">'\+\(i\+1\)\+'/.test(fn), 'the buttons are numbered, so the keyboard can pick one');
  assert(/bs\[ci\]\.onclick=\(e\)=>\{ e\.stopPropagation\(\); pickDialogueChoice\(ci\); \};/.test(fn),
    '...and clicking one picks it instead of advancing the box underneath');
  assert(/const last=\(n\.end \|\| \(!n\.to && _dlgNextFrom\(_dlg\.i\+1\)<0\)\);/.test(fn),
    'the footer says "to close" only when this really is the last thing it will say');
}
assert(/const _dm=e\.code\.match\(\/\^Digit\(\[1-6\]\)\$\/\);\s*\n\s*if\(_dm && pickDialogueChoice\(\+_dm\[1\]-1\)\)\{ e\.preventDefault\(\); return; \}/.test(src),
  '1-6 pick a reply from the keyboard');
assert(/if\(_dlg\.open && !e\.repeat && !editorOpen\)\{/.test(src), '...only during a live conversation, and never while editing');
assert(/function closeDialogue\(\)\{ _dlg\.open=false; _dlg\.script=\[\]; _dlg\.i=0;/.test(src),
  'closing drops the script, so the next conversation cannot inherit the last one\'s state');

// ---------------------------------------------------------------- authoring
{
  const fn = extractFunction('renderEditorFields', src);
  assert(/\.slice\(0,120\)\.map\(s=>s\.slice\(0,200\)\)/.test(fn), 'a conversation can be longer than the old 12 lines');
  assert(/dsm\.textContent='Replies, conditions & jumps';/.test(fn), 'the marks are documented right where the author types');
  assert(/details/.test(fn) && /dg\.appendChild\(dsm\)/.test(fn), '...folded away, so a one-line NPC never has to read any of it');
  assert(/&gt; text -&gt; label<\/b> a reply button/.test(fn), 'the reply mark is spelled out');
  assert(/item:someId<\/b> \(how many you carry\)/.test(fn), '...and so is the one thing nobody would guess');
  assert(/#gotIt/.test(fn), 'and a complete worked example is right there');
}
// the buttons are styled in the page CSS, so the HUD theme's accent and font reach them like everything else
assert(/#dialogue \.dlgChoices \{ display:flex; flex-direction:column;/.test(html), 'the reply list has a real style');
assert(/#dialogue \.dlgChoice \{[\s\S]*?font-family:inherit;/.test(html), '...inheriting the HUD font, not a browser button font');
assert(/#dialogue \.dlgChoice \{[\s\S]*?padding:8px 11px;/.test(html), '...with a target big enough for a thumb');
assert(/#dialogue \.dlgNum \{[\s\S]*?background:var\(--el-tint, var\(--accent\)\);/.test(html), '...and the number chip picks up the theme accent');

done('build 1076: the NPC can ask you something — replies, conditions and jumps, in the same box you already typed lines into');
