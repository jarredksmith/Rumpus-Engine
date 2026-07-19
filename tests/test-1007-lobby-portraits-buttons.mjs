// (build 1007) LOBBY FACELIFT — portraits + button chrome.
// - Portraits: the thumb pipeline framed the FULL body in a small square, so lobby cards showed
//   a dark sliver. _renderCharThumb gains a bust option (head-and-shoulders crop: aim at the
//   upper chest, frame ~46% of the height), renders at 160px, and composites the card's tint
//   gradient BEHIND the transparent cutout via a dataset backdrop. Portraits now fill the card.
// - Buttons: the numbered step chips are gone; CHARACTER/START/READY are the Publish-CTA family
//   (filled accent primary + dark secondary), LEAVE is a quiet ghost, and the bot count is a
//   real −/+ stepper instead of a raw white number spinner.
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- portraits: bust framing + backdrop compositing ----
const rt = extractFunction('_renderCharThumb', src);
assert(/function _renderCharThumb\(cfg, swatchEl, opts\)/.test(rt), 'thumb renderer takes options');
assert(/\+\(\(opts&&opts\.bust\)\?'\|bust':''\)/.test(rt), 'bust renders cache separately from full-body renders');
assert(/const frameH=Math\.max\(0\.35, size\.y\*0\.42, size\.x\*0\.85\);/.test(rt)
  && /const focusY=size\.y\*0\.56 - frameH\*0\.5;/.test(rt),
  'bust crop is TOP-anchored (frame top just above the head; widens for broad shoulders — build 1008)');
assert(/_thumbCam\.lookAt\(0, focusY, 0\);/.test(rt) && /_thumbCam\.lookAt\(0,0,0\);/.test(rt),
  'bust aims at the chest; full-body framing kept for non-portrait uses (inventory items)');
assert(/const bg=\(swatchEl\.dataset&&swatchEl\.dataset\.bg\)\|\|''; swatchEl\.style\.backgroundImage='url\("'\+url\+'"\)'\+\(bg\?\(', '\+bg\):''\)/.test(rt),
  'a dataset tint backdrop stays composited behind the transparent render');
assert(/_thumbR\.setSize\(160,160\)/.test(src), 'portrait-card resolution (was 112)');
assert(/pt\.dataset\.bg='linear-gradient\(160deg,'\+hex\+'40, rgba\(10,16,20,0\.9\)\)';/.test(src),
  'lobby cards hand their tint gradient to the compositor');
assert(/_renderCharThumb\(cfg, pt, \{bust:true, refresh:_lobbyThumbRefresh\}\)/.test(src), 'lobby portraits use the bust crop (build 1009: + a refresh so a cold render is never lost)');
assert(/_renderCharThumb\(e\.cfg, sw, \{bust:true\}\)/.test(src), 'character-select fallback cards too');
assert(/_renderCharThumb\(\{ url:it\.model, thumb:it\.thumb, scale:it\.scale \}, ico\)/.test(src),
  'inventory item icons keep full-body framing (items are not people)');

// ---- buttons: the Publish-CTA family ----
assert(!/stepN/.test(html), 'the numbered chips are gone entirely (markup + CSS)');
assert(/<button id="lobbyCharBtn" class="lobbyBtn">/.test(html), 'CHARACTER is the dark secondary');
assert(/<button id="lobbyStart" class="lobbyBtn lobbyCTA hidden">START MATCH<\/button>/.test(html)
  && /<button id="lobbyReady" class="lobbyBtn lobbyCTA hidden">READY UP<\/button>/.test(html),
  'START/READY are filled CTAs');
assert(/\.lobbyBtn\.lobbyCTA\{ background:linear-gradient\(180deg, rgba\(var\(--accent-rgb\),0\.95\), rgba\(var\(--accent-rgb\),0\.72\)\); border:none; color:#04120e;/.test(html),
  'the CTA fill matches the Publish button exactly (same gradient, dark text)');
assert(/#lobbyCharBtn b\{ color:var\(--accent\) !important; \}/.test(html),
  'the character name renders in the accent, not a clashing per-character color');
assert(/<button id="lobbyLeave" class="lobbyGhost">LEAVE LOBBY<\/button>/.test(html), 'LEAVE is a quiet ghost button');
assert(/\.lobbyGhost:hover\{ border-color:#ff8a93;/.test(html), '...that warns red on hover');
assert(/#lobbyCharBtn:not\(\.stepDone\)\{ animation:stepPulse/.test(html)
  && /#lobbyReady:not\(\.readied\):not\(:disabled\)\{ animation:stepPulse/.test(html),
  'the guiding pulse cues survive the chip removal');
assert(/\.lobbyPortrait \{ width:100%; max-width:150px; aspect-ratio:1\/1;/.test(html), 'portraits fill the card width');
assert(/@media \(max-height:520px\)\{[\s\S]{0,200}#lobby \.modalCard\{ overflow-y:auto; \}/.test(html)
  && /\.lobbyPortrait\{ max-width:64px; \}/.test(html),
  'phone-landscape: compact cards + the whole screen scrolls (a starved flex roster clipped cards to slivers)');

// ---- bots stepper ----
assert(/<span class="lobbyBotsLabel">FILL WITH BOTS<\/span><button id="lobbyBotDec" class="botStep" aria-label="Fewer bots">/.test(html)
  && /<button id="lobbyBotInc" class="botStep" aria-label="More bots">\+<\/button>/.test(html),
  'bot count is a labelled −/+ stepper');
assert(/#lobbyBots #lobbyBotN::-webkit-outer-spin-button, #lobbyBots #lobbyBotN::-webkit-inner-spin-button\{ -webkit-appearance:none;/.test(html),
  'the native number spinner is hidden (the stepper owns it)');
assert(/#lobbyBots\.hidden\{ display:none; \}/.test(html), 'hidden still beats the flex display (id specificity)');

// executable: the bump clamps to [0,7]
const m = src.match(/const _bump=\(d\)=>\{ if\(!bn\) return; bn\.value=([^;]+);/);
assert(m, 'stepper bump wired');
const bump = new Function('bn','d', 'bn.value=' + m[1] + '; return bn.value;');
eq(bump({value:'3'}, 1), 4, '+1 works');
eq(bump({value:'0'}, -1), 0, 'clamped at 0');
eq(bump({value:'7'}, 1), 7, 'clamped at 7');
eq(bump({value:'garbage'}, 1), 1, 'junk input recovers to a number');

done('build 1007: bust portraits over tint backdrops + Publish-family lobby buttons and bot stepper');
