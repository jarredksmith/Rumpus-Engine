// Photograph a GENERATED arena — the engine's showcase content, not the greybox default level.
//
//   node tools/probe/shot-arena.mjs --theme desert --seed 4242 --out shots/arena --port 8920
//   node tools/probe/shot-arena.mjs --all                       # one shot per theme
//
// The in-editor generator fetches levelgen from the founder's host, which this sandbox cannot reach. So
// this runs the CLI locally, serves the .glb beside the probe build, and drives the SAME three steps the
// editor's "Place in level" button performs — `spawnProp`, move the spawn to BASE 1, and apply the
// generator's own `world` block. Anything less is a photograph of a generated mesh under the DEFAULT
// level's lighting, which is not what a creator would ever see (build 1151 recorded exactly that mistake).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withGame } from './driver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };

const THEMES = argv.includes('--all')
  ? ['industrial', 'castle', 'volcanic', 'garden', 'desert', 'frost', 'facility']
  : [arg('theme', 'desert')];
const SEED = arg('seed', '4242');
const SIZE = arg('size', 'medium');
const OUT = path.resolve(arg('out', path.join(REPO, 'shots', 'arena')));
const PORT = +arg('port', 8920);
const DIR = path.resolve(arg('dir', path.join(REPO, 'probe-out')));
const W = +arg('w', 900), H = +arg('h', 506);

fs.mkdirSync(OUT, { recursive: true });

// ---- generate, and keep the WORLD block the CLI prints beside the model ----
const built = [];
for (const theme of THEMES) {
  const glb = path.join(DIR, 'arena-' + theme + '.glb');
  process.stdout.write('generating ' + theme + ' … ');
  const log = execFileSync('node', [path.join(REPO, 'tools', 'levelgen.mjs'),
    'arena', glb, SEED, theme, SIZE, 'auto'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const line = (log.split('\n').find(l => l.startsWith('WORLD ')) || '').slice(6);
  const spawn = JSON.parse((log.split('\n').find(l => l.startsWith('SPAWNS ')) || 'SPAWNS []').slice(7));
  const kb = (fs.statSync(glb).size / 1024).toFixed(0);
  built.push({ theme, url: '/' + path.basename(glb), world: line ? JSON.parse(line) : null, spawn, kb });
  console.log(kb + ' KB');
}

const meta = [];
await withGame(async (P, page) => {
  // pin the top rung — this sandbox otherwise reviews the shed-everything path (build 1141/1342)
  await P(`(()=>{ _adaptOn=false; _prStepI=0; _prScale=1; _applyPixelRatio(); _hiFxOn=true; _hiFxFails=0; _mbShed=false; _mbFails=0; return 1; })()`);
  for (const b of built) {
    // 1) the model, through the real spawnProp, waiting for the load rather than guessing
    const loaded = await P(`new Promise(res=>{
      spawnProp(${JSON.stringify(b.url)}, [0,0,0, 0,0,0, 1], ()=>res('ok'), null, 'loop', null, (e)=>res('ERR '+e));
      setTimeout(()=>res('TIMEOUT'), 120000); })`);
    // 2) the spawn the generator authored, and 3) its lighting mood — the two halves of "Place in level"
    const info = await P(`(()=>{
      const sp=${JSON.stringify(b.spawn)};
      if(sp && sp.length){ playerSpawn.x=+sp[0][0]||0; playerSpawn.z=+sp[0][1]||0; playerSpawn.y=0;
        playerSpawn.yaw=Math.atan2(playerSpawn.x, playerSpawn.z);
        player.pos.set(playerSpawn.x, 2.0, playerSpawn.z); player.yaw=playerSpawn.yaw; player.pitch=-0.04; player.vel.set(0,0,0); }
      ${b.world ? `Object.assign(worldCfg, ${JSON.stringify(b.world)}); applyWorldCfg();` : ''}
      return JSON.stringify({ props:propModels.length, spawn:[playerSpawn.x, playerSpawn.z] }); })()`);
    const shot = await P(`new Promise(r=>{ let n=0; const t=()=>{
        player.pos.set(playerSpawn.x, 2.0, playerSpawn.z); player.yaw=playerSpawn.yaw; player.pitch=-0.04; player.vel.set(0,0,0);
        if(++n>18) return r(JSON.stringify({ draws:renderer.info.render.calls, tris:renderer.info.render.triangles,
          exposure:+renderer.toneMappingExposure.toFixed(3), aa:_aaState().aa, lights:_lightLoad(_lightCensus()) }));
        requestAnimationFrame(t); }; requestAnimationFrame(t); })`);
    const file = path.join(OUT, b.theme + '.png');
    await page.screenshot({ path: file });
    meta.push({ theme: b.theme, kb: b.kb, file, loaded, place: JSON.parse(info), frame: JSON.parse(shot) });
    console.log(b.theme.padEnd(11), loaded, JSON.parse(shot).draws + ' draws', JSON.parse(shot).tris + ' tris', '->', file);
    // clear before the next theme, or every arena stacks on the last
    await P(`(()=>{ for(let i=propModels.length-1;i>=0;i--){ try{ removeProp(propModels[i]); }catch(e){} } return propModels.length; })()`);
  }
}, { viewport: { width: W, height: H }, settleMs: 5000, port: PORT, dir: DIR });

fs.writeFileSync(path.join(OUT, 'arenas.json'), JSON.stringify(meta, null, 2));
console.log('\n' + meta.length + ' arena shots -> ' + OUT);
