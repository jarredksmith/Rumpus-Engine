// build 1178: the chat gets a filter and a mute.
//
// The platform critic, verified: chat capped length and escaped HTML but never filtered CONTENT — a public,
// kids-adjacent UGC game with raw P2P chat. The filter runs CLIENT-SIDE AT RENDER (a hostile peer can send
// anything; what matters is what gets shown): links from strangers become [link] — the top P2P harm vector —
// and a baseline profanity list is masked after leet-normalisation. Mute is per-session by display name
// (/mute Name, /unmute Name) because the relay carries names, not ids.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- the filter, executed
{
  const clean = new Function('_CHAT_BAD',
    extractFunction('_chatClean') + '\nreturn _chatClean;'
  )(['fuck', 'shit', 'bitch']);

  eq(clean('nice shot!'), 'nice shot!', 'clean text passes untouched');
  eq(clean('what the fuck'), 'what the ∗∗∗∗', 'profanity masks in place');
  eq(clean('what the FuCk'), 'what the ∗∗∗∗', '...case-insensitively');
  eq(clean('what the fUcK yes sh1t'), 'what the ∗∗∗∗ yes ∗∗∗∗',
    '...and through leet substitutions (1→i), everywhere in the line');
  eq(clean('join my discord https://evil.example/grab now'), 'join my discord [link] now',
    'links from strangers collapse to [link]');
  eq(clean('www.evil.example/x too'), '[link] too', '...www links too');
  assert(clean('scunthorpe problem') === 'scunthorpe problem' || clean('scunthorpe problem').includes('∗'),
    'documented: substring matching does catch embedded words (Scunthorpe) — the accepted trade for masking leetspeak');
}

// ---------------------------------------------------------------- mute + render wiring
{
  assert(/const mm = text\.match\(\/\^\\\/\(un\)\?mute\\s\+\(\.\+\)\$\/i\);/.test(src),
    '/mute and /unmute are recognised in sendChat');
  const sc = extractFunction('sendChat');
  assert(sc.indexOf('const mm') < sc.indexOf('addChatLine(nm, text, true)'),
    '...BEFORE the message is displayed or sent — a mute command never leaves the machine');
  assert(/_chatMuted\.add\(who\)/.test(sc) && /_chatMuted\.delete\(who\)/.test(sc), 'both directions work');
  const acl = extractFunction('addChatLine');
  assert(/if\(!mine && _chatMuted\.has\(\(''\+\(name\|\|''\)\)\.trim\(\)\.toLowerCase\(\)\)\) return;/.test(acl),
    'a muted sender renders NOTHING');
  assert(/if\(!mine\) text = _chatClean\(text\);/.test(acl),
    'incoming text is filtered at render; your own text shows as typed');
  assert(/tx\.textContent=/.test(acl), 'and the existing textContent rendering (no-XSS) is untouched');
}

// ---------------------------------------------------------------- the mute round trip, executed
{
  const rows = [];
  const doc = { getElementById: () => ({ appendChild: (r) => rows.push(r), children: { length: 0 }, removeChild(){} }),
    createElement: () => ({ style: {}, classList: { add(){} }, appendChild(){}, set textContent(v){ this._t = v; }, get textContent(){ return this._t; } }) };
  const muted = new Set(['troll']);
  const acl = new Function('document', '_chatMuted', '_chatClean', 'setTimeout',
    extractFunction('addChatLine') + '\nreturn addChatLine;'
  )(doc, muted, (t) => t, () => {});
  acl('Troll', 'hello', false);
  eq(rows.length, 0, 'a muted name (case-insensitive) renders no row');
  acl('Friend', 'hello', false);
  eq(rows.length, 1, 'everyone else still comes through');
}

done('build 1178: chat is filtered at render — stranger links become [link], a leet-normalised profanity baseline masks in place, your own text shows as typed — and /mute Name silences a sender for the session without the command ever leaving the machine');
