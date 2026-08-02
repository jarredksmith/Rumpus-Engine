import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 292: third-person avatar animates idle/walk/run/attack/jump/die from the local player's own state.
// state machine extended with jump + die
// build 486: patterns now live in the ANIM_SLOTS taxonomy (re: per slot), _STATE_RE is derived from it
assert(/re:\/jump\|leap\|hop\|fall\|air\/i/.test(src), 'jump clip pattern present in ANIM_SLOTS');
assert(/re:\/die\|death\|dead\|killed\|defeat\/i/.test(src), 'die clip pattern present in ANIM_SLOTS');
assert(/for\(const _s of ANIM_SLOTS\) _STATE_RE\[_s\.k\]/.test(src), '_STATE_RE derived from the taxonomy');
const pes = extractFunction('playEnemyStates');
assert(/for\(const _slot of ANIM_SLOTS\)\{ const st = _slot\.k;/.test(pes), 'playEnemyStates iterates the full ANIM_SLOTS taxonomy (build 486)');
for(const k of ['idle','walk','run','attack','aim','crouch','jump','slide','die']) assert(new RegExp("k:'"+k+"'").test(src), k+' slot still defined (back-compat)');
assert(/_ANIM_ONESHOT\.has\(st\).{0,40}LoopOnce/.test(pes), 'one-shot slots play once and clamp');
// graceful fallback for missing clips
const sak = extractFunction('_stateActionKey');
assert(/while\(s && guard/.test(sak) && /_ANIM_FALLBACK\[s\]/.test(sak), 'states resolve via the fallback chain');
assert(/jump:'idle'/.test(src) && /die:'idle'/.test(src), 'jump/die have fallback entries');
// local avatar derives all states
const uoa = extractFunction('updateOwnAvatar');
assert(/const dead = duelDead \|\| \(player\.hp!=null && player\.hp<=0\)/.test(uoa), 'death detected');
assert(/performance\.now\(\)-lastShot < 250/.test(uoa) && /_fireSlot\(_ff\)\|\|'attack'/.test(uoa), 'attack / move+fire from recent shot (build 518)');
assert(/_airborneSlot\(a\.userData\._air/.test(uoa) && /if\(air\) st=air;/.test(uoa), 'airborne sub-states (jumpStart/jump/fall/land) via _airborneSlot (build 488)');
assert(/if\(sm<0\.012\) tier='idle';/.test(uoa) && /sm>0\.11\) \? 'run' : 'walk'/.test(uoa) && /_locoSlot\(mvx,mvz,player\.yaw,tier,cur\)/.test(uoa), 'directional run/walk/idle by smoothed travel + hysteresis (build 488)');
assert(/setEnemyAnimState\(a, st, _restart\)/.test(uoa), 'state pushed to the avatar mixer');   /* build 1307: with the edge flag that tells it a repeated one-shot is a NEW event */
done();
