// (build 870) THE TITLE BOX STOPS MATTERING — GitHub issue forms can't hide the title field, so the
// pipeline makes it irrelevant instead: the template's intro says so in bold, and if a submitter fills
// in ONLY the title (leaving the Level name field empty), the publisher now uses the title — minus any
// [Level] prefix — as the name. Both paths publish; only both-empty is rejected.
import { assert, eq, done } from './harness.mjs';
import { readFileSync } from 'fs';
import { parseIssue, validateSubmission } from '../.github/scripts/publish-level.mjs';

const mk = (name)=>'### Level name\n\n'+(name||'_No response_')+'\n\n### Your name (shown in the gallery)\n\nA\n\n### Level JSON\n\n```json\n'+JSON.stringify({ world:{}, props:[], game:{objective:'puzzle'} })+'\n```\n';

// title-only submission publishes, prefix stripped
const v1 = validateSubmission(parseIssue(mk('')), 12, '[Level] Night Market');
assert(v1.ok, 'empty name + filled title publishes');
eq(v1.entry.name, 'Night Market', 'the [Level] prefix is stripped from the fallback');
eq(v1.entry.file, 'night-market-12.json', '...and slugs normally');
// form field wins when both are present
eq(validateSubmission(parseIssue(mk('Form Name')), 12, '[Level] Title Name').entry.name, 'Form Name', 'the Level name field takes precedence');
// untouched default title alone is still empty
const v3 = validateSubmission(parseIssue(mk('')), 12, '[Level] ');
assert(!v3.ok && /Level name/.test(v3.reason), 'a bare untouched title is not a name');

// the template tells the submitter the title doesn't matter
const tpl = readFileSync(new URL('../.github/ISSUE_TEMPLATE/submit-level.yml', import.meta.url), 'utf8');
assert(/The title box above doesn't matter/.test(tpl), 'the form says so up top');
const wf = readFileSync(new URL('../.github/workflows/publish-level.yml', import.meta.url), 'utf8');
assert(/ISSUE_TITLE: \$\{\{ github\.event\.issue\.title \}\}/.test(wf), 'the workflow passes the title through');

done('build 870: the issue title is optional everywhere — explained in the form, honored as a name fallback');
