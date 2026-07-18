import { gameSource, extractFunction, assert, near, done } from './harness.mjs';
const src = gameSource();
// build 331: per-run keys + locked interactable props.

// --- registry: key kinds exist, colored, marked with .key ---
for(const [kind, color] of [['key_red','red'],['key_blue','blue'],['key_gold','gold'],['key_green','green']]){
  const re = new RegExp(kind + ":\\s*\\{[^}]*key:'" + color + "'");
  assert(re.test(src), kind + ' registered with key tag');
}

// --- executable: tryUnlockProp covers all four outcomes ---
const fn = new Function('playerKeys','flashToast','SFX','propModels','broadcastUnlock','renderKeyChips','keyDisplayName',
  extractFunction('tryUnlockProp') + '\nreturn tryUnlockProp;');
const mk = (keys) => {
  const calls = { toast:[], deny:0, buy:0, bc:[] };
  // stub mirrors the build-334 helper: custom name or COLOR KEY fallback
  const f = fn(keys, m=>calls.toast.push(m), { deny:()=>calls.deny++, buy:()=>calls.buy++ }, [], i=>calls.bc.push(i), ()=>{}, c=>c.toUpperCase()+' KEY');
  return { f, calls };
};
{ const { f } = mk({}); assert(f({ userData:{} }) === true, 'no lock -> always allowed'); }
{ const { f, calls } = mk({});
  const o = { userData:{ lockId:'red' } };
  assert(f(o) === false, 'locked without key -> denied');
  assert(calls.deny === 1 && /LOCKED/.test(calls.toast[0]) && /RED/.test(calls.toast[0]), 'deny sound + toast names the key');
  assert(!o.userData.unlocked, 'denied prop stays locked'); }
{ const keys = { red:true }; const { f, calls } = mk(keys);
  const o = { userData:{ lockId:'red' } };
  assert(f(o) === true && o.userData.unlocked === true, 'key unlocks and marks the prop');
  assert(keys.red === true, 'non-consuming lock keeps the key');
  assert(f(o) === true && calls.buy === 1, 'already-unlocked prop passes without re-spending'); }
{ const keys = { gold:true }; const { f } = mk(keys);
  const o = { userData:{ lockId:'gold', lockConsume:true } };
  assert(f(o) === true && !('gold' in keys), 'consuming lock removes the key from the ring'); }

// --- interact gates both branches before acting ---
const it = extractFunction('interact');
const animI = it.indexOf("nearTarget.type==='anim'"), xI = it.indexOf("nearTarget.type==='xanim'");
assert(it.indexOf('if(!tryUnlockProp(o)) return;', animI) > animI && it.indexOf('if(!tryUnlockProp(o)) return;', animI) < it.indexOf('playPropAnimationOnce'), 'triggered-animation branch gated');
assert(it.indexOf('if(!tryUnlockProp(o)) return;', xI) > xI && it.indexOf('if(!tryUnlockProp(o)) return;', xI) < it.indexOf('xaToggle(o)', xI), 'mechanism branch gated');

// --- per-run reset + key pickup application + one-shot pads ---
assert(/runKills=0; playerKeys=\{\}; if\(typeof renderKeyChips==='function'\) renderKeyChips\(\);/.test(extractFunction('startGame')), 'key ring resets every deploy');
assert(/POWERUP_KINDS\[kind\] && POWERUP_KINDS\[kind\]\.key\)\{ playerKeys\[POWERUP_KINDS\[kind\]\.key\]=true; renderKeyChips\(\);/.test(extractFunction('applyPowerupLocal')), 'picking up a key fills the ring + chips');
assert(/p\.cd=\(\(POWERUP_KINDS\[p\.kind\]&&POWERUP_KINDS\[p\.kind\]\.key\)\|\|p\.kind==='item'\)\?1e9:POWERUP_COOLDOWN;/.test(extractFunction('updatePowerups')), 'key + item pads never respawn');

// --- net: unlock broadcast, host relay, client apply ---
assert(/function broadcastUnlock\(i\)\{/.test(src), 'broadcastUnlock exists');
assert(/msg\.t==='unlock'\)\{ const o=propModels\[msg\.i\]; if\(o\) o\.userData\.unlocked=true; for\(const cid in NET\.conns\)/.test(src), 'host applies + relays unlock');
assert(/msg\.t==='unlock'\)\{ const o=propModels\[msg\.i\]; if\(o\) o\.userData\.unlocked=true; \}/.test(src), 'client applies unlock');

// --- serialization round-trip + editor + prompt ---
assert(/if\(o\.userData\.lockId\)\{ e\.lk=o\.userData\.lockId; if\(o\.userData\.lockConsume\) e\.lkc=1; \}/.test(extractFunction('propEntry')), 'lock fields serialize');
assert(src.split("if(p.lk){ obj.userData.lockId=p.lk; if(p.lkc) obj.userData.lockConsume=true; }").length - 1 === 3, 'lock restored at all three prop-load sites');
assert(/\[\['','None'\],\['red',keyDisplayName\('red'\)\],\['blue',keyDisplayName\('blue'\)\],\['gold',keyDisplayName\('gold'\)\],\['green',keyDisplayName\('green'\)\]\]/.test(src), 'editor lock dropdown shows custom key names (build 334)');
// build 332 regression: the lock UI must append to its fold host (behaveHost since build 989) — a bare `host`
// here is a later-declared binding in renderEditorFields and throws a TDZ ReferenceError in the browser.
{ const li = src.indexOf("// ---- Lock: this prop's E-activation");
  const lockBlock = src.slice(li, src.indexOf('// ---- Mechanism: move/rotate', li));
  assert(li > 0 && /lHost\.appendChild\(lr\)/.test(lockBlock) && /lHost\.appendChild\(cr\)/.test(lockBlock) && /lHost\.appendChild\(lh\)/.test(lockBlock) && /edFold\(behaveHost, 'lock', 'Lock'/.test(lockBlock), 'lock UI lives in its own Lock accordion (build 414)');
  assert(!/\bhint\(/.test(lockBlock), 'no hint() call — that helper is block-scoped elsewhere (build 333)');
  assert(!/[^a-zA-Z]host\./.test(lockBlock.replace(/animHost|behaveHost|motionHost/g,'AH')), 'no stray host references in the lock block'); }
assert(/\['key_red','Red Key'\],\['key_blue','Blue Key'\],\['key_gold','Gold Key'\],\['key_green','Green Key'\]/.test(src), 'key pads in the pickup dropdown');
assert(/playerKeys\[lk\] \? `<b>\$\{_uk\}<\/b> Unlock/.test(src), 'prompt distinguishes unlockable vs locked (key named per device since build 935)');
done();
