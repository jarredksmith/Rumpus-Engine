// build 1098: the settings-tab Sketchfab key row saves to the key Sketchfab actually reads.
//
// The API-keys panel row wrote to 'fs_api_key' — which is FREESOUND's storage — so a token
// saved there never reached sfGetToken ('breach_sketchfab_token') and search/download stayed
// dead until the user found the separate field in the prop tab. The row now stores to the real
// key, flips the sfSetEnabled switch so the prop browser lights up immediately, and Freesound
// got its own honest row for the storage the old row was accidentally writing.
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();
const m = src.match(/\{ id:'sketchfab',[\s\S]{0,1200}?what:'[^']*' \},/);
assert(m, 'the Sketchfab key row exists');
assert(/ls:'breach_sketchfab_token'/.test(m[0]), 'it clears/stores the REAL Sketchfab token key');
assert(/localStorage\.getItem\('breach_sketchfab_token'\)/.test(m[0]), 'the saved-badge reads the real key too');
assert(/sfSetToken\(v\)/.test(m[0]), 'saving goes through sfSetToken');
assert(/if\(v && typeof sfSetEnabled==='function'\) sfSetEnabled\(true\);/.test(m[0]),
  'saving a token also switches the Sketchfab source ON — no second setup step in the prop tab');
assert(!/fs_api_key/.test(m[0]), 'the Freesound storage key is gone from this row');

const f = src.match(/\{ id:'freesound',[\s\S]{0,900}?what:'[^']*' \},/);
assert(f, 'Freesound has its own row now (the storage the old row was writing)');
assert(/ls:'fs_api_key'/.test(f[0]) && /fsSetKey\(v\)/.test(f[0]), '...wired to fsGetKey/fsSetKey');
assert(/builtin:true/.test(f[0]), '...and honestly labelled as having a built-in shared key');

done('build 1098: a Sketchfab key saved in Settings actually works');
