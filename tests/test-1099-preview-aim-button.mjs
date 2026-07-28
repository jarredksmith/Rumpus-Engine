// build 1099: the third-person preview's hip/aim switch works again.
//
// The preview window's header is drag-to-move: pointerdown starts a drag and preventDefaults,
// which suppresses the compatibility click event. The handler excused the ✕ close button but
// not the hip/aim button — so pressing it started a (zero-pixel) window drag and the click
// never fired. The button looked dead.
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();
assert(/hdr\.addEventListener\('pointerdown', \(e\)=>\{ if\(e\.target===x \|\| e\.target===ad\) return;/.test(src),
  'the drag handler now excuses BOTH header buttons');
assert(/ad\.onclick=\(\)=>\{ _tpPvAds=_tpPvAds\?0:1; \};/.test(src), 'the switch itself still just flips the framing');

done('build 1099: hip/aim preview switch responds');
