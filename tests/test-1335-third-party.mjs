import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 1335 — platform audit 2.5, verbatim: a level can direct the browser to fetch arbitrary http(s)
// URLs through prop src, every weapon/enemy/player/chest/coin/turret/grenade/attachment model, per-
// primitive textures, audio zones, custom SFX, the HDRI sky, the lobby background, the homepage art and
// HUD widget images — with "no host allowlist, no confirmation prompt and no disclosure". Opening a shared
// level therefore hands the author the player's IP, invisibly.
//
// Measured live (tools/probe/third-party.mjs), the same run twice with only the setting changed:
//
//                      block OFF                                   block ON
//   policy live        false                                       true
//   game               gameOn, 59 props                            gameOn, 59 props
//   same-origin fetch  ok 200                                      ok 200      <- the positive control
//   off-origin img     failed                                      failed
//   CSP refusals       []                                          ["connect-src <- ...", "img-src <- ..."]
//
// THAT PAIR IS THE WHOLE VERIFICATION. This sandbox has no route to the open internet, so "the image
// failed" is worth nothing — a network failure and a refusal look identical. `securitypolicyviolation`
// fires only from CSP, and it fires in exactly one of the two runs. The same-origin row is the other half:
// a block that also broke the engine would look like a success from the refusal count alone.
//
// And a real finding from the same run: the SHIPPED stock level already contacts static.poly.pizza and
// jarredksmith.github.io. The first level anybody opens hands two third parties their IP.

// ---------------------------------------------------------------- the walk is a WALK, not a field list
{
  const f = extractFunction('levelRemoteHosts');
  assert(/for\(const k in v\)/.test(f) && /Array\.isArray\(v\)/.test(f), 'it recurses over the whole object');
  assert(/DELIBERATELY NOT ENUMERATED/.test(src),
    'and the reason is recorded: a hand-kept field list is the defect this file keeps finding');
  assert(/TP_MAX_HOSTS = 40, TP_MAX_DEPTH = 12/.test(src), 'bounded — level data is untrusted input');

  // executable, against a shape the function was never told about
  const host = extractFunction('_tpHostOf');
  const run = new Function('level', `
    const location = { href:'https://game.test/x.html', hostname:'game.test' };
    const URL = globalThis.URL;
    const TP_MAX_HOSTS = 40, TP_MAX_DEPTH = 12;
    ${host}
    ${extractFunction('levelRemoteHosts')}
    return [...levelRemoteHosts(level).entries()].map(([h,e])=>[h,e.n]).sort();`);

  const got = run({
    props: [ { src:'https://models.example.com/a.glb' }, { src:'https://models.example.com/b.glb' } ],
    world: { hdri:'https://sky.example.org/x.hdr' },
    // a field invented after this build shipped — the walk must still find it
    somethingNobodyHasWrittenYet: { deep: [ { url:'https://later.example.net/y.png' } ] },
    // and every form that is NOT a third-party fetch
    quiet: ['data:image/png;base64,AAAA', 'blob:https://game.test/abc', 'local:mine.glb',
            'community/level.json', 'https://game.test/own.glb', '', null, 42],
  });
  eq(JSON.stringify(got),
    JSON.stringify([['later.example.net',1],['models.example.com',2],['sky.example.org',1]]),
    'every host found once each, counted, with same-origin/data/blob/local/relative all excluded');

  // sketchfab: is a scheme this engine invented, and it DOES resolve to a real fetch
  const one = new Function(`const location={href:'https://game.test/',hostname:'game.test'};
    ${host} return [_tpHostOf('sketchfab:abc'), _tpHostOf('local:x'), _tpHostOf('data:x'),
                    _tpHostOf('/rel.glb'), _tpHostOf('https://game.test/a'), _tpHostOf('HTTPS://A.EXAMPLE/x')];`)();
  eq(JSON.stringify(one), JSON.stringify(['sketchfab.com', null, null, null, null, 'a.example']),
    'sketchfab: counts as sketchfab.com, the local schemes do not, and the host is lower-cased');
}

// ---------------------------------------------------------------- the block is ONE declaration
{
  // Not a guard at eight loaders plus three CSS paths — the one that got missed would be the one that
  // leaked, which is this file's most-repeated defect.
  assert(/A CSP is ONE declaration the BROWSER enforces across every fetch/.test(html), 'the reason is recorded');
  assert(/localStorage\.getItem\('breach_tpblock'\) !== '1'\) return;/.test(html), 'it is opt-in');
  const m = html.match(/m\.content = "img-src[^;]*;[\s\S]{0,400}?connect-src[^"]*"/);
  assert(m, 'the policy covers the three fetch families a level can reach');
  for (const d of ['img-src', 'media-src', 'font-src', 'connect-src'])
    assert(html.indexOf(d) >= 0, 'CSP names ' + d);

  // it must run before anything it governs — a CSP meta only covers content parsed AFTER it
  const inject = html.indexOf("localStorage.getItem('breach_tpblock')");
  const ga = html.indexOf('googletagmanager');
  const body = html.indexOf('<body');
  assert(inject > 0 && inject < ga && inject < body,
    'the injector is the first script in <head>, before the analytics tag and before <body>');

  // the allowlist is the engine's own infrastructure, or the block would take multiplayer with it
  for (const h of ['https://0.peerjs.com', 'wss://0.peerjs.com', 'https://www.rumpusengine.com',
                   'https://unpkg.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'])
    assert(html.indexOf(h) >= 0, 'the allowlist keeps ' + h);
}

// ---------------------------------------------------------------- the setting never overstates itself
{
  // A privacy control that says "on" while it is not is the worst possible failure, and the policy is
  // applied at PARSE time — so a player who just ticked the box is not protected until they reload.
  assert(/function tpBlockLive\(\)\{ return !!window\.__TP_BLOCKED; \}/.test(src),
    'there are two questions: what is stored, and what is in force');
  assert(/Saying "on" when it is not\n\/\/ would be the worst possible failure for a privacy control/.test(src),
    'with the reason recorded');
  assert(/tpBlocked\(\) !== tpBlockLive\(\) \? 'Reload the page for this to take effect\.'/.test(src),
    'and the panel says which of the two it is');
}

// ---------------------------------------------------------------- both audiences are told
{
  // the creator: they are the only person who can change it and the only one who could not see it
  assert(/This level loads content from '\+hosts\.size\+' other site'/.test(src), 'Level Check names the count…');
  assert(/gives those sites their IP address/.test(src), '…and what it costs the player');
  assert(/upload the files to your own game/.test(src), '…and the fix');
  // the player, and only for a level that came from OUTSIDE — the case they cannot inspect
  const mf = extractFunction('markForeignLevel');
  assert(/levelRemoteHostsNow\(\)\.size/.test(mf), 'a foreign level discloses on arrival');
  assert(/if\(n > 0 &&/.test(mf), '…and says nothing when there is nothing to say');
  // the modal reads the CURRENT level rather than a stored summary
  const md = extractFunction('showThirdPartyModal');
  assert(/levelRemoteHostsNow\(\)/.test(md), 'the modal asks live');
  assert(/a stale list is a false statement/.test(src), 'with the reason');
  // a hostname is level data (build 1325)
  assert(/n\.textContent=host;/.test(md), 'and the host is textContent, never markup');
  assert(!/innerHTML/.test(md), 'nothing in the modal is innerHTML');
}

done('build 1335 (platform audit 2.5 — the fetch surface): a level could point the browser at any http(s) URL through a dozen fields, so opening a shared level handed the author the player\'s IP with no allowlist, no prompt and no disclosure. The level is WALKED rather than having its url fields enumerated — nine defects in this codebase are a hand-kept list that drifted from the thing it described, and a privacy disclosure that silently misses a field is worse than none because it reads as complete; the test proves it by feeding the walk a field invented after the build shipped. The block is ONE CSP declaration injected before anything it governs, not a guard at eight loaders plus three CSS paths, because the loader that got missed would be the one that leaked. Verified with the run repeated and only the setting changed: zero CSP refusals with it off, connect-src AND img-src refusals with it on — the discriminator, since this sandbox has no internet route and "the image failed" is worth nothing either way — while a same-origin fetch stays ok 200 in both, which is the other half, because a block that broke the engine would look like a success from the refusal count alone. The panel distinguishes what is stored from what is in force, since the policy applies at parse time and a control that claims protection it does not have is the worst possible failure. And the shipped stock level already contacts static.poly.pizza and jarredksmith.github.io');
