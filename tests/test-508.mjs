import { gameSource, html, assert, done } from './harness.mjs';
const src = gameSource();
// build 658: while editing, every gameplay HUD element is hidden (crosshair stays). And the editor panel can
// be popped into its OWN browser window — we MOVE the live DOM node into the popup so all the closures /
// listeners stay intact, then re-dock on popup close (or when the editor itself is closed via P).

// --- HUD hide: a body.editing class drives a CSS rule covering all combat-HUD ids ---
assert(/body\.editing #stats, body\.editing #ammoPanel, body\.editing #score, body\.editing #wavePanel,/.test(html), 'CSS rule hides every gameplay HUD element while editing');
for(const id of ['stats','ammoPanel','score','wavePanel','bossBar','cpHud','buffs','prompt','minimap','turretHud','grabHint','hurtDir','lowhp','damage','weaponWheel'])
  assert(new RegExp('body\\.editing #'+id+'\\b').test(html), 'HUD element #'+id+' is hidden while editing');
assert(/body\.editing #weaponWheel \{ display: none !important; \}/.test(html), 'the rule uses display:none !important so it overrides inline styles');

// crosshair must NOT be in the rule
assert(!/body\.editing #crosshair\b/.test(html), 'the crosshair stays visible while editing');

// the body class is toggled by toggleEditor on open + close
assert(/document\.body\.classList\.add\('editing'\)/.test(src), 'editor open adds the body.editing class');
assert(/document\.body\.classList\.remove\('editing'\)/.test(src), 'editor close removes the body.editing class');

// the prior per-element JS toggles for minimap / wavePanel are gone (no double-handling)
assert(!/mm\.style\.display='none'/.test(src), 'minimap is now handled by the body class, not inline JS');
assert(!/wp=\$\('wavePanel'\); if\(wp\) wp\.style\.display='none';/.test(src), 'wavePanel is now handled by the body class, not inline JS');

// --- Pop out: a new button in the editor top bar opens the editor in its own window ---
assert(/<button id="edPopOut"/.test(src), 'a pop-out button exists in the editor top bar');
assert(/const pop=ed\.querySelector\('#edPopOut'\);/.test(src), 'the pop-out handler is wired');
assert(/window\.open\('', 'breach-editor'/.test(src), 'opens a named popup window');
assert(/w\.document\.body\.appendChild\(ed\);/.test(src), 'the editor element is MOVED into the popup (closures + listeners survive)');
assert(/for\(const s of document\.querySelectorAll\('style'\)\)\{ const ns=w\.document\.createElement\('style'\); ns\.textContent=s\.textContent; w\.document\.head\.appendChild\(ns\); \}/.test(src), 'parent <style> blocks are copied so the popup looks right');
assert(/#editor\.popped\{position:static !important/.test(src), 'the popped class overrides the docked layout so the panel fills the popup');

// re-docking is reliable
assert(/const reDock=\(\)=>\{/.test(src), 'a reDock helper restores the panel to the parent window');
assert(/ed\._reDock = reDock;/.test(src), 'the helper is exposed on the editor element');
assert(/w\.addEventListener\('beforeunload', reDock\);/.test(src), 'closing the popup re-docks the panel automatically');

// closing the editor itself (P key) also re-docks any open popup, so it does not linger
assert(/if\(editorEl && editorEl\._popWin\)\{ try\{ editorEl\._popWin\.close\(\); \}catch\(e\)\{\} if\(editorEl\._reDock\) editorEl\._reDock\(\); \}/.test(src), 'closing the editor closes + re-docks the popup');

// the floating + button rides along too
assert(/w\.document\.body\.appendChild\(fb\);/.test(src), 'the + button is moved into the popup with the editor');

done('build 658: HUD hidden in editor + pop-out into its own window');
