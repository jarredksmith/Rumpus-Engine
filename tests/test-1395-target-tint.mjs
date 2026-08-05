// build 1395 — REPORTED FROM PLAY: "when a prop is set as something you can blow up/break (target practice
// style), when it reloads the prop, the prop has a red tint to it."
//
// `damageProp` paints a 140 ms orange impact flash (0x661a00 at intensity 0.8) and stamps `userData._flash`.
// `updateFragments` decays it — by walking `dynamicProps`. Build 1390's static shootable target is not in
// that list, so the flash was set on every hit and NOTHING EVER CLEARED IT: a 140 ms effect became
// permanent, and a reset target (build 1391) came back still wearing it.
//
// THIS IS BUILD 1392'S DEFECT FOR THE FOURTH TIME. That build found three consumers of "which props can be
// hurt" still asking the dynamic list — the bullet walk, the turret walk, and the melee block — and fixed
// them behind one predicate. This is the fourth, and it is why `damageableProps()` is a function rather
// than three inline conditions: the fix is to call the thing that already answers the question.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ------------------------------------------------- the decay walks the right list ----
{
  const fn = extractFunction('updateFragments');
  assert(/for\(const o of damageableProps\(\)\)\{/.test(fn),
    'the flash decay walks every prop that can be HURT, not just the dynamic ones');
  const blk = fn.slice(0, fn.indexOf('if(!fragments.length)'));
  // The first draft of this counted the bare name `dynamicProps` and was failed by the COMMENT in the fix
  // explaining what it used to walk. A pin must not be satisfiable by prose, and it must not be defeatable
  // by prose either — build 164 and build 1393 both record this trap. Assert the LOOP.
  assert(!/for\(const o of dynamicProps\)/.test(blk),
    'and nothing in the decay block iterates dynamicProps — one surviving loop is one prop class that ' +
    'stays tinted, which is exactly how this shipped');

  // executed: the decay, against the two prop classes, with the SAME predicate the engine uses
  const damageable = new Function('dynamicProps', 'propModels', `
    const _dmgProps = [];
    return function(){ _dmgProps.length = 0;
      for(const o of dynamicProps) _dmgProps.push(o);
      for(const o of propModels){ if(o && o.userData && o.userData.shootable && !o.userData.phys) _dmgProps.push(o); }
      return _dmgProps; };`);
  const mkProp = (ud) => {
    const mat = { emissive: { hex: 0x661a00, setHex(h){ this.hex = h; } }, emissiveIntensity: 0.8 };
    return { userData: Object.assign({ _flash: 1 }, ud), _mat: mat,
      traverse(f){ f({ isMesh: true, material: mat }); } };
  };
  const decay = (props, list) => {
    // the shipped body, lifted: the only thing this test changes is which list it is handed
    const now0 = 1000;
    for(const o of list){
      if(o.userData._flash){ const a = now0 - o.userData._flash;
        if(a > 140){ o.userData._flash = 0; const _em = o.userData.emit;
          o.traverse(m=>{ if(m.isMesh && m.material && m.material.emissive){
            if(_em){ m.material.emissive.setHex(_em.c); m.material.emissiveIntensity = _em.i; }
            else { m.material.emissive.setHex(0x000000); m.material.emissiveIntensity = 0; } } }); } }
    }
  };
  const dyn = mkProp({ phys: {} });
  const tgt = mkProp({ shootable: true });
  const plain = mkProp({});
  const get = damageable([dyn], [dyn, tgt, plain]);

  eq(get().length, 2, 'the damageable set is the dynamic prop and the static target');
  decay(null, get());
  eq(dyn._mat.emissive.hex, 0x000000, 'the DYNAMIC prop clears — it always did (the control)');
  eq(tgt._mat.emissive.hex, 0x000000,
    'and the STATIC TARGET clears too, which is the whole report: before this build it was never in the ' +
    'list the decay walked, so it kept 0x661a00 at intensity 0.8 forever');
  eq(tgt._mat.emissiveIntensity, 0, '...intensity back to nothing');
  eq(tgt.userData._flash, 0, '...and the stamp cleared, so it decays once rather than every frame');
  eq(plain._mat.emissive.hex, 0x661a00,
    'a prop that can never be damaged is not in the set and is not touched — the decay must not be a ' +
    'per-frame traverse of every prop in the level (build 1168)');

  // an AUTHORED glow is restored, not blacked out
  const glow = mkProp({ shootable: true, emit: { c: 0x38f5b5, i: 3 } });
  decay(null, damageable([], [glow])());
  eq(glow._mat.emissive.hex, 0x38f5b5, 'a prop with its own emissive gets ITS colour back...');
  eq(glow._mat.emissiveIntensity, 3, '...at its own intensity, not black');
}

// ------------------------------------------------------ and a reset comes back clean ----
// Belt and braces, and not redundant: the decay only runs while the prop is alive. A target that shattered
// mid-flash is invisible with the tint still on it, and build 1391's restore makes it visible again.
{
  const fn = extractFunction('_restoreDestroyedProp');
  assert(/o\.userData\._flash = 0;/.test(fn), 'the restore clears the flash stamp outright');
  assert(/if\(_em\)\{ m\.material\.emissive\.setHex\(_em\.c\); m\.material\.emissiveIntensity = _em\.i; \}/.test(fn),
    '...and repaints the prop\'s own authored glow if it has one');
  assert(/else \{ m\.material\.emissive\.setHex\(0x000000\); m\.material\.emissiveIntensity = 0; \}/.test(fn),
    '...or black if it does not');
  assert(fn.indexOf('_flash = 0') < fn.indexOf('adoptModelLights'),
    'and it happens with the rest of the state reset, not tacked on after the lights');
}

// Probed live (tools/probe/target-tint.mjs), with a DYNAMIC prop beside the target as the control — because
// a static target that cleared while the control did not would mean the probe, not the fix:
//
//   STATIC    before #000000 @0  ->  hit #661a00 @0.8  ->  6 frames on #000000 @0
//   DYNAMIC   before #000000 @0  ->  hit #661a00 @0.8  ->  6 frames on #000000 @0     (identical)
//   REPORT    destroyed while flashing (#661a00, invisible) -> reset -> #000000 @0, flash cleared, hp 500/500
//   GLOW      an authored #38f5b5 @3 survives hit -> destroy -> reset and comes back as itself
//
// The setup row is the other half of the argument: `staticInDyn: false, inDamageable: true` — the target
// was outside the list the decay used to walk and is inside the one it walks now.
done('build 1395: a target that has been shot stops wearing the hit');
