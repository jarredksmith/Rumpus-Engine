import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 624: the MP start countdown is synced and shown to EVERY peer. Before, matchWarmup was host-only and
// only for PvP-with-bots, and it gated on the host's nav build — so clients (and human-only duels) saw nothing.
// Now: every PvP host match counts down and broadcasts the live count; clients hold on GET READY until it lands.

// --- state + wiring ---
assert(/let _warmupBroadcast = false/.test(src) && /let _clientWarmupHold = false/.test(src), 'sync state flags declared');
assert(/else if\(msg\.t==='warmup'\)\{ matchWarmup = \(msg\.secs!=null \? \+msg\.secs : 3\); _clientWarmupHold=false; \}/.test(src), 'client applies the host\'s synced count');
// host start: countdown on any PvP host match (bots or not); client holds
assert(/matchWarmup=3; _warmupBroadcast=false; _clientWarmupHold=false; \}/.test(src), 'host arms the countdown for every PvP match');
assert(/else if\(NET\.mode==='client'\)\{ matchWarmup=3; _clientWarmupHold=true; _warmupBroadcast=false; _cwPeak=0; _cwPctMax=0; \}/.test(src), 'client freezes and waits for the synced count (build 1015: fresh loading %)');

// --- navWarmupTick branches ---
const w = extractFunction('navWarmupTick');
assert(/if\(NET\.mode==='client' && _clientWarmupHold\)\{/.test(w) && /_setCountdown\('GET READY'\)/.test(w),
  'client holds on GET READY until the count arrives');
assert(/LOADING WORLD/.test(w) && /_cwPctMax=Math\.max\(_cwPctMax, pct\);/.test(w),
  'while models stream in, the hold shows a monotonic LOADING WORLD % (build 1015: it looked frozen)');
assert(/if\(!NAV\.built && NET\.mode==='host' && bots\.length\)\{/.test(w), 'only a host WITH bots waits on the nav build');
assert(/if\(NET\.mode==='host' && !_warmupBroadcast\)\{ _warmupBroadcast=true; for\(const id in NET\.conns\)\{ try\{ NET\.conns\[id\]\.send\(\{t:'warmup', secs:matchWarmup\}\); \}catch\(e\)\{\} \} \}/.test(w), 'host broadcasts the live count exactly once');
assert(/matchWarmup=0; _clientWarmupHold=false; return false;/.test(w), 'GO clears the client hold too');

// --- executable: navWarmupTick behavior per peer ---
function runTick(opts){
  const sent=[]; const counts=[];
  const pre = `
    let matchWarmup=${opts.matchWarmup}, _warmupBroadcast=${opts.warmupBroadcast}, _clientWarmupHold=${opts.clientHold};
    const NAV={ built:${opts.navBuilt} };
    const bots=${JSON.stringify(new Array(opts.bots||0).fill(0))};
    const NET={ mode:'${opts.mode}', conns:{ c1:{ send:(m)=>__sent.push(m) } } };
    let duelInvuln=0;
    function navBuildStep(){} function navBuildProgress(){ return 0; }
    function _setCountdown(h){ __counts.push(h); }
  `;
  const fn = new Function('__sent','__counts', pre + '\n' + extractFunction('navWarmupTick') + '\n return navWarmupTick(' + (opts.dt!=null?opts.dt:1) + ');');
  const held = fn(sent, counts);
  return { held, sent, counts };
}

// client holding: shows GET READY, sends nothing, stays held (matchWarmup not ticked here — we just see the UI)
let c = runTick({ mode:'client', matchWarmup:3, clientHold:true, warmupBroadcast:false, navBuilt:false, bots:0 });
assert(c.held===true && c.counts[c.counts.length-1]==='GET READY' && c.sent.length===0, 'a held client shows GET READY and broadcasts nothing');

// host with bots, nav NOT built: generating screen, no broadcast yet
let hg = runTick({ mode:'host', matchWarmup:3, clientHold:false, warmupBroadcast:false, navBuilt:false, bots:2 });
assert(hg.held===true && /GENERATING ARENA/.test(hg.counts.join('')) && hg.sent.length===0, 'host with unbuilt nav shows GENERATING, no count yet');

// host (no bots) ready: broadcasts the count once, then ticks the number
let hr = runTick({ mode:'host', matchWarmup:3, clientHold:false, warmupBroadcast:false, navBuilt:false, bots:0, dt:1 });
assert(hr.sent.length===1 && hr.sent[0].t==='warmup' && hr.sent[0].secs===3, 'a ready host broadcasts {t:warmup, secs} once');
assert(hr.held===true && hr.counts[hr.counts.length-1]==='2', 'after broadcasting it counts down (3 -> 2)');

// host already broadcast: does NOT send again
let h2 = runTick({ mode:'host', matchWarmup:2, clientHold:false, warmupBroadcast:true, navBuilt:true, bots:0, dt:1 });
assert(h2.sent.length===0, 'the count is broadcast only once per match');

done('synced MP start countdown: clients hold then count with the host; broadcast once (build 624)');
