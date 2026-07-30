// build 1160: a jump pressed a moment after leaving a ledge, or a moment before landing, still fires.
//
// The gate was `_jPressed && player.onGround` on the EXACT frame. Build 926 proved this fault for slide —
// "onGround flickers mid-stride... ate ~half of all slides" — and buffered it; jump never got the fix. The
// review panel flagged the inconsistency; this build applies the engine's own lesson to its own jump.
import { gameSource, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const COYOTE = +src.match(/const COYOTE_T=([\d.]+)/)[1];
const BUF    = +src.match(/JUMP_BUF=([\d.]+)/)[1];
const JUMP_CD = +src.match(/const JUMP_CD=([\d.]+)/)[1];

// ---------------------------------------------------------------- the shape
{
  assert(/if\(player\.onGround\) _coyoteT = COYOTE_T; else if\(_coyoteT>0\) _coyoteT -= dt;/.test(src),
    'grounded refreshes the coyote window, air decays it');
  assert(/if\(_jPressed\) _jumpBufT = JUMP_BUF; else if\(_jumpBufT>0\) _jumpBufT -= dt;/.test(src),
    'a press refreshes the buffer, which decays like the slide buffer (build 926)');
  assert(/_jumpBufT>0 && \(player\.onGround \|\| _coyoteT>0\) && \(player\.jumpCd\|\|0\)<=0/.test(src),
    'the jump fires when the windows overlap, still behind the cooldown');
  assert(/player\.vel\.y = JUMP; player\.onGround=false; _coyoteT=0; _jumpBufT=0;/.test(src),
    'and consumes BOTH windows, so coyote can never grant a second jump mid-air');
  assert(!/_jPressed && player\.onGround && \(player\.jumpCd\|\|0\)<=0[^\n]*player\.vel\.y = JUMP/.test(src),
    'the exact-frame gate is gone');
  assert(COYOTE > 0 && COYOTE <= 0.15, 'coyote is a forgiveness window, not a flight power (' + COYOTE + 's)');
  assert(BUF > 0 && BUF <= 0.25, 'the buffer matches the slide buffer\'s scale (' + BUF + 's)');
}

// ---------------------------------------------------------------- executed: the window logic frame by frame
{
  // replay the four lines with a synthetic player at 60fps
  function sim(frames){   // frames: [{g: grounded, p: pressed}], returns array of "jumped" flags
    const dt = 1/60; let coyote = 0, buf = 0, cd = 0; const out = [];
    for (const f of frames) {
      if (cd > 0) cd -= dt;
      if (f.g) coyote = COYOTE; else if (coyote > 0) coyote -= dt;
      if (f.p) buf = BUF; else if (buf > 0) buf -= dt;
      let jumped = false;
      if (buf > 0 && (f.g || coyote > 0) && cd <= 0) { jumped = true; coyote = 0; buf = 0; cd = JUMP_CD; f.g = false; }
      out.push(jumped);
    }
    return out;
  }
  const F = (n, g, pAt) => Array.from({ length: n }, (_, i) => ({ g, p: i === pAt }));

  // 1. THE BUG: press 3 frames after walking off a ledge — old gate ate it, coyote honours it
  {
    const frames = [...F(5, true, -1), ...F(10, false, 2)];   // grounded 5, then airborne, press on air-frame 2
    const r = sim(frames);
    assert(r[7] === true, 'a press 3 frames after leaving the ledge still jumps (coyote)');
  }
  // 2. press BEFORE landing: buffered and fired on the first grounded frame
  {
    const frames = [...F(8, false, 4), ...F(5, true, -1)];    // airborne 8 w/ press at frame 4, then grounded
    const r = sim(frames);
    assert(r.slice(0, 8).every(v => !v), 'the press in the air does not jump mid-air');
    assert(r[8] === true, '...and fires on the first grounded frame (buffer)');
  }
  // 3. no double jump: after firing, a long fall grants nothing
  {
    const frames = [...F(5, true, 4), ...F(30, false, 10)];   // jump on ground, then press again mid-fall
    const r = sim(frames);
    eq(r.filter(Boolean).length, 1, 'one press on the ground + one mid-fall = exactly one jump');
  }
  // 4. the buffer expires: a press far too early does nothing on landing
  {
    const late = Math.ceil((BUF + 0.05) * 60);
    const frames = [...F(late + 5, false, 0), ...F(5, true, -1)];
    const r = sim(frames);
    assert(r.every(v => !v), 'a press ' + (late / 60).toFixed(2) + 's before landing has expired');
  }
  // 5. the coyote window expires: a press well after leaving the ledge does nothing
  {
    const lateP = Math.ceil((COYOTE + 0.05) * 60);
    const frames = [...F(5, true, -1), ...F(lateP + 10, false, lateP)];
    const r = sim(frames);
    assert(r.every(v => !v), 'a press ' + (lateP / 60).toFixed(2) + 's after leaving the ledge is a real miss');
  }
  // 6. cooldown still prevents bunny-hopping: two presses 0.2s apart on the ground = one jump
  {
    const frames = [...F(5, true, 2), ...F(12, true, 8)];
    const r = sim(frames);
    eq(r.filter(Boolean).length, 1, 'JUMP_CD still gates rapid re-jumps');
  }
}

done('build 1160: jump gets the forgiveness the slide already had — a ' + COYOTE + 's coyote window after leaving the ground and a ' + BUF + 's press buffer before landing, both consumed on fire so no double jumps, with JUMP_CD unchanged');
