import { gameSource, extractFunction, assert, done } from './harness.mjs';
const src = gameSource();
// build 399: animated-prop control split into two axes — WHEN it plays (auto / interact / signal) and HOW it
// plays (loop / pingpong / once). Previously imported props only had loop-vs-trigger, with no "signals only"
// and no ping-pong / play-once choice.

// loop-mode mapping helper
const plm = extractFunction('_propLoopMode');
assert(/play==='pingpong' \? THREE\.LoopPingPong : \(play==='once' \? THREE\.LoopOnce : THREE\.LoopRepeat\)/.test(plm), 'maps loop/pingpong/once to THREE loop modes');

// playModelAnimations honors both axes + back-compat from the legacy single mode
const pma = extractFunction('playModelAnimations');
assert(/root\.userData\.animTrigger = \(mode==='trigger'\) \? 'interact' : 'auto';/.test(pma), 'legacy "trigger" maps to interact, else auto');
assert(/root\.userData\.animPlay = \(mode==='trigger'\) \? 'once' : 'loop';/.test(pma), 'legacy "trigger" maps to once, else loop');
assert(/const lm = _propLoopMode\(play\);/.test(pma) && /action\.loop = lm; action\.clampWhenFinished = \(play==='once'\);/.test(pma), 'each action gets the chosen loop style');
assert(/if\(trig==='auto' && usethis\)\{ action\.play\(\); \}/.test(pma), 'only auto props start on spawn; interact/signal wait');

// separate setters for the two axes
const st = extractFunction('setPropAnimTrigger');
assert(/trig = \(trig==='interact'\|\|trig==='signal'\) \? trig : 'auto';/.test(st), 'trigger setter validates auto/interact/signal');
assert(/if\(trig==='auto'\)\{[\s\S]*?a\.play\(\)[\s\S]*?\} else \{[\s\S]*?a\.stop\(\); \}/.test(st), 'auto starts playing; interact/signal hold');
const sp = extractFunction('setPropAnimPlay');
assert(/play = \(play==='pingpong'\|\|play==='once'\) \? play : 'loop';/.test(sp), 'play setter validates loop/pingpong/once');
assert(/a\.loop = lm; a\.clampWhenFinished = \(play==='once'\);/.test(sp), 'changing style updates the live actions');

// signal-only props do NOT show the E prompt (only interact ones do)
// build 1451: `ud` is the same userData, read once per prop instead of five times, and the test is now
// positive (does it prompt) rather than a `continue` guard. Same rule.
assert(/\(ud\.animTrigger\|\|\(ud\.animMode==='trigger'\?'interact':'auto'\)\)==='interact'/.test(src),
  'E-prompt is limited to interact props (signal-only is excluded)');

// fired playback (E or signal) honors the prop's loop style
const ppa = extractFunction('playPropAnimationOnce');
assert(/const lm = _propLoopMode\(obj\.userData\.animPlay\|\|'once'\), once = \(obj\.userData\.animPlay==='once'\);/.test(ppa), 'fired playback uses the prop\'s loop style');
assert(/a\.loop = lm; a\.clampWhenFinished = once; a\.reset\(\); a\.play\(\);/.test(ppa), 'so an E/signal-fired loop or pingpong keeps animating');

// serialized + restored on both axes
assert(/if\(o\.userData\.animTrigger && o\.userData\.animTrigger!=='auto'\) e\.animTrig=o\.userData\.animTrigger;/.test(src), 'trigger axis saved');
assert(/if\(o\.userData\.animPlay && o\.userData\.animPlay!=='loop'\) e\.animPlay=o\.userData\.animPlay;/.test(src), 'play axis saved');
assert((src.match(/\{trig:\(p\.animTrig\|\|\(p\.anim==='trigger'\?'interact':'auto'\)\), play:\(p\.animPlay\|\|\(p\.anim==='trigger'\?'once':'loop'\)\)\}/g)||[]).length === 3, 'all three loaders restore both axes with legacy fallback');

// editor exposes both control rows
assert(/Animation \\u2014 when it plays:/.test(src) || /Animation \u2014 when it plays:/.test(src), 'editor: "when it plays" row');
assert(/Animation \\u2014 how it plays:/.test(src) || /Animation \u2014 how it plays:/.test(src), 'editor: "how it plays" row');
assert(/\['signal','Signals only'\]/.test(src), 'imported props now offer Signals only');
assert(/\['pingpong','\\u21c4 Ping-pong'\]/.test(src) || /\['pingpong','\u21c4 Ping-pong'\]/.test(src), 'and a Ping-pong play style');
done();
