// Does a SAVED LEVEL containing every primitive type boot?
//
// `loadHostedProps()` is called bare at module level and builds the saved level's props during boot —
// before most of the file has evaluated. So any primitive builder that reads a binding declared BELOW the
// builder table throws a temporal-dead-zone error partway through the load, stranding every later prop.
//
// This has shipped twice:
//   1331  an ambient emitter read FX_PRESETS, declared ~3,400 lines below loadHostedProps. A saved level
//         with one dust emitter in it did not boot.
//   1411  a world sign read NET through _hwVarKey. Same shape. The whole suite passed at 1149/1149 while
//         the game did not start.
//
// Both were found by a user, after shipping. Build 1331 wrote the rule down — "anything a
// PRIMITIVE_BUILDERS entry reads must be declared above that table" — and `test-1331` pins the ordering
// for the ONE constant it knew about. Nothing checks the rule for the table as a whole.
//
// This does, the only way that can be conclusive: seed a real saved level containing one of EVERY
// primitive, boot the real game, and see whether they are all there.
//
// The CONTROL is a boot with an empty saved level. If that also fails, the rig is broken and nothing below
// it means anything.
import { withGame } from './driver.mjs';

const out = [];
const P = (ok, what, detail) => { out.push({ ok, what, detail }); };

// Every key in PRIMITIVE_BUILDERS, plus the sign (1411) — read from the source so a primitive added later
// is covered without editing this list. A hand-kept copy is the defect this repo records most.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../breach.html', import.meta.url), 'utf8');
// Bound the slice to the TABLE, not to some function far below it. The first draft ran to
// `function spawnProp` and swept up 43 identifiers from unrelated objects (`crouch`, `sketchfab`,
// `tracer`), which is the character-budget trap wearing a different hat: a slice is only as good as both
// of its ends.
const _tb = src.indexOf('const PRIMITIVE_BUILDERS = {');
const tbl = src.slice(_tb, src.indexOf('};', _tb));   // the table ends ` sign:buildSignProp };` on ONE line
// comments stripped: the table carries `/* build 1250: emitters are props */`, and 1250 is not a primitive
const KINDS = [...new Set((tbl.replace(/\/\*[\s\S]*?\*\//g, '').match(/([a-z_0-9]+)\s*:/g) || [])
  .map(s => s.replace(/\s*:$/, '').trim())
  .filter(k => k && k !== 'PRIMITIVE_BUILDERS'))];
if (KINDS.length < 20 || KINDS.length > 60 || !KINDS.includes('box') || !KINDS.includes('sign') ||
    KINDS.some(k => /^\d+$/.test(k)) || KINDS.includes('crouch')) {
  console.log('EXTRACTION LOOKS WRONG (' + KINDS.length + '): ' + KINDS.join(' '));
  process.exit(1);
}

console.log('  primitives found in the table: ' + KINDS.length + '\n  ' + KINDS.join(' ') + '\n');

const props = KINDS.map((k, i) => ({
  src: k,
  t: [40 + (i % 8) * 4, 0, 40 + Math.floor(i / 8) * 4, 0, 0, 0, 1.5, 1.5, 1.5],
  nid: 900000 + i,
  tg: 'boot_' + k
}));

async function boot(savedLevel, label) {
  let r = null;
  await withGame(async (probe) => {
    r = await probe(`(function(){
      const want = ${JSON.stringify(KINDS)};
      const got = {}, missing = [];
      for(const o of propModels){ if(o && o.userData && /^boot_/.test(o.userData.tag||'')) got[o.userData.tag.slice(5)] = 1; }
      for(const k of want) if(!got[k]) missing.push(k);
      return { total: propModels.length, built: Object.keys(got).length, missing: missing,
               gameReady: (typeof gameOn !== 'undefined') };
    })()`);
  }, { settleMs: 6000, savedLevel });
  console.log('  ' + label + ': ' + r.built + '/' + KINDS.length + ' primitives built, ' +
              r.total + ' props total' + (r.missing.length ? '   MISSING: ' + r.missing.join(' ') : ''));
  return r;
}

// THE CONTROL FIRST: a saved level with no props at all must boot cleanly, or the rig is what is broken.
// A saved level with NO props falls back to the engine's own default level (59 props), so an empty one is
// not a control — it never exercises the saved-level path at all. One plain box does.
const ctrl = await boot({ v: 1, props: [{ src: 'box', t: [40, 0, 40, 0, 0, 0, 1, 1, 1], nid: 900999, tg: 'boot_box' }] },
                        'CONTROL (one box)');
P(ctrl.gameReady && ctrl.built === 1 && ctrl.total === 1,
  'THE CONTROL: a saved level with one box boots and REPLACES the default level, so the rig really is ' +
  'exercising the saved-level path and a failure below is the primitive',
  ctrl.total + ' props, ' + ctrl.built + ' tagged');

const all = await boot({ v: 1, props }, 'every primitive ');
console.log('');
P(all.gameReady, 'the game boots at all with every primitive type in the saved level');
P(all.missing.length === 0,
  'and EVERY primitive in the builder table survives being in a saved level — a builder that reads a ' +
  'binding declared below the table throws mid-load and strands every prop after it, which has shipped ' +
  'twice (1331 fx_dust, 1411 sign) and was found by a user both times',
  all.missing.length ? 'missing: ' + all.missing.join(', ') : all.built + '/' + KINDS.length);

let bad = 0;
for (const o of out) { if (!o.ok) bad++; console.log((o.ok ? '  ok  ' : '  FAIL') + '  ' + o.what + (o.detail !== undefined ? '   [' + o.detail + ']' : '')); }
console.log('\n' + (out.length - bad) + '/' + out.length + (bad ? '  — ' + bad + ' FAILED' : '  all good'));
process.exit(bad ? 1 : 0);
