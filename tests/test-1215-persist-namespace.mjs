// build 1215: persistent saves are namespaced per game — two games stop clobbering each other.
//
// The feature-surface critic's finding, verified in code: _persistStore wrote campaignVars into ONE global
// key ('breach_persist_v1'), so two published games that both persist a `coins` variable read and clobber
// each other's progress — a trust-destroying bug for anyone who plays more than one creator's game. The key
// is now namespaced by the published /game/ slug (build 972) or the slugified homepage title; a level with
// neither keeps the BARE key, so every existing single-game save loads unchanged (the migration).
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the namespace + key, executed
const api = new Function(
  "const PERSIST_KEY='breach_persist_v1';\n let homepageCfg;\n" +
  extractFunction('_persistSlugify') + '\n' +
  extractFunction('_persistNSFrom') + '\n' +
  extractFunction('_persistNS') + '\n' +
  extractFunction('_persistKey') + '\n' +
  'return { slugify:_persistSlugify, nsFrom:_persistNSFrom, key:_persistKey, setHp:(h)=>{ homepageCfg=h; }, ns:_persistNS };')();

{
  eq(api.nsFrom({ slug: 'my-cool-game' }), 'my-cool-game', 'a published slug is the namespace');
  eq(api.nsFrom({ title: 'My Cool Game!' }), 'my-cool-game', 'no slug -> the title, slugified');
  eq(api.nsFrom({ slug: 'a-slug', title: 'A Title' }), 'a-slug', 'the slug wins over the title when both exist');
  eq(api.nsFrom(null), '', 'no homepage -> the empty (legacy) namespace');
  eq(api.nsFrom({}), '', 'a homepage with neither slug nor title -> empty');
}
{ // the crux: two different games get two different keys; the same game is stable
  const a = api.key(api.nsFrom({ slug: 'game-a' }));
  const b = api.key(api.nsFrom({ slug: 'game-b' }));
  assert(a !== b, 'two games write to DIFFERENT keys — no cross-game clobbering');
  eq(api.key(api.nsFrom({ slug: 'game-a' })), a, 'the same game is a stable key across sessions');
}
{ // the migration: an untitled/unpublished level keeps the bare legacy key
  eq(api.key(''), 'breach_persist_v1', 'a level with no identity uses the BARE key — existing single-game saves load unchanged');
  eq(api.key('game-a'), 'breach_persist_v1:game-a', 'a namespaced key is the bare key plus the slug');
}
{ // the live path (store/commit/clear) reads homepageCfg, which is correct by then
  api.setHp({ slug: 'live-game' });
  eq(api.key(), 'breach_persist_v1:live-game', '_persistKey() with no arg reads the live homepageCfg');
  api.setHp(null);
  eq(api.key(), 'breach_persist_v1', '...and falls back to the bare key when no homepage is set');
}
{ // slugify hardening
  eq(api.slugify('  Spaces & Symbols!!  '), 'spaces-symbols', 'slugify trims, lowercases, and collapses non-alnum');
  assert(api.slugify('x'.repeat(200)).length <= 48, 'slugify caps length so a hostile title cannot make a giant key');
}

// ---------------------------------------------------------------- the wiring
{
  assert(/localStorage\.getItem\(_persistKey\(ns\)\)/.test(extractFunction('_persistLoad')),
    'load reads the namespaced key (ns passed explicitly by the loaders — homepageCfg is not set yet at restoreLevel time)');
  assert(/localStorage\.setItem\(_persistKey\(\), JSON\.stringify\(campaignVars\)\)/.test(extractFunction('_persistStore')),
    'store writes the namespaced key (live homepageCfg, correct at commit time)');
  assert(/localStorage\.removeItem\(_persistKey\(\)\)/.test(extractFunction('clearPersistent')),
    'clear removes only THIS game\'s save, not every game\'s');
  eq((src.match(/_persistLoad\(_persistNSFrom\(level\.homepage\)\)/g) || []).length, 2,
    'both loaders derive the namespace from the level being loaded');
}

done('build 1215: persistent saves namespaced per game — nsFrom/key executed proving slug>title>bare precedence, two games land on different keys while the same game is stable, the bare key preserved as the legacy namespace so existing saves migrate for free, slugify hardened against length, and both loaders pass the level-derived namespace while store/clear read the live homepageCfg');
