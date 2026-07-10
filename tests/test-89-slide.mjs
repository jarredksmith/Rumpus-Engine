// (build 130) Slide: tapping crouch while sprinting + grounded + moving launches a brief slide that
// decays to a walk, dips the camera, and cancels on jump. Edge-detected so holding crouch won't repeat.
import { gameSource, done, assert } from './harness.mjs';
const src = gameSource();
assert(/let sliding=false, slideT=0, slideCD=0, _prevSlideKey=false, _slideBufT=0; const slideDir=new THREE\.Vector3\(\); const SLIDE_DUR=0\.55;/.test(src), 'slide state + duration (build 926: + tap buffer)');
assert(/const _slideEdge = _slideKey && !_prevSlideKey;/.test(src), 'slide key (C) press is edge-detected (tap, not hold) — build 377');
assert(/if\(!sliding && slideCD<=0 && _slideBufT>0 && _sprinting && player\.onGround && wish\.lengthSq\(\)>0\.01/.test(src), 'only slides while running on the ground (build 926: from the buffered tap)');
assert(/const slSpeed = SPEED\*SPRINT\*1\.75 \* \(0\.4 \+ 0\.6\*k\)/.test(src), 'fast launch decaying to a walk');
assert(/crouching = true; crouchT = Math\.min\(1, crouchT \+ dt\*10\);/.test(src), 'camera dips during the slide');
assert(/if\(slideT<=0 \|\| !player\.onGround\)\{ sliding=false; slideCD=0\.55; \}/.test(src), 'slide ends on timeout / leaving the ground, with a cooldown');
assert(/player\.vel\.y = JUMP; player\.onGround=false; sliding=false;/.test(src), 'jumping cancels the slide');
done('slide');
