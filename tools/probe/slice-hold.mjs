// build 1339 — "hold a single frame". The thing that has to be true: a held slice must not move AT ALL, at
// any point in its own timeline, however the action is looped or timescaled. A one-frame RANGE does not
// give you that — it brackets t0 and t0+1/fps, which are two different poses, so the gun creeps.
import { withGame } from './driver.mjs';

const SETUP = `(function(){
  const url = 'https://example.test/gun.glb';
  const slide = new THREE.Object3D(); slide.name = 'Slide';
  const grp = new THREE.Group(); grp.add(slide);
  // z travels 0 -> 3 over 3s, so ANY motion inside a slice is directly readable as a number
  const track = new THREE.VectorKeyframeTrack('Slide.position', [0,3], [0,0,0, 0,0,3]);
  gltfCache[url] = { animations:[new THREE.AnimationClip('allanim', 3, [track])], scene:grp, userData:{} };
  WEAPONS.rifle.model = url; WEAPONS.rifle.clips = undefined; _gunClipNames.rifle = [];
  _gunLoading.rifle = false; delete gunModelByWep.rifle;
  curWep = 'rifle'; showWeaponModel('rifle');
  animCuts[url] = [];
  return url;
})()`;

const sample = (expr) => `(function(){
  const c = ${expr};
  if(!c) return null;
  const tr = c.tracks[0];
  return { duration:+c.duration.toFixed(6), keys:tr.times.length,
           times:[...tr.times].map(t=>+t.toFixed(6)),
           z:[...tr.values].filter((_,i)=>i%3===2).map(v=>+v.toFixed(6)),
           still:!!(c.userData && c.userData._still) };
})()`;

await withGame(async (P, page) => {
  const url = await P(SETUP);

  console.log('SOURCE  z travels 0 -> 3 over 3s at 30fps (90 frames)\n');
  console.log('a one-frame RANGE  [45,45]   ' + JSON.stringify(await P(sample(
    `sliceClip(gltfCache['${url}'].animations[0], 'R', 45, 45, 30, false)`))));
  console.log('a HELD frame       [45]      ' + JSON.stringify(await P(sample(
    `sliceClip(gltfCache['${url}'].animations[0], 'H', 45, 45, 30, true)`))));
  console.log('a held frame IGNORES out     ' + JSON.stringify(await P(sample(
    `sliceClip(gltfCache['${url}'].animations[0], 'H', 45, 999, 30, true)`))));

  // the real question: does the rig actually stand still while the action plays?
  console.log('\nPLAYED ON THE REAL GUN, 60 frames of a looping action');
  console.log('  ' + JSON.stringify(await P(`(function(){
    const run = (hold)=>{
      const c = sliceClip(gltfCache['${url}'].animations[0], 'X'+(hold?'H':'R'), 45, 45, 30, hold);
      const m = gunModelByWep.rifle.userData.mixer || new THREE.AnimationMixer(gunModelByWep.rifle);
      m.stopAllAction();
      const a = m.clipAction(c); a.loop = THREE.LoopRepeat; a.play();
      const seen = new Set();
      for(let i=0;i<60;i++){ m.update(1/60); seen.add(gunModelByWep.rifle.children[0].position.z.toFixed(5)); }
      m.stopAllAction();
      return { distinctPoses: seen.size, poses:[...seen].slice(0,4) };
    };
    return { range: run(false), hold: run(true) };
  })()`)));

  // and through the real panel
  await P(`showClipSlicer('${url}', 'probe', { kind:'weapon', wep:'rifle' }); 1`);
  const ui = await page.evaluate(() => {
    const w = document.getElementById('clipSlicer');
    const cb = [...w.querySelectorAll('input[type=checkbox]')][0];
    const nums = [...w.querySelectorAll('input[type=number]')];
    const before = { outDisabled: nums[2].disabled };
    nums[1].value = '45'; cb.checked = true; cb.onchange();
    const after = { outDisabled: nums[2].disabled,
      note: [...w.querySelectorAll('span')].map(s => s.textContent).find(t => /still/.test(t)) || null };
    w.querySelector('input[type=text]').value = 'IdlePose';
    [...w.querySelectorAll('button')].find(b => /Add slice/.test(b.textContent)).click();
    return { label: [...w.querySelectorAll('span')].map(s => s.textContent).find(t => /Hold a single frame/.test(t)),
      before, after };
  });
  await new Promise(r => setTimeout(r, 400));
  console.log('\nPANEL');
  console.log('  checkbox        ' + JSON.stringify(ui.label));
  console.log('  Out disabled    ' + ui.before.outDisabled + '  ->  ' + ui.after.outDisabled);
  console.log('  range readout   ' + JSON.stringify(ui.after.note));
  console.log('  serialized      ' + JSON.stringify(await P(`(serializeLevel().animCuts||{})['${url}']`)));
  console.log('  built clip      ' + JSON.stringify(await P(
    `(function(){ const c = gltfCache['${url}'].animations.find(x=>x.name==='IdlePose');
      return c ? { duration:+c.duration.toFixed(6), still:!!(c.userData&&c.userData._still),
                   z:[...c.tracks[0].values].filter((_,i)=>i%3===2) } : null; })()`)));
  console.log('  row            ' + JSON.stringify(await page.evaluate(() => {
    const w = document.getElementById('clipSlicer');
    // the SOURCE row also has four children — filter it out, or this reads back the picker
    const r = [...w.children].filter(d => d.children.length === 4 && !/^Source/.test(d.textContent)).pop();
    return r ? r.children[0].textContent + '  |  ' + r.children[1].textContent : null;
  })));

  await P(`_sliceRelease(); (document.getElementById('clipSlicer')||{remove(){}}).remove(); 1`);
}, { settleMs: 4000 });
