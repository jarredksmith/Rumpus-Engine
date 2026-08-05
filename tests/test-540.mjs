import { gameSource, extractFunction, assert, done } from './harness.mjs';
/* build 1400: the two byte-identical `if(level.game){...}` loader blocks became ONE `_applyGameCfg(g)` — build 1280's fix for props, applied to the game block after five settings turned out to be written and never read back. So `level.game.` reads `g.` and the count is 1, not 2. The assertion's intent — this field is restored by the level loaders — is unchanged, and is now STRONGER: both loaders provably route through the one function, which `test-1400` pins by count. */

const src = gameSource();
// build 694: authorable win/lose screen messages. gameCfg.winText / loseText render on the victory / defeat
// screens (escaped), so an adventure can end on a line of story. Puzzle mode also gets sensible default headlines.

// --- config + persistence ---
assert(/winText:  \(savedLevel && savedLevel\.game && typeof savedLevel\.game\.winText==='string'\)  \? savedLevel\.game\.winText\.slice\(0,240\)  : ''/.test(src), 'gameCfg.winText seeded from the save');
assert(/loseText: \(savedLevel && savedLevel\.game && typeof savedLevel\.game\.loseText==='string'\) \? savedLevel\.game\.loseText\.slice\(0,240\) : ''/.test(src), 'gameCfg.loseText seeded from the save');
assert(/winText: \(gameCfg\.winText\|\|''\)\.slice\(0,240\), loseText: \(gameCfg\.loseText\|\|''\)\.slice\(0,240\)/.test(src), 'serialized with the level');
assert((src.match(/gameCfg\.winText = \(typeof g\.winText==="string"\)/g)||[]).length === 1, 'restored in both load paths');

// --- the screens render the messages, escaped ---
const gw = extractFunction('gameWon');
assert(/gameCfg\.winText \? '<div class="sub"[^']*'\+_creditEsc\(gameCfg\.winText\)\+'<\/div>' : ''/.test(gw), 'the victory screen shows winText (escaped)');
assert(/gameCfg\.objective==='puzzle' \? 'SOLVED'/.test(gw), 'puzzle wins read SOLVED');
const eg = extractFunction('endGame');
assert(/gameCfg\.loseText \? '<div class="sub"[^']*'\+_creditEsc\(gameCfg\.loseText\)\+'<\/div>' : ''/.test(eg), 'the defeat screen shows loseText (escaped)');
assert(/gameCfg\.objective==='puzzle' \? 'YOU DIED' : \('REACHED WAVE '\+wave\)/.test(eg), 'puzzle deaths read YOU DIED, not a wave count');

// --- editor fields ---
const panel = extractFunction('renderEditorFields');
assert(/<b>End-screen messages<\/b>/.test(panel), 'an end-screen-messages section exists');
assert(/gameCfg\.winText=wi\.value\.slice\(0,240\)/.test(panel) && /gameCfg\.loseText=li\.value\.slice\(0,240\)/.test(panel), 'both message fields write the config');

done('build 694: custom win / lose screen messages');
