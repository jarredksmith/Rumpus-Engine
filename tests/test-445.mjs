import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 592: attachment authoring (slot picker + mount pos/rot/scale + model url) lives in the editor Weapons tab.
const ra = extractFunction('renderAttachAuthoring');
assert(/for\(const slot of ATT_SLOTS\)/.test(ra), 'iterates the attachment slots for the weapon');
assert(/sel\.onchange=\(\)=>\{ const id=sel\.value;/.test(ra) && /_attLoadout\[wep\]\[slot\]=id/.test(ra) && /applyAttachments\(\)/.test(ra), 'a per-slot picker mounts the chosen attachment live');
assert(/\['rx','Rot X',-180,180,1\]/.test(ra) && /\['s','Scale',0\.05,5,0\.05\]/.test(ra) && /\['x','X',-0\.6,0\.6,0\.005\]/.test(ra), 'pos / rotation / scale sliders');
assert(/rg\.oninput=\(\)=>\{ const v=parseFloat\(rg\.value\); const m=getMount\(wep,slot\); m\[ax\[0\]\]=v;/.test(ra) && /rebuildAttMounts\(wep\)/.test(ra), 'dragging updates the mount + rebuilds live');
assert(/Object\.assign\(\{\}, _MOUNT_DEFAULT\[slot\]\)/.test(ra), 'reset restores the slot default');
// rendered from the Weapons tab under the gun fields, only on the gun target
assert(/editorActive==='gun' && typeof renderAttachAuthoring==='function'\) renderAttachAuthoring\(host, curWep\)/.test(src), 'shown under the gun framing in the Weapons tab');
// and no longer baked into the player loadout screen
assert(!/data-ms="'\+slot/.test(src) && !/data-mreset/.test(src), 'the old in-loadout mount sliders are gone');
done('attachment authoring (picker + pos/rot/scale + model) moved into the editor Weapons tab (build 592)');
