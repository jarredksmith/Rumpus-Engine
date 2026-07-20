// (build 1015) FOUR MULTIPLAYER FIELD BUGS from a two-phones-at-home session:
// 1) SAME-WIFI JOINS: the TURN relay (openrelay.metered.ca / 'openrelayproject') was retired —
//    with no live relay, same-network peers failed exactly when the router blocks direct
//    traffic (AP isolation / no hairpin). Live relay (freeturn.net UDP/TCP/TLS) + optional
//    self-hosted ice.php config + the localStorage override.
// 2) FROZEN "GET READY": the world's GLBs stream in behind that screen with zero feedback.
//    The client hold now shows LOADING WORLD with a monotonic percentage from the GLB pipeline.
// 3) INVISIBLE OWN CROUCH: models without a crouch clip resolve crouch->idle. _crouchSquash is
//    a non-skeletal fallback (72% visual height) for own body, remote players and bots —
//    capsules included — that steps aside whenever a real crouch clip exists.
// 4) IMMORTAL CLIENT GRENADES: explodeGrenade's client path returned BEFORE scene.remove, so
//    the spent grenade prop lingered forever on the thrower's screen.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
import { readFileSync } from 'fs';
const src = gameSource();

// ---- 1) ICE ----
assert(!/turn:openrelay\.metered\.ca/.test(src), 'no dead relay entries left');
assert(/turn:freeturn\.net:3478/.test(src) && /turns:freeturn\.tel:5349/.test(src) && /stun:stun\.cloudflare\.com:3478/.test(src),
  'live relay across UDP/TCP/TLS + extra STUN');
const fir = extractFunction('_fetchIceRemote', src);
assert(/_commApi\(\)\+'ice\.php'/.test(fir) && /j\.every\(o=>o && o\.urls\)/.test(fir), 'remote config fetched + validated');
assert(/if\(_iceRemote===null && !_peerOpts\._f\)\{ _peerOpts\._f=1; _fetchIceRemote\(\); \}/.test(src),
  'the fetch fires once, on first peer use');
const ice = readFileSync(new URL('../server/api/ice.php', import.meta.url), 'utf8');
assert(/RUMPUS_ICE_JSON/.test(ice) && /echo '\[\]'; exit;/.test(ice) && /isset\(\$e\['urls'\]\)/.test(ice),
  'ice.php ships: env-driven, defaults to [], entries validated');

// ---- 2) loading % — executable math mirror ----
const w = extractFunction('navWarmupTick', src);
assert(/LOADING WORLD/.test(w) && /_cwPeak=Math\.max\(_cwPeak, _glbPending\);/.test(w)
  && /_cwPctMax=Math\.max\(_cwPctMax, pct\);/.test(w), 'the hold shows monotonic progress while GLBs stream');
assert(/\} else \{ _setCountdown\('GET READY'\); \}/.test(w), 'nothing pending -> plain GET READY (host count arrives next)');
const pctOf = (peak, pending, frac) => Math.min(99, Math.round(((peak - pending + frac) / Math.max(1, peak)) * 100));
eq(pctOf(10, 10, 0), 0, 'all pending -> 0%');
eq(pctOf(10, 5, 0.5), 55, 'half done + half a file -> 55%');
eq(pctOf(10, 0, 0), 99, 'even complete shows 99 (GO! owns 100)');
eq(pctOf(0, 0, 0), 0, 'degenerate peak never divides by zero (and cannot occur: the branch requires pending>0)');

// ---- 3) crouch fallback — executable against real graphs ----
const cs = extractFunction('_crouchSquash', src);
const squash = new Function('grp', 'on', 'dt', cs + '\n_crouchSquash(grp, on, dt);');
const mkGrp = (stateActions, baseY) => ({ userData: { visual: { scale: { y: baseY == null ? 1 : baseY }, userData: stateActions ? { stateActions } : {} } } });
{
  // build 1016: a NORMALIZED model (natural scale 2.5) — the 1015 version dragged it toward 1
  // and fought the animation system (the field report: violent vertical stretch jitter)
  const g = mkGrp(null, 2.5);
  for (let i = 0; i < 90; i++) squash(g, true, 0.016);
  near(g.userData.visual.scale.y, 0.72 * 2.5, 0.02, 'squash is RELATIVE to the natural scale (2.5 -> 1.8, never toward 1)');
  for (let i = 0; i < 90; i++) squash(g, false, 0.016);
  eq(g.userData.visual.scale.y, 2.5, 'standing restores the natural scale exactly');
  g.userData.visual.scale.y = 7;               // something else (mixer / rebuild) owns scale now
  for (let i = 0; i < 30; i++) squash(g, false, 0.016);
  eq(g.userData.visual.scale.y, 7, 'while standing the function is fully disengaged — it touches nothing');
}
{
  // mixer-fight immunity: an animation re-writes scale every frame mid-crouch — our absolute
  // write still lands deterministically (base captured once, no read-back feedback loop)
  const g = mkGrp(null, 2.0);
  for (let i = 0; i < 90; i++) { g.userData.visual.scale.y = 2.0; squash(g, true, 0.016); }
  near(g.userData.visual.scale.y, 0.72 * 2.0, 0.02, 'a scale-writing mixer cannot re-inflate the base (no jitter, no compounding)');
}
{
  const g = mkGrp({ crouch: {} });             // model WITH a crouch clip
  for (let i = 0; i < 60; i++) squash(g, true, 0.016);
  eq(g.userData.visual.scale.y, 1, 'a real crouch clip means the animation owns it — no squash');
}
squash({ userData: {} }, true, 0.016);         // no visual at all -> no crash
// wired at all three call sites
assert(/_crouchSquash\(a, crouching && !sliding, dt\);/.test(src), 'own avatar');
assert(/_crouchSquash\(rp\.mesh, !!rp\.crouch && !rp\.slide, dt\);/.test(src), 'remote players (the host sees a clipless joiner crouch too)');
assert(/_crouchSquash\(b\.mesh, !!b\._crouch, dt\);/.test(src), 'bots holding cover');

// ---- 4) client grenade cleanup ----
const eg = extractFunction('explodeGrenade', src);
assert(/if\(typeof NET!=='undefined' && NET\.mode==='client'\)\{ scene\.remove\(g\.mesh\); return; \}/.test(eg),
  'the client visual path removes the spent grenade prop before returning');

done('build 1015: live TURN relay, joiner loading %, universal crouch fallback, client grenade cleanup');
