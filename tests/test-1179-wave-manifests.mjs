// build 1179: authored wave manifests — designed difficulty curves instead of a metronome.
//
// The feature audit: random-mode composition was a hardcoded formula (n = 3 + wave*2, type mix by wave
// thresholds); "wave 3 = 2 brutes + a shielded from the north gate" was unauthorable. A manifest is a
// mini-language (the dialogue system's precedent), one line per wave: `3x grunt, 2x runner @gate`, `-` for
// a breather, blank text = pure formula. @tag clusters the squad at a tagged prop; waves past the manifest
// fall back to the formula so endless still escalates; manifest waves never get the automatic milestone boss.
import { gameSource, extractFunction, assert, eq, near, done } from './harness.mjs';
const src = gameSource();

const parse = new Function(extractFunction('parseWaveManifest') + '\nreturn parseWaveManifest;')();

// ---------------------------------------------------------------- the parser, executed
{
  const w = parse('3x grunt, 2x runner @gate\n4x gunner, boss\n-\n2xbrute');
  eq(w.length, 4, 'one line per wave, including the breather');
  eq(w[0].list.length, 2, 'terms split on commas');
  eq(w[0].list[0].type, 'grunt'); eq(w[0].list[0].n, 3, 'N x TYPE parses');
  eq(w[0].list[1].at, 'gate', '@tag rides the term');
  eq(w[1].list[1].type, 'boss'); eq(w[1].list[1].n, 1, 'a bare type means one');
  eq(w[2].list.length, 0, 'a dash is an intentionally EMPTY wave — a breather, not a parse error');
  eq(w[3].list[0].n, 2, 'NxTYPE without spaces parses too');
}
{
  const w = parse('99x grunt\n30x grunt, 30x runner\n5x boss');
  eq(w[0].list[0].n, 20, 'a term caps at 20');
  eq(w[1].list[0].n + w[1].list[1].n, 40, 'a wave caps at 40 total');
  eq(w[2].list[0].n, 2, 'bosses cap at 2 — five bosses is a typo, not a design');
  eq(parse('').length, 0, 'empty text = no manifest');
  eq(parse('garbage !!! ???')[0].list.length, 0, 'an unparseable line yields an empty wave rather than a throw');
  assert(parse(Array(99).fill('1x grunt').join('\n')).length <= 50, 'the manifest itself caps at 50 waves');
}

// ---------------------------------------------------------------- the descriptors, executed
{
  const mk = new Function('ENEMY_TYPES', 'propModels',
    extractFunction('manifestWaveDescriptors') + '\nreturn manifestWaveDescriptors;');
  const rng = (() => { let i = 0; const seq = [0.1, 0.5, 0.9, 0.3, 0.7, 0.2, 0.6, 0.8, 0.4, 0.55]; return () => seq[i++ % seq.length]; })();
  const types = { grunt: 1, runner: 1, brute: 1, boss: 1 };
  const gate = { position: { x: 30, z: -10 }, userData: { tag: 'gate' } };

  { // @tag clusters the squad at the tagged prop
    const d = mk(types, [null, gate])({ list: [{ type: 'runner', n: 3, at: 'gate' }] }, 70, rng);
    eq(d.length, 3, 'three descriptors for 3x');
    for (const q of d) {
      assert(Math.hypot(q.x - 30, q.z - (-10)) <= 4.001, 'each spawns within the squad ring of the tag');
      eq(q.type, 'runner', '...typed as authored');
    }
  }
  { // no tag: arena-edge scatter, same shape as the formula
    const d = mk(types, [])({ list: [{ type: 'grunt', n: 2, at: '' }] }, 70, rng);
    for (const q of d) assert(Math.hypot(q.x, q.z) > 70 * 0.5, 'untagged spawns land out toward the arena edge');
  }
  { // an unknown type becomes a grunt; a missing tag falls back to the edge
    const d = mk(types, [])({ list: [{ type: 'dragon', n: 1, at: 'nowhere' }] }, 70, rng);
    eq(d[0].type, 'grunt', 'an unknown type demotes to grunt rather than spawning nothing');
    assert(Math.hypot(d[0].x, d[0].z) > 20, 'a tag no prop carries scatters at the edge instead of (0,0)');
  }
}

// ---------------------------------------------------------------- wiring
{
  const sw = extractFunction('startWave');
  assert(/const _mf = \(gameCfg\.waves && gameCfg\.waves\[wave-1\]\);/.test(sw), 'startWave consults the manifest for THIS wave');
  assert(/if\(_mf\)\{ for\(const d of manifestWaveDescriptors\(_mf, ARENA, Math\.random\)\) spawnQueue\.push\(d\); \}/.test(sw),
    '...an authored wave wins over the formula');
  assert(/else for\(const d of randomWaveDescriptors\(wave, ARENA, Math\.random\)\) spawnQueue\.push\(d\);/.test(sw),
    '...and waves past the manifest fall back, so endless keeps escalating');
  // the automatic milestone boss lives in randomWaveDescriptors, so a manifest wave never gets it — by structure
  assert(/gameCfg\.bossWave>0 && waveNum>0/.test(extractFunction('randomWaveDescriptors')),
    'the milestone boss is the FORMULA\'s feature; a manifest wave\'s composition belongs to its author');
}
{
  assert(/wavesText: \(gameCfg\.wavesText\|\|''\)\.slice\(0,2000\) \|\| undefined/.test(src), 'the manifest SOURCE serialises (round-trips the editor)');
  eq((src.match(/gameCfg\.waves = gameCfg\.wavesText \? parseWaveManifest\(gameCfg\.wavesText\) : null;/g) || []).length, 2,
    'both loaders (restore + net) re-parse it');
  assert(/one line per wave/.test(src), 'the editor explains the grammar where the textarea lives');
}

done('build 1179: wave manifests — a mini-language (3x grunt, 2x runner @gate / - for breathers) parsed once, capped sanely (20/term, 40/wave, 2 bosses, 50 waves), squads clustering at tagged props or scattering at the edge, formula fallback past the manifest, source round-tripped through the level file');
