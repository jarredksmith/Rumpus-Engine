// console-noise census — reproduce the user's pasted console on OUR tree and count each class.
// Boot, deploy, save, share, open/close the editor: the paths their session exercised.
import { withGame } from './driver.mjs';
import { DRIVE_RIG } from './drive.mjs';

const counts = new Map();
const bump = (k) => counts.set(k, (counts.get(k) || 0) + 1);
const CLASSES = [
  ['marked for update', 'Texture marked for update but no image data'],
  ['Unable to serialize Texture', 'THREE.Texture: Unable to serialize Texture'],
  ['frame-ancestors', "CSP frame-ancestors ignored in <meta>"],
  ['Multiple instances of Three.js', 'Multiple instances of Three.js'],
  ['no fire sheet', '[VFX] no fire sheet (the 404 fallback)'],
  ['404', 'a 404'],
  ['X3595', 'shader warning X3595 (gradient in loop)'],
  ['X4000', 'shader warning X4000 (uninitialized)'],
];

await withGame(async (probe, page) => {
  page.on('console', (m) => {
    const t = m.text();
    for (const [needle, label] of CLASSES) if (t.includes(needle)) { bump(label); return; }
    if (m.type() === 'warning' || m.type() === 'error') bump('OTHER ' + m.type() + ': ' + t.slice(0, 110));
  });
  page.on('requestfailed', (r) => bump('request failed: ' + r.url().split('/').slice(-2).join('/')));

  const P = (js) => probe(js);
  const ser = () => counts.get('THREE.Texture: Unable to serialize Texture') || 0;
  const step = async (label, js) => { const b = ser(); await P(js); await new Promise(r=>setTimeout(r,300)); console.log('step', label.padEnd(12), '+'+(ser()-b), 'serialize-texture warns'); };
  await P(DRIVE_RIG + `(function(){ __wavesOff(); })()`);
  await step('drive',   `(function(){ __drive(240); return 1; })()`);
  await step('editor',  `(function(){ if(!editorOpen) toggleEditor(); return 1; })()`);
  await step('ctrl+s',  `(function(){ dispatchEvent(new KeyboardEvent('keydown',{code:'KeyS',ctrlKey:true,bubbles:true,cancelable:true})); return 1; })()`);
  await step('share',   `(async function(){ try{ await encodeLevel(serializeLevel()); }catch(e){ return 'enc:'+e.message; } return 1; })()`);
  await step('deploy',  `(function(){ toggleEditor(); return 1; })()`);
  await step('drive2',  `(function(){ __drive(240); return 1; })()`);
  await P(`(function(){ __release(); return 1; })()`);

  console.log('--- console census ---');
  for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), ' ', k);
}, { headless: true });
