# RUMPUS ENGINE — Multiplayer & Netcode Audit (build 1276)

Domain: topology/authority, replication, lag handling, cheat resistance, join/leave, lobby,
chat, co-op vs PvP, operations. Every claim below was verified in `breach.html` at the cited
line, and the two headline findings were **executed**, not read (see §2.1).

Method note, because the last panel lost a CRITICAL to it: before claiming anything absent I
grepped ≥3 synonyms. Verified absent: voice chat (`getUserMedia` / `peer.call` / `MediaStream`
— zero hits), reconnect (`rejoin` appears only on the migration path, 24976/25731), backpressure
(`bufferedAmount` — zero hits), any RTT/clock sync (`rtt` / `ping` / timestamp in a packet — zero
hits; `Date.now()` appears in net code exactly once, in the lobby HTTP heartbeat, 25975).

---

## 1. What actually exists (verified inventory)

**Topology.** Star, host-authoritative-ish, over PeerJS reliable/ordered DataChannels.
Host is `new Peer('breachfps-'+code)` (25771); clients `peer.connect('breachfps-'+code,
{reliable:true})` (25782). Every client-to-client message is relayed by the host (25535,
`sendToPlayer` 22755) — doubled latency, no mesh. No dedicated/headless mode, no relay server.

**Message vocabulary** (extracted programmatically from both handlers):
- client→host, 33 types: `anim bDel botHit break buyChest char chat cine death died fire grab
  hit hold holdEnd lit nade name pAdd pDel pMov pPush propHit push pvpHit race raceFin ready
  rematchReq rocket st unlock xa` (`handleClientMsg`, 25517).
- host→client, 37 types: `actEv anim begin boom char chat cine cp credit death duelOver eshot
  feed fire frag full hudv hurt lit lobby nade pAdd pDel pMov power pvpHit race raceOver rocket
  score teams unlock wact warmup welcome world xa` (`handleHostMsg`, 25587).

**Replication.** 20 Hz (`netTick`, `NET.sendTimer=0.05`, 25429). Host broadcasts one identical
`{t:'world'}` snapshot to everyone (`broadcastWorld`, 25115) — **no interest management, no
per-client culling, no priority**. Build 1197 delta/keyframe: keyframe every 10th tick or on any
connection-count change (25100); positions quantised to cm, angles to mrad; per-entity deltas for
enemies and dynamic props with explicit tombstones (`_snapDelta`, 25073); changed-only sub-lists
for coins/chests/powerups. Clients send `{t:'st'}` with their own full pose at the same 20 Hz
(25432).

**Smoothing.** `netInterpolate` (25362) is an exponential smoother — `lerp(target, min(1,dt*14))`
— **not** a snapshot-interpolation buffer. There are no timestamps or sequence numbers in any
packet, so there is no jitter buffer, no time sync, no extrapolation, and no way for a receiver to
know how stale a position is. Grounded remote avatars are re-grounded against local terrain (25370
onward), which is the right call.

**Lag compensation: none, and none is possible in this design.** Hit detection is 100%
client-authoritative: the shooter raycasts locally against its own interpolated view and sends the
verdict (`sendToPlayer(pid,{t:'pvpHit',d:dmg,from:NET.myId})`, 31297). The host never rewinds,
never checks LOS, never checks range. Health is also client-authoritative — the victim applies its
own damage (`applyPvpDamage`, 23513) and reports `hp` in its state packet, which the host copies
verbatim (`setRemoteState`, 25026).

**What is genuinely bounded (all verified, all real):**
| guard | line | what it bounds |
|---|---|---|
| `_netDmg` / `_netDmgCap` | 25468–25482 | one damage packet's magnitude, derived from the level's own WEAPONS table |
| `_netDmgBudget` | 25492 | leaky bucket per **source** per **kind** (pvp 500/s, pve 1500/s) |
| `_plausibleMove` | 25008 | host-side displacement cap 40 u/s (90 in a car), one oversized jump per 3 s |
| `_structAllow` | 25509 | 20/s + 40 burst on `pAdd/pMov/pDel/chat` only |
| `handleClientMsg` id | 25518 | sender identity taken from `conn._pid`, never from the packet |
| relayed `pvpHit` | 25538 | clamped through both of the above before forwarding |
| `_maxPlayersFor` | 25729 | 8 per room, 2 in duel; clean `{t:'full'}` refusal |
| `_netTimedOut` | 22403 | 8 s silence in both directions |
| `_chatClean` | 23492 | links → `[link]`, 11-word leet-normalised mask, at RENDER |

**Host migration** (1201, 24892–24998): deterministic rank election, derived room id
`'breachfps-<code>-m<gen>'`, world adopted from the promoted peer's own client mirrors, keyframed
enemy `ty`+`hp` for exactly this. Honestly documented losses (logic-graph vars, PvP bots).

**Lobby.** `lobbies.php` (flat file, owner keys, salted IP hashes, server-clock TTL, 200-room and
3-per-IP caps) + a 5 s PUT heartbeat that runs **only while `NET.phase==='lobby'`** (25973), so
in-progress games are invisible. No matchmaking, no region, no ping, no friends, no parties.

---

## 2. Cheat resistance — what a malicious peer can still do

### 2.1 CRITICAL — the relay mediates exactly one of 36 host-authoritative message types

`handleClientMsg`'s forward branch (25535):

```js
if(msg && msg.to != null && +msg.to !== NET.myId && +msg.to !== id){
  const dest = NET.conns[+msg.to];
  if(dest){
    if(msg.t==='pvpHit'){ /* clamp + budget */ return; }
    const fwd = Object.assign({}, msg, { from: id }); delete fwd.to;
    try{ dest.send(fwd); }catch(e){} return;      // <-- everything else, verbatim
  }
}
```

Build 1205's stated rule is *"only KNOWN damage types are mediated, everything else passes"* —
and the only known damage type is `pvpHit`. But the destination is a client, whose `on('data')`
is `handleHostMsg` (25785), which cannot distinguish a relayed packet from a host packet. So the
relay is a write primitive into **36 other host-authoritative verbs**.

I executed the real branch (extracted with the same harness `test-1205` uses) against nine forged
packets. Output:

```
"hurt"      RELAYED VERBATIM -> {"t":"hurt","d":1000000000,"from":1}
"wact"      RELAYED VERBATIM -> {"t":"wact","k":1,"from":1}
"wact"      RELAYED VERBATIM -> {"t":"wact","tp":[0,500,0],"from":1}
"chat"      RELAYED VERBATIM -> {"t":"chat","name":"HOST","text":"...","from":1}
"credit"    RELAYED VERBATIM -> {"t":"credit","v":1000000000,"from":1}
"teams"     RELAYED VERBATIM -> {"t":"teams","tm":{"2":1},"from":1}
"raceOver"  RELAYED VERBATIM -> {"t":"raceOver","w":0,"wn":"x","from":1}
"duelOver"  RELAYED VERBATIM -> {"t":"duelOver","w":1,"from":1}

200 {t:'hurt',d:99999} packets -> 200 relayed (no cap, no budget, no flood control)
```

Landing sites on the victim, all verified:
- `{t:'hurt', to:V, d:1e9}` → `applyEnemyDamageToSelf(msg.d)` (25613) → instant death. **No
  magnitude cap, no rate bucket, no `_structAllow`.** This is exactly the one-shot-through-walls
  exploit build 1205 was written to close, reachable by renaming the type field.
- `{t:'wact', to:V, k:1}` → `applyEnemyDamageToSelf(99999)` (25646); `wact.tp` teleports the
  victim anywhere (`_lgPlacePlayer`, 25645); `wact.st` writes their stats; `wact.gi/ti` grants or
  strips inventory; `wact.pv` runs prop verbs on their client.
- `{t:'chat', to:V, name:'HOST', text:...}` → the relay path never rewrites `name` (only the
  non-`to` branch does, 25578), so this is **private, targeted impersonation of any display name**,
  invisible to everyone else — including the host, who cannot moderate what it never rendered.
- `{t:'teams', to:V, tm:{...}}` → rewrites the victim's team, which drives `sameTeam()` and hence
  their friendly-fire immunity; `{t:'duelOver'}` / `{t:'raceOver'}` ends their match; `{t:'full'}`
  kicks them to the menu; `{t:'begin'}` force-starts them out of the lobby.

Severity: any client can kill, teleport, disarm, impersonate to, and eject any other client, at
line rate, in any 3+ player room. It is one console line and it defeats every claim-bounding guard
in the file. `test-1205` covers `pvpHit` and `fire` only, which is why it survived.

**The fix is structural, not another type name in the `if`:** relay only from an explicit
COSMETIC allow-list, and re-stamp `chat.name` from `NET.players[id].name` on the relay path too.
The inverse rule ("mediate the known-bad") cannot work when the destination's vocabulary is larger
than the source's.

### 2.2 CRITICAL — kill/finish credit is asserted by the client, unbounded

- `{t:'died', by:X}` (25554) → `registerDuelKill(X, sender)`. The only check is that `X` is a live
  peer. Nothing verifies the sender actually died, and `died` is not in `_structAllow`. A loop of
  `conn.send({t:'died',by:allyId})` hands an ally the kill target instantly and ends the match.
  Self-credit is blocked (`killerId===victimId`), so this is a two-party or griefing exploit — but
  it terminates any FFA/TDM/duel at will.
- `{t:'raceFin'}` (25584) → `_raceDeclareWinner(id)` (32572) with **zero validation** — no lap
  count check against the `_raceNet[id].lap` the host is already tracking. One packet at t=0 wins
  any race.
- `{t:'buyChest', id}` (25567) removes any crate for everyone.

### 2.3 HIGH — inherent to client-authoritative hit + health, correctly bounded but not closed
- **Aimbot / wallhack / silent aim**: `pvpHit` is a client verdict. The host clamps magnitude and
  rate, so a cheat is capped at ~500 dmg/s to a single victim — a hard aimbot that never misses,
  through walls, at any range, at slightly above the best legitimate DPS. Nothing more is possible
  P2P without re-simulation.
- **God mode**: the victim owns `player.hp` and reports it; ignoring `pvpHit` is invisible.
- **The move clamp does not protect damage.** `_plausibleMove` rewrites the host's *mirror* of a
  cheater's position (25023) and never tells the cheater. The cheater's own client keeps the
  hacked position and its shots originate there. So a speedhacker/noclipper is drawn where the
  host says but *shoots* from where it wants. The guard buys visual consistency, not fairness —
  worth writing down, because the build note reads as if it buys both.

### 2.4 HIGH — the cheating host, and the host's own leaks
Every guard protects the host from clients; the host is a player. Clients apply host relays
verbatim (25617 `applyPvpDamage(msg.d, msg.from)` — no clamp on the receiving side). Inherent to
P2P; the honest mitigation is *say so in the UI*, which the product does not.

Own-goal, still live: the host's personal Sketchfab API token is shipped to every joiner in the
`welcome` (25748) behind `_sfPack` (16844), a fixed XOR whose decoder is on the next line of the
same public file. It is not obfuscation against anyone who can read the game.

### 2.5 MEDIUM — network-supplied model URLs are fetched unvalidated
`pAdd` → `netApplyAddProp` (25184) → `spawnProp(d.src, …)` (17255) → `loadGLTFCached(src)` with
**no scheme/host/size check**. Rate-limited to 20/s + 40 burst by `_structAllow`, and relayed to
every other peer. So any client can make every peer in the room fetch an attacker-chosen URL —
third-party IP logging, and a 40-deep queue of huge `.glb`s is a plausible memory kill on mobile.

### 2.6 MEDIUM — room-cap race, and a guessable/pre-claimable host id
`_maxPlayersFor` counts `Object.keys(NET.conns)`, but `NET.conns[pid]` is only populated in
`conn.on('open')` (25738). N simultaneous `connect()`s all pass the check before any opens, so the
8-cap is bypassable by a burst. Separately: room codes are 5 chars of `Math.random` over a
31-symbol alphabet (`genRoomCode`, 44626) = 28.6M — and the lobby directory publishes them for
free. The migration id is fully deterministic (`_migPid`, 24917), so anyone who has seen a code
can pre-register `breachfps-<code>-m1` on the broker and be *elected* the host on the next
migration, arriving with a world of their choosing. (Prior audit flagged this; still live.)

### 2.7 MEDIUM — a laggy client forks the room (split-brain)
`conn.on('close'/'error')` → `netHostLost()` (24892) → `netMigrateBegin()` **whenever `gameOn`** —
it never distinguishes "the host died" from "my own link died". A client that loses its channel
while the host is perfectly alive runs the election alone, fails to find `-m<gen>`, and after
`rank*4000 ms` **promotes itself** (`_migJoinLoop`'s `fail()`, 24971) into a phantom one-player
host squatting `breachfps-<code>-m1`. When the real host later dies, the survivors migrate to gen
1 and land on the phantom's stale world. A pre-flight liveness probe of the original host id
before promoting would close it.

### 2.8 LOW — no ordinary reconnection at all
`rejoin` metadata is sent only by `_migJoinLoop`. A player who reloads or drops rejoins as a fresh
`NET.nextId++` with a full level re-serialization and loses score, team and prop-id prefix. On
mobile, backgrounding the tab for 8 s is a permanent identity loss.

---

## 3. Operational reality

**Signalling.** Public PeerJS cloud broker (no `host` in `_peerOpts`, 25674) — rate-limited, no
SLA, not the project's. The library itself is pulled at runtime from unpkg → jsdelivr → cdnjs
(44629): three third parties with script-execution authority over every session, and no offline
path. (The repo already made the local-copy move for Rapier in build 961; this one is still out.)

**TURN.** Defaults are `freeturn.net` with username `free`, credential `free` (25671) — a public
free relay that will be saturated, unavailable, or gone. `ice.php` exists and is correct, but
ships reading an env var that is unset. On a **symmetric NAT with no working TURN, the connection
simply fails** — the client sits at "Connecting to <code>…" and then "Connection error" (25789).
Symmetric NAT is common on carrier-grade NAT mobile and corporate/school networks, i.e. exactly
the audience "open a URL and play" targets.

**Bandwidth on the host.** I built a realistic snapshot from `serializeWorld`'s exact field
shapes (8 players, 40 enemies, 15 dynamic props, 12 coins, 4 chests): keyframe 5,662 B, delta
3,389 B, mean 3,616 B/tick.

```
2 players -> host up   71 KB/s  = 0.58 Mbit/s
4 players -> host up  212 KB/s  = 1.74 Mbit/s
8 players -> host up  494 KB/s  = 4.05 Mbit/s
```

PeerJS 1.5's default `binary` (BinaryPack) serialization will take maybe 40–60% off, so call it
~2–2.5 Mbit/s sustained upstream for a full 8-player wave room, plus 8 inbound `st` streams, plus
the host also *playing the game*. That is above the comfortable uplink of a lot of residential and
most mobile connections, and every byte goes to every player because there is no interest
management. If TURN is in use, that same traffic is also relayed and metered — with a paid TURN
provider, an 8-player hour is roughly 1.5–3 GB *per relayed peer*. Nobody has costed this.

**Bad connections.** Channels are `reliable:true` — reliable **and ordered**. State snapshots are
the one payload class that should be unreliable/unordered: under loss, SCTP head-of-line blocking
stalls every subsequent snapshot behind the retransmit, and there is no `bufferedAmount` check
anywhere, so a congested link grows the send buffer without bound and latency spirals instead of
degrading. Combined with `lerp(dt*14)` and no timestamps, a jittery player does not smoothly lag —
they stutter and then teleport. This is the single biggest *quality* gap and it is fixable inside
the existing design (a second unreliable channel for `world`/`st`, reliable kept for events).

**Liveness.** 8 s of silence both ways (22403). Reasonable for 20 Hz traffic; harsh on a mobile
tab switch, and it triggers migration rather than a reconnect (§2.7).

---

## 4. Honest comparison

Be clear about the frame: **browser P2P with no dedicated servers is a different animal.** Unreal,
Unity and Godot all assume a process you control that no player can edit. Everything that follows
splits into *inherent to the model* and *genuine gaps Rumpus could close*.

**Inherent to browser P2P — not fair to score against:**
- Server authority over movement, hits, health and score. Unreal replicates from a server that
  *runs the simulation*; `CharacterMovementComponent` does true client prediction with server
  correction and `NetworkPredictionInterface`; hits are rewound server-side (`LagCompensation`).
  Rumpus cannot re-simulate a client's shot, and its "bound the claim" answer is the right one for
  the model. Unity NGO and Godot's high-level API give you *none* of this out of the box either —
  NGO's `NetworkTransform` is server-auth by default but ships no lag comp and no anti-cheat, and
  Godot's RPCs are entirely trust-based. **On claim-bounding, Rumpus is genuinely ahead of stock
  Unity and Godot.**
- Player counts, persistent worlds, dedicated hosting, region matchmaking.
- IP exposure to peers (WebRTC; mitigable only by forcing TURN, which costs money).

**Genuine gaps Rumpus could close, ranked by how cheap they are:**
1. **The relay allow-list** (§2.1). Unreal's RPCs are typed, `Server`/`Client`/`NetMulticast`
   scoped and validated (`_Validate`); Godot's `@rpc` declares call-local/authority. Rumpus's
   relay has *no* notion of which verbs a client may originate. This is not a P2P limitation — it
   is a missing 20-line allow-list.
2. **Unreliable channel for state.** Every one of the three uses unreliable/unordered for
   movement (`NetUpdateFrequency` + unreliable property replication; NGO's `UnreliableDeltas`;
   Godot's `rpc(..., "unreliable")`). Rumpus sends 20 Hz snapshots over reliable-ordered SCTP.
   Purely a configuration choice, and the highest-value quality fix available.
3. **Interest management.** Unreal has `NetCullDistanceSquared`, relevancy and replication graphs;
   NGO has `NetworkObject` visibility. Rumpus sends everything to everyone. At 8 players and
   arena-sized levels this is survivable, but it is why the host uplink number is what it is.
4. **Snapshot interpolation with a real delay buffer + timestamps.** All three do this. Rumpus's
   exponential smoother is ~20 lines from correct.
5. **Reconnection.** NGO/EOS both restore a client to its session. Rumpus has migration but no
   plain reconnect (§2.8) — odd, because the harder half is already built.
6. **Operational substrate.** EOS gives free relay + lobby + sessions + P2P at Epic's scale; Unity
   Relay/Lobby is a paid managed service; Godot expects you to bring your own. Rumpus's tier is
   "public broker + free TURN with the password `free`". Standing up a PeerServer and paid TURN is
   a day of work and closes the worst of it. Note honestly: **Unity Relay is exactly the same
   star-relay topology with the same host-is-a-player trust model** — Rumpus's architecture is not
   the outlier; its *infrastructure* is.
7. **Voice, spectator, parties, persistent block lists** — all absent, all table stakes on the
   platforms this competes with for players (Roblox/Fortnite Creative), none of them P2P-blocked.

Where Rumpus genuinely wins: zero install, zero account, a room code and a URL, host migration
that actually works (Unity NGO has no built-in host migration; Godot has none; Unreal's is a
`Seamless Travel` project you build yourself), and per-source per-kind damage budgeting that I
have not seen shipped in an indie P2P title.

---

## 5. Score

**Rubric.** 10 = server-authoritative simulation with prediction and reconciliation, server-side
lag compensation, interest-managed unreliable state replication, typed/validated RPC surface,
seamless reconnect, and an operational substrate the project controls and has costed. 5 = a
correct, honest P2P implementation whose trust boundaries are enforced consistently for the model
it chose. 1 = trust everything, hope.

## **Score: 5 / 10**

The engineering that is here is real and often better than its peers — delta/keyframe snapshots
with tombstones and quantisation, derived damage caps, per-source per-kind leaky buckets,
movement plausibility bounds, structural flood control, a working deterministic host migration,
an 8-player cap with a clean refusal, two-way liveness detection, and a chat filter applied at
render where it belongs. That is a 7's worth of *deliberate* netcode and it was clearly built by
someone who understood the problem.

It scores 5 because the trust boundary it spent five builds hardening has a door in it that was
never closed: the host mediates exactly one of the 36 host-authoritative message types it will
forward between clients, so the one-shot-through-walls exploit build 1205 fixed is still live
under the name `hurt`, alongside remote teleport, remote inventory writes, targeted name
impersonation, and match termination. Two more verbs (`died`, `raceFin`) let any client hand out
kills and win races by assertion. And the transport underneath all of it — reliable-ordered
channels for 20 Hz state, no interest management, no backpressure, ~2–4 Mbit/s of host upstream
at 8 players — is a configuration away from being much better and has not been touched.

Close §2.1 and §2.2 and this is a 6. Add an unreliable state channel, a real interpolation buffer
with timestamps, and a PeerServer + paid TURN, and it is a 7 — which is about the ceiling for
honest browser P2P with no dedicated server, and a perfectly respectable place to ship.
