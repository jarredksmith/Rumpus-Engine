import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1280: the audit's code-quality CRITICAL. A 1,326-character block was BYTE-IDENTICAL in
// loadHostedProps, loadLevelFromNet and restoreLevel — the three paths by which a prop reaches the scene
// (first load, a multiplayer joiner, and every level load or undo).
//
// The critic proved the cost by MUTATION, not by argument: delete one statement from ONE copy and the
// suite stayed fully green while every prop a joiner received silently lost its tag — taking the trigger
// zones, all six prop verbs, the push verb, logic-graph place resolution and joint targets with it.
// Nothing tested that the three agreed, because there was nothing to test: agreement was a fact about the
// TEXT, and text drifts. CLAUDE.md had twice fixed a symptom of this (1162, 1252) and called "four loader
// sites" a fact of nature.

const entry = extractFunction('_applyPropEntry');

{ // there is exactly one copy, and all three loaders call it
  eq((src.match(/_applyPropEntry\(obj, p\);/g) || []).length, 3,
    'the three loaders each call the one function');
  for (const fn of ['loadHostedProps', 'loadLevelFromNet', 'restoreLevel'])
    assert(/_applyPropEntry\(obj, p\)/.test(extractFunction(fn)),
      fn + ' applies the entry through the shared function');
  // and nobody kept a private copy. TWO remain in the file and that is the correct number: the shared
  // function, and _pfSpawnEntry's deliberate near-copy (see the last block). What matters is that neither
  // of the loaders has one — three copies is what drifted.
  const _pf = extractFunction('_pfSpawnEntry');
  for (const [re, what] of [[/if\(p\.tg\) obj\.userData\.tag=p\.tg;/g, 'the tag assignment'],
                            [/obj\.userData\.signals=/g, 'the signal mapping']]) {
    eq((src.match(re) || []).length, 2, what + ' exists twice: the shared function and the prefab path');
    assert(re.test(entry) || new RegExp(re.source).test(entry), what + ' is in the shared function');
    assert(new RegExp(re.source).test(_pf), '...and the other copy is _pfSpawnEntry\u2019s, on purpose');
  }
  for (const fn of ['loadHostedProps', 'loadLevelFromNet', 'restoreLevel'])
    assert(!/obj\.userData\.tag=p\.tg/.test(extractFunction(fn)),
      fn + ' keeps NO private copy — this is the count whose drift caused the bug');
}

// --- THE MUTATION, REPRODUCED -----------------------------------------------------------------------
// The critic's exact experiment: remove the tag statement and confirm that a prop no longer carries a tag.
// Before this build that mutation had to be made in three places to be caught, so making it in one was
// invisible. Now one edit changes every path — which is the whole point, and this proves it by running it.
{
  const mk = (body) => new Function('applyPropDynState', 'xaApply', 'jointApply', 'vehicleApply',
    'trackApply', '_bumpGroupSeq', '_fxCfgSan', '_fxReset',
    body + '; return _applyPropEntry;')(
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, (v) => v, () => {});

  const P = {
    tg: 'vaultDoor', gid: 'g1', itr: 1, nm: 'Door', fld: 'Doors', eh: 1, elk: 1,
    npc: 'Guard', snd: 3, att: 'by Someone', lk: 'red', lkc: 1,
    pf: { id: 'pf1', inst: 'i2', slot: 4 },
    dlg: ['hello', 'world'],
    sg: [{ w: 'use', d: 'open', t: 'gate', c: 'clip', n: 'cs', f: 'from', ci: 1, tx: 'txt', ni: 'key', nc: 1, cn: 1, so: 'snd' }],
  };
  const run = (fn) => { const o = { userData: {}, position: { y: 0 } }; fn(o, P); return o.userData; };

  const real = run(mk(entry));
  eq(real.tag, 'vaultDoor', 'the real function carries the tag');
  eq(real.groupId, 'g1', '...the group');
  eq(real.interact, true, '...interactable');
  eq(real.name, 'Door', '...the name');
  eq(real.folder, 'Doors', '...the folder');
  eq(real.edHide, true, '...hide');
  eq(real.edLock, true, '...lock');
  eq(real.npcName, 'Guard', '...the NPC name');
  eq(real.lockId, 'red', '...the lock');
  eq(real.lockConsume, true, '...and whether the key is consumed');
  eq(real.sigNeed, 3, '...the signal threshold');
  eq(real.attribution, 'by Someone', '...the attribution (CC-BY depends on this surviving)');
  eq(real.dialogue.join('|'), 'hello|world', '...the dialogue');
  eq(real.pf.id, 'pf1', '...the prefab link');
  eq(real.pf.slot, 4);
  eq(real.signals.length, 1, '...and the signals');
  const sg = real.signals[0];
  eq(sg.when, 'use'); eq(sg.do, 'open'); eq(sg.target, 'gate');
  eq(sg.clip, 'clip'); eq(sg.cs, 'cs'); eq(sg.from, 'from');
  eq(sg.contain, true); eq(sg.text, 'txt'); eq(sg.needItem, 'key');
  eq(sg.needConsume, true); eq(sg.consume, true); eq(sg.sound, 'snd');

  // now delete the one statement, exactly as the critic did
  const mutated = entry.replace('if(p.tg) obj.userData.tag=p.tg;', '');
  assert(mutated !== entry, 'the mutation applies');
  const broken = run(mk(mutated));
  eq(broken.tag, undefined, 'THE MUTATION: removing that one statement really does strip the tag');
  eq(broken.groupId, 'g1', '...and nothing else, so the experiment is isolated');
  // the point: ONE deletion is now enough to break every path, so any test of any path catches it
  for (const fn of ['loadHostedProps', 'loadLevelFromNet', 'restoreLevel'])
    assert(!/obj\.userData\.tag=p\.tg/.test(extractFunction(fn)),
      'because no loader has its own statement any more — a silent divergence between the three is not expressible (' + fn + ')');
}

// --- what is deliberately NOT merged ------------------------------------------------------------------
{
  // _pfSpawnEntry keeps its own near-copy on purpose: prefabs and paste STRIP identity (a fresh gid, no
  // nid) and that difference is the feature. Two functions that differ on purpose beat three that are
  // supposed to match — but the reason has to be written down, or the next reader "fixes" it.
  const pf = extractFunction('_pfSpawnEntry');
  assert(/obj\.userData\.groupId=gid/.test(pf),
    '_pfSpawnEntry assigns a FRESH group id, which is why it cannot share the loader path');
  assert(!/_applyPropEntry/.test(pf), '...so it is deliberately not routed through the shared function');
  assert(/_pfSpawnEntry keeps its own near-copy DELIBERATELY/.test(src),
    'and the reason is recorded beside the shared function, so it is not "tidied up" later');
}

done('build 1280: the prop entry is applied in ONE place — the 1,326-character block that was byte-identical across loadHostedProps, loadLevelFromNet and restoreLevel is now one function, with every field it carries executed, the audit critic\'s exact tag-stripping mutation reproduced and proven to bite, and _pfSpawnEntry\'s deliberate divergence pinned so nobody merges it by mistake');
