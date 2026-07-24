// (build 1069) SAVE CLIP CONFIRMS — author: "we need a toast when the user clicks Save Clip.
// right now you can't tell if it saved it successfully or not." _aeSave always DID toast; the
// toast lane just sat at z-index 70 while the fullscreen animation editor is 300, so every
// message it ever showed rendered BEHIND the editor and nobody saw it. (Same class of bug as
// the delete dialog in build 1045.) Toasts now sit above the fullscreen layers — they are
// pointer-events:none, so raising them can never swallow a click — and SAVE CLIP additionally
// confirms in place on the button itself, which survives a busy toast lane.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();
const html = (await import('./harness.mjs')).html;

// ---- the toast lane clears the fullscreen layers ----
{
  const show = extractFunction('_showToast', src);
  assert(/z-index:500;/.test(show), 'the toast lane sits above the animation editor (300) and themed dialogs (400)');
  assert(/position:fixed;top:36px/.test(show), '...and is fixed to the viewport, not the document');
  assert(/pointer-events:none/.test(show), '...and never intercepts a click, so raising it is safe');
}
{
  const big = extractFunction('flashBigToast', src);
  assert(/z-index:501;/.test(big), 'the big confirmation toast clears them too (and sits just above the small lane)');
  assert(/pointer-events:none/.test(big), '...also click-through');
}
// the editor and dialog layers are what they had to clear
assert(/#animEd\s*\{[^}]*z-index:\s*300/.test(html), 'the animation editor is the 300 layer');
assert(/z-index:400;background:rgba\(3,7,10,0\.66\)/.test(src), 'themed dialogs are the 400 layer');

// ---- SAVE CLIP reports, twice ----
{
  const sv = extractFunction('_aeSave', src);
  assert(/_aeFlashSaved\(clean\);/.test(sv), 'saving flashes the button');
  assert(/toast\('Saved — "'\+clean\.name\+'" is in this level’s clip library \('\+_aeKeyTimes\(clean\)\.length\+' keys\)'\)/.test(sv),
    '...and toasts the clip name AND its key count, so a silent no-op is impossible to miss');
  // the failure path must be just as loud
  assert(/if\(!clean\)\{ if\(typeof toast==='function'\) toast\('Nothing to save'\); return; \}/.test(sv),
    'an empty clip says so rather than failing silently');
}
{
  const fl = extractFunction('_aeFlashSaved', src);
  assert(/b\.textContent='\\u2713 SAVED';/.test(fl), 'the button reads back "✓ SAVED"');
  assert(/b\.classList\.add\('aeSaved'\);/.test(fl), '...with a distinct style');
  assert(/b\._svT=setTimeout\(/.test(fl) && /b\.textContent=b\._svLabel\|\|'SAVE CLIP'/.test(fl),
    '...and restores its own original label afterwards');
  assert(/if\(b\._svT\)\{ clearTimeout\(b\._svT\); \} else \{ b\._svLabel=b\.textContent; \}/.test(fl),
    'saving twice quickly re-arms the timer instead of capturing "✓ SAVED" as the label');
}
assert(/#animEd button\.aeSaved \{ background:rgba\(120,240,190,0\.3\)/.test(html), 'the saved state has its own style');

done('build 1069: Save Clip says so — the toast lane finally clears the fullscreen editor, and the button confirms in place');
