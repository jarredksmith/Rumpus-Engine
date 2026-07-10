// (build 924) JOINERS CAN GRAB/CARRY/THROW DYNAMIC PROPS. The client half always existed
// (grabSpecificProp sends {t:'grab'}, netTick streams {t:'hold', p:target}, release/throw send
// {t:'holdEnd', v}) and the host had _remoteHold + driveAllHeld — but every HOST-side lookup used
// dynamicById(msg.nid), which matches the numeric snapshot id (phys.id = nextDynId++), never the
// string net id the client sends. The noGrab checks passed on null, driveAllHeld's null lookup
// DELETED the hold on its first tick, and the throw impulse never found a body. Now looked up by
// nid, with two contention guards.
// Verified live (real Rapier): grab claim registered, 90 hold+drive ticks raised the body 1.2u+
// toward the streamed target with the claim intact, holdEnd threw it (linvel.x>6, armed for damage,
// claim cleared); the host refuses a grab on the prop it is itself carrying, hides client-carried
// props from its own aim-grab; client side sent grab/hold/holdEnd with sane payloads.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// host handlers look carried props up by NET nid (dynamicById matches phys.id and always missed)
const hcm = extractFunction('handleClientMsg', src);
assert(/msg\.t==='grab'\)\{ const _go=propByNid\(msg\.nid\)/.test(hcm), 'grab claim resolves by nid');
assert(/msg\.t==='hold'\)\{ const _ho=propByNid\(msg\.nid\)/.test(hcm), 'hold target resolves by nid');
assert(/msg\.t==='holdEnd'\)[\s\S]{0,120}const o=propByNid\(msg\.nid\)/.test(hcm), 'the throw impulse resolves by nid');
assert(!/dynamicById\(msg\.nid\)/.test(hcm), 'no wrong-namespace lookups remain in the handlers');

// the carry driver: nid lookup (its null result is what deleted every client hold on tick one)
const dah = extractFunction('driveAllHeld', src);
assert(/const o=propByNid\(nid\); const b=o && o\.userData\.phys && o\.userData\.phys\.body;/.test(dah),
  'driveAllHeld resolves the carried prop by nid');

// contention guards
assert(/if\(heldProp===_go\) return;/.test(hcm), 'the host refuses a grab claim on the prop it is itself carrying');
const ap = extractFunction('_aimedProp', src);
assert(/!\(_remoteHold\[o\.userData\.nid\]\)/.test(ap), "the host's own aim-grab skips props a client is carrying");

// the client protocol (pre-existing, pinned so it can't silently regress)
const gsp = extractFunction('grabSpecificProp', src);
assert(/sendToPlayer\(0, \{t:'grab', nid:heldNidLocal\}\)/.test(gsp), 'client announces the grab');
assert(/NET\.conn\.send\(\{ t:'hold', nid:heldNidLocal, p:\[tgt\.x,tgt\.y,tgt\.z\] \}\)/.test(src), 'client streams the hold target every net tick');
const th = extractFunction('throwHeld', src);
assert(/sendToPlayer\(0, \{t:'holdEnd', nid, v:/.test(th), 'client throw sends the velocity to the host');

done('build 924: a joined player can pick up a barrel, carry it, and throw it');
