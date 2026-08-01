import { gameSource, assert, done } from './harness.mjs';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const src = gameSource();
// build 1253: the shipped docs tell the truth (audit Gap 3). The in-game help no longer claims a
// GitHub account is needed to publish (false since build 958), surfaces the instant game-page
// publish, and the export button names the real file format. The field manual is rebranded and
// carries a What's-new section covering the ~160 undocumented builds.

assert(!/GitHub account needed/.test(src), 'the help topic no longer claims an account is needed to publish');
assert(/no account needed; approved levels appear/.test(src), 'it states the truth instead');
assert(/Publish game page<\/b>: an instant \/game\/ URL/.test(src), 'and finally surfaces the instant game-page publish');
assert(/Export \.rumpus<\/button>/.test(src) && /Import level<\/button>/.test(src),
  'the export button names the real format (it was the third different name for one file)');

const help = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'breach-help.html'), 'utf8');
assert(/RUMPUS <span>ENGINE<\/span>/.test(help), 'the manual wordmark is rebranded (300 builds late)');
assert(!/BRE<span>A<\/span>CH/.test(help), 'the old wordmark is gone');
assert(/id="whats-new"/.test(help), 'the manual carries a What’s-new section');
for (const feature of ['Snapping', 'Copy &amp; paste', 'Drag a .glb', 'Wave manifests', 'Auto focus', 'shell by shell', 'Publish game page', 'particle emitters']) {
  assert(help.includes(feature), `What's-new covers: ${feature}`);
}
assert(!/export\/import <code>\.breach<\/code> files/.test(help), 'the .breach export claim is corrected');
assert(/<code>\.rumpus<\/code>/.test(help), 'the manual names the real export format');
assert(/\.breach<\/code> and <code>\.json<\/code> exports still import/.test(help), 'while keeping the compat promise explicit');

done('build 1253: the docs tell the truth — help topic corrected, export label real, manual rebranded with a What’s-new section');
