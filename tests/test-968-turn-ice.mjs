// (build 968) NAT-PROOF JOINS. The game shipped STUN-only (PeerJS defaults): players behind
// strict NATs (cellular, CGNAT, different home networks) reached the broker and exchanged
// signaling ("Connecting to <code>…") but the data channel never opened -> "Connection error".
// Both Peer() constructors now carry Google STUN + the Open Relay TURN fleet (free, ports
// 80/443 + TCP); TURN engages only when the direct path fails. localStorage 'breach_ice'
// overrides the list. Verified live: the full host->browse->join loop still connects through
// the real game call sites, and _peerOpts() resolves 4 ICE entries incl. TURN.
import { gameSource, assert, done } from './harness.mjs';

const src = gameSource();

assert(/function _peerIce\(\)\{/.test(src) && /return \{ config:\{ iceServers:_peerIce\(\) \} \};/.test(src), 'ICE config helpers exist');
assert(/stun:stun\.l\.google\.com:19302/.test(src), 'STUN stays for the direct path');
// build 1015: openrelay.metered.ca ('openrelayproject') was RETIRED — a dead relay meant
// same-WiFi joins failed on AP-isolated routers. Live free relay + optional remote config now.
assert(!/turn:openrelay\.metered\.ca/.test(src), 'the dead relay is gone (the name survives only in the explanatory comment)');
assert(/turn:freeturn\.net:3478/.test(src) && /turn:freeturn\.net:3478\?transport=tcp/.test(src) && /turns:freeturn\.tel:5349/.test(src),
  'the TURN fleet covers UDP, TCP and TLS (firewall-hostile networks)');
assert(/username:'free', credential:'free'/.test(src), 'static relay credentials');
assert(/_fetchIceRemote/.test(src) && /_commApi\(\)\+'ice\.php'/.test(src) && /j\.every\(o=>o && o\.urls\)/.test(src),
  'a hosted ice.php can supply real TURN creds per deployment (validated before use)');
assert(/localStorage\.getItem\('breach_ice'\)/.test(src), 'self-hosters can override the ICE list');
assert(/new Peer\('breachfps-'\+code, _peerOpts\(\)\)/.test(src), 'the host peer carries the ICE config');
assert(/NET\.peer=new Peer\(_peerOpts\(\)\)/.test(src), 'the joining peer carries the ICE config');

done('build 968: STUN+TURN on both peers — joins survive strict NATs');
