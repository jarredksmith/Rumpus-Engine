import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 362: fold headers are title + muted subtitle in a column, so long descriptions wrap cleanly
// under the title instead of fighting it on one line (the "Physics & destruction" header wrapped badly).

const ef = extractFunction('edFold');
assert(/function edFold\(host, id, title, openDefault, subtitle\)\{/.test(ef), 'edFold takes a separate subtitle');
assert(/sec\.className='edSection'/.test(ef) && /body\.className='edSecBody'/.test(ef), 'edFold uses the shared edSection/edSecBody accordion structure');
assert(/head\.innerHTML = '<span class="edCaret">/.test(ef) && /<\/span>'\+title;/.test(ef), 'title rendered in the caret header (matches top-level sections)');
assert(/if\(subtitle\)\{[^}]*sub\.textContent=subtitle;/.test(ef), 'subtitle rendered when provided, muted + smaller');
assert(/body\.appendChild\(sub\)/.test(ef), 'subtitle goes inside the body so long descriptions wrap cleanly');
// the arrow toggle still works against the dedicated arrow span, not head.firstChild
assert(/sec\.classList\.toggle\('collapsed'\)/.test(ef), 'toggle flips the collapsed class (CSS rotates the caret)');

// the four inspector folds pass a clean (title, false, subtitle) triple — no embedded <b>/em-dash
for(const [id, title, host] of [['signals','Signals','behaveHost'],['mech','Mechanism','motionHost'],['waypath','Waypoint path','motionHost'],['physdest','Physics & destruction','motionHost']]){   // build 989 homes
  assert(src.indexOf("edFold("+host+", '"+id+"', '"+title+"', false, '") >= 0, id+' fold uses title + subtitle');
}
assert(!/edFold\([^)]*<b>/.test(src), 'no fold still jams a bold title into the header string');
done();
