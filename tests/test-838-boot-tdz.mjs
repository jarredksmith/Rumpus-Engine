// (build 838) BOOT CRASH HOTFIX — two field bugs from the console:
//  1. _groupSeq lived ~13k lines BELOW the boot-time loadHostedProps() call, but _bumpGroupSeq runs during
//     that call for every saved prop with a group id — so any SAVED level containing a grouped prop threw a
//     temporal-dead-zone ReferenceError and the entire prop load aborted on startup. (Data-dependent: the
//     plain boot test never sees it because the default scene has no groups.) The declaration now sits
//     directly above loadHostedProps.
//  2. The on-screen error box handler used `box` without declaring it — the error REPORTER itself threw
//     'box is not defined', eating the real error. Now `let box = null;`.
import { gameSource, html, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// --- 1. declaration order: _groupSeq must be initialized before the boot prop load runs ---
{
  const decl=src.indexOf('let _groupSeq = 0;');
  const bootCall=src.indexOf('\nloadHostedProps();');
  assert(decl>0 && bootCall>0, 'both sites found');
  assert(decl < bootCall, '_groupSeq is declared before the boot-time loadHostedProps() call (no TDZ)');
  // and there is exactly ONE declaration (the old far-away copy is gone)
  eq(src.match(/let _groupSeq = 0;/g).length, 1, 'single declaration');
}
// the group helpers still work
{
  const fn=new Function('"use strict"; let _groupSeq = 0;'
    + extractFunction('_newGroupId') + '\n' + extractFunction('_bumpGroupSeq')
    + '\nreturn { id:_newGroupId, bump:_bumpGroupSeq, seq:()=>_groupSeq };')();
  fn.bump('g7'); eq(fn.seq(), 7, 'loading g7 bumps the sequence');
  fn.bump('g3'); eq(fn.seq(), 7, 'lower ids never rewind it');
  fn.bump('nonsense'); fn.bump(null); eq(fn.seq(), 7, 'junk ids are ignored');
  eq(fn.id(), 'g8', 'the next new group id lands ahead of every loaded one');
}

// --- 2. the error reporter declares its element (this is in the small bootstrap script, so pin the full html) ---
assert(/let box = null;\s*\/\/ build 838[\s\S]{0,200}window\.addEventListener\('error'/.test(html), 'the on-screen error box variable is declared before use');

done('build 838: boot TDZ on grouped-prop levels fixed + the error reporter can actually report');
