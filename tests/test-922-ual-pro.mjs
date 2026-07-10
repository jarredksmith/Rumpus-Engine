// (build 922) UAL PRO — the purchased (still CC0) 120-clip pack ships in /anims/UAL1.glb and fills
// EVERY animation slot: real 8-direction locomotion, the climb set for ladder/ledge slots, turns,
// dodges, five hit reactions, two deaths. The per-model toggle is now a selector (Off/Standard/Pro);
// switching packs upgrades any slot still holding a pack default while hand-picked overrides survive.
// Verified live: in-play avatar held 63/63 state actions (ladderUp=Climb_Up_Loop,
// strafeL=Jog_Left_Loop), 119 clips retargeted onto the rig, all persistence round-trips keep 'ualpro'.
import { gameSource, extractFunction, extractConst, evalDecl, assert, eq, done } from './harness.mjs';

const src = gameSource();

// the registry entry
assert(/ualpro: \{ label:'Universal Animation Library Pro', by:'Quaternius', lic:'CC0', url:'anims\/UAL1\.glb'/.test(src),
  'the Pro pack is registered (CC0 — legal to ship in the repo)');

// EVERY slot has a pick — executable: parse both structures and compare key sets
const slotsSrc = src.slice(src.indexOf('const ANIM_SLOTS = ['), src.indexOf('];', src.indexOf('const ANIM_SLOTS = [')));
const slotKeys = [...slotsSrc.matchAll(/k:'([A-Za-z0-9]+)'/g)].map(m=>m[1]);
assert(slotKeys.length >= 60, 'found the slot list ('+slotKeys.length+' slots)');
const proBlock = src.slice(src.indexOf("ualpro: {"), src.indexOf("} }", src.indexOf("ualpro: {")));
const missing = slotKeys.filter(k=>!new RegExp('[ {]'+k+":'").test(proBlock));
eq(missing.join(','), '', 'every animation slot has a Pro pick (missing: none)');

// smart pack switching: pack defaults upgrade, hand-picked overrides survive
const ap = extractFunction('_animLibApplyPicks', src);
assert(/isDefault/.test(ap) && /p\[st\]===v\) return true/.test(ap), 'a slot holding ANY pack default counts as untouched');
const packs = { ual1:{ picks:{ walkBack:'Walk_Loop' } }, ualpro:{ picks:{ walkBack:'Jog_Bwd_Loop', idle:'Idle_Loop' } } };
const fn = evalDecl(ap, '_animLibApplyPicks', { ANIM_LIB_PACKS: packs });
const cfg = { clips:{ walkBack:'Walk_Loop', idle:'MyCustomIdle' } };   // walkBack = Standard default; idle = hand-picked
fn(cfg, 'ualpro');
eq(cfg.clips.walkBack, 'Jog_Bwd_Loop', 'a Standard-default slot upgrades to the Pro clip');
eq(cfg.clips.idle, 'MyCustomIdle', 'a hand-picked clip survives the pack switch');

// UI: both panels offer Off / Standard / Pro
eq((src.match(/'ualpro','Pro — 120 clips, every slot filled \(Quaternius, CC0\)'/g)||[]).length, 2,
  'player AND enemy panels offer the Pro tier');
eq((src.match(/Use built-in animation library/g)||[]).length, 2, 'one selector per panel');

done('build 922: UAL Pro fills all 63 animation slots — Off/Standard/Pro per model');
