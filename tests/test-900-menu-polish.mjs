// (build 900) MENU / MULTIPLAYER / LOBBY POLISH — "So many options and looks cluttered... the
// multiplayer modal is very busy... unclear that joiners need to select a character and click ready."
//  (1) Main menu: Deploy hero + four primary actions (campaign / multiplayer / build / community);
//      everything else collapses into a quiet text-link footer strip under a hairline.
//  (2) MP modal: an identity row (name + character) on top, then JOIN | HOST — the six competing host
//      sections became ONE pane with a mode picker (CO-OP / RACE / DUEL / FFA / TDM / KOTH); the bots
//      row only shows for versus modes. Every button id + handler is unchanged.
//  (3) Lobby: a numbered checklist — step 1 CHARACTER (pulses until picked), step 2 READY (pulses once
//      enabled, solid when readied). _updateReadyBtn stamps stepDone on step 1 so the pulse hands off.
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// (1) menu structure
assert(/<div class="menuBtns">\s*<button id="mpOpenBtn" class="secBtn">[\s\S]*?<button id="commBtn" class="secBtn">/.test(html), 'Community levels is a primary action — sharing a main row with Multiplayer (build 1023)');
assert(/\.menuBtns\.menuSub \{ margin-top: 22px;[^}]*border-top: 1px solid rgba\(var\(--accent-rgb\),\.14\);/.test(html), 'the utility row is a footer strip under a hairline');
assert(/\.secBtn\.ghost \{ font-size:11px;[^}]*border:none; background:transparent;/.test(html), 'footer links are quiet text, not boxed buttons');
for(const id of ['loadCampBtn','instrBtn','manualBtn','helpBtn','creditsBtn','ctrlBtn','fsBtn']) assert(html.includes('id="'+id+'"'), id+' survives in the footer');

// (2) MP modal: identity row + one host pane with mode tabs
assert(/<div class="mpIdRow"><input id="mpName"[^>]*><button id="charBtn" class="mpBtn">CHARACTER ▸<\/button><\/div>/.test(html), 'name + character = one identity row');
assert(/<div class="mpSection coop" id="mpHostPane">/.test(html), 'ONE host pane');
eq((html.match(/data-mode="/g)||[]).length, 6, 'six mode tabs');
for(const m of ['coop','race','duel','ffa','tdm','koth']) assert(html.includes('data-pane="'+m+'"'), m+' pane exists');
for(const id of ['mpHost','mpHostRace','mpDuel','mpFFA','mpTDM','mpCP','mpKills','mpFFAKills','mpTDMKills','mpCPScore','mpBots','mpBotDiff']) assert(html.includes('id="'+id+'"'), id+' still wired');
assert(/<button id="mpHostRace" class="mpBtn coop"[^>]*>Host race<\/button>/.test(html), 'the Host race button shape is untouched');
assert(/const tabs=document\.getElementById\('mpModeTabs'\);/.test(src) && /const _vs=\(m==='duel'\|\|m==='ffa'\|\|m==='tdm'\|\|m==='koth'\);/.test(src) && /botsRow\.style\.display=_vs\?'flex':'none';/.test(src),
  'tabs swap panes; bots only for versus modes');

// (3) lobby steps
// build 1007: the numbered chips are gone — the ORDER (character above ready/start) + the pulse
// cues below still walk a joiner through; buttons are the Publish-CTA family.
assert(/<div class="lobbyStep" style="margin-top:12px"><button id="lobbyCharBtn" class="lobbyBtn">/.test(html), 'step 1: character (chip-less)');
assert(/<div class="lobbyStep"><button id="lobbyStart" class="lobbyBtn lobbyCTA hidden">START MATCH<\/button><button id="lobbyReady"/.test(html), 'step 2: ready / start (filled CTA family)');
assert(/#lobbyCharBtn:not\(\.stepDone\)\{ animation:stepPulse/.test(html), 'step 1 pulses until a character is picked');
assert(/#lobbyReady:not\(\.readied\):not\(:disabled\)\{ animation:stepPulse/.test(html), 'step 2 pulses once actionable');
assert(/cb\.classList\.toggle\('stepDone', _charChosen\)/.test(src), 'picking a character hands the pulse to step 2');

done('build 900: hero menu + one-pane multiplayer + a lobby that walks joiners through it');
