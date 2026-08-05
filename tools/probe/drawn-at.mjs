// `drawnAt(x, y)` — what the RENDERER puts at a pixel, as opposed to what a raycast happens to hit first.
//
// This exists because build 1387's first three measurement rounds were taken on a window of 7,621 pixels
// that a raycast reported as the engine floor plane and that the renderer was drawing as something else
// entirely. Painting `floorMat` bright red moved those pixels by 0.01 while moving the whole frame by 2.2.
//
// Two traps, both of which this file's log already records and neither of which a material-class filter
// catches:
//   * `Raycaster` ignores `visible:false` on the object AND on its ancestors (build 1267 verified this
//     against r149). The player's own capsule proxy is invisible in first person and sits AT the camera,
//     so it wins every ray at distance 0.
//   * A nearer hit whose material you filtered out still OCCLUDES in the render. Filtering by material
//     class therefore reports the first hit you were willing to look at, not the first one drawn.
//
// So the predicate is the renderer's own: an object is drawn if it and every ancestor is visible, it is
// not the sky dome (a mesh ~1 unit from the camera that wins every ray — build 1139), and it is not a
// pure line/point helper. Export as a GLSL-free string so any probe can eval it inside the closure.
export const DRAWN_AT = `
  window.__drawnAt = (function(){
    const rc = new THREE.Raycaster(); rc.far = 2000;
    const shown = (o) => { for(let p = o; p; p = p.parent) if(!p.visible) return false; return true; };
    const dome = (o) => {
      const m = o.material; const t = (m && (m.type || (m[0] && m[0].type))) || '';
      // the procedural sky is a raw ShaderMaterial box drawn around the camera; water is one too, but
      // water is real geometry, so the test is "shader material AND essentially at the camera".
      return t === 'ShaderMaterial' && o.geometry && o.geometry.type === 'BoxGeometry';
    };
    return function(x, y, W, H){
      rc.setFromCamera(new THREE.Vector2((x / W) * 2 - 1, -((y / H) * 2 - 1)), camera);
      const hits = rc.intersectObjects(scene.children, true);
      for(const h of hits){
        const o = h.object;
        if(!shown(o)) continue;
        if(dome(o)) continue;
        if(o.isLine || o.isPoints || o.isLineSegments) continue;
        return h;
      }
      return null;
    };
  })();
`;

// A one-line label for whatever is drawn, in the spirit of build 1151's WHO[...]: read it before
// attributing anything to a surface.
export const WHO = `
  window.__who = function(h){
    if(!h) return 'sky';
    const o = h.object, m = o.material;
    return (o === floor ? 'FLOOR-PLANE'
          : (typeof arenaWalls !== 'undefined' && arenaWalls.indexOf(o) >= 0) ? 'BOUNDARY-WALL'
          : (o.userData.src || (o.parent && o.parent.userData.src) || o.name || o.geometry.type))
      + '|' + ((m && (m.type || 'arr')) || '-')
      + (m === floorMat ? '|floorMat' : m === wallMat ? '|wallMat' : '')
      + (o.isInstancedMesh ? '|INSTANCED' : '')
      + '@' + h.distance.toFixed(1);
  };
`;
