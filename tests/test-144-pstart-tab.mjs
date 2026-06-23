import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// player-start tab must be reachable from the Player mode (its own area as of build 652)
assert(/player:\s*\[[^\]]*'pstart'[^\]]*\]/.test(src), 'pstart (player start) is in MODE_TARGETS.player');
assert(/pstart:\s*\{[\s\S]*?isPstart: true/.test(src), 'pstart target still defined');
done('pstart-tab');
