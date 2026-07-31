// build 1212: the hitmarker stops lying about headshots, and headshots get their own tick.
//
// The gameplay-feel critic's HIGH: showHitmarker had two states — white ✕ (hit) and red ✖ (kill) — and
// the duel + co-op-client paths passed `isHead`, so a NON-LETHAL headshot rendered the red KILL marker: a
// false kill-confirm in exactly the mode where you cannot see the target's HP (players disengage from live
// targets on it). Solo headshots had no distinct feedback at all (the "layering" was SFX.hit twice = +3dB,
// not a distinct crack). Now there are three states — hit / head (yellow ✛) / kill — and SFX.headshot is a
// real high dink. Legacy boolean callers (kill true/false) still work.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- showHitmarker, executed against a fake DOM
function render(kind) {
  const hm = { style: {} };
  const body =
    'const $ = () => hm;\n const requestAnimationFrame = () => {};\n' +
    extractFunction('showHitmarker') + '\nshowHitmarker(kind); return hm;';
  return new Function('hm', 'kind', body)(hm, kind);
}
{
  const hit = render('hit'), head = render('head'), kill = render('kill');
  eq(hit.textContent, '✕', 'a body hit is the white tick');
  eq(head.textContent, '✛', 'a headshot is its OWN glyph');
  eq(kill.textContent, '✖', 'a kill is the cross');
  assert(head.style.color !== hit.style.color && head.style.color !== kill.style.color,
    'the head marker is a distinct COLOUR (yellow) — not confusable with a hit or a kill');
  eq(head.style.color, '#ffd166', '...specifically the headshot yellow');
  eq(kill.style.color, '#ff4d6d', 'kill stays red');
}
{ // the crux: a headshot is NEVER the kill marker
  const head = render('head'), kill = render('kill');
  assert(head.textContent !== kill.textContent && head.style.color !== kill.style.color,
    'a non-lethal headshot can never be mistaken for a kill-confirm — the false-positive is structurally gone');
}
{ // legacy boolean compatibility (enemyHurt returns a kill bool)
  eq(render(true).textContent, '✖', 'a truthy legacy arg (kill returned) is still a kill marker');
  eq(render(false).textContent, '✕', 'a falsy legacy arg is a plain hit');
  eq(render(undefined).textContent, '✕', 'no arg is a plain hit');
}

// ---------------------------------------------------------------- the call sites no longer pass isHead-as-kill
{
  // the two client bugs: both must now map isHead to the 'head' STATE, not the kill state
  assert(/showHitmarker\(isHead\?'head':'hit'\); SFX\.hit\(\); if\(isHead\) SFX\.headshot\(\);/.test(src),
    'the pvp and enemy CLIENT paths render the head state and play the dink (was: red kill marker + double hit)');
  eq((src.match(/showHitmarker\(isHead\?'head':'hit'\)/g) || []).length, 3,
    'all three client-side headshot sites are fixed (pvp client, enemy client, turret client)');
  // the host/solo paths: kill wins, else head, else hit
  assert(/showHitmarker\(_ek\?'kill':\(isHead\?'head':'hit'\)\); SFX\.hit\(\); if\(isHead && !_ek\) SFX\.headshot\(\);/.test(src),
    'the solo enemy path shows kill>head>hit and dinks a non-lethal headshot');
  assert(/showHitmarker\(k\?'kill':\(isHead\?'head':'hit'\)\)/.test(src),
    'the turret host path does the same');
  // the old +3dB double-hit hack for headshots is gone everywhere
  assert(!/if\(isHead\) SFX\.hit\(\);/.test(src), 'the "play the hit sound twice for a headshot" hack is fully replaced by SFX.headshot');
  assert(/headshot\(\)\{ tone\(\{freq:1400, type:'sine', dur:0\.07, vol:0\.13, slideTo:1950\}\); \}/.test(src),
    'SFX.headshot is a real high-frequency dink');
}

done('build 1212: the hitmarker has three states — hit/head/kill executed against a fake DOM proving the head marker is its own glyph AND colour and can never be the kill marker, legacy booleans still map correctly, all three client false-kill bugs now render the head state, the host/solo paths rank kill>head>hit, and a dedicated SFX.headshot replaces the +3dB double-hit hack');
