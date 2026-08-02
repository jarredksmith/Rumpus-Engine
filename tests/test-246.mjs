import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 348: 'Signals only' mechanism trigger — no autoplay, no E prompt, moves only via signals.

assert(/\[\['auto','Auto'\],\['interact','E Activate'\],\['signal','Signals only'\]\]/.test(src), 'third trigger option in the editor');
assert(/if\(a\.trig==='interact' \|\| a\.trig==='signal'\)\{ const tgt=a\.dest\?1:0;/.test(src), 'signal-trig is dest-driven, not auto-running');
// proximity scan only ever offers trig==='interact' — signal-trig props get no prompt and no E
assert(/a\.trig!=='interact'\) continue;/.test(extractFunction('checkProximity')), 'prompt scan excludes anything not E-triggered');

// level check rule, executed: an unwired signals-only mech is flagged; a wired one is clean
const li = new Function('propModels','pickupSpots','POWERUP_KINDS','keyDisplayName','pickupsOn','audioZones','cineCfg',
  // build 1300: levelIssues records WHERE each issue is, beside the message. This rig runs it in an
  // empty scope, so it supplies an inert recorder — the locators are build 1300's own test's business.
  'const _issueFind = new Map(); const _issueAt = (m)=>m;\n' +
  extractFunction('levelIssues') + '\nreturn levelIssues();');
const run = (props) => li(props, [], {}, c=>c, true, [], { on:false });
const mech = (tag) => ({ userData:{ tag, xa:{ on:true, trig:'signal' } } });
assert(run([ mech('gate') ]).some(m=>/never move/.test(m)), 'unwired signals-only mech flagged');
assert(run([ mech(undefined) ]).some(m=>/no tag/.test(m)), 'untagged signals-only mech flagged with the reason');
assert(run([ mech('gate'), { userData:{ tag:'lever', signals:[{ when:'interacted', do:'toggle', target:'gate' }] } } ]).filter(m=>/never move/.test(m)).length === 0, 'wired one is clean');
done();
