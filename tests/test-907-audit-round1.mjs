// (build 907) RELEASE AUDIT round 1 — layout overflow, MP race-joiner init order, settings hygiene,
// lobby lifecycle. Verified live in the two-browser harness (joiner seats + race HUD shows; editor
// rows wrap on phone/tablet/laptop/desktop); these pins keep the shapes from regressing.
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// layout: the two overflowing editor rows wrap now
assert(/#edModes\.edModes \{ flex: 0 0 58px; flex-wrap: nowrap; flex-direction: column;/.test(html), 'editor mode tabs are a vertical rail (build 982: no more clipping — the column scrolls)');
assert(/#editor \.row2 \{ display: flex; gap: 6px; flex-wrap: wrap; \}/.test(html), 'editor button rows wrap (the 9-shape add row overflowed)');
assert(/height: 100vh; height: 100dvh; max-height: 100dvh;/.test(html), 'editor panel height uses the real (dvh) mobile viewport (build 982: full-height flex column)');
assert(/#chatInput \{ display:none; width:min\(300px, 86vw\);/.test(html), 'chat input capped to the viewport');

// MP race joiner: objective re-inits AFTER the host level lands
const sg = extractFunction('startGame', src);
const block = sg.slice(sg.indexOf('if(NET.pendingLevel)'));
assert(/loadLevelFromNet\(NET\.pendingLevel\); NET\.pendingLevel=null;[\s\S]{0,700}startObjective\(\);[\s\S]{0,300}_raceAutoSeat\(0\), 350\)/.test(block),
  'a fresh joiner re-runs startObjective + race auto-seat once the welcome level is applied');

// settings hygiene: applying a level's audio never persists over the player's saved prefs
const audioApplies = src.match(/if\(level\.audio[^\n]*\n?/g) || [];
assert(audioApplies.length >= 2 && audioApplies.every(l => !/saveAudioSettings\(\)/.test(l)),
  "level-audio apply paths don't call saveAudioSettings (player blob stays theirs)");

// pause menu re-syncs its controls on every open
assert(/function openPause\(\)\{[\s\S]{0,300}bindPauseMenu\(\)/.test(src), 'openPause re-syncs the settings controls from live state');

// lobby lifecycle: backdrop click can't strand a live room
assert(/e\.target===m && m\.id!=='lobby'/.test(src), 'the lobby is excluded from generic backdrop-dismiss (Leave is the exit)');

// bindMenu re-entrancy: poller + unload hook register once
assert(/window\._menuOnceBound/.test(src), 'menu poller/unload hook bind once, not once per menu visit');

// accessibility: every modal ✕ carries a name; icon-only touch buttons too
assert((html.match(/aria-label="Close"/g)||[]).length >= 7, 'every ✕ button has an accessible name (7 modals; build 910 adds the keybind modal)');
assert(/id="tReload" aria-label="Reload"/.test(html) && /id="tNade" aria-label="Grenade"/.test(html) && /id="tWeapon" aria-label="Swap weapon"/.test(html),
  'icon-only touch buttons are labelled');

// grip editor: the dead flat keys are gone (persistence is the per-weapon blob)
assert(!/_saveTpGun\(\); refreshAvatarGunGrips\(\); try\{ localStorage\.setItem\(key/.test(src),
  'grip sliders no longer write dead write-only localStorage keys');

// iOS: returning to the tab resumes a suspended AudioContext
assert(/actx\.state==='suspended'\) actx\.resume\(\)/.test(extractFunction('initAudio', src)) || /state==='suspended'\) actx\.resume/.test(src.slice(src.indexOf('_tabHidden'))),
  'a suspended AudioContext resumes when the tab returns');

done('build 907: audit round 1 — layout, race joiners, settings hygiene, lobby lifecycle');
