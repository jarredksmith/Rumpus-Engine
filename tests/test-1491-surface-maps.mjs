// build 1491 — the floor's normal and roughness maps get a field to type into
//
// Reported from play: "if a material is added to the floor, it doesn't pick up any normal or bump maps, just
// the flat image."
//
// The floor has LOADED all three maps since build 1378 — applySurfaceTexture takes an albedo, a normal and a
// roughness; worldCfg carries floorTexN/floorTexR; they serialize with the world and the asset inventory has
// listed them since build 990. There was simply nowhere to TYPE one. The only writer was the texture search,
// which returns a whole map set, so a creator who pasted their own url got a flat image with the relief
// unreachable forever — and pressing Apply CLEARED the other two, which is the trap that arrives the moment
// those rows exist.
//
// The pins are on the DOOR (a field per map, for both surfaces) and on the CLEAR (fires on a real change,
// never on a re-apply), because the loading half was never broken.

import { gameSource, assert, eq, done } from './harness.mjs';

const src = gameSource();

/* ---------- 1. the loader was always able to take all three ---------- */
{
  const f = src.match(/function applySurfaceTexture\([^)]*\)\{[\s\S]*?\n\}/);
  assert(f, 'applySurfaceTexture is one function');
  for(const slot of ['map', 'normalMap', 'roughnessMap'])
    assert(new RegExp("_loadSurfaceMap\\(mat, '" + slot + "'").test(f[0]),
      'it loads ' + slot + ' — this half was never the bug');
  /* the DATA maps must be linear and the albedo sRGB, which is build 1429's whole subject one layer over */
  assert(/'map',\s+url,\s+repU, repV, true/.test(f[0]), 'the albedo is sRGB');
  assert(/'normalMap',\s+normalUrl, repU, repV, false/.test(f[0]), 'the normal is LINEAR data, not sRGB');
  assert(/'roughnessMap',\s+roughUrl,\s+repU, repV, false/.test(f[0]), 'and so is the roughness');
}

/* ---------- 2. the door: a field per map, on both surfaces ---------- */
{
  const rows = [...src.matchAll(/texRow\(b,\s*'([^']*)',\s*'(\w+)'\)/g)].map(m => ({ ph: m[1], key: m[2] }));
  const key = (k) => rows.filter(r => r.key === k);

  for(const k of ['floorTex', 'floorTexN', 'floorTexR', 'wallTex', 'wallTexN', 'wallTexR'])
    eq(key(k).length, 1, 'exactly one field writes ' + k + ' — two would fight over the same value');

  /* the placeholder is the only thing telling a creator what belongs in the box, so it is pinned: an empty
     one beside two others that look identical is a row nobody can use on purpose (build 1338's rule) */
  assert(/normal/i.test(key('floorTexN')[0].ph), 'the floor normal row says it wants a normal map');
  assert(/rough/i.test(key('floorTexR')[0].ph), 'and the roughness row says roughness');
  assert(/normal/i.test(key('wallTexN')[0].ph) && /rough/i.test(key('wallTexR')[0].ph),
    'the wall pair the same');
  for(const k of ['floorTexN', 'floorTexR', 'wallTexN', 'wallTexR'])
    assert(/optional/i.test(key(k)[0].ph), 'and says it is optional — a blank one is not a missing step');

  /* order: the albedo first, its two maps under it, so the clear-on-change reads as a consequence */
  const at = (k) => src.indexOf("','" + k + "')");
  assert(at('floorTex') < at('floorTexN') && at('floorTexN') < at('floorTexR'),
    'floor: albedo, then normal, then roughness');
  assert(at('wallTex') < at('wallTexN') && at('wallTexN') < at('wallTexR'), 'walls the same');
}

/* ---------- 3. the clear fires on a CHANGE, never on a re-apply ---------- */
const applyFn = (function(){
  const i = src.indexOf('const apply=()=>{ pushUndoSnapshot(); const was=');
  assert(i > 0, "texRow's apply handler is where it was");
  const END = '\n      };';
  const j = src.indexOf(END, i);
  assert(j > i, 'and it closes');
  /* +END.length, or the slice stops one character before the arrow function's own brace and every
     execution below is a syntax error rather than a test — the same off-by-one build 1488 hit */
  return src.slice(i, j + END.length);
})();

assert(/if\(now!==was\)\{/.test(applyFn), 'the clear is inside a real-change guard');
for(const k of ['floorTexN', 'floorTexR', 'wallTexN', 'wallTexR'])
  assert(new RegExp('worldCfg\\.' + k + "=''").test(applyFn), 'a changed albedo drops ' + k);

/* EXECUTED, both ways, on the real handler — a source pin cannot tell you which branch a nested if guards */
const drive = new Function('worldCfg', 'typed', 'log', `
  const pushUndoSnapshot = () => {};
  const applyWorldCfg = () => log.push('applyWorldCfg');
  const renderEditorFields = () => log.push('render');
  const toast = (t) => log.push('toast:' + t);
  const inp = { value: typed };
  const key = 'floorTex';
  ${applyFn}
  apply();
  return worldCfg;
`);

{
  const log = [];
  const w = drive({ floorTex: 'a.png', floorTexN: 'n.png', floorTexR: 'r.png' }, 'a.png', log);
  eq(w.floorTexN, 'n.png', 'RE-APPLYING the same url keeps the normal the creator just typed');
  eq(w.floorTexR, 'r.png', 'and the roughness');
  assert(log.indexOf('applyWorldCfg') >= 0, 'and it still applies');
  assert(!log.some(l => l.indexOf('toast:') === 0), 'and says nothing, because nothing was dropped');
}
{
  const log = [];
  const w = drive({ floorTex: 'a.png', floorTexN: 'n.png', floorTexR: 'r.png' }, 'b.png', log);
  eq(w.floorTex, 'b.png', 'a real change lands');
  eq(w.floorTexN, '', 'and drops the normal — a concrete relief under a brick colour is not a surface');
  eq(w.floorTexR, '', 'and the roughness');
  assert(log.some(l => l.indexOf('toast:') === 0), 'and SAYS it dropped them, rather than doing it silently');
  assert(log.indexOf('render') >= 0, 'and repaints, so the two fields empty in front of you (build 1490s rule)');
}
{
  /* the case a creator hits constantly: no relief maps set, so there is nothing to drop and nothing to say */
  const log = [];
  const w = drive({ floorTex: 'a.png', floorTexN: '', floorTexR: '' }, 'b.png', log);
  eq(w.floorTex, 'b.png', 'the albedo still changes');
  assert(!log.some(l => l.indexOf('toast:') === 0), 'and no notice for a drop that did not happen');
}
{
  /* clearing the albedo is a change like any other */
  const w = drive({ floorTex: 'a.png', floorTexN: 'n.png', floorTexR: 'r.png' }, '', []);
  eq(w.floorTex, '', 'blanking it clears the albedo');
  eq(w.floorTexN, '', 'and takes its relief with it');
}

/* ---------- 4. what must NOT have changed ---------- */
{
  /* the texture search still sets all three at once — that path was correct and is the reason the fields
     existed with no door. Pinned so this build cannot be read as replacing it. */
  assert(/worldCfg\.floorTex=maps\.map\|\|'';\s*worldCfg\.floorTexN=maps\.normal\|\|'';/.test(src),
    'the texture search still writes the whole map set');
  /* three's default normalScale is what a creator's own map is authored against. Build 1387 bakes the
     PROCEDURAL relief strength into its map rather than setting this, precisely so a loaded map is not
     scaled by whatever was left behind — that decision is what makes these fields safe to expose. */
  assert(!/floorMat\.normalScale/.test(src) && !/wallMat\.normalScale/.test(src),
    'nothing writes normalScale on the shared surface materials');
  /* and a blank field still returns the slot to build 1139's procedural grain rather than to nothing */
  assert(/_procFallback/.test(src.slice(src.indexOf('function _loadSurfaceMap'), src.indexOf('function applySurfaceTexture'))),
    'a cleared slot falls back to the procedural detail set, not to null');
}

done('build 1491 — a creator can type their own normal and roughness maps for the floor and walls, and ' +
     'changing the texture above them says what it dropped');
