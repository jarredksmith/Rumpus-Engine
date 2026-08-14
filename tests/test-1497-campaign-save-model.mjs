// build 1497 — the campaign gets the library's save model
//
// Reported from play: the campaign is "fairly confusing on how to add levels, save the level you're working
// on, etc." — and the confusion was one asymmetry. Build 1262 taught saveLevel() to write through to the
// library entry being worked on (_libCurrent -> libCommit) and build 1359 made that attachment survive a
// reload. The campaign's campaignEditIdx is the SAME CONCEPT and got neither: Edit a campaign level, work,
// press Ctrl+S — the save went to the browser slot while the campaign kept the OLD copy, silently.
//
// The state machine is executed here (attach, write-through, remap, detach); the panel wiring is pinned.

import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

/* ================================================================= the tracker */
{
  const t = extractFunction('_campTrack', src);
  assert(/localStorage\.setItem\(CAMP_CUR_KEY, String\(campaignEditIdx\)\)/.test(t),
    'the attachment persists, like build 1359 made the library\'s');
  assert(/localStorage\.removeItem\(CAMP_CUR_KEY\)/.test(t), '...and detaching removes the key');
  assert(/renderCampaignPanel/.test(t), 'every change repaints the panel, so the state is never stale on screen');
  /* ONE writer: nothing else may assign campaignEditIdx directly, or memory and storage disagree —
     1262's stated rule for _libTrack. The declaration's own initializer is the one exception. */
  /* Counting bare assignments found TWO REAL STRAYS on the first run: a foreign-campaign loader that
     left the persisted key behind (now routed through the tracker), and my own comment quoting the
     removed code — the prose trap, fifth sighting. */
  const bare = (src.match(/campaignEditIdx\s*=\s*[^=]/g) || []).filter(m => !/[=!<>]=/.test(m));
  eq(bare.length, 2, 'exactly two assignment sites: the tracker and the declaration initializer');
}
{
  /* the persisted load VALIDATES: a stale index into a shorter campaign detaches rather than pointing a
     write-through at whatever level now sits there */
  const i = src.indexOf('let campaignEditIdx = (function(){');
  assert(i > 0, 'the initializer reads the persisted key');
  const blk = src.slice(i, i + 900);
  assert(/i<campaign\.levels\.length/.test(blk), 'validated against the campaign that actually exists');
  assert(/_foreignLevel/.test(blk),
    'and a foreign level marked during boot outranks a stale attachment — the level being loaded is not ' +
    'the campaign level the key remembers');
  assert(/\}catch\(e\)\{/.test(blk), 'behind a catch (typeof does not guard a TDZ — 1127/1331)');
}

/* ================================================================= the write-through, executed */
const rig = (function(){
  const body = [
    'let campaignEditIdx = attach;',
    'const CAMP_CUR_KEY = "k";',
    extractFunction('saveLevel', src),
    'return { save: saveLevel, idx: () => campaignEditIdx };',
  ].join('\n');
  return (opts) => {
    const st = { store: {}, committed: 0, campaign: opts.campaign };
    const fn = new Function('attach', 'serializeLevel', '_levelDBPut', '_libCurrent', 'libCommit',
                            'campaign', 'saveCampaign', 'SAVE_KEY', 'localStorage', body);
    const api = fn(opts.attach, () => opts.level, null, opts.lib || null, () => { st.committed++; },
                   st.campaign, () => { st.saved = true; }, 'sk',
                   { setItem: (k, v) => { st.store[k] = v; }, getItem: (k) => st.store[k] });
    return { ...api, st };
  };
})();

{
  /* THE REPORT: attached, plain Save updates the campaign copy — keeping the entry's NAME, because the
     campaign owns the name and the working level does not carry one */
  const r = rig({ attach: 0, level: { props: [{ t: [77] }] },
                  campaign: { levels: [{ name: 'Intro', props: [] }] } });
  assert(r.save(), 'save succeeds');
  eq(r.st.campaign.levels[0].props[0].t[0], 77, 'the campaign copy is the level just saved');
  eq(r.st.campaign.levels[0].name, 'Intro', '...still named Intro');
  assert(r.st.saved, 'and the campaign store was written');
}
{
  /* detached: the campaign is untouched — Save is just the browser save again */
  const r = rig({ attach: -1, level: { props: [{ t: [55] }] },
                  campaign: { levels: [{ name: 'Intro', props: [] }] } });
  r.save();
  eq(r.st.campaign.levels[0].props.length, 0, 'a detached save leaves the campaign alone');
}
{
  /* a stale index past the end writes NOTHING rather than throwing or growing the array */
  const r = rig({ attach: 5, level: { props: [] }, campaign: { levels: [{ name: 'A', props: [] }] } });
  assert(r.save(), 'save still succeeds');
  eq(r.st.campaign.levels.length, 1, 'and the campaign did not grow a phantom level');
}
{
  /* the library's own write-through is untouched beside it — the two ride the same serialize */
  const r = rig({ attach: 0, lib: 'lib1', level: { props: [] },
                  campaign: { levels: [{ name: 'A', props: [] }] } });
  r.save();
  eq(r.st.committed, 1, 'libCommit still fires (build 1262)');
}
{
  const sl = extractFunction('saveLevel', src);
  assert(/JSON\.parse\(str\)/.test(sl),
    'the already-serialized string is reused — one serialization, two destinations');
  assert(sl.indexOf('libCommit') < sl.indexOf('campaignEditIdx>=0'),
    'beside the library line it mirrors, so the next reader sees them as one rule');
}

/* ================================================================= the panel semantics */
{
  const panel = extractFunction('renderCampaignPanel', src);
  /* ADD ATTACHES — the old `campaignEditIdx=-1` meant the copy started going stale on the next edit */
  assert(/campaign\.levels\.push\(lv\); saveCampaign\(\); _campTrack\(campaign\.levels\.length-1\)/.test(panel),
    'Add current level attaches to the level just added');
  assert(/you are editing it: Save keeps it current/.test(panel), '...and says so');
  /* reorder REMAPS — with write-through, a silent detach means saves silently stop flowing */
  assert(/const _remap=\(from,to\)=>/.test(panel), 'reorder remaps the attachment');
  assert(!/campaign\.levels\[i\]=t; campaignEditIdx=-1/.test(panel), '...instead of dropping it');
  /* delete: the attached one detaches, one above shifts down */
  assert(/campaignEditIdx===i \? -1 : \(campaignEditIdx>i \? campaignEditIdx-1 : campaignEditIdx\)/.test(panel),
    'delete detaches or shifts, never leaves the index pointing at the wrong level');
  /* the state is visible: a banner while attached */
  assert(/Editing campaign level/.test(panel), 'the attached state announces itself in the panel');
  assert(/Save \(Ctrl\+S\) keeps the campaign copy current/.test(panel), '...and explains what Save now does');
}
{
  /* the Save note names BOTH destinations — a save whose second destination is invisible is how the
     two-target confusion started */
  assert(/updated too ✓/.test(src), 'the save note names the campaign level it also updated');
}

/* ================================================================= the detach sites */
{
  const mf = extractFunction('markForeignLevel', src);
  assert(/_campTrack\(-1\)/.test(mf),
    'a foreign load detaches — beside _libStopTracking, the library\'s own detach, ONE site covering ' +
    'share links, the gallery, file import and help examples (build 1254\'s five entry points)');
  const nl = extractFunction('_edNewLevel', src);
  assert(/removeItem\(CAMP_CUR_KEY\)/.test(nl),
    'New level clears the PERSISTED key — the page reloads, so the key is the half that matters');
}

done('build 1497 — the campaign gets the library\'s save model: Add and Edit attach, plain Save writes ' +
     'through to the attached campaign level and says so, reorder remaps, and foreign loads detach');
