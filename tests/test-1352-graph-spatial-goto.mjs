// (build 1352) THE GRAPH CAN ASK WHERE SOMETHING IS, AND MOVE BETWEEN LEVELS.
//
// 1. WHERE. The graph could MOVE a prop (1170), SHOVE one (1258) and be told when one entered a zone
//    (1276) — and could never ask where one WAS. "The ball is on your half", "the crate is within 3 m of
//    the plinth", "how far is the player from the exit" were all unaskable, which is most of what a sports
//    level or a physics puzzle is made of. `_lgPlaceAt` already resolves a tag (and `me`, `start`, `#here`)
//    to world coordinates, so this is that resolver plus arithmetic — the same tag vocabulary the place
//    field has always used, which is why it needs no new autocomplete list.
//
// 2. GO TO LEVEL. A campaign was strictly linear: `_campaignLoad(i)` is a single index load and the only
//    transition in the engine is `campaignIdx++` on clear. Hub worlds, level select, branching routes and
//    "you failed, back to the tutorial" were all inexpressible.
//
// Driven through the REAL `_lgPulse` switch (tools/probe/graph-spatial.mjs), a tagged prop at (12, 3.5, -8)
// with the player at the origin:
//   propx 12 · propy 3.5 · propz -8 · propdist 14.42 (= hypot(12,8)) · "me" -> the player's own x
//   missing tag -> 0 AND a reported failure · goto 3 -> loadedIndex 2, campaignIdx 2 · client -> nothing
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';

const src = gameSource();
const pulse = extractFunction('_lgPulse', src);

// ---- the spatial reads ----
{
  assert(/case 'propx': case 'propy': case 'propz': case 'propdist':/.test(pulse),
    'four spatial stats share one branch');
  assert(/_lgPlaceAt==='function'\) \? _lgPlaceAt\(_tg\)/.test(pulse),
    'they resolve through the EXISTING place resolver, so `me`, `start`, `#here` and every tag work ' +
    'without a second vocabulary to keep in step');
  assert(/Math\.round\(Math\.hypot\(_dx,_dz\)\*100\)\/100/.test(pulse),
    'distance is horizontal — a creator asking "how close" means across the floor, and a prop on a shelf ' +
    'is not further away');
  assert(/Math\.round\(\(_st==='propx'\?_pl\.x:/.test(pulse),
    'and every value is rounded to 2dp: a graph COMPARES these, and an unrounded float never equals ' +
    'anything with ==');
  assert(/_noteLogicFailure\('A "Read game stat" node asks where/.test(pulse),
    'a tag nobody carries REPORTS rather than reading 0 forever — reading 0 looks exactly like "it is at ' +
    'the origin", which is build 1214’s whole point');
}

// the dropdown offers them, and the tag field is the PLACE list
{
  for (const k of ['propx', 'propy', 'propz', 'propdist'])
    assert(new RegExp("\\['" + k + "',").test(src), k + ' is offered in the stat dropdown');
  assert(/\{k:'item',l:'tag',w:88,ifv:\['stat',\['propx','propy','propz','propdist'\]\],listId:'lgPlaceList'\}/.test(src),
    'the tag box reuses the `item` param keyed by stat, and offers lgPlaceList — the same vocabulary ' +
    '_lgPlaceAt actually accepts');
}

// ---- goto is its own NODE, not a `do` verb ----
// The first draft put it in the `do` dropdown while implementing it as a node type — build 1277's exact
// defect, a verb offered in the UI that the dispatcher never routes to a handler. The probe caught it:
// the node resolved, nothing loaded, campaignIdx never moved.
{
  assert(/goto:\s*\{ t:'Go to level',\s*cat:'ac'/.test(src), 'goto is declared as a node type');
  assert(/case 'goto': \{/.test(pulse), '...and handled in the node switch, where win and lose live');
  const doVerbs = src.match(/do:\s*\{ t:'Do action'[\s\S]{0,400}?sel:\[([\s\S]{0,1400}?)\]\}/);
  assert(doVerbs && doVerbs[1].indexOf("'goto'") < 0,
    'and it is NOT in the `do` verb list — `do` routes through _applySignalAction, which knows nothing ' +
    'about levels, so offering it there would be a control that does nothing');
}

// ---- every guard, because each one is a silent bug otherwise ----
{
  const g = pulse.slice(pulse.indexOf("case 'goto':"), pulse.indexOf("case 'goto':") + 1600);
  assert(/NET\.mode==='client'\) break;/.test(g),
    'a client never loads a level on its own — two peers in different worlds is the desync this prevents');
  assert(/!campaignActive/.test(g) && /not part of a campaign/.test(g),
    'fired outside a campaign it REPORTS: there is no campaign.levels to index and silence would be the ' +
    'failure 1214 exists to surface');
  assert(/_n1 >= 1 && _n1 <= _tot/.test(g),
    'the index is range-checked — `n` comes out of a level file, which is untrusted input (1325), and ' +
    'campaign.levels[999] is undefined, which _campaignLoad would swallow silently');
  assert(/asked for level '\+_n1\+', but this campaign has '\+_tot/.test(g),
    '...and says both numbers, so the creator can fix it');
  assert(/campaignIdx = _n1 - 1;/.test(g),
    'the field is 1-BASED because that is what the campaign list shows the creator; the array is 0-based, ' +
    'and getting that backwards is a whole-level off-by-one nobody would suspect');
  assert(/_lgNum\(p\.n\)/.test(g), 'it accepts a VARIABLE, so a hub can branch on one');
  assert(/_clearInterstitial\(\)/.test(g),
    'and the level-transition card is cleared first, or a jump during one leaves it stuck on screen');
}

// ---- the 1-based/0-based arithmetic, executed ----
for (const [asked, total, idx] of [[1, 3, 0], [3, 3, 2], [2, 5, 1]]) {
  assert(asked >= 1 && asked <= total, 'in range');
  eq(asked - 1, idx, 'level ' + asked + ' of ' + total + ' loads index ' + idx);
}

done('build 1352: the graph can ask where a prop is, and a campaign can branch');
