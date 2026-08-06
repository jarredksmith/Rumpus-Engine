// build 1423: Level Check says when the objective cannot be completed.
//
// It has reported lights, texture memory, missing models, third-party hosts, locks without keys and the
// graph's own last-run failures for a long time — and said NOTHING about the one setting that decides
// whether a level can be finished. Three of the eight modes are silently unwinnable when under-authored,
// and none of the three announces itself in play:
//
//   destroy  the win test is `_destroyTotal>0 && remain<=0`, so with no usable target the HUD reads
//            "NO TARGETS SET" and the run has no ending
//   puzzle   nothing spawns and `objectiveTick` has no puzzle branch — a win action is the ONLY exit
//   race     with no Start-line piece `_raceStartO` is null, the lap never arms, the HUD hides
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the three predicates, executed
const mk = (name, extra) => new Function('propModels', 'logicGraph', 'TRACK_PIECES',
  (extra || '') + extractFunction(name) + '; return ' + name + ';');
const P = (ud) => ({ userData: ud });

{ // which props a Destroy mission can actually finish on
  const fn = (props) => mk('_objectiveTargets')(props, { nodes: [] }, {})();
  {
    const r = fn([
      P({ objective: true, shootable: true, breakable: true }),
      P({ objective: true, phys: {}, breakable: true }),
      P({ objective: true, phys: {} }),                       // breakable unset = the default, true
      P({ shootable: true, breakable: true }),                // damageable, not marked
    ]);
    eq(r.usable.length, 3, 'a static target, a dynamic prop and one that never mentions breakable all count');
    eq(r.marked.length, 3, '...and only the marked ones are marked');
  }
  {
    const r = fn([
      P({ objective: true, shootable: true, breakable: false }),   // build 1421: takes hits forever
      P({ objective: true }),                                      // marked but not damageable at all
    ]);
    eq(r.usable.length, 0,
      'an UNBREAKABLE target and a non-damageable one are both unusable — the first can never reach 0 HP ' +
      'and the second can never be hurt, so a mission resting on either can never end');
    eq(r.marked.length, 2, '...but both are still reported as marked, which is what the row is about');
  }
  eq(fn([]).usable.length, 0, 'an empty level has none');
}

{ // is there ANY authored way to end the room
  const fn = (nodes, props) => mk('_hasWinPath')(props || [], { nodes }, {})();
  eq(fn([{ type: 'win' }]), true, 'a Win level node ends it');
  eq(fn([{ type: 'do', p: { verb: 'win' } }]), true, '...and so does a Do node set to Win level');
  eq(fn([{ type: 'goto', p: { n: 2 } }]), true,
    'and so does Go to level: a campaign room ends by loading the next one (build 1394), and calling that ' +
    '"no win path" would fire on every room of a multi-room game — which is the shape this engine now encourages');
  eq(fn([], [P({ signals: [{ when: 'interacted', do: 'win' }] })]), true, 'a prop signal that wins counts');
  eq(fn([{ type: 'lose' }, { type: 'toast' }], [P({ signals: [{ when: 'used', do: 'toggle' }] })]), false,
    'a Lose node, a message and an unrelated signal are not an exit');
  eq(fn([], [P({})]), false, 'and a bare level has none');
  eq(fn([], [null]), false, '...and a null hole in propModels does not throw (build 1389)');
}

{ // a race needs its start line
  const fn = (props) => mk('_raceHasStart')(props, { nodes: [] }, { straight: {}, startline: { start: true } })();
  eq(fn([P({ src: 'straight' })]), false, 'track pieces alone do not arm a lap');
  eq(fn([P({ src: 'straight' }), P({ src: 'startline' })]), true, '...a Start-line piece does');
  eq(fn([P({ src: 'crate' })]), false, 'and an ordinary prop is not a track piece');
}

// ---------------------------------------------------------------- the rows, and what they must not do
{
  const fn = extractFunction('levelIssues');
  assert(/mode==='destroy'/.test(fn) && /mode==='puzzle'/.test(fn) && /mode==='race'/.test(fn),
    'all three modes are checked');
  assert(/NO TARGETS SET/.test(fn),
    'the Destroy row names the HUD line the player would actually see, so the report and the symptom match');
  assert(/_issueAt\(/.test(fn.slice(fn.indexOf("mode==='destroy'"), fn.indexOf("mode==='puzzle'"))),
    'the mixed case is CLICKABLE (build 1300) — there is a specific prop to go and fix, unlike the ' +
    'level-wide cases, which have nothing to point at');
  // ...and the five modes that provision themselves must never be nagged about
  for (const m of ['eliminate', 'survival', 'extraction', 'defend', 'escort'])
    assert(!new RegExp("mode==='" + m + "'").test(fn), 'nothing is reported for ' + m);
}
{
  // The renderer sets `d.textContent = msg`, and it MUST stay that way: other rows interpolate
  // level-authored strings (key names, audio-zone names, hostnames — build 1335/1325). So a message
  // carrying markup would render as literal tags. This build's first draft did exactly that.
  const r = extractFunction('renderLevelIssues');
  assert(/d\.textContent=msg;/.test(r), 'issue rows are set as text, never as markup');
  const fn = extractFunction('levelIssues');
  const rows = fn.slice(fn.indexOf("build 1423: the objective"), fn.indexOf("mode==='race'"));
  assert(rows.length > 200, 'the 1423 block extracted');
  assert(!/<b>|<\/b>|<i>|<br/.test(rows), '...so the 1423 rows carry no markup at all');
}
{ // advisory, never a refusal (build 1282's rule) — the check is a heuristic and a creator may be mid-build
  const i = src.indexOf('Level check');
  assert(i > 0, 'the panel header exists');
  assert(/saving still works/.test(src.slice(i, i + 300)),
    'the header still says saving works regardless, so a new row can never read as a block');
}

done('build 1423: a Destroy mission with no targets, a Puzzle with no exit and a Race with no start line all say so');
