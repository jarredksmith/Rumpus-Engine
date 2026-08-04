// Build 1353: texture MEMORY, and the four per-frame arrays the sweep was still allocating.
// The census must (a) find textures reached only through a material — an imported GLB's own maps are in
// neither cache and are most of a big level — (b) not double-count a texture shared by ten materials, and
// (c) count a compressed texture as its real transcoded size rather than 4 bytes a pixel.
import { withGame } from './driver.mjs';

await withGame(async (P) => {
  console.log('stock level: ' + await P(`JSON.stringify(_texCensus())`));
  console.log('three\'s own count for comparison (a COUNT, not bytes): '
    + await P(`String(renderer.info.memory.textures)`));

  console.log('\nthe arithmetic, on textures I control:');
  console.log('  ' + await P(`(function(){
    const mk=(w,h,mips)=>{ const t=new THREE.Texture({ width:w, height:h }); t.generateMipmaps=mips; return t; };
    return JSON.stringify({
      '1024 no mips MB': +( _texBytesOf(mk(1024,1024,false)) /1048576).toFixed(2),
      '1024 w/ mips MB': +( _texBytesOf(mk(1024,1024,true))  /1048576).toFixed(2),
      '4096 w/ mips MB': +( _texBytesOf(mk(4096,4096,true))  /1048576).toFixed(2),
      'no image': _texBytesOf(new THREE.Texture()),
      'null': _texBytesOf(null)
    });
  })()`));

  console.log('\n  a texture shared by many materials counts ONCE:');
  console.log('  ' + await P(`(function(){
    const before=_texCensus();
    const t=new THREE.Texture({ width:512, height:512 }); t.generateMipmaps=false;
    const holders=[];
    for(let i=0;i<8;i++){ const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({ map:t }));
      m.position.set(9000+i,0,9000); scene.add(m); holders.push(m); }
    const after=_texCensus();
    for(const m of holders) scene.remove(m);
    return JSON.stringify({ countBefore:before.count, countAfter:after.count,
      delta: after.count-before.count, sharedBy:8 });
  })()`));

  console.log('\n  a texture reached ONLY through a material (not in either cache) is found:');
  console.log('  ' + await P(`(function(){
    const before=_texCensus();
    const t=new THREE.Texture({ width:2048, height:2048 }); t.generateMipmaps=true;
    const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({ normalMap:t }));
    m.position.set(9100,0,9100); scene.add(m);
    const after=_texCensus();
    scene.remove(m);
    const inCache = (typeof texCache!=='undefined' && Object.values(texCache).indexOf(t)>=0)
                 || (typeof _texInst!=='undefined' && Object.values(_texInst).indexOf(t)>=0);
    return JSON.stringify({ inEitherCache:inCache, mbBefore:before.mb, mbAfter:after.mb,
      deltaMb: after.mb-before.mb, expected: Math.round(2048*2048*4*4/3/1048576) });
  })()`));

  console.log('\nthe sweep no longer allocates — same array object every frame:');
  console.log('  ' + await P(`(function(){
    const a=_aoHidW, b=_aoHidV, c=_velHidW, d=_velHidV;
    const distinct = new Set([a,b,c,d]).size;
    _aoHidW.push('junk');                       /* the function must clear, since callers reuse it */
    _aoHideNoDepth(scene, _aoHidW);
    return JSON.stringify({ fourDistinctBuffers: distinct===4, clearedOnEntry: _aoHidW.indexOf('junk')<0 });
  })()`));
}, { settleMs: 6000 });
