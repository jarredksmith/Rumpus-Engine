// (build 923) Two live-tested multiplayer prop bugs.
// A) DUPLICATED PROPS: levels can carry duplicate nids (monster-jam-8 ships 's-9' twice). The old
//    healing rolled a RANDOM nid per machine at spawn-land time, so host and client disagreed and
//    each side pAdd'd "its" healed prop to the other. Also: the host seeded its sync baseline once
//    at hostStart (late-landing props got spurious pAdds), and netApplyAddProp would spawn a second
//    copy of a nid whose own download was still in flight.
// B) STATIC BARRELS FOR CLIENTS: resolvePlayerProps authored the shove impulse only when !clientMode
//    — a joined player pressing into a dynamic prop did nothing. Clients now relay a throttled
//    {t:'pPush'} to the host (mirror of the propHit shooting relay); the host applies the clamped
//    impulse and the D snapshot carries the motion back.
// Verified live: healing deterministic (s-9, s-9~2, s-9~3 in array order both runs), pending-nid
// pAdd refused, client sent pPush at <=1 per 120ms while pressing into a barrel, host applied
// dv=3.6 for s=6 and clamped s=9999 to exactly dv=5.4.
import { gameSource, extractFunction, evalDecl, assert, eq, done } from './harness.mjs';

const src = gameSource();

// A1: deterministic parse-time healing, called by BOTH loaders
const heal = extractFunction('_healLevelNids', src);
const fn = evalDecl(heal, '_healLevelNids', {});
const props = [{nid:'s-9'},{nid:'s-9'},{nid:'a'},{nid:'s-9'},{nid:'a'}];
fn(props);
eq(props.map(p=>p.nid).join(','), 's-9,s-9~2,a,s-9~3,a~2', 'duplicate nids heal deterministically in array order');
eq((src.match(/_healLevelNids\(level\.props\);/g)||[]).length, 2, 'client loadLevelFromNet AND host restoreLevel both heal before spawning');

// A2: the host/solo loader seeds the sync baseline as each prop lands
assert(/if\(NET\.mode!=='off' && obj\.userData\.nid\) NET\.sentProps\.set\(obj\.userData\.nid, obj\.userData\.phys \? 'dyn' : propTuple\(obj\)\); \}catch\(e\)\{ console\.warn\('prop '\+i\+' apply failed'/.test(src),
  'restoreLevel seeds NET.sentProps on landing (a late GLB no longer gets a spurious pAdd)');

// A3: a pAdd for a nid whose own spawn is pending is refused
const nap = extractFunction('netApplyAddProp', src);
assert(/if\(_nidPending\.has\(d\.nid\)\) return false;/.test(nap), 'in-flight level copies are never doubled by a pAdd');

// B: client push relay + host handler
const rpp = extractFunction('resolvePlayerProps', src);
assert(/else if\(NET\.conn && obj\.userData\.nid\)/.test(rpp) && /t:'pPush', nid:obj\.userData\.nid, nx:-nx, nz:-nz, s:shove/.test(rpp),
  'a client relays the shove instead of dropping it');
assert(/_pushAt = _now \+ 120/.test(rpp), 'push relay is throttled per prop');
const hcm = extractFunction('handleClientMsg', src);
assert(/msg\.t==='pPush'/.test(hcm) && /Math\.max\(0, Math\.min\(9, \+msg\.s\|\|0\)\)/.test(hcm) && /applyImpulse\(\{ x:\(\+msg\.nx\|\|0\)\*sh\*0\.6, y:0, z:\(\+msg\.nz\|\|0\)\*sh\*0\.6 \}/.test(hcm),
  'the host applies the clamped shove with the same formula it uses for itself');

done('build 923: no more duplicated props, and joined players can shove dynamic props');
