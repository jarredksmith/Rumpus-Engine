// (build 852) TWO FIXES FROM THE FIRST REAL SUBMISSION (issue #5, "Cars"):
//  1. The publish workflow committed the level but the site never redeployed — pushes made with the
//     built-in GITHUB_TOKEN deliberately don't fire on:push workflows (GitHub's recursion guard), so
//     approved levels landed in the repo but never went live. The workflow now dispatches pages.yml
//     explicitly after its push (needs actions: write).
//  2. The community modal's intro/loading/empty text used class="hint", whose ONLY css rule is scoped
//     to #editor — inside the modal it was unstyled and barely readable on some themes. Every text in
//     the modal now carries an explicit high-contrast inline color.
import { gameSource, html, assert, done } from './harness.mjs';
import { readFileSync } from 'fs';
const src = gameSource();
const wf = readFileSync(new URL('../.github/workflows/publish-level.yml', import.meta.url), 'utf8');

// 1 — the publish workflow deploys what it publishes
assert(/actions: write/.test(wf), 'workflow may dispatch other workflows');
assert(/gh workflow run pages\.yml --ref main/.test(wf), 'it dispatches the Pages deploy after the push');
assert(/if: steps\.pub\.outputs\.ok == 'true'\n        env:\n          GH_TOKEN/.test(wf), '...only when a level was actually published');

// 2 — no unstyled "hint" text remains in the community modal (inline colors win over any theme)
assert(!/class="hint"/.test(html.match(/id="communityModal"[\s\S]{0,900}/)[0]), 'the modal markup carries no editor-scoped hint class');
assert(/id="commNote" style="[^"]*color:#cfe9df/.test(html), 'the intro note has an explicit bright color');
const gallery = src.match(/async function renderCommunity[\s\S]{0,6000}/)[0];   // build 854 grew the gallery (thumbs/badge/filters)
assert(!/class="hint"/.test(gallery), 'loading/error/empty states are inline-styled, not hint-classed');
assert(/color:#cfe9df/.test(gallery) && /color:#ffc9a3/.test(gallery), 'states use bright body/error colors');
assert(/color:#a9d3c6/.test(gallery) && /color:#cfe9df;font-size:12px/.test(gallery), 'row meta + description brightened');

done('build 852: approved levels auto-deploy (GITHUB_TOKEN pushes cannot fire on:push), community modal text high-contrast');
