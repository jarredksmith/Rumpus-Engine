import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 707: physics JOINT system (Rapier revolute/hinge). A dynamic prop can be hinged to a fixed world point or to
// another tagged body, so it swings under physics (doors, levers, see-saws, pendulums) — with optional limits + motor.
// Physics can't run in the Node harness (no Rapier/WASM), so this pins the wiring; the swing itself is browser-verified.

// --- jointApply normalizes the config (defaults + clamped axis) ---
const ja = new Function('o','j', extractFunction('jointApply') + '\nreturn (o,j)=>{ jointApply(o,j); return o.userData.joint; };')();
{ const o={ userData:{} }; const J=ja(o, {});
  eq(J.type,'hinge','defaults to a hinge'); eq(J.axis,'y','default axis is Y (door swing)');
  eq(J.to,'','blank anchor = fixed world point'); eq(J.mspeed,0,'no motor by default'); }
{ const o={ userData:{} }; const J=ja(o, { axis:'bogus', ax:1.5, to:'frame', mspeed:90, lim:1, min:-10, max:80 });
  eq(J.axis,'y','an invalid axis falls back to Y'); eq(J.ax,1.5,'hinge offset kept'); eq(J.to,'frame','tag anchor kept');
  assert(J.lim===true && J.min===-10 && J.max===80, 'limits carried'); eq(J.mspeed,90,'motor speed carried'); }
{ const o={ userData:{} }; const J=ja(o, { axis:'x' }); eq(J.axis,'x','a valid axis (x) is kept'); }

// --- buildJoints uses the Rapier revolute API, guarded, after bodies exist ---
const bj = extractFunction('buildJoints');
assert(/if\(!physWorld \|\| !RAPIER \|\| !RAPIER\.JointData \|\| typeof physWorld\.createImpulseJoint!=='function'\) return;/.test(bj), 'feature-detects the joint API and no-ops if absent');
assert(/RAPIER\.JointData\.revolute\(a1, a2, axis\)/.test(bj), 'builds a revolute (hinge) joint');
assert(/physWorld\.createImpulseJoint\(jd, body, body2, true\)/.test(bj), 'creates the impulse joint between the two bodies');
assert(/RAPIER\.RigidBodyDesc\.fixed\(\)\.setTranslation\(_jWorld\.x, _jWorld\.y, _jWorld\.z\)/.test(bj), 'a blank anchor pins to a fresh fixed body at the hinge point');
assert(/joint\.configureMotorVelocity\(\(J\.mspeed\|\|0\)\*RAD, /.test(bj), 'a motor drives the hinge when set');
// build 757: revolute limits must be set on the JOINT (rapier-compat only reads JointData limit fields for prismatic) — sorted lo<=hi
assert(/if\(J\.lim\)\{ try\{ let lo=\(J\.min\|\|0\)\*RAD, hi=\(J\.max\|\|0\)\*RAD; if\(lo>hi\)\{ const t=lo; lo=hi; hi=t; \} joint\.setLimits\(lo, hi\); \}/.test(bj), 'swing limits applied on the joint (the JointData fields are ignored for revolute)');
assert(!/jd\.limitsEnabled/.test(bj), 'the ineffective JointData-limit path is gone');
assert(/\}catch\(e\)\{ console\.warn\('joint build failed for a prop'/.test(bj), 'each joint is isolated so a bad one never breaks the world');

// --- buildJoints runs inside buildPhysWorld after every body is created ---
assert(/for\(const o of dynamicProps\) createBodyFor\(o\);\s*\n\s*buildJoints\(\);/.test(src), 'buildJoints is called after the dynamic bodies are built');

// --- build 758: stop a towed trailer from shaking — more solver iterations + heavier damping on a jointed body ---
assert(/physWorld\.numSolverIterations = 8;/.test(src), 'the world runs more solver iterations so a hinge resolves stiffly (no buzz)');
const cbf = extractFunction('createBodyFor');
assert(/const _jointed = !!obj\.userData\.joint;/.test(cbf), 'createBodyFor detects a jointed (towed) prop');
assert(/setLinearDamping\(_jointed\?0\.5:0\.2\)\.setAngularDamping\(_jointed\?1\.1:0\.45\)/.test(cbf), 'a jointed body gets heavier linear + angular damping');
assert(/setRestitution\(_jointed\?0:0\.3\)/.test(cbf), 'a jointed body does not bounce on bumps');

// --- serialize + restore (compact j) at all three prop-load sites ---
assert(/if\(o\.userData\.joint\)\{ const J=o\.userData\.joint; e\.j=\{ type:J\.type\|\|'hinge', to:J\.to\|\|'', ax:J\.ax\|\|0, ay:J\.ay\|\|0, az:J\.az\|\|0, axis:J\.axis\|\|'y' \};/.test(src), 'joint serialized compactly');
eq(src.split('if(p.j) jointApply(obj, p.j);').length - 1, 3, 'joint restored at all three prop-load sites');

// --- editor: a Joint fold with anchor / axis / hinge offset / motor ---
assert(/edFold\(animHost, 'joint', 'Joint \(physics\)'/.test(src), 'a Joint (physics) fold in the inspector');
assert(/seg\('Hinge axis','axis',\[\['y','Y \(door\)'\],\['x','X \(see-saw\)'\],\['z','Z'\]\]\)/.test(src), 'hinge-axis picker');
assert(/num\('Motor speed \(°\/s\)','mspeed',-720,720,5\)/.test(src), 'motor-speed control (the wheel/driving basis)');

done('build 707: physics hinge joints (Rapier revolute) — doors / levers / see-saws / pendulums');
