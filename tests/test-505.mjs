import { gameSource, extractFunction, assert, near, done } from './harness.mjs';
const src = gameSource();
// build 655: adding an object placed it in front of the PLAYER, who is off-screen when you're flying the editor
// camera across the map. editorDropPoint() now drops it where you're LOOKING: ray-march the fly camera to the
// ground, or use the top-view pan centre; otherwise (normal view) a few metres in front of the player.

const THREE = { Vector3: class { constructor(x,y,z){ this.x=x; this.y=y; this.z=z; } } };
const mk = (opts) => new Function(
  'player','flyPos','terrainHeightAt','editorOpen','editorFreeFly','editorTopView','topPanX','topPanZ','THREE',
  extractFunction('editorDropPoint') + '; return editorDropPoint;'
)(opts.player, opts.flyPos, ()=>0, opts.editorOpen, opts.editorFreeFly, opts.editorTopView, opts.topPanX, opts.topPanZ, THREE);

// 1) normal view: a few metres ahead of the player (yaw 0 -> -Z)
{
  const f = mk({ player:{ yaw:0, pitch:0, pos:{x:0,y:0,z:0} }, flyPos:{x:0,y:0,z:0}, editorOpen:true, editorFreeFly:false, editorTopView:false, topPanX:0, topPanZ:0 });
  const p = f(5);
  near(p.x, 0, 1e-6, 'normal: x stays at the player'); near(p.z, -5, 1e-6, 'normal: 5m ahead along -Z');
}

// 2) fly mode looking straight down from high up: lands under the camera, not at the player
{
  const f = mk({ player:{ yaw:0, pitch:-Math.PI/2, pos:{x:0,y:0,z:0} }, flyPos:{x:18,y:25,z:-9}, editorOpen:true, editorFreeFly:true, editorTopView:false, topPanX:0, topPanZ:0 });
  const p = f(5);
  near(p.x, 18, 0.05, 'fly: drops under where the camera looks (x)');
  near(p.z, -9, 0.05, 'fly: drops under where the camera looks (z)');
  near(p.y, 0, 1e-6, 'fly: grounded to terrain height');
}

// 3) top view: the pan centre is the target
{
  const f = mk({ player:{ yaw:1.2, pitch:0, pos:{x:0,y:0,z:0} }, flyPos:{x:0,y:0,z:0}, editorOpen:true, editorFreeFly:false, editorTopView:true, topPanX:30, topPanZ:-7 });
  const p = f(5);
  near(p.x, 30, 1e-6, 'top view: x = pan centre'); near(p.z, -7, 1e-6, 'top view: z = pan centre');
}

// --- every add path routes through editorDropPoint ---
assert(/function addSceneProp\(src, meta\)\{[\s\S]*?const _dp = editorDropPoint\(5\);/.test(src), 'props use the drop point');
assert(/buildLight\(\{ color:0xffe6a0[\s\S]{0,160}/.test(src) && /const _dp = editorDropPoint\(5\);\n  const px = _dp\.x, pz = _dp\.z;\n  const g = buildLight/.test(src), 'lights use the drop point');
assert(/editorDropPoint\(6\)[\s\S]*?buildSpawnMarker/.test(src), 'spawns use the drop point');
assert(/editorDropPoint\(5\):\{x:player\.pos\.x,z:player\.pos\.z\}; const px=_dp\.x, pz=_dp\.z; const g=buildTurret/.test(src), 'turrets use the drop point');
assert(/addPickupSpot\(kind\)\{ pushUndoSnapshot\(\); const _dp=\(typeof editorDropPoint==='function'\)\?editorDropPoint\(6\)/.test(src), 'pickups use the drop point');
for(const z of ['addFireZone','addJumpPad','addLadder','addDeathZone'])
  assert(new RegExp(z+'\\(\\)\\{ pushUndoSnapshot\\(\\); const _dp=\\(typeof editorDropPoint').test(src), z+' uses the drop point');
assert(/if\(type==='audiozones'\)\{ pushUndoSnapshot\(\); const _dp=editorDropPoint\(0\); audioZones\.push/.test(src), 'the + menu audio zone uses the drop point');

done('build 655: new objects drop where you are looking in fly / top view');
