import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1295: REPORTED — "if I give the player a sword as a melee weapon, I can't break/explode props if I
// swing at it." Three faults in one block of `meleeAttack`, all from it having been written for a
// first-person solo punch and never revisited. The ENEMY cone twenty lines above already does all three
// things right, which is exactly what made the difference invisible: enemies took the hit, props did not.
//
// Measured live on the same crate 1.5 m in front of the player:
//   first person   camera->prop 1.5   player->prop 1.5   old test HITS
//   third person   camera->prop 5.7   player->prop 1.5   old test MISSES   (boom 4.2 m behind)
// After: the real swing deals the crowbar's full 60 damage in BOTH views.

// build 1303: the swing and the contact are two functions now — the blow lands after the weapon's
// windup, not on the input frame. These assertions are about the CONTACT, so read both halves.
const melee = extractFunction('meleeAttack') + '\n' + extractFunction('_meleeStrike');
const block = melee.slice(melee.indexOf('if(dynamicProps.length){'));

// ---------------------------------------------------------------- 1. the reach is measured from the player
{
  assert(/_meleeRc\.set\(_meleeOrig\.set\(px, py, pz\), _meleeDir\.copy\(fwd\)\.normalize\(\)\)/.test(block),
    'the swing casts from the PLAYER along the swing direction');
  assert(/_meleeRc\.near = 0; _meleeRc\.far = RANGE;/.test(block),
    '...and the reach IS the ray, so the prop test and the enemy cone agree on what "in range" means');
  assert(!/setFromCamera/.test(block), 'nothing in the block starts at the camera any more');
  assert(!/\[0\]\.distance<=RANGE/.test(block),
    '...and nothing range-limits on a camera distance — that comparison is what could never pass');
  // the cone above it has always used the player, and still does
  assert(/const cone=\(tx,ty,tz\)=>\{ const dx=tx-px, dy=ty-py, dz=tz-pz/.test(melee),
    'the enemy cone measures from the player — the asymmetry this build removes');
}
{ // THE GEOMETRY, from the shipped constants: a prop in front of the player is ALWAYS out of camera reach
  const RANGE = +src.match(/MELEE_RANGE = ([0-9.]+)/)[1];
  const BOOM = +src.match(/let tpDist = ([0-9.]+);/)[1];
  eq(RANGE, 2.9, 'the melee reach ships at 2.9 m');
  eq(BOOM, 4.2, 'and the third-person boom at 4.2 m behind');
  assert(BOOM > RANGE,
    'THE BUG IN ONE COMPARISON: the boom alone exceeds the whole reach, so a prop directly in front of the player is further from the camera than a swing can reach — melee could never break a prop in third person, for any prop, at any distance');
  // and the measurement agrees with the arithmetic: 4.2 behind + 1.5 in front = 5.7
  assert(Math.abs((BOOM + 1.5) - 5.7) < 0.01, 'the probe’s 5.7 m is exactly boom + the crate distance');
}

// ---------------------------------------------------------------- 2. it aims where the body swings
{
  assert(/_meleeDir\.copy\(fwd\)/.test(block), 'the ray uses the same `fwd` the cone uses');
  // ...which is the one corrected for the cursor-aim views
  assert(/if\(typeof cursorAimActive==='function' && cursorAimActive\(\)\) fwd\.set\(-Math\.sin\(player\.yaw\), 0, -Math\.cos\(player\.yaw\)\);/.test(melee),
    'and `fwd` is corrected for the twin-stick / chase-cursor views, where the body faces the cursor and the camera does not');
  assert(melee.indexOf('cursorAimActive()') < melee.indexOf('_meleeDir.copy(fwd)'),
    '...before the ray is built, or the correction would not reach it');
}

// ---------------------------------------------------------------- 3. a client can swing too
{
  assert(!/NET\.mode!=='client' && dynamicProps\.length/.test(melee),
    'the whole block is no longer skipped on a client');
  assert(/if\(NET\.mode==='client'\)\{ if\(NET\.conn\) try\{ NET\.conn\.send\(\{t:'propHit', nid:o\.userData\.nid, d:DMG, dir:\[dir\.x,dir\.y,dir\.z\], s:8, pt:\[pt\.x,pt\.y,pt\.z\]\}\); \}catch\(e\)\{\}/.test(block),
    'a client asks the host, exactly as a shot does');   /* build 1305 appends the locally-predicted impact sound to the same branch */
  assert(/else \{ const broke=damageProp\(o, DMG, pt, dir, 8, NET\.myId\); if\(!broke\) pushDynamic\(o, dir, 8, pt\); \}/.test(block),
    'and the host (or solo) applies it directly');
  // THE PACKET MUST MATCH WHAT THE HOST READS — pinning one end alone is how a wire goes dead silently
  const h = src.slice(src.indexOf("msg.t==='propHit'"), src.indexOf("msg.t==='propHit'") + 420);
  for (const f of ['msg.nid', 'msg.d', 'msg.dir[0]', 'msg.s', 'msg.pt'])
    assert(h.includes(f), 'the host handler reads ' + f + ', which the swing sends');
  assert(/_netDmg\(msg\.d\)/.test(h),
    'and the damage still goes through the host bound (build 1130) — a melee claim is not more trusted than a shot');
}

// ---------------------------------------------------------------- it costs nothing per swing
{
  assert(/const _meleeRc = new THREE\.Raycaster\(\), _meleeOrig = new THREE\.Vector3\(\), _meleeDir = new THREE\.Vector3\(\), _meleePt = new THREE\.Vector3\(\);/.test(src),
    'the raycaster and its vectors are module scope (build 1168; 1311 added the arc test\'s closest-point scratch)');
  assert(!/new THREE\.Raycaster\(\)/.test(block), '...never allocated inside the swing');
  // ITS OWN raycaster, because `far` is a persistent property and the shared one is read everywhere
  assert(/Its own, because `far` has to be the swing's reach and the\n\/\/ shared `raycaster` is read by a dozen other systems/.test(src),
    'and why it is not the shared raycaster is recorded — setting far on that one would leak the limit');
  assert(!/raycaster\./.test(block), 'the shared raycaster is not touched by this block at all');
}

// ---------------------------------------------------------------- the reasoning survives
{
  assert(/Melee has therefore never broken a prop in third person\./.test(src), 'the finding is stated plainly');
  assert(/camera->prop 1\.5 \(hits\), third person camera->prop 5\.7 \(misses\)/.test(src),
    '...with the measurement that settled it');
  assert(/they just conclude melee is decorative/.test(src),
    'and why the co-op half would never have been reported as a bug');
}

done('build 1295: a melee swing reaches props from the PLAYER, in every view, for every peer — the prop test cast from the camera and range-limited on the distance from the camera, so with a 2.9 m reach and a 4.2 m boom it could never pass in third person (measured: camera->prop 5.7 against player->prop 1.5 for the same crate); it also ignored the cursor-aim correction its own enemy cone applies, and skipped clients entirely while the bullet path has always relayed propHit to the host. All three fixed in the block they share, with the swing’s own module-scope raycaster so the reach can be its `far` without leaking onto the shared one');
