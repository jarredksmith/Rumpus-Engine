// (build 137) Freesound SFX browser in the Sounds tab: token stored per-device, search via the APIv2
// text endpoint (token as a query param + trailing slash to dodge the CORS preflight/redirect), results
// preview + assign to any event slot (music, per-weapon shoot, reload/explode/coin/hit/kill/hurt).
import { gameSource, extractFunction, done, assert } from './harness.mjs';
const src = gameSource();

assert(/function fsGetKey\(\)\{ try\{ return \(localStorage\.getItem\('fs_api_key'\)/.test(src), 'token persisted per device');
assert(/const FS_DEFAULT_KEY = '[A-Za-z0-9]+';/.test(src), 'a default token is baked in');
assert(/\(localStorage\.getItem\('fs_api_key'\)\|\|''\) \|\| FS_DEFAULT_KEY/.test(src), 'falls back to the baked-in token when none is set');
const fss = extractFunction('fsSearch');
assert(/freesound\.org\/apiv2\/search\/text\/\?query=/.test(fss), 'uses the apiv2 text-search endpoint with trailing slash');
assert(/&token='\+encodeURIComponent\(key\)/.test(fss), 'token passed as a query param (no preflight)');
assert(/fields='\+encodeURIComponent\('id,name,username,license,duration,previews'\)/.test(fss), 'requests preview URLs + license + author');
const fps = extractFunction('fsParseSound');
assert(/pv\['preview-hq-mp3'\]\|\|pv\['preview-lq-mp3'\]/.test(fps), 'prefers the hq mp3 preview');

const slots = extractFunction('_fsAssignSlots');
assert(/label:'Music'/.test(slots) && /'Shoot \\u00b7 '\+nm/.test(slots) && /'Reload \\u00b7 '\+nm/.test(slots) && /\['Grenade','explode'\]/.test(slots), 'assignable slots: music, per-weapon shoot + reload (build 748), and the event sounds');

assert(/function renderFreesoundBrowser\(host, refresh, directTarget\)\{/.test(src), 'browser renderer exists');
assert(/b\.appendChild\(renderFreesoundBrowser\(b, \(\)=>renderEditorFields\(\)\)\); \}/.test(src), 'browser wired into World > Audio (build 844: the orphaned Sounds-tab copy was removed)');
done('freesound browser');
