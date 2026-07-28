// build 1096: nocollide foliage cards cast shadows but never receive them.
//
// Crossed alpha-cutout grass cards under PCF shadows catch their own twin's shadow as acne
// across the whole quad — entire tufts rendered as black silhouettes in daylight (seen on the
// garden arena the moment build 1095 gave levels a real sun). Casting is kept: tufts speckling
// the lawn with shadow is what visually grounds them.
import { gameSource, extractFunction, assert, done } from './harness.mjs';

const fp = extractFunction('finalizeProp');
assert(/for\(let p=o; p; p=p\.parent\)\{ if\(p\.name && \/\^nocollide\/i\.test\(p\.name\)\)\{ o\.receiveShadow = false; break; \} \}/.test(fp),
  'nocollide-named meshes (and children of nocollide groups) stop receiving shadows');
assert(/o\.castShadow = true; o\.receiveShadow = true;/.test(fp),
  'every other mesh still both casts and receives');

done('build 1096: foliage casts shadow, never catches its own');
