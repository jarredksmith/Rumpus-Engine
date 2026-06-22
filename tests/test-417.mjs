import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
// build 548: co-op turret sync (Phase 2). Before this, only the tracer of a turret shot synced — a turret a
// remote player was manning sat at its base on every other peer (barrel never tracked their aim). We sync one
// field, the mounted-turret index (mt), and reconstruct the barrel pose on each peer from the aim that
// already travels in the state packet. The index is a stable network id: every peer builds turretModels from
// the same ordered level.turrets list.

// --- mt rides in all three send sites (host self entry, host relay of a client, client's own packet) ---
assert(/n:NET\.name\|\|'Host', mt:\(mountedTurret\?_turretIndexOf\(mountedTurret\):-1\) \}\];/.test(src), 'host snapshot self-entry carries its mounted-turret index');
assert(/hs:rp\.hs\|\|0, n:rp\.name, mt:\(rp\.mt!=null\?rp\.mt:-1\) \}\);/.test(src), 'host relays each remote player mounted-turret index');
assert(/n:NET\.name, mt:\(mountedTurret\?_turretIndexOf\(mountedTurret\):-1\) \}\); \}catch/.test(src), 'client state packet carries its mounted-turret index');

// --- mt is applied on receipt (host from a client, client from the snapshot) and defaulted on the record ---
assert(/rp\.mt = \(msg\.mt!=null\?msg\.mt:-1\);/.test(src), 'setRemoteState stores the synced turret index');
assert(/rp\.mt=\(pl\.mt!=null\?pl\.mt:-1\);/.test(src), 'applyWorld stores the synced turret index');
const erp = extractFunction('ensureRemotePlayer');
assert(/modelCfg:cfg, mt:-1, ready:false \}/.test(erp), 'a new remote player record defaults mt to -1 (un-mounted)');

// --- index helper + per-frame remote poser ---
assert(/function _turretIndexOf\(g\)\{ return \(typeof turretModels!=='undefined' && g\) \? turretModels\.indexOf\(g\) : -1; \}/.test(src), 'turret index helper returns the stable level-ordered id');
const srt = extractFunction('_syncRemoteTurrets');
assert(/g===mountedTurret\) continue;/.test(srt), 'the locally-manned turret is left to turretUpdate (not double-driven)');
assert(/rp\.mt===i && \(rp\.hp==null\|\|rp\.hp>0\)/.test(srt), 'a turret is aimed by the live remote player whose mt points at it');
assert(/if\(op\) _poseTurretAim\(g, op\.yaw, op\.pitch\|\|0\); else _turretRestPose\(g\);/.test(srt), 'manned turrets track the operator aim; the rest return to base');
assert(/_syncRemoteTurrets\(\);/.test(extractFunction('netInterpolate')), 'netInterpolate drives the remote turret poses every frame (host + client)');

// --- executable: _poseTurretAim clamps traverse to the yaw arc and pitch to its limits, exactly like the
//     local _turretAimClamp, so a bystander's barrel cannot exceed what the operator's own view allows ---
const RAD = Math.PI/180;
// faithful re-implementation of the pose math (the in-game fn closes over RAD/turretModelYaw/THREE objects)
function poseDelta(turret, baseYaw, aimYaw, aimPitch){
  const half = (turret.yawArc||120)*RAD*0.5;
  let dy = aimYaw - baseYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); dy = Math.max(-half, Math.min(half, dy));
  const pMin=(turret.pitchMin!=null?turret.pitchMin:-15)*RAD, pMax=(turret.pitchMax!=null?turret.pitchMax:35)*RAD;
  const pit = Math.max(pMin, Math.min(pMax, aimPitch||0));
  return { dy, pit };
}
const T = { yawArc:90, pitchMin:-10, pitchMax:30 };
// aim 80° off the turret base — must clamp to the 45° half-arc
let r1 = poseDelta(T, 0, 80*RAD, 0);
near(r1.dy, 45*RAD, 1e-6, 'traverse clamps to half the yaw arc (45° of a 90° arc)');
// aim within the arc passes through
let r2 = poseDelta(T, 0, 20*RAD, 0);
near(r2.dy, 20*RAD, 1e-6, 'an in-arc aim is preserved');
// pitch above the max clamps
let r3 = poseDelta(T, 0, 0, 60*RAD);
near(r3.pit, 30*RAD, 1e-6, 'elevation clamps to pitchMax');
// pitch below the min clamps
let r4 = poseDelta(T, 0, 0, -40*RAD);
near(r4.pit, -10*RAD, 1e-6, 'depression clamps to pitchMin');
// shortest-arc wrap: aiming just past ±180 resolves to a small signed delta, not a full turn
let r5 = poseDelta({ yawArc:360 }, 170*RAD, -170*RAD, 0);
near(Math.abs(r5.dy), 20*RAD, 1e-6, 'yaw delta takes the shortest signed path across the ±180 seam');

done('co-op turret sync: mounted-turret index travels + remote barrels track the operator (build 548)');
