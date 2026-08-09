// Reported from play: "Not all zones can be clicked on in the editor to get control with their gizmos.
// Water, waterfalls, death zones, etc you can't click — you have to open the World tab and scroll all the
// way to the bottom and then click on the zone's Select button."
//
// Build 1326 made ZONE_EDIT the one table that decides what a clicked object BELONGS to, and the click
// path's raycast TARGET LIST is still hand-written. This measures, per zone type, whether a ray can reach
// the marker at all — and separately whether the resolver would name it if it did. The two halves fail
// differently and only the first is what the report describes.

import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const P = (js) => probe(js);

  const setup = await P(`(function(){
    if(!editorOpen && typeof toggleEditor === 'function') toggleEditor();
    /* one of every zone type, all at distinct spots on open ground inside the arena */
    const spots = {};
    const mk = (type, x, z) => {
      const d = ZONE_EDIT[type]; if(!d || !d.add) return null;
      const before = d.list().length;
      d.add();
      const list = d.list();
      if(list.length === before) return null;
      const z0 = list[list.length - 1];
      z0.x = x; z0.z = z; if(z0.r != null) z0.r = 4; if(z0.w != null) z0.w = 4; if(z0.h != null && type !== 'ladders') z0.h = 4;
      d.refresh();
      spots[type] = { x, z, idx: list.length - 1 };
      return z0;
    };
    let i = 0;
    for(const type in ZONE_EDIT){ mk(type, -50 + (i % 4) * 26, -50 + Math.floor(i / 4) * 26); i++; }
    return { spots, types: Object.keys(ZONE_EDIT) };
  })()`);

  // what the raycast can actually REACH, and what the resolver would name
  const report = await P(`(function(){
    const out = {};
    for(const type in ZONE_EDIT){
      const d = ZONE_EDIT[type];
      const arr = d.markers() || [];
      const i = d.list().length - 1;
      const m = arr[i];
      out[type] = {
        zones: d.list().length,
        markers: arr.length,
        haveMarker: !!m,
        visible: m ? !!m.visible : null,
        inScene: m ? !!(m.parent) : null,
        meshes: 0,
        resolverNames: null,
        inTargetList: null,
      };
      if(m){
        let n = 0; m.traverse(o => { if(o.isMesh) n++; });
        out[type].meshes = n;
        /* would the resolver name it? (build 1326's half) */
        let leaf = null; m.traverse(o => { if(!leaf && o.isMesh) leaf = o; });
        const zh = leaf ? _zoneHitAt(leaf) : null;
        out[type].resolverNames = zh ? zh.type : null;
      }
    }
    return out;
  })()`);

  // the target list itself, read out of the running click path by re-deriving it exactly as the code does
  const targets = await P(`(function(){
    const t = [];
    if(station && station.model) t.push(station.model);
    for(const p of propModels){ if(p && !(p.userData && (p.userData.edLock || p.userData.edHide))) t.push(p); }
    for(const g of lightModels){ if(g.userData.marker && g.visible && !g.userData.edLock) t.push(g.userData.marker); }
    for(const g of spawnMarkers){ if(g.visible && !g.userData.edLock) t.push(g); }
    for(const m of pickupMarkers){ if(m && m.visible) t.push(m); }
    for(const m of lootMarkers){ if(m && m.visible) t.push(m); }
    for(const type in ZONE_EDIT){ for(const m of (ZONE_EDIT[type].markers() || [])){ if(m && m.visible) t.push(m); } }
    for(const g of turretModels){ if(g && g.visible && !(g.userData && g.userData.edLock)) t.push(g); }
    if(playerSpawnMarker && playerSpawnMarker.visible) t.push(playerSpawnMarker);
    if(extractZone && extractZone.visible) t.push(extractZone);
    const out = {};
    for(const type in ZONE_EDIT){
      const arr = ZONE_EDIT[type].markers() || [];
      out[type] = arr.filter(m => t.indexOf(m) >= 0).length + '/' + arr.length;
    }
    return { total: t.length, perType: out };
  })()`);

  /* The list is a re-derivation, so it can agree with itself and be wrong. This drives the REAL click
     handler: place the editor camera above each zone looking straight down, synthesise a mousedown at
     the canvas centre, and read back what got selected. */
  const clicks = await P(`(function(){
    const out = {};
    const cv = renderer.domElement, r = cv.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for(const type in ZONE_EDIT){
      const d = ZONE_EDIT[type], i = d.list().length - 1, z = d.list()[i];
      const m = (d.markers() || [])[i];
      if(!m){ out[type] = 'no marker'; continue; }
      const p = new THREE.Vector3(); m.getWorldPosition(p);
      /* activeCam() returns the main camera in fly mode, and the raycast reads that camera's own
         matrices — so the pose is set on it directly and its world matrix forced, rather than going
         through the frame loop, which would need a real rAF that SwiftShader delivers at ~1.5 fps. */
      editorTopView = false; editorFreeFly = true;
      camera.position.set(p.x, p.y + 26, p.z + 0.01);
      camera.lookAt(p.x, p.y, p.z);
      camera.updateMatrixWorld(true);
      /* clear every selection so a stale one cannot be mistaken for a fresh pick */
      for(const t2 in ZONE_EDIT) ZONE_EDIT[t2].pick(-1);
      selProps.length = 0; selLights.length = 0; editorActive = 'props';
      /* A zone marker is a RING, so a ray straight down its axis goes through the HOLE — aiming at the
         centre is not what a creator does. Several offsets are tried and any hit counts, which is the
         real question: can this zone be clicked.
         The pick listens for CLICK, not mousedown — a synthesised down+up does not produce one, which is
         why the first run reported every type failing INCLUDING the three that already worked. A null
         with a failed control is the instrument (build 1428). */
      let hit = false, where = null;
      /* the offsets are in NDC and the camera is 26 m up at fov 78, so half-height on the ground is ~21 m:
         0.35 is 7.4 m, well OUTSIDE a 4 m zone. Only the centre was ever being tested, and the centre of a
         ring is its hole. */
      for(const [ox, oy] of [[0,0],[0.08,0],[0,0.08],[-0.08,0],[0,-0.08],[0.06,0.06],[-0.06,-0.06],[0.12,0],[0,0.12]]){
        for(const t2 in ZONE_EDIT) ZONE_EDIT[t2].pick(-1);
        selProps.length = 0; editorActive = 'props'; editorDragMoved = false;
        cv.dispatchEvent(new MouseEvent('click', { bubbles:true,
          clientX: cx + ox * r.width * 0.5, clientY: cy + oy * r.height * 0.5, button:0 }));
        if(editorActive === type && d.sel() === i){ hit = true; where = [ox, oy]; break; }
      }
      out[type] = { hit, where };
      if(!hit){
        /* say WHY: what the ray actually reached, and what the marker is made of */
        const parts = []; m.traverse(o => { if(o.isMesh) parts.push({ t:o.geometry && o.geometry.type, vis:o.visible,
          raycast: (o.raycast === THREE.Mesh.prototype.raycast) ? 'default' : 'OVERRIDDEN', layers:o.layers.mask }); });
        const _rc = new THREE.Raycaster(); _rc.near = 0; _rc.far = Infinity;
        _rc.setFromCamera(new THREE.Vector2(0, 0), activeCam());
        const anyHit = _rc.intersectObject(m, true);
        out[type] = out[type] || {};
        out[type].why = { parts, directHits: anyHit.length, markerVisible: m.visible, parentVisible: !!(m.parent && m.parent.visible) };
      }
    }
    /* THE CONTROL: a prop must select through the identical path. Without it a table of failures is
       indistinguishable from a probe that never fired the right event — which is what happened. */
    /* the control gets its OWN clear spot — the first run put it above a jump-pad marker and resolved
       that instead, which is a fixture collision, not a finding */
    const n0 = propModels.length;
    spawnProp('box', [58, 0, 58, 0, 0, 0, 2, 2, 2]);   /* [x,y,z, rx,ry,rz, sx,sy,sz] — read propTuple, do not guess: the first draft put the scale in the rotation slots and made a ZERO-SIZE box, which is invisible to a raycast and reads exactly like a broken click path */
    const pr = propModels.length > n0 ? propModels[propModels.length - 1] : null;
    let control = 'no prop';
    if(pr){
      const p2 = new THREE.Vector3(); pr.getWorldPosition(p2);
      camera.position.set(p2.x, p2.y + 26, p2.z + 0.01); camera.lookAt(p2.x, p2.y, p2.z); camera.updateMatrixWorld(true);
      selProps.length = 0; editorActive = 'zzz'; editorDragMoved = false;
      cv.dispatchEvent(new MouseEvent('click', { bubbles:true, clientX:cx, clientY:cy, button:0 }));
      const pw = new THREE.Vector3(); pr.getWorldPosition(pw);
      const _rc2 = new THREE.Raycaster(); _rc2.near = 0; _rc2.far = Infinity;
      _rc2.setFromCamera(new THREE.Vector2(0, 0), activeCam());
      const direct = _rc2.intersectObject(pr, true);
      control = { active: editorActive, idx: editorTargets.props.idx, isThatProp: propModels[editorTargets.props.idx] === pr,
                  propAt: [+pw.x.toFixed(1), +pw.y.toFixed(1), +pw.z.toFixed(1)], visible: pr.visible,
                  edHide: !!(pr.userData && pr.userData.edHide), edLock: !!(pr.userData && pr.userData.edLock),
                  directHits: direct.length, camAt: [+camera.position.x.toFixed(1), +camera.position.y.toFixed(1), +camera.position.z.toFixed(1)],
                  activeIsCamera: activeCam() === camera, topView: editorTopView, freeFly: editorFreeFly,
                  sharedFar: raycaster.far, sharedNear: raycaster.near,
                  ray: [+_rc2.ray.direction.x.toFixed(2), +_rc2.ray.direction.y.toFixed(2), +_rc2.ray.direction.z.toFixed(2)],
                  inPropModels: propModels.indexOf(pr),
                  kids: pr.children.length, meshes: (()=>{ let n=0; pr.traverse(o=>{ if(o.isMesh) n++; }); return n; })(),
                  bbox: (()=>{ const b=new THREE.Box3().setFromObject(pr); return b.isEmpty() ? 'EMPTY' :
                    [+b.min.x.toFixed(1),+b.min.y.toFixed(1),+b.min.z.toFixed(1),+b.max.x.toFixed(1),+b.max.y.toFixed(1),+b.max.z.toFixed(1)]; })(),
                  src: pr.userData && pr.userData.src };
    }
    out.__control = control;
    return out;
  })()`);

  console.log(JSON.stringify({ types: setup.types, report, targets, clicks }, null, 1));
});
