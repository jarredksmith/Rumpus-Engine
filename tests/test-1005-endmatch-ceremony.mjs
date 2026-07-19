// (build 1005) END-OF-MATCH CEREMONY — the shooter VICTORY/DEFEAT screen gains a real
// standings board: ranked rows with podium colors in FFA, side-by-side team columns with a
// winning-team glow + MVP callout in team modes, the player's own row highlighted. Row
// collection is factored out of the live scoreboard into _sbRows so both views rank the
// same way. The pinned button contract (replayBtn/startBtn handlers) is untouched.
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- executable: the standings builder, FFA + team, against a mock match ----
const fns = extractFunction('_sbRows', src) + '\n' + extractFunction('_resultStandingsHTML', src);
const mk = (env) => new Function('NET','teamMode','TEAM_NAME','teamTotal','killName','_esc',
  fns + '\nreturn _resultStandingsHTML(env.w, env.wt);'.replace('env.w', String(env.w)).replace('env.wt', String(env.wt)))(
  env.NET, env.teamMode, ['RED','BLUE'], env.teamTotal, (id)=>env.names[id]||('P'+id), (t)=>String(t));

// FFA: three players, I am mid-table
{
  const NET = { myId: 7, name: 'Me', duelScore: { 3: 5, 7: 2, 9: 0 }, players: { 3:{name:'Ada'}, 9:{name:'Bo'} }, teams: {} };
  const h = mk({ NET, teamMode: ()=>false, teamTotal: ()=>0, names: {3:'Ada', 9:'Bo'}, w: 3, wt: null });
  assert(/class="drBoard"/.test(h) && !/drTeams/.test(h), 'FFA renders a single board');
  const order = [...h.matchAll(/drName">([^<]+)</g)].map(m=>m[1]);
  eq(order.join('|'), 'Ada|Me (you)|Bo', 'rows ranked by kills, self tagged (you)');
  assert(/drRow me"><span class="drPlace" style="color:#c9d6e2">2<\/span>/.test(h), 'my row highlighted, 2nd place gets the silver color');
  assert(/color:#ffd75e">1</.test(h) && /color:#d29a6b">3</.test(h), 'gold + bronze podium colors on 1st/3rd');
  assert(/drK">5</.test(h) && /drK">2</.test(h), 'kill counts shown');
}
// FFA overflow: only the top 8 rows render, the rest are counted honestly
{
  const duelScore = {}; const players = {}; for(let i=1;i<=11;i++){ duelScore[i]=12-i; if(i!==7) players[i]={name:'P'+i}; }
  const NET = { myId: 7, name: 'Me', duelScore, players, teams: {} };
  const h = mk({ NET, teamMode: ()=>false, teamTotal: ()=>0, names: {}, w: 1, wt: null });
  eq([...h.matchAll(/class="drRow/g)].length, 8, 'board caps at 8 rows');
  assert(/\+3 more/.test(h), 'overflow players are counted, not silently dropped');
}
// Team mode: two columns, winner glows, MVP is the top fragger
{
  const NET = { myId: 7, name: 'Me', duelScore: { 3: 6, 7: 4, 9: 1 }, players: { 3:{name:'Ada'}, 9:{name:'Bo'} },
    teams: { 3: 0, 7: 1, 9: 1 } };
  const h = mk({ NET, teamMode: ()=>true, teamTotal: (tm)=> tm===0?6:5, names: {3:'Ada', 9:'Bo'}, w: 3, wt: 0 });
  assert(/drBoard drTeams/.test(h), 'team result renders the two-column board');
  assert(/drTeamCol drWin"><div class="drTeamHead" style="color:#ff8a93">RED · 6/.test(h), 'winning team column glows and shows its total');
  assert(/drTeamHead" style="color:#9fd0ff">BLUE · 5/.test(h), 'losing team column shows its total without the glow');
  assert(/MVP · Ada · 6 kills/.test(h), 'MVP callout names the top fragger');
  const blue = h.slice(h.indexOf('BLUE'));
  const bo = [...blue.matchAll(/drName">([^<]+)</g)].map(m=>m[1]);
  eq(bo.join('|'), 'Me (you)|Bo', 'players sit in their own team column, ranked within it');
}
// empty match (no scores, no players) -> no board, no crash
{
  const NET = { myId: 0, name: 'Me', duelScore: {}, players: {}, teams: {} };
  const h = mk({ NET, teamMode: ()=>false, teamTotal: ()=>0, names: {}, w: 0, wt: null });
  assert(/drBoard/.test(h) && /Me \(you\)/.test(h), 'solo host still sees a one-row board');
}

// ---- wiring: the ceremony rides the existing result screen, pinned contract intact ----
const sdr = extractFunction('showDuelResult', src);
assert(/\$\{_resultStandingsHTML\(winnerId, winnerTeam\)\}/.test(sdr), 'the standings board sits between subtitle and buttons');
assert(/drBanner \$\{win\?'drVictory':'drDefeat'\}/.test(sdr), 'banner carries the win/defeat class (glow color from CSS, not inline)');
assert(/clearKillFeed\(\);/.test(sdr) && /<button id="replayBtn">/.test(sdr), 'kill-feed clear + Replay contract untouched');
assert(/const rows=_sbRows\(\);/.test(extractFunction('renderScoreboard', src)), 'the live scoreboard shares the same ranked rows');

// ---- CSS ----
assert(/\.drBanner\.drVictory \{ color:var\(--accent\); text-shadow:0 0 36px rgba\(var\(--accent-rgb\),0\.55\); \}/.test(html), 'victory banner glows in the accent');
assert(/\.drBanner\.drDefeat \{ color:#ff2d55;/.test(html), 'defeat banner glows red');
assert(/\.drRow\.me \{ background:rgba\(var\(--accent-rgb\),0\.16\);/.test(html), 'own row highlighted');
assert(/\.drTeamCol\.drWin \{ border-color:rgba\(var\(--accent-rgb\),0\.45\);/.test(html), 'winning team column outlined');
assert(/\.drBoard \{[^}]*max-height:44vh; overflow-y:auto;/.test(html), 'big lobbies scroll instead of pushing the buttons off-screen');
assert(/body\.touch \.drBanner \{ font-size:36px;/.test(html), 'banner scales down on phones');

done('build 1005: end-of-match ceremony — ranked standings, team columns, MVP on the result screen');
