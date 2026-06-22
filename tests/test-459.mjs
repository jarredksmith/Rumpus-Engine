import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 605: co-op multi-kill credit for the client (and the host's own kills), without desyncing the sim.

// host attributes a client's hit, and on a kill tells that client to register it
assert(/_coopKillFor=id; const _killed=enemyHurt\(en, msg\.d,[^;]*; _coopKillFor=null; if\(_killed\) sendToPlayer\(id, \{t:'frag'\}\)/.test(src), 'host frags the client that landed the killing hit');
// the client turns a frag into a local multi-kill tick
assert(/else if\(msg\.t==='frag'\)\{ registerLocalKill\(\); \}/.test(src), 'client registers the kill on frag');

// killEnemy: solo unchanged; co-op host self-credits ONLY when the kill is not a client's
const ke = extractFunction('killEnemy');
assert(/if\(NET\.mode==='off'\)\{ hitStop = Math\.max\(hitStop, 0\.07\); registerLocalKill\(\); \}/.test(ke), 'solo path keeps impact freeze + tracking');
assert(/else if\(NET\.mode==='host' && _coopKillFor==null\) registerLocalKill\(\)/.test(ke), 'co-op host credits only its own kills');

// the slow-mo stays solo-only (no co-op desync)
assert(/if\(n>=2\)\{ showMultiKill\(n\); if\(NET\.mode==='off' && n>=3\) hitStop=Math\.max\(hitStop, 0\.2\); \}/.test(extractFunction('registerLocalKill')), 'multi-kill slow-mo remains solo-only');

done('co-op multi-kill: client credited via frag, host self-credits its own, slow-mo stays solo (build 605)');
