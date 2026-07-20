// (build 151) Radial deploy menu: hold Tab to open a wheel of buildable props (crate/barrel/ball/cone/
// explosive); aim a wedge with the mouse and click (or release Tab) to spawn it in front of you. Deployed
// props are dynamic so they grab/stack/throw and ride the prop reconciler into co-op (host simulates).
import { gameSource, extractFunction, html, done, assert } from './harness.mjs';
const src = gameSource();

// build 671: the radial menu is now a per-level configurable list (radialCfg), default still crate..explosive
assert(/const DEFAULT_RADIAL = \[/.test(src) && /label:'Explosive', icon:/.test(src), 'default radial set incl. explosive');
assert(/let radialCfg = _sanitizeRadial\(savedLevel && savedLevel\.radial\);/.test(src), 'radial menu is per-level configurable');
assert(/function openRadial\(\)/.test(src) && /function closeRadial\(deploy\)/.test(src) && /function radialMove\(dx,dy\)/.test(src) && /function deployProp\(slot, at\)/.test(src), 'radial + deploy fns (build 928: aimed placement)');

const op = extractFunction('openRadial');
assert(/if\(!gameOn \|\| editorOpen \|\| shopOpen \|\| paused \|\| duelDead \|\| radialOpen\) return;/.test(op), 'wheel only opens in live play');

const dp = extractFunction('deployProp');
assert(/if\(.*_deployCD>0\)\{/.test(dp) && /_deployCD = at \? 0\.2 : 0\.5;/.test(dp),
  'deploy has a cooldown (build 928: faster while building; 1018: refusals from build mode explain themselves)');
assert(/toast\('Can\\u2019t build: '/.test(dp), 'a guard refusal in build mode toasts the specific blocker (build 1018)');
assert(/const _ready=\(obj\)=>\{[\s\S]{0,400}?obj\.userData\.runtime = true;[\s\S]*?if\(!slot\.anc\) setPropDynamic\(obj, true\);/.test(dp)
  && /spawnProp\(slot\.src\|\|'box', \[px, py, pz, 0,yaw,0, sc\], _ready,/.test(dp),
  'deploys a dynamic prop at the aim (build 928: anchored stays static; 1017: shared _ready + retry/toast on load failure)');
assert(/Could not load that prop/.test(dp), 'a failed deploy load says so instead of dying as a console.warn (build 1017)');
assert(/const mat = \{\}; if\(slot\.col!=null\) mat\.col=slot\.col; if\(slot\.tex\) mat\.tex=slot\.tex;/.test(dp), 'the slot’s colour/texture ride the prop (and sync via the reconciler)');
assert(/if\(slot\.exp\)\{ obj\.userData\.explosive=true; obj\.userData\.blastRadius=7; obj\.userData\.blastDmg=70; obj\.userData\.impactVel=10; \}/.test(dp), 'explosive option flags the prop');

assert(/if\(e\.code===BINDS\.radial\)\{ if\(buildMode\)\{ exitBuildMode\(\); e\.preventDefault\(\); return; \} if\(!e\.repeat\) openRadial\(\); e\.preventDefault\(\); return; \}/.test(src) && /radial:'Tab'/.test(src), 'hold Tab (rebindable) opens the wheel; a second press ends build mode (build 928)');
assert(/if\(e\.code===BINDS\.radial && radialOpen\) closeRadial\(true\);/.test(src), 'releasing Tab (the radial bind) confirms the highlighted wedge');
assert(/if\(radialOpen\)\{ radialMove\(e\.movementX, e\.movementY\); return; \}/.test(src), 'mouse aims the wheel + freezes look');
assert(/if\(radialOpen\)\{ if\(e\.button===0\) closeRadial\(true\); return; \}/.test(src), 'click deploys the highlighted wedge');
assert(/<div id="radial"><div id="radialRing">/.test(html) && /#radial \.radItem\.hot/.test(html), 'radial overlay element + style');
done('radial deploy menu');
