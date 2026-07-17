// (build 975) UPLOADS GENERALIZED to textures + sounds, plus a big success toast. The build-974
// model upload became a shared renderUploadRow + _uploadAsset(type) path; the same magic-byte
// discipline extends to images (PNG/JPEG/WebP) and audio (MP3/OGG/WAV), each with its own inert
// hosting folder. flashBigToast is a loud, animated confirmation for a deliberate action.
import { gameSource, html, assert, eq, done } from './harness.mjs';
import { readFileSync } from 'fs';
const src = gameSource();
const up  = readFileSync(new URL('../server/api/upload.php', import.meta.url), 'utf8');
const adm = readFileSync(new URL('../server/api/admin.php', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../server/api/_community_lib.php', import.meta.url), 'utf8');
const htT = readFileSync(new URL('../community/textures/.htaccess', import.meta.url), 'utf8');
const htS = readFileSync(new URL('../community/sounds/.htaccess', import.meta.url), 'utf8');
const rd  = readFileSync(new URL('../server/README.md', import.meta.url), 'utf8');

// ---- executable: the generalized client sniff across all three media ----
const sniff = src.match(/function _sniffUpload\(b, type\)\{[\s\S]{0,1100}?\n\}/)[0];
const _sniff = new Function('b', 'type', sniff.replace(/^function _sniffUpload\(b, type\)\{/, '').replace(/\}$/, ''));
const bytes = (arr) => { const u = new Uint8Array(16); u.set(arr); return u; };
eq(_sniff(bytes([0x67,0x6c,0x54,0x46, 2,0,0,0, 16,0,0,0]), 'model'), 'glb', 'GLB header -> glb');
eq(_sniff(bytes([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]), 'texture'), 'png', 'PNG signature -> png');
eq(_sniff(bytes([0xFF,0xD8,0xFF,0xE0]), 'texture'), 'jpg', 'JPEG signature -> jpg');
eq(_sniff(bytes([0x52,0x49,0x46,0x46, 0,0,0,0, 0x57,0x45,0x42,0x50]), 'texture'), 'webp', 'RIFF/WEBP -> webp');
eq(_sniff(bytes([0x4F,0x67,0x67,0x53]), 'sound'), 'ogg', 'OggS -> ogg');
eq(_sniff(bytes([0x52,0x49,0x46,0x46, 0,0,0,0, 0x57,0x41,0x56,0x45]), 'sound'), 'wav', 'RIFF/WAVE -> wav');
eq(_sniff(bytes([0x49,0x44,0x33, 3,0]), 'sound'), 'mp3', 'ID3 tag -> mp3');
eq(_sniff(bytes([0xFF,0xFB,0x90,0x00]), 'sound'), 'mp3', 'MPEG frame sync -> mp3');
eq(_sniff(bytes([0x3C,0x68,0x74,0x6D,0x6C]), 'texture'), '', 'HTML is not an image');
eq(_sniff(bytes([0x3C,0x68,0x74,0x6D,0x6C]), 'sound'), '', 'HTML is not a sound');

// ---- shared control + per-type wiring ----
assert(/const UPLOAD_MAX = \{ model:8, texture:4, sound:4 \};/.test(src), 'per-type size caps');
assert(/localStorage\.getItem\('breach_my_'\+type\+'s'\)/.test(src), "per-type upload lists ('breach_my_models' stays back-compatible)");
assert(/function renderUploadRow\(host, type, fill, opts\)/.test(src), 'one shared Upload+picker+delete control');
assert(/fetch\(_commApi\(\)\+'upload\.php\?type='\+type\+'&name='/.test(src), 'the type rides on the POST');

// texture: uploads under the Apply/Clear row, applies to the selected material
assert(/renderUploadRow\(matHost, 'texture', \(url\)=>\{[\s\S]{0,220}?applyPropTexture\(o, url\)/.test(src),
  'the texture panel gets an Upload image control that applies to the selection');
// sound: a per-slot upload inside the shared _sndRow helper (covers shoot/reload/turret/music/…)
const snd = src.match(/function _sndRow\(label, get, set\)\{[\s\S]*?return row;\n\}/)[0];
assert(/renderUploadRow\(row, 'sound', \(url\)=>\{ inp\.value=url; set\(url\);/.test(snd),
  'every sound field gains an Upload sound control that fills + applies the slot');
assert(/loadSound\(url, mark\)/.test(snd), '...and previews/loads the uploaded sound');

// ---- the big toast: louder, safe for user filenames (textContent), fires on every upload ----
assert(/function flashBigToast\(title, sub\)\{/.test(src), 'a big success toast exists');
assert(/\.bigToastTitle'\)\.textContent=title/.test(src) && /sb\.textContent=sub/.test(src),
  'title + subtitle set via textContent (safe for arbitrary filenames)');
assert(/flashBigToast\(UPLOAD_NOUN\[type\]\.toUpperCase\(\)\+' UPLOADED'/.test(src),
  'a successful upload fires the big toast, not the small one');

// ---- server: generic type handling, per-type magic, shared quotas ----
assert(/in_array\(\$type, assetTypes\(\), true\)/.test(up), 'the endpoint validates the type param');
assert(/function sniffAsset\(\$type, \$b\)/.test(up)
  && /substr\(\$b, 0, 8\) === "\\x89PNG/.test(up) && /substr\(\$b, 0, 4\) === 'OggS'/.test(up),
  'server-side signature checks for images + audio');
assert(/'texture' => \(int\)\(getenv\('RUMPUS_TEXTURE_MAX'\)/.test(up) && /'sound' => \(int\)\(getenv\('RUMPUS_SOUND_MAX'\)/.test(up),
  'per-type size caps, env-tunable');
assert(/foreach \(assetTypes\(\) as \$t\) \{\s*\n\s*foreach \(glob\(assetMetaDir\(\$t\)/.test(up),
  'quotas count across ALL types (no dodging the cap by spreading media)');
assert(/'url' => 'https:\/\/' \. \$host \. '\/community\/' \. assetKind\(\$type\) \. '\/' \. \$fname/.test(up),
  'the served URL points at the right per-type folder');

// ---- inert hosting for the two new folders ----
for (const [ht, kinds, label] of [[htT, /\\\.\(png\|jpe\?g\|webp\)\$/, 'textures'], [htS, /\\\.\(mp3\|ogg\|wav\)\$/, 'sounds']]) {
  assert(/php_flag engine off/.test(ht) && /Options -ExecCGI -Indexes/.test(ht), label + ': no script execution');
  assert(/Require all denied/.test(ht) && kinds.test(ht), label + ': only its own media type is served');
  assert(/max-age=604800/.test(ht), label + ': week-long cache');
}

// ---- admin lists all three, deletes by type ----
assert(/foreach \(assetTypes\(\) as \$t\)/.test(adm) && /'uploads' => \$uploads/.test(adm) && /delete_upload/.test(adm),
  'admin gathers models+textures+sounds and deletes any by type');
assert(/UPLOADED ASSETS/.test(adm) && /\['\+esc\(m\.type\)\+'\]/.test(adm), 'the review page tags each asset with its type');

// ---- lib dirs + README ----
assert(/function assetFilesDir\(\$type\)/.test(lib) && /function assetMetaDir\(\$type\)/.test(lib) && /function assetTypes\(\)/.test(lib),
  'the shared lib exposes the generic asset dirs');
assert(/community\/textures\/\.htaccess/.test(rd) && /community\/sounds\/\.htaccess/.test(rd), 'deploy steps document the new folders');

done('build 975: texture + sound uploads on the shared pipeline, loud success toast, inert per-type hosting');
