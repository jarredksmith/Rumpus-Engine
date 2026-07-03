// (build 847) HONEST SECTION TITLE — 'Waves & objectives' actually holds objective + waves PLUS fall damage,
// ragdoll, crush damage, unarmed/hands, flashlight, spawn region and hit numbers. Renamed 'Objectives & rules'
// with a subtitle that says so, so first-time users know where the gameplay rules live. (The deeper fold-split
// of this section is queued — its row helpers all append straight to the section host.)
import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
assert(/sec\('Objectives &amp; rules', 'game', '<div id="edGame"><\/div>'\)/.test(src), 'the section title covers its contents');
assert(/game:\s*'Five folds: objective & win, waves, damage & death rules, player options, multiplayer spawns\.'/.test(src), 'the subtitle names what actually lives inside');   // build 853: the section renders as folds now
done('build 847: the Gameplay tab’s main section is honestly titled');
