// Capture real frames from the live engine, for looking at.
//
//   node tools/probe/shot.mjs                       # the standard set -> shots/
//   node tools/probe/shot.mjs --out shots/x --w 1280 --h 720 --only stock,arena-desert
//
// Everything the "measure it, don't argue about it" rule says still applies — a PNG is evidence of what
// the frame LOOKS like and nothing else. Three things here are scar tissue:
//  * WAIT ON FRAMES, NOT WALL CLOCK. This sandbox renders ~1.5 fps with MSAA and the full post chain, so a
//    700 ms sleep photographs the frame before the one you set up (build 1344).
//  * SETTLE THE CAMERA IN THE SAME BLOCK AS THE RENDER. The frame loop rewrites camera.position from the
//    player every frame, so a pose set in one round trip and captured in the next has already been undone
//    (build 1345). Poses here drive `player`, which is what the loop reads.
//  * KNOW WHERE THE CAMERA IS. The default level's spawn is inside nothing interesting from most angles;
//    every pose below is stated, and `probe` reports what the centre ray actually hit (build 1124/1151).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withGame } from './driver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const OUT = path.resolve(arg('out', path.join(REPO, 'shots')));
const W = +arg('w', 900), H = +arg('h', 506);
const ONLY = (arg('only', '') || '').split(',').filter(Boolean);
const PORT = +arg('port', 8899);
const DIR = arg('dir', path.join(REPO, 'probe-out'));
// This sandbox renders ~1.5 fps under SwiftShader, so the adaptive ladder (build 1141) reaches its BOTTOM
// rung within seconds — FXAA only, 66% of native, MSAA and SSAO shed. That is a real frame for a weak
// device and a useless one for judging the engine's ceiling. --top pins full quality. Always state which.
const TOP = argv.includes('--top');

// pose: [x, y, z, yaw, pitch] — y is the EYE height, yaw 0 faces -Z (the engine's forward is -sin/-cos)
const SCENES = [
  { id: 'stock-spawn',   desc: 'the default level from the real spawn — the first frame anybody sees', pose: null },
  { id: 'stock-wide',    desc: 'the default level, stood back, looking across the architecture',
    pose: [0, 3.2, 46, 0, -0.06] },
  { id: 'stock-close',   desc: 'a crate and the ground at close range — materials and contact shadow',
    pose: [2, 1.7, 24, 0.35, -0.35] },
  { id: 'stock-up',      desc: 'the sky and the silhouette edges against it', pose: [0, 3.2, 40, 0, 0.28] },
  { id: 'stock-weapon',  desc: 'the viewmodel against a mid-distance wall', pose: [0, 1.7, 34, 0.9, -0.05] },
];

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const meta = [];
  await withGame(async (P, page) => {
    page.on('crash', () => console.log('[PAGE CRASHED]'));
    if (TOP) await P(`(()=>{ _adaptOn=false; _prStepI=0; _prScale=1; _applyPixelRatio(); _hiFxOn=true; _hiFxFails=0; _mbShed=false; _mbFails=0; return 1; })()`);
    // one settled frame before anything, so the adaptive ladder and auto-exposure have a baseline
    await P(`new Promise(r=>{ let n=0; const t=()=>{ if(++n>8) return r(1); requestAnimationFrame(t); }; requestAnimationFrame(t); })`);
    for (const s of SCENES) {
      if (ONLY.length && !ONLY.includes(s.id)) continue;
      if (s.pose) {
        // pose + settle + report WHAT IS IN SHOT, in one block — the frame loop owns camera.position
        const [x, y, z, yaw, pitch] = s.pose;
        await P(`(()=>{ player.pos.set(${x}, ${y}, ${z}); player.yaw=${yaw}; player.pitch=${pitch};
          player.vel.set(0,0,0); return 1; })()`);
      }
      const info = await P(`new Promise(r=>{ let n=0; const t=()=>{
          ${s.pose ? `player.pos.set(${s.pose[0]}, ${s.pose[1]}, ${s.pose[2]}); player.yaw=${s.pose[3]}; player.pitch=${s.pose[4]}; player.vel.set(0,0,0);` : ''}
          if(++n>14){
            const rc=new THREE.Raycaster(); rc.setFromCamera({x:0,y:0}, camera);
            /* r149's Raycaster ignores the visible flag on the mesh AND on its ancestors (build 1267 verified this
               against the real build), so an UNDRAWN object wins the centre ray and this reporter lies about
               what is in shot — the play grid (hidden by build 1133) did exactly that. Walk the chain. */
            const drawn=(o)=>{ for(let p=o;p;p=p.parent) if(p.visible===false) return false; return true; };
            const hits=rc.intersectObjects(scene.children, true).filter(h=>h.object && h.object!==_skyMesh && drawn(h.object));
            const h0=hits[0];
            return r(JSON.stringify({
              cam:[+camera.position.x.toFixed(2),+camera.position.y.toFixed(2),+camera.position.z.toFixed(2)],
              centreHit: h0 ? { d:+h0.distance.toFixed(2), src:(h0.object.userData&&h0.object.userData.src)||h0.object.name||h0.object.type,
                 mat:(h0.object.material&&h0.object.material.type)||'?' } : 'sky',
              fov:+camera.fov.toFixed(1), exposure:+renderer.toneMappingExposure.toFixed(3),
              aa:(typeof _aaState==='function'?_aaState().aa:'?'), lights:(typeof _lightLoad==='function'?_lightLoad(_lightCensus()):-1),
              draws:renderer.info.render.calls, tris:renderer.info.render.triangles }));
          }
          requestAnimationFrame(t); }; requestAnimationFrame(t); })`);
      const file = path.join(OUT, s.id + '.png');
      await page.screenshot({ path: file, timeout: 180000 });   /* SwiftShader at ~1 fps can take >30 s to produce a frame under load — the default timeout was killing multi-theme runs at theme 2 */
      meta.push({ id: s.id, desc: s.desc, file, info: JSON.parse(info) });
      console.log(s.id.padEnd(14), JSON.parse(info).centreHit === 'sky' ? 'sky' : JSON.stringify(JSON.parse(info).centreHit), '  ->', file);
    }
  }, { viewport: { width: W, height: H }, settleMs: 4000, port: PORT, dir: DIR });
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(meta, null, 2));
  console.log('\n' + meta.length + ' shots -> ' + OUT);
}
run();
