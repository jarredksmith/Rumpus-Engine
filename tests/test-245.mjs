import { gameSource, assert, done } from './harness.mjs';
import { readFileSync } from 'fs';
const src = gameSource();                              // script blocks only
const page = readFileSync(new URL('../breach.html', import.meta.url), 'utf8');   // markup lives outside gameSource
// build 346: the field manual (breach-help.html, same directory) is reachable from the menu and the editor.
// build 850: the menu button is id="manualBtn" — it used to share id="helpBtn" with Help & tutorials, which stole its click.
assert(/<button id="manualBtn" class="secBtn ghost"><svg class="eico"[^>]*>[\s\S]*?<\/svg>Field manual<\/button>/.test(page), 'menu button beside Instructions (icon, build 516)');
assert(/manualBtn'\); if\(hb\) hb\.onclick=\(\)=>\{ try\{ window\.open\('breach-help\.html','_blank'\); \}catch\(e\)\{\} \};/.test(src), 'menu opens the manual in a new tab');
assert(/<button id="edHelp" title="Open the field manual \(new tab\)">\?<\/button>/.test(src), '? button in the editor top bar');   // this one IS in script (panel innerHTML)
assert(/edHelp'\); if\(hq\) hq\.onclick=\(\)=>\{ try\{ window\.open\('breach-help\.html','_blank'\); \}catch\(e\)\{\} \};/.test(src), 'editor ? opens the same relative URL');
assert(!/jarredksmith\.github\.io[^'"]*breach-help/.test(src), 'URL stays relative — works on any host/fork');
done();
