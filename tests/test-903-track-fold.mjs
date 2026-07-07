// (build 903) RACE TRACK ACCORDION — "make all of the racetrack options in its own section" — the
// builder, Draw/Random tools, piece grid, walls and Track appearance were ~half the Object panel for
// non-racers. They now live inside ONE collapsible 'Race track' fold (state in localStorage, default
// collapsed); every control simply appends to tkWrap instead of shapesHost, so nothing rebinds.
import { gameSource, assert, eq, done } from './harness.mjs';
const src = gameSource();
assert(/const tkOpen=\(\(\)=>\{ try\{ return localStorage\.getItem\('breach_fold_track'\)==='1'; \}catch\(e\)\{ return false; \} \}\)\(\);/.test(src), 'fold state persists, default collapsed');
assert(/<span style="flex:1;text-align:left">Race track<\/span>/.test(src), 'the fold header is labeled Race track');
assert(/localStorage\.setItem\('breach_fold_track', open\?'1':'0'\)/.test(src), 'toggling remembers');
eq((src.match(/tkWrap\.appendChild\(/g)||[]).length, 12, 'all twelve track controls live inside the fold');
assert(!/shapesHost\.appendChild\(tHead\)|shapesHost\.appendChild\(tgrid\)|shapesHost\.appendChild\(rst\)/.test(src), 'nothing track-related leaks outside it');
done('build 903: the race track kit folds into its own section');
