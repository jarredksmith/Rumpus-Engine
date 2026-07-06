// (build 886) TRACK APPEARANCE — "Can we make the race track have material options and settings?"
// Every track piece shares one material singleton (_trkM), so a per-level worldCfg.track config
// restyles the WHOLE course live: road colour/roughness/texture(+tiles), painted-line colour, the
// kerb stripe pair, and the barrier colour. Applied by _applyTrackCfg from applyWorldCfg (so every
// load path restyles) and baked into the first _trackMats() build. Verified headless: live restyle
// of a placed course, clean GL render, and a serialize→stock→restore round-trip.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();
const fn = extractFunction('_applyTrackCfg', src);

// ---- the config covers every course material, with the stock look as the defaults ----
assert(/M\.road\.color\.setHex\(T\.road!=null\?\(\+T\.road>>>0\):0x24272c\);/.test(fn), 'road colour (stock asphalt default)');
assert(/M\.road\.roughness=Math\.max\(0, Math\.min\(1, T\.roadRough!=null\?\+T\.roadRough:0\.95\)\);/.test(fn), 'road roughness, clamped');
assert(/t\.repeat\.set\(Math\.max\(0\.2, \+T\.roadTile\|\|1\), 1\);/.test(fn) && /M\.road\.map=t;/.test(fn), 'optional road texture with a tiles dial');
assert(/else if\(M\.road\.map\)\{ M\.road\.map=null; \}/.test(fn), 'clearing the texture clears the map');
assert(/M\.line\.color\.setHex\(T\.line!=null\?\(\+T\.line>>>0\):0xe8ecef\);/.test(fn), 'painted-line colour');
assert(/M\.barrier\.color\.setHex\(T\.barrier!=null\?\(\+T\.barrier>>>0\):0xb9bdc2\);/.test(fn), 'barrier colour');
assert(/const ka=T\.kerbA!=null\?\(\+T\.kerbA>>>0\):0xd8402f, kb=T\.kerbB!=null\?\(\+T\.kerbB>>>0\):0xeef0f2;/.test(fn), 'kerb stripe pair (stock red/white default)');
assert(/if\(M\.kerb\.map && M\.kerb\.map\.dispose\) M\.kerb\.map\.dispose\(\);/.test(fn), 'the old stripe canvas is disposed, not leaked');
assert(/if\(!_trkM\) return;/.test(fn), 'safe before the materials exist — _trackMats() bakes the cfg on first build instead');

// ---- wiring: first build + every load path ----
assert(/_trkM=\{ road, line, kerb, chk, barrier, screen \};[\s\S]{0,600}try\{ _applyTrackCfg\(\); \}catch\(e\)\{\}/.test(src),
  '_trackMats bakes the saved appearance on first build — inside try/catch (build 889: a track-piece autosave builds at boot BEFORE worldCfg exists; even typeof throws in the TDZ)');
assert(/if\(typeof _applyTrackCfg==='function'\) _applyTrackCfg\(\);   \/\/ build 886/.test(src), 'applyWorldCfg restyles — boot, load, share, MP-adopt and undo all pass through it');
// the road deck now carries arc-length UVs so a texture rides the course
assert(/_trackRibbon\(def, -half\+KW,  half-KW, 0, TRACK_T,      segs, 1\/6\),    M\.road\)/.test(src), 'road deck UVs: u = metres/6 (unused until a map is set)');

// ---- editor UI ----
assert(/<b>Track appearance<\/b> \\u2014 restyles every placed piece/.test(src), 'the panel exists under the track builder');
assert(/colPick\('Road','road',0x24272c\); colPick\('Lines','line',0xe8ecef\); colPick\('Kerb A','kerbA',0xd8402f\); colPick\('Kerb B','kerbB',0xeef0f2\); colPick\('Barrier','barrier',0xb9bdc2\);/.test(src),
  'five colour pickers, defaults = stock');
assert(/renderTexSearch\(th,\(maps\)=>\{ pushUndoSnapshot\(\); T\.roadTex=maps\.map\|\|''; _upd\(\); renderEditorFields\(\); \}\);/.test(src), 'road texture via the free-texture search');
assert(/rst\.onclick=\(\)=>\{ pushUndoSnapshot\(\); worldCfg\.track=null; _applyTrackCfg\(\);/.test(src), 'Reset to stock');
// persistence is free: worldCfg.track rides `world: Object.assign({}, worldCfg)` — pin that shape survives
assert(/world:   Object\.assign\(\{\}, worldCfg\),/.test(src), 'worldCfg (incl. track) serializes wholesale');

done('build 886: per-level track appearance — road/lines/kerbs/barriers, restyled live, saved with the level');
