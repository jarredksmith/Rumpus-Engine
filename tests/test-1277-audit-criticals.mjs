import { gameSource, html, extractFunction, extractConst, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1277: three CRITICALs from the build-1276 audit, each verified in source before being acted on.
//
// 1. Level-authored text reached the DOM as markup. _creditEsc escaped `& < >` but NOT `"`, and
//    _creditLinkify drops its match inside href="$1" — so one quote in an attribution closed the
//    attribute and opened an event handler, with the publish key, the API keys and the endpoint
//    overrides (which make a backdoor persistent) all readable from localStorage.
// 2. Build 1166's SAFE credits renderer was dead code, overwritten six lines later by the older
//    vulnerable handler — and invisible because TWO buttons shared id="pauseCredits".
// 3. Six of the 27 logic verbs had never worked.

// ---------------------------------------------------------------- 1. the escape
{
  const esc = new Function(extractFunction('_creditEsc') + '; return _creditEsc;')();
  eq(esc('<script>'), '&lt;script&gt;', 'angle brackets, as before');
  eq(esc('a & b'), 'a &amp; b', 'ampersand, as before');
  eq(esc('say "hi"'), 'say &quot;hi&quot;', 'THE FIX: double quotes are escaped');
  eq(esc("it's"), 'it&#39;s', '...and single quotes');
  eq(esc('&<>"\''), '&amp;&lt;&gt;&quot;&#39;', 'all five together, ampersand first so it is not double-escaped');
  eq(esc(null), 'null', 'a non-string does not throw');
  eq(esc(undefined), 'undefined');
}
{ // the actual exploit string, through the actual function pair
  const link = new Function(extractFunction('_creditEsc') + '\n' + extractFunction('_creditLinkify') + '; return _creditLinkify;')();
  const attack = 'https://x.com" onmouseover="alert(document.cookie)';
  const out = link(attack);
  assert(!/onmouseover=/.test(out) || !/href="https:\/\/x\.com"\s+onmouseover/.test(out),
    'the payload cannot terminate the href attribute');
  assert(!out.includes('" onmouseover="'), 'THE EXPLOIT: no raw quote survives to close the attribute');
  assert(out.includes('&quot;'), '...it is escaped instead');
  // an ordinary attribution still linkifies, including a query string
  const ok = link('Crate by Someone — https://poly.pizza/m/abc?x=1&y=2');
  assert(/<a href="https:\/\/poly\.pizza\/m\/abc\?x=1&amp;y=2"/.test(ok), 'a real url with a query string still becomes a link');
  assert(/rel="noopener"/.test(ok), '...with noopener intact');
  eq(link('no links here').includes('<a '), false, 'plain text is left alone');
}
{ // markup in ordinary level text is still inert wherever _creditEsc guards it
  const esc = new Function(extractFunction('_creditEsc') + '; return _creditEsc;')();
  eq(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;', 'an image payload is text');
}

// ---------------------------------------------------------------- 2. the dead safe renderer
{
  // markup lives in `html`, not in gameSource()'s script block
  eq((html.match(/<button id="pauseCredits"/g) || []).length, 1,
    'exactly ONE element carries id="pauseCredits" — two did, so getElementById never reached the second');
  assert(/<button id="pauseCredits2"/.test(html), '...and the other has its own id');
  assert(!/pc\.onclick=openCredits/.test(src),
    'the vulnerable handler no longer overwrites build 1166’s safe one');
  assert(/for\(const _cid of \['pauseCredits','pauseCredits2'\]\)/.test(src),
    'and BOTH buttons are wired, so neither is inert');
  const bind = extractFunction('bindPauseMenu');
  eq((bind.match(/showCreditsModal/g) || []).length >= 1, true, 'the safe renderer is what they call');
  eq((bind.match(/onclick=openCredits/g) || []).length, 0, 'there is only one credits handler now');
}

// ---------------------------------------------------------------- 3. the six dead verbs
{
  // THE TEST THAT WOULD HAVE CAUGHT IT: walk the node -> dispatcher -> handler PATH, rather than
  // asserting the handler's source and the dropdown's source and assuming something joins them.
  const reached = [];
  const run = (verb, extra = {}) => {
    reached.length = 0;
    const body = [
      extractFunction('_applySignalAction'),
      'return _applySignalAction;',
    ].join('\n');
    const fn = new Function('_applyWorldAction', 'NET', 'propModels', 'setGoal', 'setCheckpoint',
      'playSample', 'loadSound', 'logicEvent', 'xaToggle', 'broadcastXAnim', 'playPropAnimationOnce',
      'broadcastAnim', 'broadcastUnlock', 'winLevel', 'playCutscene',
      body)(
      (s) => reached.push(s.do), { mode: 'host' }, [], () => {}, () => {},
      () => true, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {});
    try { fn(Object.assign({ do: verb, target: 'x' }, extra), null); } catch (e) { /* unrelated stubs */ }
    return reached.includes(verb);
  };
  for (const v of ['showprop', 'hideprop', 'moveprop', 'delprop', 'pushprop', 'spawnprop'])
    assert(run(v), 'THE FIX: a "' + v + '" node actually reaches _applyWorldAction');
  // the verbs that always worked still do — the change must not have moved anything else
  for (const v of ['spawn', 'pickup', 'damage', 'heal', 'kill', 'teleport', 'give', 'take', 'stat', 'music', 'command'])
    assert(run(v), 'the pre-existing world verb "' + v + '" still routes');
  // ...and a tag verb still does NOT go to the world handler; it belongs to the tag loop
  for (const v of ['toggle', 'open', 'close', 'anim', 'unlock'])
    eq(run(v), false, 'the tag verb "' + v + '" is still handled by the tag path, not the world handler');
}
{ // spawnprop was dead TWICE: the Do node dropped the prefab name on the way through
  const pulse = extractFunction('_lgPulse');
  const doCase = pulse.slice(pulse.indexOf("case 'do': {"), pulse.indexOf("case 'toast':"));
  assert(/prefab:p\.prefab\|\|''/.test(doCase),
    'the Do node forwards the prefab name — without it spawnprop had nothing to spawn even once routed');
  // every verb the dropdown offers must be forwarded with the fields its own handler reads
  assert(/target:_tgt/.test(doCase) && /at:String\(p\.at==null\?'':p\.at\)\.trim\(\)/.test(doCase),
    '...alongside the tag and the place the prop verbs use');
}
{ // the palette and the dispatcher must agree — this is the parity that was missing
  const defs = new Function('return ' + extractConst('LG_DEFS', src) + ';')();
  const offered = defs.do.params.find(p => p.k === 'verb').sel.map(o => o[0]);
  const dispatch = extractFunction('_applySignalAction');
  for (const v of offered)
    assert(new RegExp("'" + v + "'").test(dispatch) || /win|cutscene/.test(v),
      'every verb the Do node offers is named somewhere in the dispatcher: ' + v);
  eq(offered.length, 28, 'all 28 verbs accounted for (build 1391 added resetprop)');
}

done('build 1277: the audit’s three client-side CRITICALs — level text can no longer reach the DOM as markup (the quote that closed href="$1" is escaped, proven with the real payload), build 1166’s safe credits renderer is no longer dead code behind a duplicate element id, and the six prop verbs that three builds shipped unreachable now actually reach their handler — tested by WALKING the node-to-handler path rather than pinning both ends and assuming');
