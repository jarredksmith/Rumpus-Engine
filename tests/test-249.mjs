import { gameSource, assert, done } from './harness.mjs';
import { readFileSync } from 'fs';
const src = gameSource();
const page = readFileSync(new URL('../breach.html', import.meta.url), 'utf8');
// build 351: manual control-mode override (Auto / Touch / Desktop), persisted, live-applied.

assert(/let _ctrlPref = 'auto'; try\{ const v=localStorage\.getItem\('breach_controls'\)/.test(src), 'preference persisted under breach_controls');
const ap = src.slice(src.indexOf('function applyControlMode'), src.indexOf('function applyControlMode')+700);
assert(/if\(_ctrlPref==='touch'\) isTouch = true;\s*else if\(_ctrlPref==='desktop'\) isTouch = false;/.test(ap), 'forced modes override detection');
assert(/matchMedia\('\(pointer: coarse\)'\)\.matches\);[\s\S]{0,40}document\.body\.classList\.toggle\('touch', isTouch\)/.test(ap), 'auto re-detects; body class follows');
assert(/if\(!isTouch\)\{ const tu=document\.getElementById\('touchUI'\); if\(tu\) tu\.style\.display='none'; \}/.test(ap), 'switching to desktop hides the touch UI explicitly');

// every touch promotion respects a forced desktop choice
assert(/touchstart', \(\)=>\{ if\(_ctrlPref==='desktop'\) return; isTouch = true;/.test(src), 'first-touch promotion gated');
for(const tail of ['stickId=e\\.pointerId;','lookId=e\\.pointerId;','fid=e\\.pointerId;','aid=e\\.pointerId;'])
  assert(new RegExp("if\\(_ctrlPref!=='desktop'\\) isTouch=true;[\\s\\S]{0,220}?"+tail).test(src), 'promotion gated at '+tail);
assert(!/[^)] isTouch=true; (stickId|lookId|fid|aid)/.test(src), 'no ungated promotions remain');

// menu button cycles and applies live
assert(/<button id="ctrlBtn" class="secBtn ghost"><\/button>/.test(page), 'menu button beside the Field manual (icon set by JS, build 516)');
assert(/_ctrlPref = _ctrlPref==='auto' \? 'touch' : _ctrlPref==='touch' \? 'desktop' : 'auto';/.test(src), 'cycles auto -> touch -> desktop');
assert(/localStorage\.setItem\('breach_controls', _ctrlPref\)/.test(src) && /applyControlMode\(\); lbl\(\);/.test(src), 'choice saved + applied immediately');
done();
