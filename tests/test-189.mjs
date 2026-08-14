import { gameSource, extractFunction, assert, done } from './harness.mjs';
const rcp = extractFunction('renderCampaignPanel');
// build 278: clicking Edit must re-render the campaign panel, since renderEditorFields() does NOT,
// so the "Save changes to ..." banner (built from campaignEditIdx inside renderCampaignPanel) actually appears.
const editIdx = rcp.indexOf("ed.onclick=");
assert(editIdx !== -1, 'Edit handler not found');
const editHandler = rcp.slice(editIdx, editIdx + 400);
/* build 1497: the handler routes through _campTrack, whose own body re-renders the panel — build 278's
   intent (the save banner shows) is now guaranteed by the ONE writer rather than remembered per caller. */
assert(/_campTrack\(i\);/.test(editHandler), 'Edit handler should set campaignEditIdx (via the tracker)');
assert(/renderCampaignPanel/.test(extractFunction('_campTrack')), 'the tracker itself re-renders the panel, so no caller can forget the banner');
// and the banner itself is still gated on campaignEditIdx (regression guard)
assert(/if\(campaignEditIdx>=0 && campaign\.levels\[campaignEditIdx\]\)/.test(rcp), 'save banner gate missing');
assert(/Save changes to/.test(rcp), 'save button text missing');
done();
