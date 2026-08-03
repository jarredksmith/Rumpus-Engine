// build 1336 — slicing a long baked take into named clips, end to end in the live game.
//
// No rigged .glb with animation is reachable from this sandbox, so the model is SYNTHESIZED inside the
// game closure: a real THREE.AnimationClip on a real object, pushed into gltfCache under a url, with a
// real AnimationMixer standing in as the preview rig. Everything downstream of that is the shipped code —
// applyAnimCuts, sliceClip, showClipSlicer, the DOM it builds, and the clip list the dropdowns read.
import { withGame } from './driver.mjs';

const SETUP = `(function(){
  const url = 'https://example.test/hero.glb';
  const node = new THREE.Object3D(); node.name = 'Bone';
  const grp = new THREE.Group(); grp.add(node);
  // 0..150 frames at 30fps = 5s. x goes 0 -> 5 linearly, so the pose at any time is READABLE as a number.
  const track = new THREE.VectorKeyframeTrack('Bone.position', [0,5], [0,0,0, 5,0,0]);
  // ...and a second track keyed ONLY at t=0, which is the track three's own subclip would DROP
  const still = new THREE.QuaternionKeyframeTrack('Bone.quaternion', [0], [0,0,0,1]);
  const clip = new THREE.AnimationClip('allanim', 5, [track, still]);
  gltfCache[url] = { animations:[clip], scene:grp, userData:{} };

  // a stand-in preview rig so the scrub path is exercised rather than skipped
  const mixer = new THREE.AnimationMixer(grp);
  window.__rig = grp;
  previewAvatar = grp;
  grp.userData.mixer = mixer; grp.userData.animClips = gltfCache[url].animations; grp.userData.stateActions = {};
  mixers.push(mixer);
  return url;
})()`;

await withGame(async (P, page) => {
  const url = await P(SETUP);
  console.log('synthetic model  ' + url);

  // ---- the core: what does a slice actually contain
  console.log('\nSLICE (frames 60-120 @30fps = t 2.0-4.0, inclusive)');
  console.log('  ' + JSON.stringify(await P(`(function(){
    const src = gltfCache['${url}'].animations[0];
    const c = sliceClip(src, 'Reload', 60, 120, 30);
    return { name:c.name, duration:+c.duration.toFixed(6), tracks:c.tracks.length,
             firstTime:+c.tracks[0].times[0].toFixed(6),
             lastTime:+c.tracks[0].times[c.tracks[0].times.length-1].toFixed(6),
             stillTrackKept: c.tracks.some(t=>/quaternion/.test(t.name)) };
  })()`)));
  console.log('  three\'s own subclip, same request, for comparison:');
  console.log('  ' + JSON.stringify(await P(`(function(){
    const src = gltfCache['${url}'].animations[0];
    const c = THREE.AnimationUtils.subclip(src.clone(), 'Reload', 60, 120, 30);
    return { duration:+c.duration.toFixed(6), tracks:c.tracks.length,
             stillTrackKept: c.tracks.some(t=>/quaternion/.test(t.name)) };
  })()`)));

  // ---- applyAnimCuts: injection, idempotence, edit-not-stack
  console.log('\nAPPLY');
  console.log('  ' + JSON.stringify(await P(`(function(){
    const g = gltfCache['${url}'];
    animCuts['${url}'] = [ {n:'Idle',s:'allanim',a:0,b:60,f:30}, {n:'Reload',s:'allanim',a:60,b:120,f:30} ];
    applyAnimCuts(g, '${url}');
    const once = g.animations.map(c=>c.name);
    applyAnimCuts(g, '${url}'); applyAnimCuts(g, '${url}');
    const thrice = g.animations.map(c=>c.name);
    animCuts['${url}'][1].b = 90;            // EDIT the same slice
    applyAnimCuts(g, '${url}');
    const edited = g.animations.map(c=>c.name);
    const rel = g.animations.find(c=>c.name==='Reload');
    return { once, afterThreeApplies:thrice, afterEdit:edited, reloadDuration:+rel.duration.toFixed(4) };
  })()`)));

  // ---- the scrub actually poses the rig
  console.log('\nSCRUB (x travels 0 -> 5 over the take, so the pose reads as a number)');
  const poses = await P(`(function(){
    const out = [];
    for(const t of [0, 1.25, 2.5, 5]){ _slicePose('allanim', t); out.push(+window.__rig.children[0].position.x.toFixed(3)); }
    return out;
  })()`);
  console.log('  t = 0, 1.25, 2.5, 5   ->  x = ' + JSON.stringify(poses));

  // ---- the panel
  await P(`showClipSlicer('${url}', 'probe'); 1`);
  const ui = await page.evaluate(() => {
    const w = document.getElementById('clipSlicer');
    if (!w) return { open: false };
    const sel = w.querySelector('select');
    const nums = [...w.querySelectorAll('input[type=number]')].map(i => i.value);
    return { open: true, sources: [...sel.options].map(o => o.textContent),
      numbers: nums, rows: [...w.querySelectorAll('div')].filter(d => d.children.length === 4).map(d => d.children[0].textContent + ' ' + d.children[1].textContent),
      buttons: [...w.querySelectorAll('button')].map(b => b.textContent) };
  });
  console.log('\nPANEL');
  console.log('  open        ' + ui.open);
  console.log('  sources     ' + JSON.stringify(ui.sources));
  console.log('  fields      ' + JSON.stringify(ui.numbers) + '  (fps, in, out)');
  console.log('  slice rows  ' + JSON.stringify(ui.rows));
  console.log('  buttons     ' + JSON.stringify(ui.buttons));

  // add one through the real button, the way a creator would
  const added = await page.evaluate(() => {
    const w = document.getElementById('clipSlicer');
    const nums = [...w.querySelectorAll('input[type=number]')];
    nums[1].value = '120'; nums[2].value = '150';
    const nm = w.querySelector('input[type=text]'); nm.value = 'Shoot';
    [...w.querySelectorAll('button')].find(b => /Add slice/.test(b.textContent)).click();
    return [...w.querySelectorAll('div')].filter(d => d.children.length === 4).map(d => d.children[0].textContent);
  });
  console.log('  after Add   rows ' + JSON.stringify(added));
  console.log('  clip list   ' + JSON.stringify(await P(`gltfCache['${url}'].animations.map(c=>c.name)`)));
  console.log('  serialized  ' + JSON.stringify(await P(`(serializeLevel().animCuts||{})['${url}']`)));

  // and a name that collides with a real clip must be refused, not silently dropped
  console.log('  collision   ' + JSON.stringify(await P(`(function(){
    const before = (animCuts['${url}']||[]).length;
    const w = document.getElementById('clipSlicer');
    w.querySelector('input[type=text]').value = 'allanim';
    [...w.querySelectorAll('button')].find(b=>/Add slice/.test(b.textContent)).click();
    return { before, after:(animCuts['${url}']||[]).length };
  })()`)));

  await P(`_sliceRelease(); (document.getElementById('clipSlicer')||{remove(){}}).remove(); 1`);
}, { settleMs: 4000 });
