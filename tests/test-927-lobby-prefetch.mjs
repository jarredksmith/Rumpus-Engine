// (build 927) LOBBY ASSET PREFETCH + SLIDE SPRINT GRACE.
// The welcome handler stored the host's level but downloads only began inside startGame() — the
// whole lobby wait was wasted, then every GLB (props, enemy models, avatars, anim packs) came down
// mid-round: joiners saw capsules and missing props for ~30s. The client now prefetches every
// model the pending level + roster reference the moment the welcome lands; character broadcasts
// prefetch too; the lobby status line reports "Downloading level models — N left…" until warm.
// SLIDE: sprint was read on the buffer-consume frame, so easing off Shift a hair before C still
// ate the tap — sprint now has a 0.3s grace window.
// Verified live: a welcome-shaped level queued 8/8 unique URLs (6 GLBs + 2 anim packs, primitives
// skipped, dupes collapsed); the ticker showed the live count then settled; Shift released 120ms
// before the C tap still slid.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const src = gameSource();

// the prefetcher covers every model family and skips primitives
const pf = extractFunction('_prefetchLevelAssets', src);
assert(/PRIMS = \/\^\(box\|sphere\|cylinder\|cone\|pillar\|ramp\|stairs\|dome\|tube\|torus\)\$\//.test(pf), 'primitives never hit the network');
assert(/level\.props\|\|\[\]/.test(pf) && /level\.enemies\|\|\{\}/.test(pf) && /level\.player/.test(pf) && /level\.roster\|\|\[\]/.test(pf),
  'props + enemy models + player + roster all prefetch');
assert(/ANIM_LIB_PACKS\[p\]\) urls\.add\(ANIM_LIB_PACKS\[p\]\.url\)/.test(pf), 'referenced animation packs prefetch too');
assert(/new Set\(\)/.test(pf), 'URLs are deduped before queueing');

// fired from the welcome (lobby AND straight-into-match joins), plus the lobby ticker
assert(/try\{ _prefetchLevelAssets\(NET\.pendingLevel, NET\.charById\); \}catch\(e\)\{\}/.test(src),
  'the welcome handler starts the downloads immediately');
assert(/if\(msg\.phase==='lobby'\)\{ showClientLobby\(\); _lobbyDlWatch\(\); \}/.test(src), 'the lobby shows download progress');
const tick = extractFunction('_lobbyDlTick', src);
assert(/Downloading level models/.test(tick) && /_glbPending/.test(tick), 'the ticker reports in-flight count');
assert(/if\(NET\.phase!=='lobby'\)\{ if\(_lobbyDlT\)\{ clearInterval\(_lobbyDlT\)/.test(tick), 'the ticker stops itself when the lobby ends');

// character broadcasts warm that player's model + pack
const arc = extractFunction('applyRemoteChar', src);
assert(/if\(cfg\.url\) loadGLTFCached\(cfg\.url/.test(arc) && /ANIM_LIB_PACKS\[cfg\.animLib\]\.url/.test(arc),
  'each character broadcast prefetches the model and its animation pack');

// slide sprint grace
assert(/if\(_sprinting\) _sprintGraceT = 0\.3; else if\(_sprintGraceT>0\) _sprintGraceT -= dt;/.test(src),
  'sprint carries a 0.3s grace window');
assert(/_slideBufT>0 && \(_sprinting \|\| _sprintGraceT>0\) && player\.onGround/.test(src),
  'the slide accepts a tap within the grace window (Shift eased off a hair early)');

done('build 927: joiners download the level in the lobby, and C-slides forgive a slipped Shift');
