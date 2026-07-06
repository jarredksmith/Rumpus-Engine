import { gameSource, extractFunction, assert, near, done } from './harness.mjs';
const src = gameSource();

// pure generator + sampler are unit-testable
const gen = new Function(extractFunction('_terrainRng') + '\n' + extractFunction('_sampleHeightGrid') + '\n' + extractFunction('generateTerrain') + '\nreturn generateTerrain;')();
const samp = new Function(extractFunction('_sampleHeightGrid') + '\nreturn _sampleHeightGrid;')();

// grid size = (seg+1)^2, deterministic by seed, border faded to ~0, values within +/-amp
const seg=12, amp=6;
const h = gen(seg, amp, 3, 42);
assert(h.length === (seg+1)*(seg+1), 'wrong grid length');
const h2 = gen(seg, amp, 3, 42);
assert(h.every((v,i)=>v===h2[i]), 'generator not deterministic for a fixed seed');
const N=seg+1;
for(let c=0;c<N;c++){ assert(Math.abs(h[c])<1e-9, 'top border not 0'); assert(Math.abs(h[(N-1)*N+c])<1e-9, 'bottom border not 0'); }
for(let r=0;r<N;r++){ assert(Math.abs(h[r*N])<1e-9, 'left border not 0'); assert(Math.abs(h[r*N+(N-1)])<1e-9, 'right border not 0'); }
assert(h.every(v=>v>=-amp-1e-6 && v<=amp+1e-6), 'height exceeds amplitude');
assert(h.some(v=>Math.abs(v)>0.1), 'terrain is suspiciously flat');

// sampler hits grid corners exactly and interpolates the midpoint
const g=[0,2, 4,6]; // 2x2 grid: (0,0)=0 (1,0)=2 (0,1)=4 (1,1)=6
near(samp(g,2,0,0), 0, 1e-9); near(samp(g,2,1,0), 2, 1e-9); near(samp(g,2,0,1), 4, 1e-9); near(samp(g,2,1,1), 6, 1e-9);
near(samp(g,2,0.5,0.5), 3, 1e-9);

// integration is wired + gated
assert(/function terrainHeightAt\(/.test(src), 'no terrainHeightAt');
assert(/let t=null; try \{ t=\(typeof worldCfg!=='undefined' && worldCfg\) \? worldCfg\.terrain : null; \}\s*\n\s*catch\(e\)\{ t=\(typeof savedLevel!=='undefined' && savedLevel && savedLevel\.world\) \? savedLevel\.world\.terrain : null; \}/.test(src), 'terrainHeightAt not TDZ-safe (build 893: the TDZ path samples the autosave so boot placement lifts correctly)');
assert(/let t=null; try \{ t=\(typeof worldCfg!=='undefined' && worldCfg\) \? \(worldCfg\.terrain\|\|null\) : null; \} catch\(e\)\{ t=null; \}/.test(src), 'setTerrainFromCfg not TDZ-safe');
const gh = extractFunction('groundHeightAt');
assert(/const g = terrainHeightAt\(x, z\)/.test(gh) && /return g;/.test(gh) && /Math\.max\(g, top\)/.test(gh), 'groundHeightAt not terrain-aware');
const aw = extractFunction('applyWorldCfg');
assert(/setTerrainFromCfg\(\)/.test(aw), 'applyWorldCfg does not refresh terrain');
const st = extractFunction('setTerrainFromCfg');
assert(/t===_terrainApplied\) return/.test(st), 'setTerrainFromCfg missing change-guard');
assert(/terrain:null/.test(src), 'DEFAULT_WORLD missing terrain field');
done();
