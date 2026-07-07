// (build 89) Home screen restructure: the controls box + multiplayer box became buttons that open modals;
// the audio sliders moved into the pause menu; co-op vs duel are visually distinct in the MP modal.
import { html, gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

// buttons in the secondary row
assert(/id="mpOpenBtn" class="secBtn"[^>]*>[\s\S]*?Multiplayer/.test(html), 'Multiplayer button in the menu row');
assert(/id="instrBtn" class="secBtn ghost"[^>]*>[\s\S]*?Instructions/.test(html), 'Instructions button in the (secondary) menu row');
assert(/id="fsBtn" class="secBtn ghost"/.test(html), 'fullscreen still shares the secondary style');
assert(/class="menuBtns menuSub"/.test(html), 'utility actions sit in a quieter second tier');
assert(/id="loadCampBtn" class="secBtn ghost"/.test(html), 'Load campaign is a ghost button in the second tier');

// modals exist, with the moved content
assert(/id="instrModal" class="modalBack hidden"/.test(html), 'instructions modal exists');
assert(/id="instrModal"[\s\S]*?<div id="controls">[\s\S]*?WASD/.test(html), 'control info lives inside the instructions modal');
assert(/id="mpModal" class="modalBack hidden"/.test(html), 'multiplayer modal exists');
assert(/\.modalBack \{/.test(html) && /\.modalCard \{/.test(html), 'shared modal styling exists');

// co-op vs duel visual distinction
assert(/<div class="mpSection coop" id="mpHostPane">[\s\S]*?id="mpHost"/.test(html), 'the host pane hosts the co-op button (build 900: one section, mode tabs)');
assert(/data-pane="duel"[\s\S]*?id="mpDuel"/.test(html), 'the duel pane hosts the duel button (build 900)');
assert(/\.mpSection\.coop \{[^}]*var\(--accent\)/.test(html) && /\.mpSection\.duel \{[^}]*#ff5da2/.test(html), 'co-op and duel use distinct accent colors');

// audio sliders moved OUT of the home overlay and INTO the pause menu
assert(/<div class="pauseAudio">[\s\S]*?id="volMaster"[\s\S]*?id="volSfx"/.test(html), 'audio sliders live in the pause menu');
assert(!/id="audioCtl"/.test(html) && !/id="mpBox"/.test(html), 'the old inline audio + mp boxes are gone');

// wiring
const bm = extractFunction('bindMenu');
assert(/instrBtn'\)[\s\S]*?openModal\('instrModal'\)/.test(bm) && /mpOpenBtn'\)[\s\S]*?openModal\('mpModal'\)/.test(bm), 'buttons open their modals');
const bp = extractFunction('bindPauseMenu');
assert(/volMaster'\)[\s\S]*?audioSettings\.master/.test(bp), 'audio sliders are wired in the pause menu now');
assert(/bindModals\(\);/.test(src), 'modal close/backdrop handlers registered at startup');
const sg = extractFunction('startGame');
assert(/closeModal\('mpModal'\); closeModal\('instrModal'\)/.test(sg), 'starting a game closes any open modal');
done('home-screen modals + relocated audio');
