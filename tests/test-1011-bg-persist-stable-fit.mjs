// (build 1011) Two field bugs from the 1009 lobby/select work:
// 1) LOBBY BACKDROP VANISHED ON REFRESH. restoreLevel restored lobbyBgUrl, but a page refresh
//    boots from the savedLevel blob directly (the same pattern as the grenade config) — and the
//    boot-time `let lobbyBgUrl` ignored it. Hosting right after an import worked (restoreLevel
//    had just run); a refresh reset it to ''. The declaration now initializes from savedLevel.
// 2) THE SELECT CAMERA "BREATHED". The 0.5s re-measure ran Box3.setFromObject on the SPINNING
//    model, so the horizontal extent oscillated with yaw and the zoom jumped every re-measure.
//    Measurement is now gated on a content signature (only async load / preview swap trigger it)
//    and taken with the turntable yaw zeroed, so rotation never changes the frame.
import * as THREE from 'three';
import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---- 1) backdrop boot persistence ----
assert(/let lobbyBgUrl = _sanitizeLobbyBg\(typeof savedLevel!=='undefined' && savedLevel \? savedLevel\.lobbyBg : ''\);/.test(src),
  'the declaration boots from the saved blob (refresh does not run restoreLevel)');
assert(/lobbyBg: \(typeof lobbyBgUrl==='string' && lobbyBgUrl\) \? lobbyBgUrl : undefined,/.test(src),
  'serializeLevel still writes it into that blob (dirty -> autosave -> refresh survives)');

// ---- 2) stable framing: executable check of the signature + yaw-zeroed measure ----
const block = src.match(/_csFitT-=dt;[\s\S]{0,1200}?\n      \}\n      const fovV/);
assert(block, 'the fit block is where it should be');
const fit = block[0].replace(/\n      const fovV[\s\S]*$/, '');
let _csFitT=0, _csFitH=0, _csFitW=0, _csFitY=0, _csFitSig=0;
const run = new Function('THREE','_csGrp','dt','st',
  'let {_csFitT,_csFitH,_csFitW,_csFitY,_csFitSig}=st;\n' + fit + '\nreturn {_csFitT,_csFitH,_csFitW,_csFitY,_csFitSig};');

// an asymmetric "model": 2.4 tall, 0.6 wide in X, 1.6 deep in Z (extent changes as it spins)
const grp = new THREE.Group();
const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.4, 1.6), new THREE.MeshBasicMaterial());
mesh.position.y = 1.2; grp.add(mesh);

let st = { _csFitT:0, _csFitH:0, _csFitW:0, _csFitY:0, _csFitSig:0 };
grp.rotation.y = 0.4;                       // mid-spin when first measured
st = run(THREE, grp, 0.016, st);
assert(st._csFitH > 2.3 && st._csFitH < 2.5, 'height measured');
const w1 = st._csFitW;
assert(Math.abs(w1 - 1.6) < 0.05, 'width measured with yaw ZEROED (1.6 deep box -> 1.6, not the rotated diagonal)');
eq(Math.abs(grp.rotation.y - 0.4) < 1e-9, true, 'the turntable yaw is restored after measuring');

// spin on: cadence re-checks but the signature is unchanged -> the frame NEVER moves
for (let i = 0; i < 200; i++) { grp.rotation.y += 0.05; st = run(THREE, grp, 0.016, st); }
eq(st._csFitW, w1, 'rotation never changes the frame (no more breathing zoom)');

// the model swaps (async load lands): signature changes -> one fresh measure
grp.add(new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.0, 0.5), new THREE.MeshBasicMaterial()));
st._csFitT = 0;
st = run(THREE, grp, 0.016, st);
assert(st._csFitW > 2.9, 'a content change (new mesh) re-measures the frame once');

done('build 1011: lobby backdrop survives refresh; select framing is rotation-invariant');
