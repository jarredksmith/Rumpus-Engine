// build 1323 (editor audit 4.10) — "No CSG / room / spline tools; a doorway is four boxes forever."
//
// The geometry is checked exhaustively in test-1323 (pure function, 3600 configurations, no browser). This
// probe asks only what a live engine can answer.
//
// TWO INSTRUMENT FAILURES from its first run, both fixed here and both worth keeping:
//   - `insideSolid(x, z, feetY)` was called as (x, y, z). It reported the whole sweep CLEAR — including
//     through a solid wall — and the "a player fits" line agreed. A sweep with no control is worthless:
//     it now proves it can read SOLID before it is allowed to report clear.
//   - "shear" was measured as each piece's y against the floor top, which called a door header's
//     legitimate 2.1 m base 2.1 m of shear. Shear is the spread of the per-piece terrain LIFT.
import { withGame } from './driver.mjs';

await withGame(async (P, page) => {
  console.log('open editor:', JSON.stringify(await P(`(function(){ if(!editorOpen) toggleEditor(); return { editorOpen }; })()`)));
  await page.waitForTimeout(900);

  console.log('\n--- 1. THE PANEL, AND THE + MENU ENTRY ---');
  console.log(JSON.stringify(await P(`(function(){
    const btn=document.getElementById('edAdd'), menu=document.getElementById('edAddMenu');
    menu.style.display='none'; btn.click();
    const row=[...menu.children].find(e=>/Room/i.test(e.textContent));
    if(!row) return { noRoomEntry:true };
    row.click();
    return { entry: row.textContent, mode: editorMode, target: editorActive };
  })()`)));
  await page.waitForTimeout(300);
  console.log('panel   :', JSON.stringify(await P(`(function(){
    const h=document.getElementById('edRoom');
    const fold=h&&h.closest?h.closest('.edSubSection'):null;
    return { built: h.children.length>0, foldOpen: fold?!fold.classList.contains('collapsed'):null,
             fields: [...h.querySelectorAll('.field label span')].map(e=>e.textContent),
             buttons: [...h.querySelectorAll('button')].map(b=>b.textContent) };
  })()`)));

  console.log('\n--- 2. ONE CLICK -> A ROOM ---');
  console.log(JSON.stringify(await P(`(function(){
    const n0 = propModels.length;
    const made = buildRoomAt(0, 0, roomDraft);
    return { props: made.length, addedToScene: propModels.length-n0,
             oneGroup: new Set(made.map(o=>o.userData.groupId)).size===1,
             selected: selProps.length, names: made.map(o=>o.userData.name),
             allHaveColliders: made.every(o=>!!(o.userData.boxes||o.userData.box)) };
  })()`)));

  console.log('\n--- 3. IS THE DOORWAY PASSABLE TO THE ENGINE ITSELF? ---');
  console.log('  CONTROL FIRST — a sweep that cannot read SOLID anywhere proves nothing.');
  console.log('  AND ON EMPTY GROUND: built at the origin, the sweep read BLOCKED — by a stock-level crate');
  console.log('  standing at (0,-3.15), not by the room. Probe the scene before believing the number.');
  console.log(JSON.stringify(await P(`(function(){
    buildRoomAt(200, 200, roomDraft);      /* far from anything the stock level placed */
    const Z = 200-3.15;                    /* the north wall's centre line at d=6, t=0.3 */
    const X0 = 200;
    const solid = (x, feet)=> insideSolid(X0+x, Z, feet);
    let clear = 0; const ST = 0.02;
    for(let x=-6;x<=6;x+=ST) if(!solid(x, 0.05)) clear += ST;
    return { CONTROL_solidInsideTheWall: solid(3.5, 0.05),
             CONTROL_clearWellAboveIt:  !solid(3.5, 40),
             clearSpanAlongTheWall: +clear.toFixed(2),
             authoredDoorWidth: (roomDraft.openings[0]||{}).width };
  })()`)));
  console.log('player fits:', JSON.stringify(await P(`(function(){
    const Z=200-3.15, X0=200, R=player.radius||0.8;
    const fits=(x)=>{ for(let a=0;a<8;a++){ const th=a/8*Math.PI*2;
      if(insideSolid(X0+x+Math.cos(th)*R, Z+Math.sin(th)*R, 0.05)) return false; } return true; };
    let ok=false; for(let x=-2;x<=2;x+=0.02) if(fits(x)){ ok=true; break; }
    return { playerRadius:R, fitsThroughTheDoorway: ok, andIsStoppedByTheWall: !fits(3.5) };
  })()`)));

  console.log('\n--- 4. DOES A ROOM SHEAR ON SLOPED TERRAIN? ---');
  console.log('  (finalizeProp lifts EVERY prop independently by _maxTerrainOver(x,z,footR))');
  const SHEAR = `(function(){
    const made = buildRoomAt(0,0,roomDraft);
    const local = roomPieces(roomDraft);
    const lifts = made.map((o,i)=> o.position.y - local[i].y);
    return { lifts: lifts.map(v=>+v.toFixed(4)),
             shear: +(Math.max(...lifts)-Math.min(...lifts)).toFixed(4) };
  })()`;
  console.log('flat    :', JSON.stringify(await P(SHEAR)));
  console.log('15% slope:', JSON.stringify(await P(`(function(){
    const real = terrainHeightAt;
    try{ terrainHeightAt = (x,z)=> x*0.15; return ${SHEAR}; }
    finally { terrainHeightAt = real; }
  })()`)));
  console.log('  (a shear of 0 means the shell lands FLAT on one pad — walls not sunk through the slab)');

  console.log('\n--- 5. IT IS ORDINARY PROPS AFTERWARDS ---');
  console.log(JSON.stringify(await P(`(function(){
    const made = buildRoomAt(0,0,roomDraft);
    const gid = made[0].userData.groupId;
    const lvl = serializeLevel();
    const all = lvl.props||lvl.p||[];
    const mine = all.filter(p=>(p.gid||p.groupId||p.g)===gid);
    return { roomProps: made.length, serializedWithTheRoomsGroup: mine.length,
             allSerialized: mine.length===made.length, sampleKeys: mine[0]?Object.keys(mine[0]):null };
  })()`)));
  console.log('round trip:', JSON.stringify(await P(`(function(){
    const made = buildRoomAt(0,0,roomDraft);
    const before = made.map(o=>[+o.position.x.toFixed(4),+o.position.y.toFixed(4),+o.position.z.toFixed(4)]);
    const lvl = serializeLevel();
    restoreLevel(lvl);
    const back = propModels.filter(Boolean).slice(-made.length)
      .map(o=>[+o.position.x.toFixed(4),+o.position.y.toFixed(4),+o.position.z.toFixed(4)]);
    return { same: JSON.stringify(before)===JSON.stringify(back), before: before[0], back: back[0] };
  })()`)));
  console.log('undo    :', JSON.stringify(await P(`(function(){
    const n0 = propModels.length;
    buildRoomAt(0,0,roomDraft);
    const n1 = propModels.length;
    performUndo();
    return { before:n0, afterBuild:n1, afterUndo:propModels.length, wholeRoomUndone: propModels.length===n0 };
  })()`)));
}, { settleMs: 9000 });
