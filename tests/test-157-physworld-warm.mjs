import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// buildPhysWorld must step once after creating colliders so the KCC sees them on frame 1
assert(/for\(const o of dynamicProps\) createBodyFor\(o\);\s*\n\s*buildJoints\(\);[^\n]*\n\s*physAccum = 0;\s*\n[\s\S]*?try\{ physWorld\.step\(\); \}catch\(e\)\{\}/.test(src), 'physics world is warmed (stepped once) after bodies + joints are built');   // build 707: joints created after bodies, before the warm step
assert(/const reveal=\(\)=>\{ try\{ if\(physWorld\) buildPhysWorld\(\); \}catch\(e\)\{\}/.test(src), 'physics world rebuilt once assets finish loading (so KCC has all colliders)');   // build 554: reveal() now starts the deferred intro BEFORE hiding the loader, so the loader reveals the cinematic's painted first frame
done('physworld-warm');
