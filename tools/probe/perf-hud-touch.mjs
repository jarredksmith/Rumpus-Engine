// Can a touch player see the frame rate — and can they READ it once it is on?
//
// Asked from use: "Can there be a way to open the dev hud on a touch device? I want to see FPS but I can't
// click a backtick on a phone." The meter had exactly one door, the ` key, so on a phone it did not exist.
//
// A checkbox alone is only half an answer. `#perfHud` is pinned bottom-left with `white-space:nowrap`, and
// bottom-left on a phone is where the movement stick sits — so this measures the READOUT too: does it
// overlap a touch control, and does its longest line fit the screen.
//
// Run at a phone-shaped viewport, with the engine's own `body.touch` class doing the work.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(24) + JSON.stringify(v));

await withGame(async (P) => {
  const r = await P(`(function(){
    const R = el => { const b = el.getBoundingClientRect();
      return { x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width), h:Math.round(b.height) }; };
    const hits = (a,b) => !(a.x+a.w <= b.x || b.x+b.w <= a.x || a.y+a.h <= b.y || b.y+b.h <= a.y);

    const el = document.getElementById('perfHud');
    const before = { exists: !!el, hidden: el.classList.contains('hidden'), perfOn };

    /* the door a touch player can actually reach */
    document.body.classList.add('touch');
    const cb = document.getElementById('perfHudCb');
    const hasDoor = !!cb;
    if(cb){ cb.checked = true; cb.onchange(); }        /* exactly what a tap does */
    updatePerfHud(); updatePerfHud();                   /* it redraws ~4x/sec; ask twice */

    const vw = innerWidth, vh = innerHeight;
    const box = R(el);

    /* the touch controls are what makes this different from a desktop overlay, so SHOW them */
    const tu = document.getElementById('touchUI'); if(tu) tu.style.display = 'block';

    /* Everything a player must be able to SEE. The meter is pointer-events:none, so a full-screen
       transparent INPUT layer (#touchUI is inset:0, #tLook is a 226x844 look pad) is not an obstruction —
       counting those was the first run's mistake and it painted the whole screen occupied. An element
       occupies space here only if it actually draws: a background, a border, or its own text. */
    const draws = (o, cs2) => {
      const bg = cs2.backgroundColor || '', a = /rgba\\([^)]*,\\s*([\\d.]+)\\s*\\)/.exec(bg);
      if(bg && bg !== 'transparent' && (!a || +a[1] > 0.05)) return true;
      if(parseFloat(cs2.borderTopWidth) > 0 && !/,\\s*0\\s*\\)/.test(cs2.borderTopColor||'')) return true;
      for(const n of o.childNodes) if(n.nodeType === 3 && n.textContent.trim()) return true;
      return false;
    };
    const occupied = [];
    document.querySelectorAll('#hud [id], #touchUI [id], #touchUI .tBtn, #pauseBtn').forEach(o=>{
      const b = o.getBoundingClientRect();
      if(b.width < 6 || b.height < 6) return;
      const cs2 = getComputedStyle(o);
      if(cs2.display === 'none' || cs2.visibility === 'hidden' || +cs2.opacity === 0) return;
      if(!draws(o, cs2)) return;
      occupied.push({ id: o.id || o.className, r: R(o) });
    });
    const overlaps = occupied.filter(o => hits(box, o.r)).map(o => o.id + ' ' + JSON.stringify(o.r));

    /* a coarse occupancy map, so the next placement is CHOSEN rather than guessed a third time */
    const COLS = 6, ROWS = 12, cw = vw/COLS, ch = vh/ROWS;
    const grid = [];
    for(let r2=0;r2<ROWS;r2++){ let row = '';
      for(let c=0;c<COLS;c++){
        const cell = { x:c*cw, y:r2*ch, w:cw, h:ch };
        row += occupied.some(o => hits(cell, o.r)) ? '#' : '.';
      }
      grid.push(row);
    }

    /* the longest rendered line, measured rather than counted in characters */
    const probe = document.createElement('span');
    probe.style.cssText = 'position:fixed;left:-9999px;white-space:pre;font:' + getComputedStyle(el).font;
    const lines = el.innerText.split('\\n');
    let widest = 0, widestLine = '';
    for(const L of lines){ probe.textContent = L; document.body.appendChild(probe);
      const w = probe.getBoundingClientRect().width; document.body.removeChild(probe);
      if(w > widest){ widest = w; widestLine = L; } }

    const cs = getComputedStyle(el);
    const persisted = (function(){ try{ return localStorage.getItem('breach_perfhud'); }catch(e){ return 'n/a'; } })();

    /* and the key still works, through the same one writer */
    const wasOn = perfOn;
    setPerfHud(false); const offHidden = el.classList.contains('hidden'), offBox = cb ? cb.checked : null;
    setPerfHud(wasOn);

    return { viewport:[vw,vh], before, hasDoor,
      perfOnAfterTap: perfOn, hiddenAfterTap: el.classList.contains('hidden'), persisted,
      box, onScreen: box.x >= 0 && box.y >= 0 && box.x+box.w <= vw && box.y+box.h <= vh,
      whiteSpace: cs.whiteSpace, wraps: cs.whiteSpace !== 'nowrap',
      widestLine: Math.round(widest), widestFitsInBox: Math.round(widest) <= box.w + 1,
      overlapsTouchUI: overlaps, occupancy: grid,
      keyStillWorks: (offHidden === true && offBox === false) };
  })()`);
  for (const k of Object.keys(r)) say(k, r[k]);
}, { settleMs: 4500, viewport: { width: 390, height: 844 } });

console.log('');
