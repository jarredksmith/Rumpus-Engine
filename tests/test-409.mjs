import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();

// build 534: chasing enemies beeline straight at a VISIBLE target (always moves in the open) and only fall
// back to the nav path when line of sight is blocked. A too-close waypoint must never zero out the step.
// build 534/553: chasing enemies beeline straight at the target (always move in the open, from any angle) and
// only fall back to the nav path when the straight WALKING path is actually blocked. A too-close waypoint
// must never zero out the step.
assert(/if\(td\.chase && en\._pathBlk && typeof _botFollowPath==='function'\)/.test(src), 'build 553: pathfinding engages only when the direct walking path is blocked (en._pathBlk)');
assert(!/td\.chase && !td\.see && typeof _botFollowPath/.test(src), 'the visible-only pathfinding gate is removed (533/542)');
assert(!/if\(td\.chase && typeof _botFollowPath==='function'\)\{/.test(src), 'the build-542 always-pathfind is replaced by the blocked-path gate');
// the gate is fed by a LOW (knee-height) walkability ray so a wall you can see over but not walk through still routes
assert(/en\._pathBlk = \(typeof segmentBlocked==='function'\) \? segmentBlocked\(en\.mesh\.position\.x, en\.mesh\.position\.z, td\.tx, td\.tz, _kneeY\)/.test(src), 'the gate tests a low walking-height sightline toward the move target');
assert(/const _kneeY=\(en\._groundY!=null\?en\._groundY:0\)\+0\.4;/.test(src), 'the walkability ray is cast at knee height above the enemy ground');
assert(!/clearAt\(_ecx,en\.mesh\.position\.z,_efy\)/.test(src), 'build 546: the per-step clearAt wall-slide is removed (Phase 3 resolves penetration; nudge handles head-on)');
assert(/if\(_pl > 0\.5\)\{ _mvx=_pdx\/_pl; _mvz=_pdz\/_pl; \}/.test(src), 'a waypoint within 0.5u is ignored so the beeline is kept (no zeroed step / freeze)');
// the old unconditional override (||1 fallback that could zero the step) is gone
assert(!/_pl=Math\.hypot\(_pdx,_pdz\)\|\|1; _mvx=_pdx\/_pl/.test(src), 'the step-zeroing ||1 path override is removed');
// beeline remains the base move
assert(/let _mvx=dx\/d, _mvz=dz\/d;/.test(src), 'beeline toward the target is the base movement');
done();
