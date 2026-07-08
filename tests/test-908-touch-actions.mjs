// (build 908) TOUCH CONTROLS COMPLETED — the release audit found core actions with NO touch path:
// crouch (couldn't crouch/slide/ledge-drop at all), melee, the build/deploy radial, flashlight,
// inventory, MP chat, grab/throw. Six new buttons (three context-aware), tap-a-slice radial deploy,
// long-press USE = grab/drop, wake lock during play. Verified live on a touch-profile browser
// (crouch reached the sim; a slice tap deployed a runtime prop; hold-USE fired grabAction once).
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// the buttons exist, labelled, and the context trio starts hidden
for(const [id,label] of [['tCrouch','Crouch'],['tMelee','Melee'],['tBuild','Build menu'],['tFlash','Flashlight'],['tInv','Inventory'],['tChat','Chat']])
  assert(new RegExp('id="'+id+'" aria-label="'+label+'"').test(html), id+' exists with an accessible name');
assert(/id="tFlash"[^>]*style="display:none"/.test(html) && /id="tChat"[^>]*style="display:none"/.test(html),
  'context buttons start hidden (no clutter until the level/session uses them)');

// crouch reaches the sim: the touch flag ORs into the crouch want AND the ledge-drop read
assert(/\|\| padCrouch \|\| touchCrouch/.test(src), 'touchCrouch feeds _wantCrouch (crouch/slide/crouch-jump)');
assert(/padCrouch\|\|touchCrouch\|\|keys\['KeyS'\]/.test(src), 'touchCrouch feeds the ledge-drop read');
assert(/touchCrouch=false; \{ const cb=document\.getElementById\('tCrouch'\)/.test(src), 'clearMovementInput resets the crouch toggle + its lit state');

// wiring: melee / radial / flashlight / inventory / chat
assert(/tap\('tMelee', \(\)=>\{ if\(typeof meleeAttack==='function'\) meleeAttack\(\); \}\);/.test(src), 'MELEE taps meleeAttack');
assert(/tap\('tBuild', \(\)=>\{ if\(typeof openRadial!=='function'\) return; if\(radialOpen\) closeRadial\(false\); else openRadial\(\); \}\);/.test(src), 'BUILD toggles the radial (cancel on second tap)');
assert(/tap\('tFlash', \(\)=>\{ if\(typeof toggleFlashlight==='function'\) toggleFlashlight\(\); \}\);/.test(src), 'LIGHT taps the flashlight');
assert(/tap\('tInv',\s+\(\)=>\{ if\(typeof toggleInventory==='function'\) toggleInventory\(\); \}\);/.test(src), 'BAG opens the inventory');
assert(/tap\('tChat',\s+\(\)=>\{ if\(typeof openChat==='function'\) openChat\(\); \}\);/.test(src), 'CHAT opens MP chat');

// USE: tap = interact, 400ms hold = grab/drop
assert(/ut=setTimeout\(\(\)=>\{ uheld=true; ub\.classList\.add\('on'\); if\(typeof grabAction==='function'\) grabAction\(\); \}, 400\)/.test(src),
  'holding USE 400ms grabs/drops');
assert(/if\(!uheld && typeof interact==='function'\) interact\(\)/.test(src), 'a quick USE tap still interacts (on release, not after a grab)');

// radial slices are tappable
assert(/d\.style\.pointerEvents='auto'; d\.addEventListener\('pointerdown', ev=>\{ ev\.preventDefault\(\); ev\.stopPropagation\(\); radialSel=i; updateRadialSel\(\); closeRadial\(true\); \}\);/.test(src),
  'tapping a radial slice selects + deploys it');

// context tick + wake lock exist and are driven from the loop
const tick = extractFunction('_touchCtxTick', src);
assert(/gameCfg\.flashlight/.test(tick) && /invCatalog/.test(tick) && /NET\.mode!=='off'/.test(tick), 'context tick gates LIGHT/BAG/CHAT on real state');
assert(/_touchCtxTick==='function'\) _touchCtxTick\(_anow\)/.test(src), 'the context tick rides the per-frame timer block');
assert(/navigator\.wakeLock\.request\('screen'\)/.test(extractFunction('_wakeLockTry', src)), 'wake lock requested during play');
assert(/_wakeLockTry==='function'\) _wakeLockTry\(\)/.test(src), 'wake lock re-acquired when the tab returns');

// executable: the context tick shows/hides by state
const els={ tFlash:{style:{display:'none'}}, tInv:{style:{display:'none'}}, tChat:{style:{display:'none'}} };
const mk=(deps)=>{ const f=(new Function('isTouch','gameCfg','inventory','invCatalog','NET','document','_tcxAt',`"use strict";let __t=_tcxAt;${tick.replace('_tcxAt=now+500','__t=now+500').replace('now<_tcxAt','now<__t')}\nreturn _touchCtxTick;`))(
  true, deps.gameCfg, deps.inventory, deps.invCatalog, deps.NET, { getElementById:(id)=>els[id]||null }, 0); f(1000); };
mk({ gameCfg:{flashlight:true}, inventory:[], invCatalog:{ medkit:{} }, NET:{mode:'client'} });
eq(els.tFlash.style.display, '', 'flashlight level -> LIGHT shows');
eq(els.tInv.style.display, '', 'inventory catalog -> BAG shows');
eq(els.tChat.style.display, '', 'in a room -> CHAT shows');
mk({ gameCfg:{flashlight:false}, inventory:[], invCatalog:{}, NET:{mode:'off'} });
eq(els.tFlash.style.display, 'none', 'no flashlight -> LIGHT hides');
eq(els.tChat.style.display, 'none', 'solo -> CHAT hides');

// new buttons are user-arrangeable + touch grab hint
assert(/TOUCH_EDITABLE = \['tStick','tFire','tAim','tJump','tReload','tNade','tWeapon','tUse','tCrouch','tMelee','tBuild','tFlash','tInv','tChat'\]/.test(src),
  'the new buttons are editable in the layout customizer');
assert(/isTouch \? 'Hold USE to grab'/.test(src), 'the grab hint speaks touch on touch');

done('build 908: touch players can crouch, melee, build, light up, open the bag, chat and grab');
