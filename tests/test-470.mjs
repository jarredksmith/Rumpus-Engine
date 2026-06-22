import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 616: pickups can require an E press (with a prompt) instead of auto-collecting on walk-over.

// flag threads through spawn / load / serialize
assert(/interact:!!spot\.interact, ready:true/.test(src), 'runtime powerup carries the interact flag from its spot');
assert(/scale:\(s\.scale!=null\?\+s\.scale:1\), interact:!!s\.interact \}\)\)/.test(src), 'saved spots restore the interact flag');
assert(/\.\.\.\(s\.interact\?\{interact:1\}:\{\}\)/.test(src), 'interact flag persists with the level');

// auto-grant is gated: the LOCAL player must press E; remotes still auto-collect (host-authoritative)
const up = extractFunction('updatePowerups');
assert(/if\(near && nd < 2\.0 && !\(p\.interact && near\.id===NET\.myId\)\)\{ grantPowerup\(near, p\.kind, p\.item\)/.test(up), 'local player skips auto-collect for interact pickups');

// proximity scan finds the nearest ready interact-pickup and prompts
const cp = extractFunction('checkProximity');
assert(/for\(const p of powerups\)\{ if\(!p \|\| !p\.interact \|\| !p\.ready\) continue;/.test(cp), 'scans only ready interact pickups');
assert(/nearTarget = \{ type:'pickup', pu:best \}/.test(cp), 'sets a pickup target');
assert(/prompt\.innerHTML = `<b>E<\/b> Pick up \\u2014 \$\{_pickupLabel\(nearTarget\.pu\)\}`/.test(cp), 'shows a "Pick up — name" prompt');

// interact() collects it for the local player + consumes the pad
const it = extractFunction('interact');
assert(/if\(nearTarget\.type==='pickup'\)\{/.test(it), 'interact handles a pickup target');
assert(/grantPowerup\(\{ id:NET\.myId \}, p\.kind, p\.item\); p\.ready=false; p\.cd=\(\(POWERUP_KINDS\[p\.kind\]&&POWERUP_KINDS\[p\.kind\]\.key\)\|\|p\.kind==='item'\)\?1e9:POWERUP_COOLDOWN; if\(p\.mesh\) p\.mesh\.visible=false;/.test(it), 'E grants to the local player and consumes the pad');

// ---- executable: the label helper ----
const lbl = new Function('WEAPONS','POWERUP_KINDS','keyDisplayName','invCatalog', extractFunction('_pickupLabel') + '; return _pickupLabel;')(
  { rifle:{ name:'RIFLE' } },
  { health:{ label:'+50 INTEGRITY' }, goldkey:{ key:'gold' } },
  (k)=> k.toUpperCase()+' KEY',
  { relic:{ name:'Ancient Relic' } });
eq(lbl({ kind:'item', item:'relic' }), 'Ancient Relic', 'item pickups use the catalog name');
eq(lbl({ kind:'rifle' }), 'RIFLE', 'weapon pickups use the weapon name');
eq(lbl({ kind:'health' }), '+50 INTEGRITY', 'powerups use their label');
eq(lbl({ kind:'goldkey' }), 'GOLD KEY', 'key pickups use the key display name');

// editor exposes the toggle
assert(/sp\.interact=cb\.checked;/.test(src) && /Require interact \(press E to pick up\)/.test(src), 'editor has a require-interact checkbox');

done('interact-to-pickup: E prompt + collect, per-spot toggle, persisted (build 616)');
