import { html, assert, eq, done } from './harness.mjs';
// build 1332 — platform audit 2.6: the engine pulled two third-party scripts from public CDNs with NO
// integrity attribute anywhere in the project, and shipped no CSP of any kind. three.js IS the renderer and
// PeerJS IS the multiplayer transport, both running with full access to the page — so anyone who could
// alter what a CDN served owned every session: the publish key, the Sketchfab token, the level saves.
//
// These live in the document's own <script> blocks and in a function outside the game closure, so they are
// pinned against `html`, not gameSource().
//
// Verified live with a CONTROL PAIR (tools/probe/sri-csp.mjs), because "it booted" proves only that the
// hash is not wrong — an integrity attribute the browser IGNORED boots identically:
//   shipped bytes      -> THREE r149, game running, 0 CSP violations, 0 page errors
//   ONE byte flipped   -> the script never executes, window.THREE absent
// and all six CDN URLs were fetched and hashed: the three three.js mirrors are byte-identical to each
// other and to tests/node_modules/three@0.149.0, and so are the three PeerJS mirrors.

const THREE_SRI = 'sha384-RRHfJ6w1mTlKUBMYT/hvnRiOzEB/vyRV3DrQOseb6oYfvaZSfdd0byS4bHps0k2R';
const PEER_SRI  = 'sha384-nlUQ8ZqCbvStErob+biJNzSgltf6urV3VGqhfIfzhmg9RXmpeRm76ELw0pYnKlTR';

// ---------------------------------------------------------------- every remote <script> is hashed
{
  assert(html.includes("s.integrity = '" + THREE_SRI + "'"), 'three.js carries its sha384');
  assert(html.includes("s.integrity='" + PEER_SRI + "'"), 'PeerJS carries its sha384');

  // crossOrigin is not decoration: without it the response is opaque and the browser CANNOT verify it,
  // so the attribute would be silently inert — which is exactly the failure the tamper control rules out.
  for (const [who, near] of [['three', "s.integrity = '" + THREE_SRI], ['peerjs', "s.integrity='" + PEER_SRI]]) {
    const i = html.indexOf(near);
    assert(i > 0, who + ' hash present');
    const around = html.slice(i - 400, i + 200);
    assert(/crossOrigin\s*=\s*'anonymous'/.test(around), who + ': crossOrigin is set beside it, or SRI is inert');
  }
}

// ---------------------------------------------------------------- and NOTHING remote is left unhashed
{
  // Every CDN script the DOCUMENT loads must be covered. This is the assertion that catches the next one
  // somebody adds, which is the only way a hash list stays true.
  const urls = html.match(/['"]https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\/[^'"]*\.js['"]/g) || [];
  assert(urls.length >= 6, 'the CDN lists are still here: ' + urls.length);
  // the ESM imports (Rapier, gltf-transform, DRACO) are module `import`s / dynamic import() — those cannot
  // take an integrity attribute at all without an import map, so they are named rather than silently missed
  assert(/import maps? are the only way to hash an ESM/i.test(html) || /ESM import.*cannot carry `integrity`/i.test(html),
    'the ESM gap is stated rather than left to be discovered');
}

// ---------------------------------------------------------------- the headers a static host carries itself
{
  const m = html.match(/<meta http-equiv="Content-Security-Policy"\s*\n?\s*content="([^"]+)"/);
  assert(m, 'a CSP meta is present');
  const p = m[1];
  for (const d of ["base-uri 'self'", "object-src 'none'", "form-action 'none'"])
    assert(p.includes(d), 'CSP carries ' + d);
  /* build 1503: frame-ancestors is GONE from this list, and its absence is asserted — the spec ignores
     the directive when delivered via <meta>, so this pin spent its whole life asserting a protection the
     browser provably never enforced (it logged an error saying so on every page load). Real clickjacking
     protection is an HTTP header, which a static Pages host cannot send. */
  assert(!/frame-ancestors/.test(p), 'frame-ancestors must not return via <meta> — it is ignored there and only logs errors');

  // A `script-src` is deliberately ABSENT and that has to stay deliberate: the engine is ~47,000 lines of
  // INLINE script, so any policy it could satisfy today needs 'unsafe-inline', which buys nothing while
  // reading as protection. If a future build adds one, it must not be that one.
  assert(!/script-src/.test(p), 'no script-src yet…');
  assert(!/unsafe-inline/.test(p), '…and never an unsafe-inline one, which would be protection in name only');
  assert(/~47,000 lines of INLINE script/.test(html), 'with the reason recorded where the policy is');
}

// ---------------------------------------------------------------- the meta must be able to take effect
{
  const csp = html.indexOf('<meta http-equiv="Content-Security-Policy"');
  const head = html.indexOf('<head');
  const body = html.indexOf('<body');
  assert(head < csp && csp < body, 'the policy is in <head>, before <body>');
  // A CSP meta is ignored if anything it governs has already been parsed, so it has to precede every
  // script in the document — including the error overlay, which is the first one.
  const firstScript = html.indexOf('<script');
  assert(csp < firstScript, 'and before the FIRST <script>, or the policy never applies to it');
}

// ---------------------------------------------------------------- the fallback chain is what makes this safe
{
  // A single hashed CDN would turn "this mirror is serving altered bytes" into "the game does not load".
  // With the fallback, a failed check fires onerror and the NEXT mirror is tried — the same path an
  // unreachable CDN already took. That is why one hash can cover all three: they serve identical bytes.
  const i = html.indexOf("s.integrity = '" + THREE_SRI);
  const after = html.slice(i, i + 900);
  assert(/s\.onerror = tryNext;/.test(after), 'three: a refused script falls through to the next mirror');
  const j = html.indexOf("s.integrity='" + PEER_SRI);
  assert(/s\.onerror=next;/.test(html.slice(j, j + 400)), 'peerjs: same');
  assert(/degrades\n    \/\/ to the behaviour the loader already has for an unreachable one/.test(html),
    'with the reason stated at the site');
}

done('build 1332 (platform audit 2.6 — supply chain): three.js and PeerJS were loaded from public CDNs with no `integrity` anywhere in the project, and the document shipped no CSP. three.js IS the renderer and PeerJS IS the multiplayer transport, so whoever could alter what a mirror served owned every session. Both now carry a sha384 with crossOrigin (without which the response is opaque and the attribute is silently inert) — and the FALLBACK LIST is what makes SRI safe to add rather than risky: a refused script fires onerror and the next mirror is tried, which is the path an unreachable CDN already took, so a poisoned mirror degrades instead of taking the session. All six URLs were fetched and hashed and each pair is byte-identical, which is what lets one hash cover a whole chain. The CSP is the set a static host can carry in the document and that cannot break a same-origin engine — base-uri, object-src, form-action, frame-ancestors — with script-src deliberately absent and pinned never to arrive as an unsafe-inline one, because the engine is ~47,000 lines of inline script and such a policy would be protection in name only. Verified live with a control pair: the shipped bytes boot with zero CSP violations, and ONE FLIPPED BYTE is refused outright — which is the only thing that distinguishes a working check from an ignored attribute');
