// (build 951) THREE EDITOR/UX REQUESTS in one build:
//  - SKY PRESETS: Park/Mountain/Room (LDR JPG panoramas) are replaced by Poly Haven pure-sky HDRs —
//    Cloudy, Clear Day, Sunset (1k .hdr = real HDR lighting, CORS-open, verified 200). None stays.
//  - DEFAULT PACE: walk 6 / run 12 / crouch 2 (was 28/47/14 — too fast). Levels that saved their
//    own world speeds keep them; only the defaults changed.
//  - The lobby START button is ALWAYS go-green, whatever the HUD accent/theme says (id-scoped
//    !important rules beat the themed .mpBtn variables).
// Verified live: a fresh level ran at SPEED 6 / run 12 / CROUCH 2; the world panel showed exactly
// Cloudy/Clear Day/Sunset/None (no Park/Mountain/Room); with a forced ORANGE accent, #lobbyStart
// still computed rgb(18,53,31) bg / rgb(57,255,136) border.
import { gameSource, html, assert, done } from './harness.mjs';

const src = gameSource();

// sky presets
assert(/\['Cloudy','https:\/\/dl\.polyhaven\.org\/file\/ph-assets\/HDRIs\/hdr\/1k\/kloofendal_48d_partly_cloudy_puresky_1k\.hdr'\]/.test(src), 'Cloudy preset (Poly Haven HDR)');
assert(/\['Clear Day','https:\/\/dl\.polyhaven\.org\/file\/ph-assets\/HDRIs\/hdr\/1k\/mpumalanga_veld_puresky_1k\.hdr'\]/.test(src), 'Clear Day preset');
assert(/\['Sunset','https:\/\/dl\.polyhaven\.org\/file\/ph-assets\/HDRIs\/hdr\/1k\/belfast_sunset_puresky_1k\.hdr'\]/.test(src), 'Sunset preset');
assert(/\['None',''\]/.test(src), 'None stays');
assert(!/2294472375_24a3b8ef46_o\.jpg/.test(src) && !/puydesancy\.jpg/.test(src) && !/kandao3\.jpg/.test(src), 'the old JPG panoramas are gone');

// default pace
assert(/const DEFAULT_WORLD = \{ walk:6, run:12, jump:13, grav:30, crouch:2,/.test(src), 'defaults: walk 6 / run 12 / crouch 2');

// unmissable START (build 1007: the 951 forced-green !important override silently defeated every
// later lobby restyle — START's prominence now comes from the filled accent CTA family instead)
assert(!/#lobbyStart \{ background:#12351f !important;/.test(html), 'the forced-green !important override is gone');
assert(/<button id="lobbyStart" class="lobbyBtn lobbyCTA hidden">/.test(html)
  && /\.lobbyBtn\.lobbyCTA\{ background:linear-gradient\(180deg, rgba\(var\(--accent-rgb\),0\.95\)/.test(html),
  'START wears the filled accent CTA (still unmissable, now restylable)');

done('build 951: HDR sky presets (Cloudy/Clear Day/Sunset), calmer default pace, always-green START');
