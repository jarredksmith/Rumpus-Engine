// build 1176: Ctrl+C / Ctrl+V for props — the editor finally has a clipboard.
//
// The editor critic, verified: no clipboard existed at all; carrying a configured object between levels
// meant formalising it into a prefab first. Copy rides the same `_pfEntryOf` serializer duplicate (1162)
// and prefabs use — full config, identity stripped, pivot-relative so arrangements survive — into memory
// AND the system clipboard as tagged JSON (cross-level, cross-tab paste). Paste goes through the
// loader-mirroring `_pfSpawnEntry` apply block, groups multi-prop pastes, selects the result, and caps a
// hostile system-clipboard paste at 100 entries.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- copy, executed
{
  const build = (sel, models) => {
    const calls = { toasts: [], written: [] };
    const api = new Function('selProps', 'propModels', 'editorTargets', '_pfPivotOf', '_pfEntryOf', 'navigator', 'flashToast', '_propClipboard_ref',
      'let _propClipboard=null;\n' + extractFunction('copySelectedProps') +
      '\nreturn { copy: copySelectedProps, clip: () => _propClipboard };'
    )(sel, models || [{}], { props: { idx: 0 } },
      (list) => ({ x: 5, y: 0, z: 5 }),
      (o, pivot) => ({ src: o.userData.src, t: [o.px - pivot.x, 0, o.pz - pivot.z, 0,0,0,1,1,1], sg: o.userData.signals }),
      { clipboard: { writeText: (t) => calls.written.push(t) } },
      (m) => calls.toasts.push(m), null);
    return { ...api, calls };
  };
  const prop = (src2, px, pz, signals) => ({ px, pz, userData: { src: src2, signals } });

  { // full config travels; arrangement is pivot-relative
    const a = prop('box', 4, 5, [{ when: 'interacted', do: 'open' }]), b = prop('door.glb', 6, 5);
    const t = build([a, b]);
    eq(t.copy(), 2, 'two props copied');
    const clip = t.clip();
    eq(clip.props.length, 2, '...as two entries');
    assert(clip.props[0].sg && clip.props[0].sg.length === 1, 'signals ride the entry — the full config, not a bare mesh');
    eq(clip.props[0].t[0], -1, 'positions are PIVOT-relative, so the pair pastes as the same arrangement');
    eq(clip.props[1].t[0], 1, '...on both sides of the pivot');
    eq(t.calls.written.length, 1, 'and the system clipboard got a copy');
    const sys = JSON.parse(t.calls.written[0]);
    eq(sys.format, 'rumpusprops', '...tagged, so paste can recognise its own format');
  }
  { // nothing selected AND no primary prop: a toast, not a throw, and the browser keeps the key.
    // (With a primary but no multi-selection, copy correctly falls back to the primary — desired UX.)
    const t = build([], [null]);
    eq(t.copy(), 0, 'copying nothing returns 0 — the keybind then lets the browser have Ctrl+C');
    assert(/Nothing selected/.test(t.calls.toasts[0]), '...and says so');
  }
}

// ---------------------------------------------------------------- paste, executed
{
  const build = () => {
    const spawned = []; const snaps = [];
    const api = new Function('pushUndoSnapshot', 'editorDropPoint', '_newGroupId', '_pfSpawnEntry', 'selProps', 'propModels', 'editorTargets', 'flashToast',
      extractFunction('_pasteEntries') + '\nreturn _pasteEntries;'
    )(() => snaps.push(1), () => ({ x: 10, z: 20 }), () => 'g9',
      (p, at, mark, gid, cb) => { spawned.push({ p, at, gid }); cb({ id: spawned.length }); },
      [], [], { props: { idx: 0 } }, () => {});
    return { paste: api, spawned, snaps };
  };
  { // spawns at the drop point through the loader-mirroring apply block, grouped when plural
    const t = build();
    t.paste([{ src: 'box', t: [0,0,0,0,0,0,1,1,1] }, { src: 'door.glb', t: [2,0,0,0,0,0,1,1,1] }]);
    eq(t.spawned.length, 2, 'both entries spawn');
    eq(t.spawned[0].at.x, 10, '...at the editor drop point');
    eq(t.spawned[0].gid, 'g9', '...sharing ONE fresh group id, so the paste moves as a unit');
    eq(t.snaps.length, 1, 'one undo snapshot per paste — Ctrl+Z removes the whole paste');
  }
  { // a single prop is not needlessly grouped; a hostile paste is capped
    const t = build();
    t.paste([{ src: 'box', t: [0,0,0,0,0,0,1,1,1] }]);
    eq(t.spawned[0].gid, null, 'a single pasted prop carries no group');
    const t2 = build();
    t2.paste(Array.from({ length: 500 }, () => ({ src: 'box', t: [0,0,0,0,0,0,1,1,1] })));
    eq(t2.spawned.length, 100, 'a 500-entry clipboard (hostile or accidental) is capped at 100');
  }
}

// ---------------------------------------------------------------- the keys and the sources
{
  assert(/e\.code==='KeyC' && !e\.shiftKey && !e\.altKey/.test(src), 'Ctrl+C is bound in the editor');
  assert(/!\(window\.getSelection && String\(window\.getSelection\(\)\)\)/.test(src),
    '...but yields to a REAL text selection — stealing the browser copy mid-highlight would be hostile');
  assert(/copySelectedProps\(\)>0\) e\.preventDefault\(\);/.test(src),
    '...and only claims the key when something was actually copied');
  assert(/e\.code==='KeyV' && !e\.shiftKey && !e\.altKey/.test(src), 'Ctrl+V is bound');
  const pp = extractFunction('pasteProps');
  assert(/navigator\.clipboard\.readText\(\)\.then/.test(pp), 'paste prefers the SYSTEM clipboard (cross-level, cross-tab)');
  assert(/d\.format==='rumpusprops'/.test(pp), '...accepting only its own tagged format from that untrusted text');
  assert(/\.catch\(fromMem\)/.test(pp), '...and falls back to memory when the browser refuses readText');
}

done('build 1176: Ctrl+C serialises the selection through the prefab entry pair (full config, pivot-relative, to memory + tagged system clipboard) and Ctrl+V pastes through the loader-mirroring apply block — grouped, selected, one undo step, capped at 100, yielding to real text selections');
