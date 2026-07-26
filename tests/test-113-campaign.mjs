// (build 162) Single-player campaign: an ordered list of levels; each level's win condition (e.g. Extraction)
// loads the next via the existing runtime level-rebuild, carrying weapons + health. Authored in the editor.
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();
assert(/const CAMPAIGN_KEY='breach_campaign_v1';/.test(src) && /function loadCampaign\(\)/.test(src) && /function saveCampaign\(\)/.test(src), 'campaign storage');
assert(/function startCampaign\(\)/.test(src) && /function _campaignLoad\(i\)\{ const lv=campaign\.levels\[i\]; if\(!lv\) return; loadLevelFromNet\(lv\); startGame\(\); \}/.test(src), 'start + load a campaign level via the runtime rebuild');
assert(/function _captureLoadout\(\)/.test(src) && /function _restoreLoadout\(c\)/.test(src), 'loadout carry across levels');
const gw = extractFunction('gameWon');
assert(/if\(campaignActive && campaign\.levels\.length\)\{/.test(gw), 'win advances the campaign');
assert(/campaignIdx\+\+; const toIdx=campaignIdx;/.test(gw) && /_campaignLoad\(toIdx\); _restoreLoadout\(carry\);/.test(gw), 'next level loads (via the interstitial card) with the carried loadout');
assert(/campaignActive=false; _campaignComplete=true;/.test(gw), 'last level completes the campaign');
assert(/\(_campaignComplete\?'CAMPAIGN COMPLETE':'MISSION COMPLETE'\)/.test(src),
  'victory screen reflects campaign completion (build 1082: unless the creator named their own ending)');
assert(/function renderCampaignPanel\(\)/.test(src) && /sec\('Campaign', 'campaign'/.test(src), 'editor Campaign panel');
done('single-player campaign');
