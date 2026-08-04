import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 498: bots and enemies finally react to fire. A central botHurt / enemyHurt funnels all damage so a
// non-fatal hit plays a directional flinch (hitFront/Back/Left/Right) and a kill plays a directional death
// (bots linger -> dieFront/dieBack; enemies are removed instantly). Mirrors hurtDir's direction math, with a
// short flinch cooldown so rapid fire can't stun-lock the body.

// ---- wiring ----
assert(/function _reactDir\(dx, dz, yaw\)/.test(src), 'shared hit-bearing -> direction helper exists');
assert(/function botHurt\(b, dmg, sx, sz\)/.test(src), 'central bot damage hook exists');
assert(/function enemyHurt\(en, dmg, sx, sz, byEnemy\)/.test(src), 'central enemy damage hook exists');   // build 1355: + who dealt it
assert(/const d=_reactDir\(sx-b\.pos\.x, sz-b\.pos\.z, b\.yaw\); dieSlot = \(d==='Front'\)\?'dieBack'/.test(src), 'botDie picks a directional death (front hit -> fall backward)');
assert(/if\(b\._evt && performance\.now\(\)<b\._evt\.until\) st=b\._evt\.slot;/.test(src), 'bot resolver plays the flinch one-shot');
assert(/if\(en\._evt && nowMs < en\._evt\.until\) st = en\._evt\.slot;/.test(src), 'enemy resolver plays the flinch one-shot');

// every damage site routes through the hooks: botDie/killEnemy now exist only as the definition + the hook call
assert((src.match(/botDie\(/g)||[]).length===2, 'botDie is only called from botHurt (+ its definition)');
assert((src.match(/killEnemy\(/g)||[]).length===2, 'killEnemy is only called from enemyHurt (+ its definition)');
// spot-check a couple of consolidated sites keep their kill-credit / FX
assert(/if\(botHurt\(o, dmg, b\.pos\.x, b\.pos\.z\)\) registerDuelKill\(b\.id, o\.id\)/.test(src), 'bot-vs-bot melee routes through botHurt, credits the kill');
assert(/const _ek = enemyHurt\(en, dealt, player\.pos\.x, player\.pos\.z\)/.test(src), 'the main bullet->enemy hit routes through enemyHurt');

// ---- executable: _reactDir (mirrors hurtDir) ----
const _reactDir = new Function('return (' + extractFunction('_reactDir') + ')')();
// facing -Z (yaw 0): dx,dz = source - actor
assert(_reactDir(0, -5, 0) === 'Front', 'source ahead -> Front');
assert(_reactDir(0,  5, 0) === 'Back',  'source behind -> Back');
assert(_reactDir(5,  0, 0) === 'Right', 'source to screen-right -> Right');
assert(_reactDir(-5, 0, 0) === 'Left',  'source to screen-left -> Left');

// ---- executable: botHurt applies damage, flinches, kills, and respects the cooldown ----
const _rd = new Function('return (' + extractFunction('_reactDir') + ')')();
let died = 0, dieSrc = null;
const botDie = (b, sx, sz) => { b.dead = true; died++; dieSrc = [sx, sz]; };
const botHurt = new Function('botDie', '_reactDir', 'return (' + extractFunction('botHurt') + ')')(botDie, _rd);
const mkBot = hp => ({ hp, dead:false, pos:{x:0,z:0}, yaw:0, mesh:{ userData:{ visual:{ userData:{ stateActions:{} } } } } });
{
  const b = mkBot(100);
  const killed = botHurt(b, 30, 0, -5);   // hit from the front, survives
  assert(killed === false && b.hp === 70, 'non-fatal hit applies damage, returns false');
  assert(b._evt && b._evt.slot === 'hitFront', 'survivor plays a directional flinch (hitFront)');
}
{
  const b = mkBot(20);
  const killed = botHurt(b, 30, 0, 5);    // lethal hit from behind
  assert(killed === true && b.dead === true && died === 1, 'lethal hit kills via botDie, returns true');
}
{
  const b = mkBot(100);
  botHurt(b, 10, 5, 0);                    // first hit -> sets cooldown
  b._evt = null;                           // clear it, then fire again immediately
  botHurt(b, 10, 5, 0);
  assert(b._evt === null, 'flinch cooldown blocks a re-trigger from rapid fire');
}

done();
