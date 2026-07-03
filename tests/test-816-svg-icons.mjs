// (build 816) Load-bearing color emoji on buttons are replaced with inline currentColor stroke SVGs (the same 24x24
// .eico language the static HTML already uses) — color emoji render differently on every OS and can't inherit the theme.
// Icon-only buttons (✕ delete / ▲▼ reorder) get title + aria-label.
import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();

// the helper + icon set
assert(/function _icn\(name\)\{ return '<svg class="eico" viewBox="0 0 24 24" fill="none" stroke="currentColor"[\s\S]*?aria-hidden="true">'\+\(_ICONS\[name\]\|\|''\)\+'<\/svg>'; \}/.test(src), 'the _icn helper emits the shared .eico SVG language');
for(const k of ['save','link','download','upload','trash','search','eye','eyeOff','plus','warn'])
  assert(new RegExp("  "+k+":'").test(src), 'icon exists: '+k);

// the swapped sites
assert(/id="edSave">'\+_icn\('save'\)\+'Save<\/button>/.test(src), 'Save uses the SVG icon');
assert(/id="edShare">'\+_icn\('link'\)\+'Copy share link<\/button>/.test(src), 'Copy-link uses the SVG icon');
assert(/id="edExport">'\+_icn\('download'\)\+'Export \.json<\/button>/.test(src) && /id="edImport">'\+_icn\('upload'\)\+'Import \.json<\/button>/.test(src), 'Export/Import use SVG icons');
assert(/id="edWipe"[^>]*>'\+_icn\('trash'\)\+'Delete all objects/.test(src), 'Delete-all uses the SVG icon');
assert(/wb\.innerHTML=_icn\('warn'\)\+'Click again to delete ALL objects'/.test(src), 'the armed wipe state uses the warning icon');
assert(/pv\.innerHTML = \(previewEnemy \? _icn\('eyeOff'\)\+'Hide preview' : _icn\('eye'\)\+'Preview enemy'\);/.test(src), 'enemy preview uses eye / eye-off icons');
assert((src.match(/_icn\('plus'\)\+'Add /g)||[]).length>=3, 'the add buttons use the plus icon');
assert((src.match(/_icn\('search'\)\+'Search free models/g)||[]).length===4, 'the model-search headers use the search icon with one normalized phrase (build 844)');

// no color-emoji remain on those controls (comments don't count)
{
  const code = src.split('\n').map(l=>l.replace(/\/\/.*$/,'')).join('\n');
  for(const em of ['💾','🔗','⬇','⬆','🗑','🔍','👁','➕','🎯','⏱','📦','🛡','💥','🚚','🧩','🎲','🗺','🚶','💨','🪨','🧊','🔁','⛓','✨'])
    eq(code.includes(em), false, 'color emoji removed from the UI: '+em);
}

// icon-only buttons carry title + aria-label
assert((src.match(/setAttribute\('aria-label','Remove /g)||[]).length>=5, 'icon-only delete buttons have aria-labels');
assert(/up\.title='Move up'; up\.setAttribute\('aria-label','Move level up'\)/.test(src), 'reorder buttons have titles + aria-labels');

done('build 816: emoji buttons -> themed SVG icons, with accessible labels');
