// (build 1351) A WAY TO REPORT SOMETHING.
// The platform audit's named blocker for a public release with minors, and the cheapest high-value item in
// it: there was NO report affordance anywhere in the product. Chat had build 1178's 11-word filter applied
// at render and a per-session `/mute`, and that was the entire safety surface — a player who saw something
// worse had no way to tell anyone, and a moderator had no queue to read.
//
// The server half is server/api/report.php. This tests the half a person can reach, and it was verified
// live against a stubbed endpoint (tools/probe/report-flow.mjs) through every response branch:
//   sent      -> {kind:chat, reason:harassment, target:"Griefer", text:"something awful", room:"ab12cd"}
//                "Reported — thank you. A moderator will look at it."
//   429       -> "You have reported very recently — try again in 37s"   (retry comes from the server)
//   400       -> "Could not send the report: bad kind"
//   no backend-> "Could not reach the moderation service — your report was NOT sent"
//   cancel    -> zero requests
import { gameSource, extractFunction, extractConst, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- the reasons are a whitelist, matching what report.php accepts ----
{
  const r = extractConst('REPORT_REASONS');
  for (const k of ['harassment', 'sexual', 'violence', 'hate', 'spam', 'other'])
    assert(r.indexOf("'" + k + "'") >= 0, 'reason ' + k + ' is offered');
  assert(/Harassment or bullying/.test(r), 'and each is worded for a person, not for a database');
}

// ---- a CHAT report must carry the message, because the server has no copy ----
{
  const f = extractFunction('openReportDialog', src);
  assert(/if\(opts\.text\) body\.text/.test(f),
    'the reported line travels with the report — chat is peer-to-peer, so the server has no copy of it ' +
    'and a report without it is an unactionable accusation. report.php refuses one for the same reason');
  assert(/if\(opts\.room\) body\.room/.test(f), '...and the room code, so a moderator can place it');
  const chat = src.match(/openReportDialog\('chat',[\s\S]{0,320}?\}\)/);
  assert(chat && /text:\(''\+\(text\|\|''\)\)/.test(chat[0]), 'the chat call site actually passes the text');
  assert(chat && /room:\(NET && NET\.room\)/.test(chat[0]), '...and the room');
}

// ---- it must fail LOUDLY when there is no backend ----
{
  const f = extractFunction('openReportDialog', src);
  assert(/catch\(e\)\{[\s\S]{0,400}was NOT sent/.test(f),
    'a self-hosted or offline session is told the report did not send — a silent swallow is worse than ' +
    'no button at all, because the reporter believes they have been heard');
  assert(/r\.status === 429/.test(f) && /\+j\.retry/.test(f),
    'and 429 uses the server’s own retry-in-seconds rather than guessing a number');
  assert(/if\(r\.ok && j && j\.ok\)/.test(f),
    'success requires BOTH an ok status and the body saying ok — an HTML error page with status 200 is ' +
    'not a delivered report');
}

// ---- reporting yourself is not a thing ----
{
  const line = src.match(/if\(!mine && typeof _reportBtn==='function'\)\{[\s\S]{0,420}?\}/);
  assert(line, 'the chat flag is gated on the line not being yours');
}

// ---- one dialog, one in flight ----
{
  const f = extractFunction('openReportDialog', src);
  assert(/if\(_reportBusy\) return;/.test(f), 'a second report cannot be started while one is in flight');
  assert(/_reportBusy = false;/.test(f), '...and the flag is always cleared, including on the error path');
  assert(/if\(!vals\) return;/.test(f), 'cancelling sends nothing — verified live: request count unchanged');
}

// ---- the two surfaces ----
assert(/Report this message/.test(src), 'chat lines are reportable');
assert(/Report this level/.test(src), 'community levels are reportable');
{
  const f = extractFunction('_reportBtn', src);
  assert(/setAttribute\('aria-label'/.test(f), 'the flag announces itself — build 1347 is not undone here');
  assert(/e\.stopPropagation\(\)/.test(f),
    'and it stops the event, or reporting a community row would also PLAY it (build 1147’s lesson)');
}

// ---- uiPromptForm gained a select, additively ----
{
  const f = extractFunction('uiPromptForm', src);
  assert(/if\(f\.options && f\.options\.length\)/.test(f), 'a field with options becomes a <select>');
  assert(/inp=document\.createElement\('input'\); inp\.type='text'/.test(f),
    '...and a field without them is EXACTLY the text input every existing caller already gets');
  assert(/card\.appendChild\(inp\); inputs\.push\(inp\);/.test(f),
    'both land in the same `inputs` array, so the callback still receives values in order and no existing ' +
    'caller changes shape');
}

done('build 1351: chat lines and community levels can be reported, and a missing backend says so');
