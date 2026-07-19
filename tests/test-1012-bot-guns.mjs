// (build 1012) BOTS HOLD GUNS — field report: bots fired with empty hands. makeBot built the
// avatar but never attached a weapon; remote players get theirs re-attached every frame once
// their model lands (netInterpolate), and bots had no equivalent. Now each bot rolls a
// persistent per-life weapon at spawn (rifle-weighted, only keys that exist in WEAPONS) and
// updateBots attaches it under the same visual-ready guard remote players use — attachAvatarGun
// no-ops cheaply when the right gun is already in hand, so the per-frame call costs nothing.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
const ub = extractFunction('updateBots', src);

// the attach: same readiness guard as remote players, every frame, cheap no-op after the first
assert(/if\(b\.mesh && \(b\.mesh\.userData\.hasModel \|\| b\.mesh\.userData\.visual\) && typeof attachAvatarGun==='function'\) attachAvatarGun\(b\.mesh, b\.wep\|\|'rifle'\);/.test(ub),
  'bots attach their weapon once the avatar visual exists (async model load included)');
assert(/if\(rp\.mesh\.userData\.hasModel \|\| rp\.mesh\.userData\.visual\) attachAvatarGun\(rp\.mesh, rp\.wep\|\|'rifle', rp\.grip\|\|null\);/.test(src),
  'the remote-player guard this mirrors is still in place');

// the loadout roll: executable — only real+ALLOWED keys (build 1014 host match rules), rifle-weighted
const m = src.match(/wep: \(function\(\)\{ const _w=(\['rifle','rifle','smg','shotgun','pistol'\])\.filter\(k=>WEAPONS\[k\] && _allowedWep\(k\)\); return _w\.length\?_w\[\(Math\.random\(\)\*_w\.length\)\|0\]:\(\['pistol','rifle','smg','shotgun','sniper','launcher'\]\.find\(k=>WEAPONS\[k\]&&_allowedWep\(k\)\)\|\|'crowbar'\); \}\)\(\)/);
assert(m, 'per-bot weapon rolled at spawn (rule-aware)');
const roll = new Function('WEAPONS','_allowedWep',
  "const _w=['rifle','rifle','smg','shotgun','pistol'].filter(k=>WEAPONS[k] && _allowedWep(k)); return _w.length?_w[(Math.random()*_w.length)|0]:(['pistol','rifle','smg','shotgun','sniper','launcher'].find(k=>WEAPONS[k]&&_allowedWep(k))||'crowbar');");
{ const W = { rifle:{}, smg:{}, shotgun:{}, pistol:{} }, all = () => true;
  const seen = new Set(); for (let i = 0; i < 200; i++) seen.add(roll(W, all));
  assert(seen.has('rifle') && seen.size >= 3, 'the mix actually varies across bots');
  for (const w of seen) assert(W[w], 'only keys that exist in WEAPONS'); }
{ const W = { rifle:{}, smg:{}, sniper:{} }, onlySniper = (k) => k === 'sniper';
  eq(roll(W, onlySniper), 'sniper', 'host rules bind the cosmetic roll (sniper-only match -> bots hold sniper)'); }
eq(roll({}, () => true), 'crowbar', 'a level with no matching weapons still defaults sanely');

// attachAvatarGun stays cheap on repeat calls (the per-frame no-op path)
const ag = extractFunction('attachAvatarGun', src);
assert(/if\(g\.userData\.gunKey === weaponKey && g\.userData\.gun\)\{/.test(ag),
  'unchanged weapon short-circuits (no reload, no re-grip beyond a signature check)');

// grip-slider tuning reaches bots
assert(/if\(typeof bots!=='undefined'\) for\(const b of bots\)\{ if\(b && b\.mesh\) reapply\(b\.mesh\); \}/.test(extractFunction('refreshAvatarGunGrips', src)),
  'live grip tuning re-applies to bot-held guns too');

done('build 1012: bots hold a real per-life weapon — attached like remote players, rifle-weighted mix');
