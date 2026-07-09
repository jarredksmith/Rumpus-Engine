// (build 913) MOBILE HUD + SNIPER SCOPE — the room-code badge and the mode banner overlapped at
// top-centre on phones (badge ~26px tall at top:8, banner at top:30), neither was movable in the
// customize-controls editor, and the editor's own toolbar sat exactly on top of them. And the
// sniper never zoomed on touch/pad: the scope gate read only the MOUSE ads flag. Verified live on
// a touch profile: defaults clear (badge b=29 < banner t=42), toolbar drags aside, both elements
// drag + persist, AIM tap scopes (fov 78->12, overlay up) and unscopes cleanly.
import { gameSource, html, assert, done } from './harness.mjs';

const src = gameSource();

// de-overlapped touch defaults
assert(/body\.touch #roomBadge \{ top: calc\(4px \+ env\(safe-area-inset-top\)\); \}/.test(html), 'badge sits at 4px + inset on touch');
assert(/body\.touch #wavePanel \{ top: calc\(42px \+ env\(safe-area-inset-top\)\);/.test(html), 'banner drops to 42px — clear of the badge');

// badge + banner join the layout editor
assert(/HUD_EDITABLE = \['stats','ammoPanel','minimap','score','scoreboard','wavePanel','roomBadge'\]/.test(src), 'mode banner + room code are movable/resizable');
assert(/wavePanel:'Mode banner', roomBadge:'Room code'/.test(src), '...with labels in the editor');

// resize-only keeps centered elements centered
assert(/_centered = \(id==='wavePanel'\|\|id==='roomBadge'\) && typeof o\.fx!=='number'/.test(src) && /translateX\(-50%\) scale\('\+sc\+'\)/.test(src),
  'a bare resize keeps translateX(-50%) (it used to throw them half a width right)');

// the toolbar is draggable and shields the elements beneath
assert(/bar\.addEventListener\('pointerdown', e=>\{\n      e\.stopPropagation\(\);/.test(src), 'presses on the toolbar never start an element drag');
assert(/bar\.style\.left=x\+'px'; bar\.style\.top=y\+'px'; bar\.style\.transform='none'/.test(src), 'the toolbar itself drags aside');

// the scope belongs to every input
assert(/_scopedNow = !!\(\(ads \|\| padAds \|\| touchAds\) && WEAPONS\[curWep\] && WEAPONS\[curWep\]\.scope/.test(src),
  'touch AIM + controller LT raise the sniper scope (was mouse-only)');

done('build 913: the top-centre HUD is yours to arrange, and the sniper scopes on every input');
