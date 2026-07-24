// (build 1066) SETTINGS > API KEYS — author: "Can we move APIs to some sort of settings area?
// I'd like the Sketchfab api and Claude API to live there instead of it being buried somewhere."
// The Anthropic key was reachable only from inside the AI scene builder's Auto-generate fold,
// and the Sketchfab / Poly Pizza keys had NO visible UI at all (a shared key is baked in). A new
// top-level Settings mode now hosts all three with per-key state, save/clear, and a link to
// where each key comes from. Keys stay in this browser's localStorage — never serialized into a
// level, share code, campaign export or network message.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

// ---- the mode is registered everywhere a mode must be ----
assert(/const EDITOR_MODES = \['build','scene','player','enemies','rules','kit','hud','files','settings'\];/.test(src),
  'settings joins the mode list (last)');
assert(/files:'Save', settings:'Settings' \}/.test(src), 'it has a label');
assert(/files:'#b69cff', settings:'#9fb4c7' \}/.test(src), 'it has a rail colour');
assert(/settings:'Your API keys for the AI tools and the 3D model libraries\./.test(src), 'it has a mode hint');
assert(/settings:_svgIcon\(/.test(src), 'it has a rail icon');
assert(/settings:\['apikeys'\],   \/\/ build 1066/.test(src), 'it owns the apikeys section');
assert(/  settings:\[\],\n\};\nconst TARGET_MODE/.test(src), 'it declares no object targets (a settings tab has none)');
assert(/apikeys:    'Keys for the AI tools \(Claude\) and the 3D model search\./.test(src), 'the section has its plain-language subtitle');
assert(/\+ sec\('API keys', 'apikeys', '<div id="edApiKeys"><\/div>'\)/.test(src), 'the section host exists in the panel markup');
assert(/if\(typeof renderApiKeysPanel==='function'\) renderApiKeysPanel\(\);/.test(src), 'the panel renders with the other global panels');

// ---- the row registry: executable against a stubbed localStorage ----
{
  const store = {};
  const env = new Function('localStorage', 'aiGetKey', 'aiSetKey', 'fsSetKey',
    src.match(/const API_KEY_ROWS = \[[\s\S]*?\n\];/)[0] + '\nreturn API_KEY_ROWS;')(
    { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    () => (store['breach_anthropic_key'] || ''),
    (v) => { store['breach_anthropic_key'] = v; },
    (v) => { store['fs_api_key'] = v; });

  eq(env.length, 3, 'three keys are surfaced');
  eq(env.map(r => r.id).join(','), 'anthropic,sketchfab,polypizza', 'Claude first, then the model libraries');

  const ant = env.find(r => r.id === 'anthropic');
  eq(ant.ls, 'breach_anthropic_key', 'the Anthropic row reuses the EXISTING storage key (scene-builder keys carry over)');
  eq(ant.get(), '', 'starts unset');
  ant.set('sk-ant-test');
  eq(ant.get(), 'sk-ant-test', 'saving round-trips through aiSetKey/aiGetKey');
  assert(!ant.builtin, 'Claude has no built-in fallback — it is genuinely off until you add a key');
  assert(/AI animation generation/.test(ant.what), 'its description names the AI animation feature');

  const sf = env.find(r => r.id === 'sketchfab');
  eq(sf.ls, 'fs_api_key', 'Sketchfab reuses its existing storage key');
  assert(sf.builtin, 'Sketchfab is marked as having a built-in shared key');
  eq(sf.get(), '', "reads the USER's key only — the baked-in default never masquerades as yours");
  sf.set('my-token');
  eq(sf.get(), 'my-token', 'a user token round-trips');

  const pp = env.find(r => r.id === 'polypizza');
  eq(pp.ls, 'pp_api_key', 'Poly Pizza reuses its existing storage key');
  assert(pp.builtin, '...and is also built-in by default');

  for (const r of env) {
    assert(/^https:\/\//.test(r.url), r.id + ' links out over https');
    assert(r.label && r.what && r.urlLabel, r.id + ' has a label, description and link text');
  }
}

// ---- the panel's behavior ----
{
  const fn = extractFunction('renderApiKeysPanel', src);
  assert(/badge\.textContent = mine \? '\\u2713 your key saved' : \(row\.builtin \? 'built-in key active' : 'not set'\);/.test(fn),
    'each row reports whether YOUR key is saved, a built-in covers it, or nothing is set');
  assert(/inp\.type='password'/.test(fn), 'keys are masked on screen');
  assert(/row\.set\(v\); inp\.value='';/.test(fn), 'saving clears the field (the key is never left sitting in the DOM)');
  assert(/if\(mine\)\{ const clr=document\.createElement\('button'\); clr\.textContent='Clear';/.test(fn),
    'a Clear button appears only once you have your own key');
  assert(/localStorage\.removeItem\(row\.ls\)/.test(fn), 'clearing really removes the stored value');
  assert(/stored in <b>this browser only<\/b>/.test(fn) && /never written into a level/.test(fn),
    'the panel states plainly that keys never travel with a level');
}

// ---- keys must never be serialized ----
{
  const ser = extractFunction('serializeLevel', src);
  for (const k of ['breach_anthropic_key', 'fs_api_key', 'pp_api_key', 'apiKey', 'anthropic']) {
    assert(ser.indexOf(k) < 0, 'serializeLevel never writes ' + k);
  }
}

// ---- the old buried field still works, and points here ----
assert(/Also editable under <b>Settings \\u2192 API keys<\/b>/.test(src),
  'the AI scene builder’s inline key field cross-links to Settings (both write the same storage)');

done('build 1066: one Settings home for the Claude, Sketchfab and Poly Pizza keys — nothing buried, nothing serialized');
