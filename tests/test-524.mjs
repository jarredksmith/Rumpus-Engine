import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
/* build 1400: the two byte-identical `if(level.game){...}` loader blocks became ONE `_applyGameCfg(g)` — build 1280's fix for props, applied to the game block after five settings turned out to be written and never read back. So `level.game.` reads `g.` and the count is 1, not 2. The assertion's intent — this field is restored by the level loaders — is unchanged, and is now STRONGER: both loaders provably route through the one function, which `test-1400` pins by count. */

const src = gameSource();
// build 677: the held flashlight is tunable per level — brightness, cone angle, edge softness, range and beam
// colour — via editor sliders, serialized with the level and applied live for instant feedback.

// --- sanitizer with sensible clamps + defaults ---
const _sanitizeFlash = new Function(extractFunction('_sanitizeFlash') + '; return _sanitizeFlash;')();
{
  const d = _sanitizeFlash(undefined);
  eq(d.intensity, 6, 'default brightness');
  eq(d.angle, 28, 'default cone angle (deg)');
  near(d.penumbra, 0.45, 1e-9, 'default edge softness');
  eq(d.distance, 46, 'default range');
  eq(d.color, 0xfff0d4, 'default warm-white beam');
  const c = _sanitizeFlash({ intensity:999, angle:-5, penumbra:2, distance:0, color:0x11223344 });
  eq(c.intensity, 20, 'brightness clamps high');
  eq(c.angle, 8, 'cone angle clamps low');
  eq(c.penumbra, 1, 'softness clamps to 1');
  eq(c.distance, 5, 'range clamps low');
  eq(c.color, 0x223344, 'colour masked to 24-bit');
  eq(_sanitizeFlash({ color:'bad' }).color, 0xfff0d4, 'bad colour -> default');
}

// --- the spotlight + live-apply are driven by the config ---
const ef = extractFunction('ensureFlashlight');
assert(/const fc = gameCfg\.flashCfg/.test(ef) && /new THREE\.SpotLight\(fc\.color, 0, fc\.distance, fc\.angle\*Math\.PI\/180, fc\.penumbra/.test(ef), 'the spotlight is built from flashCfg');
const af = extractFunction('applyFlashCfg');
assert(/_flashlight\.color\.setHex\(fc\.color\)/.test(af) && /_flashlight\.angle = fc\.angle\*Math\.PI\/180/.test(af) && /_flashlight\.penumbra = fc\.penumbra/.test(af) && /_flashlight\.distance = fc\.distance/.test(af), 'applyFlashCfg pushes every param onto the live light');
const tf = extractFunction('toggleFlashlight');
assert(/_flashlight\.intensity = flashlightOn \? fc\.intensity : 0;/.test(tf), 'toggling uses the configured brightness');

// --- gameCfg carries flashCfg, persisted + restored both load paths ---
assert(/flashCfg: _sanitizeFlash\(savedLevel && savedLevel\.game && savedLevel\.game\.flash\)/.test(src), 'gameCfg.flashCfg seeded from the save');
assert(/flash: \{ intensity:\+gameCfg\.flashCfg\.intensity, angle:\+gameCfg\.flashCfg\.angle, penumbra:\+gameCfg\.flashCfg\.penumbra, distance:\+gameCfg\.flashCfg\.distance, color:gameCfg\.flashCfg\.color \}/.test(src), 'flash beam serialized with the level');
eq((src.match(/gameCfg\.flashCfg = _sanitizeFlash\(g\.flash\);/g)||[]).length, 1, 'restored in both load paths');

// --- the editor exposes the sliders (only when the flashlight is enabled) ---
const panel = extractFunction('renderEditorFields');
assert(/if\(gameCfg\.flashlight\)\{/.test(panel), 'flashlight controls are gated on the toggle');
assert(/_flRow\('Brightness'/.test(panel) && /_flRow\('Cone angle'/.test(panel) && /_flRow\('Edge softness'/.test(panel) && /_flRow\('Range'/.test(panel), 'brightness / cone / softness / range sliders');
assert(/Beam colour/.test(panel), 'a beam-colour picker');
assert(/applyFlashCfg\(\)/.test(panel), 'editing a slider applies to the live light');

done('build 677: tunable flashlight (brightness/cone/softness/range/colour)');
