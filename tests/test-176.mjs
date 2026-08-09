import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();
// selPickup plumbing exists and is honored with priority across the gizmo path
assert(/let selPickup = -1;/.test(src), 'selPickup not declared');
assert(/for\(const m of pickupMarkers\)\{ if\(m && m\.visible\) targets\.push\(m\); \}/.test(src), 'pickup markers not added to click-select targets');
assert(/const ki = pickupMarkers\.indexOf\(root\);\s*\n\s*if\(ki>=0\)\{ picked='pickups'; selPickup=ki; break; \}/.test(src), 'pickup not detected in pick walk');
assert(/if\(picked && picked!=='pickups'\) selPickup = -1;/.test(src), 'other selections do not release the pickup');
assert(/function selectedSceneObject\(\)\{\s*\n\s*if\(selPickup>=0 && pickupMarkers\[selPickup\]\) return pickupMarkers\[selPickup\];/.test(src), 'selectedSceneObject ignores selPickup');
assert(/function getSelPos\(\)\{\s*\n\s*if\(selPickup>=0 && pickupMarkers\[selPickup\]\) return pickupMarkers\[selPickup\]\.position;/.test(src), 'getSelPos ignores selPickup');
// setSelPos writes x/z back and keeps the marker on the terrain (ignores dragged y)
assert(/if\(selPickup>=0\)\{[\s\S]*?sp\.x=\+v\.x\.toFixed\(2\); sp\.z=\+v\.z\.toFixed\(2\); _applyPickupXform\(g, sp\);/.test(src), 'setSelPos does not write pickupSpots / keep on terrain');
// rotate + scale are no-ops for pickups
assert(/function setSelRot\(euler\)\{\s*\n\s*if\(selPickup>=0\) return;/.test(src), 'setSelRot not guarded for pickups');
assert(/function setSelScale\(v\)\{\s*\n\s*if\(selPickup>=0\) return;/.test(src), 'setSelScale not guarded for pickups');
// gizmo becomes movable + forced to translate for a selected pickup
assert(/const movable = editorOpen && \(selPickup>=0 \|\|/.test(src), 'gizmo not movable for a selected pickup');
assert(/if\(selPickup>=0\) mode='translate';/.test(src), 'pickup gizmo not forced to translate');
// tab change + place/remove keep selPickup coherent
assert(/b\.onclick = \(\)=>\{ selPickup=-1; editorActive = key;/.test(src), 'tab change does not release pickup');
assert(/selPickup = pickupSpots\.length-1; refreshPickupMarkers\(\); renderEditorFields\(\); \}/.test(src), 'placing a pickup does not auto-select it');
// build 1445 CLAMPED this instead of clearing it, so two Delete presses remove two spots — as they do for
// a zone, a prop or a light. Worth noting what this pin was: its MESSAGE said "does not clear selPickup"
// while its regex asserted `selPickup=-1`, which clears it. The two described opposite things, which is the
// third kind of pin trap build 1419 records — not satisfied by prose, not defeated by it, just drifted
// apart from its own message. The message now says what the regex checks.
assert(/pickupSpots\.splice\(i,1\); selPickup = pickupSpots\.length \? Math\.min\(i, pickupSpots\.length-1\) : -1;/.test(src),
  'removing a pickup keeps a neighbour selected, and clears the selection only when the list is empty');
done();
