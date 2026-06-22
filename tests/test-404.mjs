import { gameSource, assert, done } from './harness.mjs';
const src = gameSource();

// build 529: solo/campaign enemies no longer hover-bob, and they stand on the real walkable surface
// (props / imported arena floor mesh / ramps) via groundHeightAt — the SAME logic the player + MP bots use.
assert(!/Math\.sin\(t\*4\+en\.id\)\*0\.08/.test(src), 'idle hover-bob removed from enemy Y');
assert(/groundHeightAt\(en\.mesh\.position\.x, en\.mesh\.position\.z, en\.mesh\.position\.y - 1\.4\)/.test(src), 'enemies ground via groundHeightAt (prop/floor-mesh aware), not bare terrain');
assert(/en\.mesh\.position\.y = \(en\._groundY!=null\?en\._groundY:0\) \+ 1\.4 \+ \(en\.launchY\|\|0\);/.test(src), 'enemy Y = walkable surface + center offset + launch arc (no bob term)');
done();
