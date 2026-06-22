import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 638: Sketchfab SEARCH now authenticates with the user's saved token (the download path already did).
// Sketchfab allows the Authorization header on the search endpoint's CORS, so an authenticated search works
// directly AND gets per-token rate limits — fixing failures from the strict anonymous per-IP limit. Swapping
// tokens never helped before because the old search sent no token at all.

// --- wiring ---
const f = extractFunction('sfFetchPage');
assert(/const tok = \(typeof sfGetToken==='function'\) \? \(sfGetToken\(\)\|\|''\)\.trim\(\) : '';/.test(f), 'reads the saved token');
assert(/const authOpts = tok \? \{ headers:\{ Authorization:'Token '\+tok \} \} : undefined;/.test(f), 'builds an Authorization header when a token exists');
assert(/fetch\(url, authOpts\)\.then\(parse\)/.test(f), 'the first search request carries the token');
assert(/if\(authOpts\)\{ fetch\(url\)\.then\(parse\)\.then\(deliver\)\.catch\(afterUnauth\); \}/.test(f), 'if the authed request fails, it retries unauthenticated before the proxy');
assert(/r\.status===429\?' \\u2014 Sketchfab is rate-limiting/.test(f), 'a 429 explains the real (rate-limit) cause');

// --- executable: the right request is made for token / no-token ---
const deps = `
  let calls=[];
  function sfGetToken(){ return TOKEN; }
  function proxied(u){ return u; }
  function sfMap(m){ return m; }
  function fetch(u, o){ calls.push({ u, o }); return Promise.resolve({ ok:true, text:()=>Promise.resolve('{"results":[],"next":null}') }); }
`;
const make = (token)=> new Function('TOKEN', deps + '\n' + extractFunction('sfFetchPage') + '\n return { sfFetchPage, calls:()=>calls };')(token);

const withTok = make('abc123token');
let okWith=false;
withTok.sfFetchPage('https://api.sketchfab.com/v3/search?q=barrel', ()=>{ okWith=true; }, ()=>{});
await new Promise(r=>setTimeout(r, 0));
const c1 = withTok.calls();
eq(c1.length, 1, 'one direct request (no proxy fallback needed on success)');
assert(c1[0].o && c1[0].o.headers && c1[0].o.headers.Authorization === 'Token abc123token', 'the search request carries Authorization: Token <token>');
assert(okWith, 'results delivered to the callback');

const noTok = make('');
noTok.sfFetchPage('https://api.sketchfab.com/v3/search?q=barrel', ()=>{}, ()=>{});
await new Promise(r=>setTimeout(r, 0));
const c2 = noTok.calls();
assert(c2[0].o === undefined, 'no token -> a plain unauthenticated request (graceful fallback)');

done('Sketchfab search: authenticated with the user token for per-token rate limits (build 638)');
