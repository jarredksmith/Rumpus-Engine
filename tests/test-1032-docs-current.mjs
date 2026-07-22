// (build 1032) THE HELP DOCS CATCH UP — the field manual documents every feature shipped in the
// ~1000-1031 run: the auto-rigger, the logic graph, prefabs, host match rules, the new lobby,
// smarter bots, bullet decals + everyone's-gunfire visibility, all four build-rotate inputs, and
// the regrouped home menu. Stale advice ("auto-rig it on Mixamo") now points at the in-app tool.
import { readFileSync } from 'node:fs';
import { html, assert, eq, done } from './harness.mjs';
const manual = readFileSync(new URL('../breach-help.html', import.meta.url), 'utf8');

// ---- new feature chapters exist and say the load-bearing things ----
assert(/<h3>Prefabs<\/h3>/.test(manual), 'Prefabs section (Build tab)');
assert(/local overrides<\/b>/.test(manual) && /Detach<\/b> disconnects a copy/.test(manual),
  '...and it explains overrides + detach, the subtle half of the feature');
assert(/embeds the prefabs\nit uses<\/b>/.test(manual) || /embeds the prefabs/.test(manual), '...and that levels carry their prefabs');
assert(/<li><b>Auto-rigger<\/b>/.test(manual) && /chin → wrists → elbows → knees → groin/.test(manual),
  'Auto-rigger section with the marker order');
assert(!/upload to Mixamo, download the rigged T-pose/.test(manual), 'the old "go use Mixamo" advice is gone');
assert(/<h2 id="logic">/.test(manual) && /Visual logic — the Logic graph/.test(manual), 'Logic graph chapter');
for(const n of ['On start','Branch','Counter','Delay','Repeat','Random','Only once','Set variable','Change variable','Do action','Show message','Send event'])
  assert(manual.includes('<i>'+n+'</i>'), 'logic chapter lists node: '+n);
assert(/\{variable\}<\/code> interpolation/.test(manual), '...and the {var} message trick');
assert(/→ Logic event<\/td>/.test(manual), 'the signal verb table gained the graph bridge');
assert(/graph runs on the <b>host<\/b>/.test(manual) && /pauses while the editor is open/.test(manual),
  '...with the two gotchas players will actually hit');

// ---- multiplayer chapter: rules, lobby, bots, podium ----
assert(/<b>Match rules<\/b>/.test(manual) && /starting grenades<\/b> \(0–6\)/.test(manual), 'host match rules documented');
assert(/lobby backdrop image<\/b>/.test(manual), 'creator lobby backdrop documented');
assert(/LOADING WORLD %<\/b>/.test(manual), 'joiner loading percent documented');
assert(/podium ceremony/.test(manual) && /MVP callout/.test(manual), 'end-of-match ceremony documented');
assert(/throw grenades/.test(manual) && /random characters from the level's roster<\/b>/.test(manual), 'smarter bots documented');

// ---- weapons chapter: decals + gunfire visibility ----
assert(/<b>Bullet holes<\/b>/.test(manual) && /upload your own decal image<\/b>/.test(manual), 'bullet decals documented');
assert(/joiners', bots' and enemies' tracers stop at the wall/.test(manual), 'everyone’s-gunfire visibility documented');

// ---- controls: all four rotate inputs; the home menu matches build 1023 ----
assert(/<kbd>R<\/kbd> \(<kbd>Shift<\/kbd>\+<kbd>R<\/kbd> rotates back\), <b>RB\/LB<\/b> on a controller, or the <b>ROT<\/b> chip on touch/.test(manual),
  'build-mode rotation documents scroll, R, pad and touch');
assert(!/<b>Scroll<\/b> rotates 90°,/.test(manual), 'the scroll-only wording is gone');
assert(/Its equal twin <b>Build \/ edit level<\/b>/.test(manual) && /<b>Community levels<\/b>/.test(manual),
  'the home-menu walkthrough matches the regrouped menu');
assert(/Logic graph<\/b> · <b>Cutscenes<\/b>/.test(manual), 'the Gameplay-tab crumbs include the new section');

// ---- the in-game instructions card ----
assert(/<b>R<\/b> reload \(rotates the ghost while building\)/.test(html), 'the quick controls card mentions the build-mode R');

done('build 1032: the field manual + instructions card document the full 1000-1031 feature run');
