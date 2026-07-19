// (build 1014) HOST MATCH RULES — the host picks which guns are allowed and how many grenades
// everyone starts with. A MATCH RULES block (weapon checkboxes + grenade count) sits under the
// versus panes in the MP modal, persists in localStorage, rides the welcome to every client
// (sanitized), and is enforced on all machines at the loadout / switch / pickup layer. Melee is
// never banned, rules bind hosted PvP only (co-op/solo untouched), and bots obey both rules.
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- executable: _allowedWep is the single gate ----
const aw = extractFunction('_allowedWep', src);
const mk = (WEAPONS, NET, pvp, MP_RULES) =>
  new Function('WEAPONS', 'NET', 'pvpMode', 'MP_RULES', aw + '\nreturn _allowedWep;')(WEAPONS, NET, () => pvp, MP_RULES);
const W = { rifle:{}, pistol:{}, sniper:{}, crowbar:{}, hands:{}, launcher:{} };
{
  const f = mk(W, { mode:'host' }, true, { weps:['sniper'], nades:0 });
  eq(f('sniper'), true, 'allowed gun passes');
  eq(f('rifle'), false, 'banned gun blocked in hosted PvP');
  eq(f('crowbar'), true, 'melee is never banned');
  eq(f('hands'), true, 'fists never banned');
  eq(f('nosuch'), false, 'unknown keys always rejected');
}
{
  const f = mk(W, { mode:'host' }, true, { weps:null, nades:2 });
  eq(f('rifle'), true, 'weps:null = every gun allowed');
}
{
  const f = mk(W, { mode:'off' }, false, { weps:['sniper'], nades:0 });
  eq(f('rifle'), true, 'solo play ignores the rules');
}
{
  const f = mk(W, { mode:'host' }, false, { weps:['sniper'], nades:0 });
  eq(f('rifle'), true, 'co-op multiplayer ignores the rules too (PvP only)');
}

// ---- executable: the UI reader collapses all/none to "no restriction" ----
const rr = extractFunction('_readMpRules', src);
const read = (boxes, nadeVal) => new Function('document', rr + '\nreturn _readMpRules();')({
  querySelectorAll: () => boxes.map(b => ({ checked: b.c, dataset: { wep: b.k } })),
  getElementById: () => ({ value: nadeVal }),
});
{
  const r = read([{k:'rifle',c:true},{k:'sniper',c:false},{k:'pistol',c:true}], '3');
  eq(JSON.stringify(r.weps), '["rifle","pistol"]', 'checked guns become the allowlist');
  eq(r.nades, 3, 'grenade count read');
}
eq(read([{k:'rifle',c:true},{k:'sniper',c:true}], '0').weps, null, 'ALL checked -> no restriction');
eq(read([{k:'rifle',c:false},{k:'sniper',c:false}], '9').weps, null, 'NONE checked -> no restriction (never brick the match)');
eq(read([], '99').nades, 6, 'grenades clamp to 6');

// ---- executable: the client-side sanitizer (rules arrive over the wire) ----
const ap = extractFunction('_applyMpRules', src);
const apply = (r) => { const MP_RULES = { weps:null, nades:2 };
  new Function('MP_RULES', 'WEAPONS', ap + '\n_applyMpRules(r);'.replace('r)', JSON.stringify(r) + ')'))(MP_RULES, W);
  return MP_RULES; };
eq(JSON.stringify(apply({ weps:['sniper','nosuch',42], nades:'4' }).weps), '["sniper"]', 'unknown/typed junk filtered');
eq(apply({ weps:['sniper'], nades:'4' }).nades, 4, 'nade count applied');
eq(apply({ weps:[], nades:99 }).weps, null, 'empty allowlist -> unrestricted; nades clamped');

// ---- enforcement wiring ----
assert(/let l=\['pistol','rifle','smg','shotgun','sniper','launcher','crowbar'\]\.filter\(k=>typeof _allowedWep!=='function'\|\|_allowedWep\(k\)\)/.test(src),
  'the PvP loadout is filtered by the rules');
assert(/if\(!l\.length\) l=\['pistol','crowbar'\];/.test(src) && /curWep=l\.find\(k=>k!=='crowbar'\)\|\|l\[0\];/.test(src),
  'never an empty loadout; the first allowed GUN is equipped');
assert(/if\(typeof _allowedWep==='function' && !_allowedWep\(key\)\) return;   \/\/ build 1014: host match rules/.test(extractFunction('switchWeapon', src)),
  'switching to a banned gun is refused (digits, wheel, radial)');
assert(/function giveWeapon\(key\)\{ if\(typeof _allowedWep==='function' && !_allowedWep\(key\)\)\{ if\(typeof toast==='function'\) toast\('The host disabled that weapon for this match'\); return; \}/.test(src),
  'pickups granting a banned gun are refused with an honest toast');

// ---- grenades: start + respawn, host-set, bots too ----
assert(/if\(pvpMode\(\) && typeof MP_RULES!=='undefined'\)\{ grenadeCount = MP_RULES\.nades; \}/.test(src), 'match start deals the host-set grenades');
assert(/refillAllWeapons\(\); buffs\.shield=0; if\(typeof MP_RULES!=='undefined'\) grenadeCount=MP_RULES\.nades;/.test(src), 'each respawn refills to the same count');
assert(/nades:\(MP_RULES\.nades===0\?0:2\)/.test(src) && /b\.nades=\(MP_RULES\.nades===0\?0:2\)/.test(src), 'grenades OFF disarms bot grenades too');

// ---- sync + persistence + UI ----
assert(/rules:\{ weps:MP_RULES\.weps, nades:MP_RULES\.nades \}, phase:NET\.phase\}/.test(src), 'rules ride the welcome to every joiner');
assert(/if\(msg\.rules && typeof _applyMpRules==='function'\) _applyMpRules\(msg\.rules\);/.test(src), 'clients apply them (sanitized) before their match starts');
assert(/if\(pvpMode\(\)\)\{ const _r=_readMpRules\(\); MP_RULES\.weps=_r\.weps; MP_RULES\.nades=_r\.nades; try\{ localStorage\.setItem\('breach_mp_rules', JSON\.stringify\(_r\)\); \}catch\(e\)\{\} \}/.test(src),
  'hosting locks in the UI state and persists it for next time');
assert(/localStorage\.getItem\('breach_mp_rules'\)/.test(src), 'saved rules load at boot');
assert(/<div id="mpRulesRow"[^>]*>/.test(html) && /MATCH RULES/.test(html) && /id="mpNades"/.test(html), 'the MATCH RULES block exists in the MP modal');
assert(/rulesRow\.style\.display=_vs\?'block':'none'; if\(_vs && typeof _renderMpRules==='function'\) _renderMpRules\(\);/.test(src),
  'it shows for versus modes only, rebuilt fresh on every pane switch');

done('build 1014: host match rules — allowed guns + starting grenades, synced, enforced everywhere, bots included');
