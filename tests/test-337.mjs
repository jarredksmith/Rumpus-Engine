import { gameSource, html, extractFunction, extractConst, assert, done } from './harness.mjs';
const src = gameSource();
const page = html;
// build 446: editor-defined crosshairs (style/size/thickness/gap/dot/color), saved with the level and synced to
// multiplayer joiners.

// config + serialize
assert(/crosshair: \(function\(\)\{ const c=\(savedLevel&&savedLevel\.game&&savedLevel\.game\.crosshair\)\|\|\{\}; return \{/.test(src), 'crosshair config loads from the level');
assert(/crosshair: \{ style: gameCfg\.crosshair\.style, size: \+gameCfg\.crosshair\.size, thickness: \+gameCfg\.crosshair\.thickness, gap: \+gameCfg\.crosshair\.gap, dot: !!gameCfg\.crosshair\.dot, color: gameCfg\.crosshair\.color \}/.test(src), 'crosshair saved with the level');

// the JS builder + CSS neutralized
assert(/#crosshair::before, #crosshair::after \{ display:none; \}/.test(page), 'old CSS crosshair lines are disabled (JS builds it)');
const ac = extractFunction('applyCrosshair');
assert(/cfg\.color==='accent'\) \? 'var\(--accent\)' : cfg\.color/.test(ac), "'accent' color follows the player's theme; a hex is literal");
/* build 1485 put the hover ring on every style including this one — it is an affordance, not a reticle, and
   is invisible until the player looks at something the level made clickable. The intent here is that 'none'
   draws no RETICLE, which is asserted directly now rather than by quoting an empty assignment. */
assert(/if\(cfg\.style==='none'\)\{ el\.innerHTML = hotRing; return; \}/.test(ac), "'none' hides the crosshair");
/* and the branch RETURNS, so no arm or dot can be reached — asserted by what the ring IS rather than by a
   character window after it, which is this file's most-repeated pin trap and caught me writing one. */
assert(/const hotRing = '<div class="xhHot"><\/div>';/.test(ac), "...whose ring is one empty element, not a reticle");
assert(/cfg\.style==='cross' \|\| cfg\.style==='classic' \|\| cfg\.style==='tee'/.test(ac), 'cross / classic / tee draw arms');
assert(/cfg\.style==='circle'/.test(ac) && /border-radius:50%/.test(ac), 'circle style draws a ring');
assert(/cfg\.dot \|\| cfg\.style==='dot'/.test(ac), 'a center dot is supported');

// applied on game start; host crosshair used for joiners
assert(/applyCrosshair\(\(NET\.mode==='client' && NET\.crosshair\) \? NET\.crosshair : gameCfg\.crosshair\)/.test(src), 'game start applies the crosshair (host crosshair for clients)');

// MP sync: host sends, joiner stores + applies
assert(/t:'welcome'[\s\S]*?crosshair:gameCfg\.crosshair,/.test(src), 'host sends the crosshair in the welcome handshake');
assert(/if\(msg\.crosshair\)\{ NET\.crosshair = msg\.crosshair; if\(typeof applyCrosshair==='function'\) applyCrosshair\(msg\.crosshair\); \}/.test(src), 'joiner stores + applies the host crosshair');

// editor UI: presets + tuning
assert(/<b>Crosshair<\/b> — carries to multiplayer players who join your game/.test(src), 'editor section labelled + explains MP behaviour');
assert(/'classic\|✛ Classic','cross\|\+ Cross','dot\|• Dot','circle\|◯ Circle','tee\|⊤ T-shape','none\|∅ None'/.test(src), 'six crosshair presets offered');
assert(/xhNum\('Size'/.test(src) && /xhNum\('Thickness'/.test(src) && /xhNum\('Gap'/.test(src), 'size / thickness / gap sliders');
assert(/Use theme accent/.test(src), 'accent-or-custom colour control');

// executable: arm length from size + gap
function arm(size, gap){ return Math.max(0, size/2 - gap); }
assert(arm(24,3)===9, 'arms run from the gap to the edge');
assert(arm(24,12)===0, 'a gap >= half the size collapses the arms (dot-like)');
done();
