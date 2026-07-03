// (build 853) 'OBJECTIVES & RULES' IS FIVE FOLDS — the longest flat scroll in the editor now groups as
// Objective & win / Waves & difficulty / Damage & death rules / Player options / Multiplayer spawn area,
// each an edSubSection with a remembered collapse state. The fold bodies are created UP FRONT, so display
// order is fixed regardless of code order — which also fixes a long-standing quirk: the per-objective
// settings (laps/rivals/survive-seconds/…) used to render BELOW the damage rules; they now sit with the
// objective picker where they belong.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
const panel = extractFunction('renderEditorFields');

// the five folds, in display order, into the game host
const foldBlock = panel.match(/const bObj = subSec[\s\S]{0,600}/)[0];
const order = [...foldBlock.matchAll(/const (b\w+) = subSec\('([^']+)', '(g_\w+)', (false|true), gHost\)/g)]
  .map(m=>({ v:m[1], title:m[2], key:m[3], collapsed:m[4] }));
eq(order.map(o=>o.title).join('|'), 'Objective & win|Waves & difficulty|Damage & death rules|Player options|Multiplayer spawn area', 'five folds in the intended order');
eq(order[0].collapsed, 'false', 'Objective & win starts open');
eq(order.filter(o=>o.collapsed==='true').length, 4, 'the other four start collapsed');
assert(new Set(order.map(o=>o.key)).size===5 && order.every(o=>o.key.startsWith('g_')), 'distinct g_* collapse keys (no collision with the World fold keys)');

// each block appends into its own fold, not the flat host
assert(/bObj\.appendChild\(obRow\)/.test(panel), 'objective picker → Objective & win');
assert(/if\(objectiveActive\(\)==='race'\)\{[\s\S]{0,1600}bObj\.appendChild\(rcLab\)/.test(panel), 'race laps/rivals settings live with the objective');
assert(/fdToggle=\(label, get, set\)=>\{[\s\S]{0,900}bDmg\.appendChild\(lab\)/.test(panel), 'fall/ragdoll/crush toggles → Damage & death rules');
assert(/\/\/ hit-number look[\s\S]{0,700}bDmg\.appendChild\(hnLab\)/.test(panel), 'hit numbers → Damage & death rules');
assert(/bWav\.appendChild\(gmRow\)/.test(panel), 'wave mode → Waves & difficulty');
assert(/bWav\.appendChild\(ugLab\)/.test(panel), 'upgrade cards → Waves & difficulty');
assert(/_chk=\(label, checked, on\)=>\{[\s\S]{0,900}bPly\.appendChild\(lab\)/.test(panel), 'unarmed/flashlight checks → Player options');
assert(/_flRow=\(label, min, max, step, get, set, fmt\)=>\{[\s\S]{0,900}bPly\.appendChild\(w\)/.test(panel), 'flashlight sliders → Player options');
assert(/bMps\.appendChild\(onLab\)/.test(panel), 'spawn region → Multiplayer spawn area');
// nothing appends to the bare gHost anymore (the folds themselves are its only children)
eq((panel.match(/gHost\.appendChild/g)||[]).length, 0, 'no stray flat appends left in the section');
assert(!/hint\(gHost,/.test(panel) && !/hint\(gHost /.test(panel), 'no stray flat hints either');

// the subtitle tells the new truth
assert(/game:\s*'Five folds: objective & win, waves, damage & death rules, player options, multiplayer spawns\.'/.test(src), 'SEC_SUB.game describes the folds');

done('build 853: Objectives & rules split into five remembered folds; per-objective settings rejoined the picker');
