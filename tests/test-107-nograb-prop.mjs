// (build 156) Editor flag: a prop can be Dynamic (physics) but NOT grabbable by the gravity gun.
// userData.noGrab gates _aimedProp, is validated host-side on client grab/hold, and persists + syncs.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

const aim = extractFunction('_aimedProp');
assert(/o\.userData\.phys && o\.userData\.nid!=null && !o\.userData\.noGrab/.test(aim), 'gravity gun skips no-grab props');

assert(/else if\(msg\.t==='grab'\)\{ const _go=propByNid\(msg\.nid\); if\(!_go \|\| !_go\.userData\.phys \|\| _go\.userData\.noGrab\) return;/.test(src), 'host rejects a no-grab grab (build 924: nid lookup, and unknown/non-dynamic props refuse too)');
assert(/else if\(msg\.t==='hold'\)\{ const _ho=propByNid\(msg\.nid\); if\(!_ho \|\| !_ho\.userData\.phys \|\| _ho\.userData\.noGrab \|\| heldProp===_ho\) return;/.test(src), 'host rejects a no-grab hold (build 924: nid lookup + host-carry contention)');

assert(/grbcb\.checked=\(sel\.userData\.noGrab!==true\)/.test(src) && /sel\.userData\.noGrab = !grbcb\.checked;/.test(src), 'editor Grabbable checkbox toggles noGrab');
assert(/<b>Grabbable<\/b>/.test(src), 'checkbox is labelled');

const pe = extractFunction('propEntry');
assert(/if\(o\.userData\.noGrab\) e\.ng=true;/.test(pe), 'noGrab serializes (save + network)');
const ap = extractFunction('applyPropDynState');
assert(/if\(p\.ng\) obj\.userData\.noGrab=true;/.test(ap), 'noGrab restores on load/sync');
assert(/dsh:d\.dsh, ng:d\.ng \}\)/.test(src), 'pAdd carries noGrab to clients');
done('no-grab prop flag');
