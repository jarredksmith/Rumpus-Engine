import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 381: the live player avatar didn't pick up clip/speed/HOLD changes — the hold worked in the editor
// preview but not in actual play. Two causes: ensureOwnAvatar's cache key omitted the anim config (so a hold
// toggle was a cache hit, no rebuild), and rebuildAvatars never refreshed the local _ownAvatar.

const eoa = extractFunction('ensureOwnAvatar');
// the cache key now includes clips + clipSpeed + clipHold, so changing any rebuilds the live body
assert(/JSON\.stringify\(cfg\.clips\|\|\{\}\)/.test(eoa), 'own-avatar key includes clip mappings');
assert(/JSON\.stringify\(cfg\.clipSpeed\|\|\{\}\)/.test(eoa), 'own-avatar key includes clip speeds');
assert(/JSON\.stringify\(cfg\.clipHold\|\|\{\}\)/.test(eoa), 'own-avatar key includes hold flags');

// rebuildAvatars now also rebuilds the local body (resets the key + re-ensures)
const rb = extractFunction('rebuildAvatars');
assert(/_ownAvatar\)\{ _ownAvatarKey=''; if\(typeof ensureOwnAvatar==='function'\) ensureOwnAvatar\(\); \}/.test(rb), 'rebuildAvatars refreshes the live player avatar');

// the local state pick drives setEnemyAnimState on the own avatar (which applies hold from animCfg)
assert(/const a=ensureOwnAvatar\(\);/.test(src), 'live body comes from ensureOwnAvatar');
assert(/setEnemyAnimState\(a, st\);/.test(src), 'live body state is set each frame');

// and setEnemyAnimState reads hold from the avatar config (the path that now actually receives updates)
const sa = extractFunction('setEnemyAnimState');
// build 1304: the loop mode belongs to the RESOLVED slot, not the requested name — a one-shot request
// falling back to a looping slot was stamping LoopOnce onto it (idle froze; see test-1304). An authored
// override is still honoured, looked up under the requested name first and the resolved slot second.
assert(/_cfg\.clipHold && _cfg\.clipHold\[_pick\(_cfg\.clipHold\)\] != null/.test(sa), 'hold is read from the (now-refreshed) avatar config');
done();
