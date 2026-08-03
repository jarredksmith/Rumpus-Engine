// build 1337 — the slicer in the WEAPON tab, per weapon. The thing that has to be true and was not true in
// 1336: the scrub must pose the VIEWMODEL GUN, not the character. A gun carries its own mixer and its own
// three-slot mapping (idle / shoot / reload), so slicing one against the character rig would have shown a
// player standing still while the numbers changed.
//
// No .glb is reachable here, so a weapon model is synthesized into the cache and then loaded through the
// engine's own showWeaponModel — everything after that line is shipped code.
import { withGame } from './driver.mjs';

const SETUP = `(function(){
  const url = 'https://example.test/gun.glb';
  const slide = new THREE.Object3D(); slide.name = 'Slide';
  const grp = new THREE.Group(); grp.add(slide);
  // the slide travels z 0 -> 3 across a 3s take, so the pose at any instant reads as a number
  const track = new THREE.VectorKeyframeTrack('Slide.position', [0,3], [0,0,0, 0,0,3]);
  const still = new THREE.QuaternionKeyframeTrack('Slide.quaternion', [0], [0,0,0,1]);
  gltfCache[url] = { animations:[new THREE.AnimationClip('allanim', 3, [track, still])], scene:grp, userData:{} };
  WEAPONS.rifle.model = url; WEAPONS.rifle.clips = undefined; _gunClipNames.rifle = [];
  // the boot load of the real gun.glb never resolves in this sandbox, so its in-flight flag is still set
  // and showWeaponModel would return at the "a load for this weapon is already in flight" guard
  _gunLoading.rifle = false; delete gunModelByWep.rifle;
  curWep = 'rifle';
  showWeaponModel('rifle');
  return url;
})()`;

await withGame(async (P, page) => {
  const url = await P(SETUP);
  console.log('weapon model      ' + url);
  console.log('viewmodel built   ' + JSON.stringify(await P(
    `({ hasModel: !!gunModelByWep.rifle, clipNames: _gunClipNames.rifle, hasMixer: !!(gunModelByWep.rifle && gunModelByWep.rifle.userData.mixer) })`)));

  // open the editor on the gun target, the way a creator reaches this
  console.log('\nEDITOR');
  console.log('  ' + JSON.stringify(await P(`(function(){
    if(!editorOpen) toggleEditor();
    setEditorMode('player'); editorActive='gun';
    renderEditorFields();
    return { editorOpen, editorActive, vmWanted: (typeof _vmWanted==='function') ? _vmWanted() : null };
  })()`)));
  const btn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#editor button')].find(x => /Slice clips/.test(x.textContent));
    return b ? { found: true, label: b.textContent, title: b.title.slice(0, 60) } : { found: false };
  });
  console.log('  button          ' + JSON.stringify(btn));

  // click it for real
  await page.evaluate(() => [...document.querySelectorAll('#editor button')].find(x => /Slice clips/.test(x.textContent)).click());
  await new Promise(r => setTimeout(r, 300));
  console.log('\nPANEL');
  console.log('  ' + JSON.stringify(await page.evaluate(() => {
    const w = document.getElementById('clipSlicer');
    return w ? { open: true, sources: [...w.querySelector('select').options].map(o => o.textContent) } : { open: false };
  })));
  console.log('  rig             ' + JSON.stringify(await P(
    `_sliceRig ? { kind:_sliceRig.kind, wep:_sliceRig.wep, obj:_sliceRig.obj===gunModelByWep.rifle ? 'THE VIEWMODEL GUN' : 'something else', clips:_sliceRig.clips.map(c=>c.name), madeMixer:_sliceRig.made } : null`)));

  console.log('\nSCRUB — the gun\'s own slide, not the character');
  console.log('  ' + JSON.stringify(await P(`(function(){
    const out = [];
    for(const t of [0, 1, 2, 3]){ _slicePose('allanim', t); out.push(+gunModelByWep.rifle.children[0].position.z.toFixed(3)); }
    return out;
  })()`)) + '   (t = 0,1,2,3)');

  // add a slice through the real button
  await page.evaluate(() => {
    const w = document.getElementById('clipSlicer');
    const nums = [...w.querySelectorAll('input[type=number]')];
    nums[1].value = '30'; nums[2].value = '60';
    w.querySelector('input[type=text]').value = 'Reload';
    [...w.querySelectorAll('button')].find(b => /Add slice/.test(b.textContent)).click();
  });
  await new Promise(r => setTimeout(r, 400));
  console.log('\nAFTER ADD');
  console.log('  clip list       ' + JSON.stringify(await P(`gltfCache['${url}'].animations.map(c=>c.name)`)));
  console.log('  _gunClipNames   ' + JSON.stringify(await P(`_gunClipNames.rifle`))
    + '   <- what the weapon tab dropdowns read');
  console.log('  serialized      ' + JSON.stringify(await P(`(serializeLevel().animCuts||{})['${url}']`)));

  // map it and prove the gun can actually play it
  console.log('  map to reload   ' + JSON.stringify(await P(`(function(){
    WEAPONS.rifle.clips = { idle:'', shoot:'', reload:'Reload' };
    _rebuildGunStates('rifle');
    const acts = gunModelByWep.rifle.userData.gunStates || {};
    return { slots:Object.keys(acts), reloadClip: acts.reload ? acts.reload.getClip().name : null,
             reloadDuration: acts.reload ? +acts.reload.getClip().duration.toFixed(4) : null };
  })()`)));

  // close and confirm the panel hands the gun back
  await page.evaluate(() => [...document.querySelectorAll('#clipSlicer button')].find(b => b.textContent === 'Close').click());
  await new Promise(r => setTimeout(r, 300));
  console.log('\nAFTER CLOSE');
  console.log('  ' + JSON.stringify(await P(
    `({ panel: !!document.getElementById('clipSlicer'), rig: _sliceRig, gunStates: Object.keys((gunModelByWep.rifle.userData.gunStates)||{}), mixerLive: mixers.indexOf(gunModelByWep.rifle.userData.mixer) >= 0 })`)));
}, { settleMs: 4500 });
