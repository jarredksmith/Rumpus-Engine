import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();

// export: wraps all levels in a tagged payload and downloads a .breach file (build 939)
const exp = extractFunction('_exportCampaign');
assert(/kind:'breach-campaign', version:1, levels: campaign\.levels/.test(exp), 'export payload shape wrong');
assert(/a\.download = 'breach-campaign-'/.test(exp), 'export does not download a campaign .json');
assert(/JSON\.stringify\(payload/.test(exp), 'export does not serialize the payload');

// import: accepts a campaign file (levels array) OR a single-level file (props/world), saves + re-renders
const imp = extractFunction('_importCampaignFile');
assert(/Array\.isArray\(data\.levels\)/.test(imp), 'import does not detect a campaign file');
assert(/data\.props \|\| data\.world/.test(imp), 'import does not accept a single-level file');
assert(/campaign\.levels = levels\.map/.test(imp), 'import does not load the levels');
assert(/saveCampaign\(\)/.test(imp), 'import does not persist the campaign');
assert(/renderCampaignPanel\(\)/.test(imp), 'import does not refresh the panel');
assert(/uiConfirm\('Replace your current campaign/.test(imp) && /if\(campaign\.levels\.length\) uiConfirm/.test(imp), 'import confirms (themed dialog, build 815) before clobbering an existing campaign');

// UI present in the campaign panel
const rcp = extractFunction('renderCampaignPanel');
assert(/Export campaign/.test(rcp) && /_exportCampaign\(\)/.test(rcp), 'export button missing');
assert(/Import campaign/.test(rcp) && /_importCampaignFile\(/.test(rcp), 'import button missing');
assert(/_campImp\.accept='\.breach,\.json,application\/json'/.test(rcp), 'import file input missing (accepts .breach and legacy .json, build 939)');
done();
