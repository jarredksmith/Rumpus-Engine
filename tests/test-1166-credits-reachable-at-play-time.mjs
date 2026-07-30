// build 1166: one authoritative credits surface, reachable in every session.
//
// CLAUDE.md has carried "asset licensing + a credits screen are release blockers" for hundreds of builds.
// Attribution lived in two systems that never met: per-prop `userData.attribution` (placed CC-BY models)
// and the `assetCredits` set (enemy/pickup/chest/coin/attachment models, sounds). A CC-BY licence is only
// satisfied if the credit is REACHABLE at play time — so the pause menu now carries an Asset credits button
// in every session, no creator opt-in, and the Level Check panel flags a Sketchfab model with no recorded
// attribution as the licensing exposure it is.
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the unified list, executed
{
  const fn = new Function('assetCredits', 'propModels',
    extractFunction('levelCreditsList') + '\nreturn levelCreditsList;');
  const credits = new Set(['Poly Haven — polyhaven.com (CC0)', 'Zombie by A. Author (CC-BY) via Poly Pizza']);
  const props = [
    { userData: { attribution: 'Crate by B. Builder (CC-BY) via Sketchfab' } },
    { userData: { attribution: '  Crate by B. Builder (CC-BY) via Sketchfab  ' } },   // dup w/ whitespace
    { userData: {} }, null,
    { userData: { attribution: 'Zombie by A. Author (CC-BY) via Poly Pizza' } },      // dup across systems
  ];
  const list = fn(credits, props)();
  eq(list.length, 3, 'both systems merge and dedupe (set + prop attributions, whitespace-insensitive)');
  assert(list.includes('Crate by B. Builder (CC-BY) via Sketchfab'), 'a placed model\'s credit is in the one list');
  assert(list.includes('Poly Haven — polyhaven.com (CC0)'), '...beside the non-prop slots\' credits');
  const sorted = list.slice().sort((a, b) => a.localeCompare(b));
  eq(list.join('|'), sorted.join('|'), 'stable sorted order, so the screen does not reshuffle between opens');
}

// ---------------------------------------------------------------- the surface
{
  assert(/<button id="pauseCredits" class="pBtnGhost">/.test(html), 'the pause menu carries an Asset credits button');
  assert(/pcr\.onclick=\(\)=>\{ if\(typeof showCreditsModal==='function'\) showCreditsModal\(\); \}/.test(src),
    '...wired to the modal');
  const modal = extractFunction('showCreditsModal');
  assert(/levelCreditsList\(\)/.test(modal), 'the modal renders the unified list');
  assert(/d\.textContent='· '\+t;/.test(modal),
    'entries render via textContent — attributions are UNTRUSTED level data, never innerHTML');
  assert(/ENGINE_CREDITS\.forEach/.test(modal), 'and the engine\'s own dependencies are always credited');
  assert(/uses no externally-credited assets/.test(modal), 'an empty list says so instead of showing a blank card');
}
{
  const ec = src.match(/const ENGINE_CREDITS = \[[\s\S]*?\];/)[0];
  for (const dep of ['three\\.js', 'Rapier', 'PeerJS', 'fflate'])
    assert(new RegExp(dep).test(ec), 'engine credits name ' + dep.replace('\\\\', ''));
}

// ---------------------------------------------------------------- the linter half
{
  const li = extractFunction('levelIssues');
  assert(/\/\^sketchfab:\/i\.test\(String\(o\.userData\.src\|\|''\)\) && !o\.userData\.attribution/.test(li),
    'the Level Check flags a Sketchfab model with no recorded attribution');
  assert(/CC-BY requires the credit to ship/.test(li), '...and says WHY, so the creator learns the rule');
}

done('build 1166: the two attribution systems merge into one deduped list, the pause menu shows it in every session (untrusted strings via textContent, engine deps always included), and the Level Check flags un-attributed Sketchfab models — the declared release blocker now has its surface');
