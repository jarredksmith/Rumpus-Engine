import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();

// build 525: editorOpen is declared at the very top of GAME_START (next to RAD/DEG) so async boot
// callbacks (audio/music/GLB loaders) can never read it during its temporal dead zone.
const decls = src.match(/\blet editorOpen\b/g) || [];
assert(decls.length === 1, 'exactly one editorOpen declaration (no duplicate)');
const idxDecl = src.indexOf('let editorOpen');
const idxRad  = src.indexOf('const RAD = Math.PI/180');
assert(idxRad >= 0 && idxDecl > idxRad && (idxDecl - idxRad) < 200, 'editorOpen declared right after RAD/DEG at the top');
// it must come before the first function that reads it
const idxFirstUse = src.indexOf('typeof editorOpen');
assert(idxFirstUse > idxDecl, 'editorOpen declared before its first use (TDZ-safe)');

// build 525: pointer-lock request swallows the async promise rejection Chrome can throw
assert(/const p = el\.requestPointerLock\(\);[\s\S]{0,80}p\.catch\(\(\)=>\{\}\)/.test(src), 'tryPointerLock catches the rejected lock promise');
done();
