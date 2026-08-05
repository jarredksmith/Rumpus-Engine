import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
assert(/skyBright:1,/.test(src), 'skyBright default present');
assert(/new THREE\.MeshPhysicalMaterial\(\{ color:0x141c22/.test(src), 'floor uses Physical (specularIntensity available)');
assert(/new THREE\.MeshPhysicalMaterial\(\{ color:0x1a242b/.test(src), 'wall uses Physical');
assert(/floorMat\.envMapIntensity = _envInten\(floorMat\.metalness, worldCfg\.skyBright\)/.test(src), 'floor env scaled by skyBright');
assert(/\* \(\(bright == null\) \? 1 : bright\)/.test(src), '...and skyBright still scales the whole term after build 1144\'s floor');
// build 1386: "matte" used to be pinned here as specularIntensity following metalness. Measured, that is
// not matte — it is a dielectric with a tenth of its F0 and a fifth of its F90, which is a surface that
// stops responding to light rather than one that scatters it. Matte is ROUGHNESS, and it is authored.
// The intent of this file is skyBright scaling the environment term; that is untouched above.
assert(/floorRough:0\.95/.test(src) && /wallRough:0\.8/.test(src), 'matte comes from roughness, and it is high by default');
assert(/if\(worldCfg\.floorRough!=null\) floorMat\.roughness = /.test(src), '...and a creator still owns it');
{
  const spec = src.match(/^\s*\w+(\.\w+)*\.specularIntensity = [^;]+;/gm) || [];
  assert(spec.length === 2 && !spec.some(s => /metalness/.test(s)),
    'while both Physical surfaces keep a physical specular intensity, uncoupled from the metal slider');
}
assert(/slider\(b,'Reflection strength','skyBright',0,3,0\.05\)/.test(src), 'reflection-strength slider in Sky panel');
done('sky-bright-matte');
