// (build 974) CREATOR MODEL UPLOADS — upload a .glb from the editor's model widget; it hosts on
// the community server and comes back as a plain URL, so it works everywhere URLs already do
// (saves, share codes, published games, multiplayer transfer). Both sides verify the binary-glTF
// header, so only real models land; the upload folder serves nothing but .glb and executes
// nothing. Owner key (hashed at rest): same filename + same key replaces in place; delete is
// key-gated. Quotas: 8 MB/file, 10 files + 40 MB per key, 500 files + 2 GB global.
import { gameSource, assert, eq, done } from './harness.mjs';
import { readFileSync } from 'fs';
const src = gameSource();
const up  = readFileSync(new URL('../server/api/upload.php', import.meta.url), 'utf8');
const adm = readFileSync(new URL('../server/api/admin.php', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../server/api/_community_lib.php', import.meta.url), 'utf8');
const ht  = readFileSync(new URL('../community/models/.htaccess', import.meta.url), 'utf8');
const rd  = readFileSync(new URL('../server/README.md', import.meta.url), 'utf8');

// ---- executable: the client-side signature sniff (build 975 generalized _sniffUpload) ----
const sniff = src.match(/function _sniffUpload\(b, type\)\{[\s\S]{0,900}?\n\}/)[0];
const _sniff = new Function('b', 'type', sniff.replace(/^function _sniffUpload\(b, type\)\{/, '').replace(/\}$/, ''));
const glb = new Uint8Array(12); glb.set([0x67,0x6c,0x54,0x46, 2,0,0,0, 12,0,0,0]);   // 'glTF', v2
eq(_sniff(glb, 'model'), 'glb', 'a real GLB header sniffs as glb');
const fake = new Uint8Array(12); fake.set([0x3c,0x68,0x74,0x6d, 2,0,0,0, 12,0,0,0]); // '<htm…'
eq(_sniff(fake, 'model'), '', 'an HTML file dressed as .glb fails the check');

// ---- game wiring ----
assert(/if\(typeof renderModelUpload==='function'\) renderModelUpload\(urlHost, inp, tgt\);/.test(src),
  'the widget hooks into the SHARED model-URL section — props, weapons, station, player, all of it');
assert(/breach_upload_key/.test(src) && /breach_my_'\+type\+'s/.test(src), 'owner key + per-type upload lists live in this browser');
assert(/fetch\(_commApi\(\)\+'upload\.php\?type='\+type\+'&name='\+encodeURIComponent\(file\.name\)\+'&k='\+_uploadKey\(\)/.test(src),
  'raw bytes POST to the live API with the type param');
assert(/renderUploadRow\(urlHost, 'model', \(url\)=>\{/.test(src) && /if\(tgt && tgt\.setUrl && !tgt\.addable\) tgt\.setUrl\(url\);/.test(src),
  'model widget uses the shared control; single-slot targets auto-apply, props keep it for Add model');
assert(/afterRender:\(url\)=>\{ const ni=editorEl && editorEl\.querySelector\('#edUrlInput'\); if\(ni\) ni\.value=url; \}/.test(src),
  'the URL survives the picker re-render so Swap/Add read it');
assert(/upload\.php\?type='\+type\+'&slug='\+encodeURIComponent\(slug\)\+'&k='\+_uploadKey\(\), \{ method:'DELETE' \}/.test(src),
  'creators can delete their own uploads');
assert(/gltf\.report \/ gltfpack/.test(src), 'oversize is rejected client-side with compression advice');

// ---- server: header re-verified, quotas, replace-in-place, key-gated delete ----
assert(/substr\(\$b, 0, 4\) !== 'glTF'/.test(up) && /\$ver === 2 && \$dlen === \$len/.test(up),
  'server re-verifies magic + version + declared length (truncated uploads rejected too)');
assert(/RUMPUS_MODEL_MAX/.test(up) && /RUMPUS_UPLOADS_PER_KEY/.test(up) && /RUMPUS_UPLOADS_DISK/.test(up)
  && /RUMPUS_UPLOAD_INTERVAL/.test(up), 'file/quota/disk/rate caps, env-tunable');
assert(/hash_equals\(\(string\)\(\$m(eta)?\['keyHash'\] \?\? ''\), \$kh\)/.test(up),
  'owner key compared via hash_equals against the stored hash');
assert(/\$replacing = true/.test(up), 'same filename + same key replaces in place');
assert(/function modelsDir\(\)/.test(lib) && /function assetFilesDir\(\$type\)/.test(lib),
  'model dirs live in the shared lib (metadata under api/, web-denied)');

// ---- the upload folder is inert: no execution, .glb only ----
assert(/php_flag engine off/.test(ht) && /RemoveHandler \.php/.test(ht) && /Options -ExecCGI -Indexes/.test(ht),
  'script execution is hard-off in community/models/');
assert(/Require all denied/.test(ht) && /<FilesMatch "\\\.glb\$">\s*\n\s*Require all granted/.test(ht),
  'nothing but .glb is ever served from it');
assert(/max-age=604800/.test(ht), 'week-long cache — repeat players do not refetch');

// ---- admin: visibility + takedown ----
assert(/'uploads' => \$uploads/.test(adm) && /delete_upload/.test(adm) && /UPLOADED ASSETS/.test(adm),
  'admin lists uploads (with disk total) and can delete');
assert(/uploadBytes/.test(adm), 'the disk total is surfaced');
assert(/community\/models\/\.htaccess/.test(rd) && /post_max_size/.test(rd), 'deploy steps documented');

done('build 974: creator .glb uploads — magic-checked both sides, quota-capped, inert hosting, admin takedown');
