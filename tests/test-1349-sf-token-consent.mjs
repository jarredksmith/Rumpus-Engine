// (build 1349) THE HOST STOPS LENDING A PERSONAL API CREDENTIAL TO STRANGERS BY DEFAULT.
// The multiplayer audit's sharpest verified own-goal: the host's Sketchfab token was packed into the
// WELCOME message of every match whose level referenced a `sketchfab:` model — and room codes are published
// in the lobby directory, so anyone who could join received it. `_sfPack` is a fixed XOR plus base64 whose
// DECODER ships in the same file; the comment beside it always admitted it is obfuscation, not encryption.
//
// The feature is legitimate — without a token a joiner sees holes where the level's models should be. What
// was wrong is that it happened silently and by default. Handing over a credential is a decision, and the
// person whose quota it is has to be the one making it.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';

const src = gameSource();

// ---- the consent flag, and it defaults to OFF ----
{
  const f = extractFunction('sfLendEnabled', src);
  assert(/localStorage\.getItem\(SF_LEND_KEY\)==='1'/.test(f),
    'lending is on only when explicitly set — an unset key reads false, so every existing host stops ' +
    'lending the moment they take this build');
  assert(/catch\(e\)\{ return false; \}/.test(f),
    'and a storage failure fails CLOSED: if we cannot tell, we do not hand over the credential');
  assert(/const SF_LEND_KEY='breach_sketchfab_lend'/.test(src), 'it has its own key');
  assert(!/SF_LEND_KEY[^\n]*\|\|\s*'1'/.test(src), 'nothing defaults it on');
}

// ---- the welcome gate ----
{
  const line = src.match(/let sfTok; try\{[^\n]*\}catch\(e\)\{\}/);
  assert(line, 'the welcome still decides whether to send a token');
  assert(/sfLendEnabled\(\) && _levelUsesSketchfab\(level\) && sfGetToken\(\)/.test(line[0]),
    'consent is checked FIRST and ANDed with the two pre-existing conditions — a level that uses no ' +
    'Sketchfab model still sends nothing, exactly as before');
  // the packing itself is unchanged: this build changes WHETHER, not HOW
  assert(/function _sfPack\(s\)\{[\s\S]{0,240}sfk1:/.test(src), '_sfPack is untouched');
  assert(/msg\.sfTok/.test(src), 'and a client still accepts one when a consenting host sends it');
}

// ---- the control sits with the token, not in a settings screen elsewhere ----
{
  const bar = extractFunction('_modelSourceBar', src);
  assert(/sfSetLend\(lc\.checked\)/.test(bar), 'the checkbox writes the flag');
  assert(/if\(sfEnabled\(\)\)\{/.test(bar),
    'and only appears once Sketchfab itself is on — there is nothing to lend otherwise');
  assert(/Lend my token to players who join my games/.test(bar), 'it says what it does in plain terms');
  assert(/spend your Sketchfab API quota/.test(bar),
    'the ON state names the actual risk — this is the whole point of asking rather than assuming');
  assert(/see holes where/.test(bar),
    'and the OFF state names the actual cost, so the choice is informed in both directions');
}

// ---- a check that would have caught the original defect ----
// If the token is ever packed anywhere the consent flag is not consulted, this build is a no-op there.
{
  const packs = [...src.matchAll(/_sfPack\(/g)].map(m => m.index);
  eq(packs.length, 2, '_sfPack is referenced exactly twice: its own definition and the one send site');
  const sendIdx = packs[1];
  const around = src.slice(Math.max(0, sendIdx - 300), sendIdx);
  assert(/sfLendEnabled\(\)/.test(around), 'and that send site is gated on consent');
}

done('build 1349: the Sketchfab token is lent by choice, not by default');
