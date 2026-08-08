// build 1421: an UNBREAKABLE prop registers the hit. It just never breaks.
//
// Reported from play, one message after the shooting-range loop first worked end to end:
//   "if you don't also have Breakable toggled on, it doesn't work."
//
// Verified at the line — `damageProp` opened `if(obj.userData.breakable===false) return false;`, so
// unticking the Breakable checkbox did not stop the plate SHATTERING, it stopped the plate REGISTERING:
// no health change, no impact flash, no hit sound, and no `damaged` signal (build 1397). The checkbox says
// "shatters when shot", so the creator who wants exactly what a shooting range is made of — score every
// hit, the plate never disappears — turned their target off by asking for it.
//
// This is build 1405's narrowing taken one step further. That build moved `breakable:false` from "skip the
// prop entirely" to "cannot be damaged"; it now means "cannot be DESTROYED", which is what the label has
// said all along. FIVE call sites read the flag and all five treated it as immunity.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// ---------------------------------------------------------------- damageProp, executed
// The rig records everything a hit is supposed to produce, so "did it register" is measured rather than
// inferred from a return value that is `false` in BOTH the fixed and the broken case (it means "did not
// shatter"). That ambiguity is exactly what let the defect look like a working refusal.
const rig = () => {
  const st = { ignite: 0, shatter: 0, sound: 0, events: [], flashed: 0 };
  const deps = `
    let __st;
    function __bind(s){ __st = s; }
    function igniteProp(o){ __st.ignite++; o.userData._fireIgnited = true; }
    function shatterProp(){ __st.shatter++; }
    function defaultHpFor(){ return 100; }
    function playPropHitSound(){ __st.sound++; return true; }
    function _lgPropEvent(o, when){ __st.events.push(when); }
    function _propCtx(){ return {}; }
    const performance = { now: () => 1234 };
  `;
  const api = new Function(deps + '\n' + extractFunction('damageProp') +
    '\n return { damageProp, bind: __bind };')();
  api.bind(st);
  return { hit: api.damageProp, st };
};
// `traverse` is how the impact flash is applied; counting the visit proves the flash ran.
const prop = (ud, st) => ({
  userData: Object.assign({ shootable: true, hp: 100, maxHp: 100 }, ud),
  traverse(f) { st.flashed++; f({ isMesh: true, material: { emissive: { setHex() {} }, emissiveIntensity: 0 } }); },
});

{ // THE REPORT: a static target with Breakable unticked
  const { hit, st } = rig();
  const p = prop({ breakable: false }, st);
  const broke = hit(p, 30, null, null, 1, null);
  eq(st.events.join(), 'damaged', 'an unbreakable target FIRES the `damaged` signal — the reported symptom');
  eq(st.sound, 1, '...plays its impact sound');
  eq(st.flashed, 1, '...and shows the impact flash');
  eq(p.userData.hp, 100, 'its health never drops, which is the truthful reading of invulnerable');
  eq(st.shatter, 0, '...so it can never reach 0 and shatter');
  eq(broke, false, 'and damageProp reports it survived');
}
{ // ...however long you shoot it. An infinite target is the point of the setting.
  const { hit, st } = rig();
  const p = prop({ breakable: false }, st);
  for (let i = 0; i < 50; i++) hit(p, 999, null, null, 1, null);
  eq(p.userData.hp, 100, '50 shots of 999 leave it at full health');
  eq(st.shatter, 0, '...and standing');
  eq(st.events.length, 50, '...having scored every one of them');
}
{ // THE CONTROL: the same prop with Breakable ticked is byte-identical to before this build
  const { hit, st } = rig();
  const p = prop({ breakable: true }, st);
  eq(hit(p, 30, null, null, 1, null), false, 'a breakable target survives a 30 of its 100');
  eq(p.userData.hp, 70, '...and loses the health');
  eq(st.events.join(), 'damaged', '...and reports the hit');
  eq(hit(p, 999, null, null, 1, null), true, 'a killing shot reports destroyed');
  eq(st.shatter, 1, '...and shatters it');
}
{ // an UNSET flag is the default and must behave exactly as breakable does
  const { hit, st } = rig();
  const p = prop({}, st);
  hit(p, 40, null, null, 1, null);
  eq(p.userData.hp, 60, 'a prop that never mentions `breakable` still takes damage (the default is true)');
}
{ // build 1390's gate is UNTOUCHED, and it is the one that must stay closed
  const { hit, st } = rig();
  const wall = { userData: { hp: 50, maxHp: 50 }, traverse() { st.flashed++; } };
  eq(hit(wall, 999, null, null, 1, null), false, 'a plain static prop is still not damageable at all');
  eq(wall.userData.hp, 50, '...and keeps every point of health');
  eq(st.events.length, 0, '...and fires nothing: this is what stops every wall in every saved level ' +
    'becoming shootable, and it is a DIFFERENT question from breakable');
  eq(st.flashed, 0, '...not even a flash');
}
{ // a FUSED explosive that cannot be destroyed must never light, because lighting is how it destroys itself
  const { hit, st } = rig();
  const barrel = prop({ breakable: false, explosive: true, fireFuse: 3 }, st);
  hit(barrel, 999, null, null, 1, null);
  eq(st.ignite, 0, 'an unbreakable fused explosive is not lit by a shot');
  eq(st.events.join(), 'damaged', '...but the shot still registers on it');
  const b2 = rig(); const lit = prop({ breakable: true, explosive: true, fireFuse: 3 }, b2.st);
  b2.hit(lit, 999, null, null, 1, null);
  eq(b2.st.ignite, 1, 'CONTROL: a breakable one still lights on the first shot (build 629)');
}

// ---------------------------------------------------------------- the shape of the fix
{
  const fn = extractFunction('damageProp');
  assert(!/if\(obj\.userData\.breakable===false\) return false;/.test(fn),
    'the immunity early-return is GONE — that line was the whole defect');
  assert(/if\(!obj\.userData\.phys && !obj\.userData\.shootable\) return false;/.test(fn),
    "...while build 1390's opt-in gate, which answers a different question, is untouched");
  assert(/const _brk = obj\.userData\.breakable !== false;/.test(fn),
    'the flag is read ONCE into a local, so the three things it gates cannot drift apart');
  // the three gates, each of which is the bug the other way round if it is missing
  assert(/if\(_brk\) obj\.userData\.hp -= dmg;/.test(fn), 'it gates the health');
  assert(/if\(_brk && obj\.userData\.hp <= 0\)\{ shatterProp\(/.test(fn), 'and the shatter');
  assert(/if\(_brk && obj\.userData\.explosive/.test(fn), 'and the fuse');
  // ...and nothing else. A gate on the flash, the sound or the event would put the defect back.
  eq((fn.match(/_brk/g) || []).length, 4, 'exactly four uses: the declaration and those three gates');
  const iEv = fn.indexOf("_lgPropEvent(obj, 'damaged'"), iSh = fn.indexOf('shatterProp(');
  assert(iEv > 0 && iSh > iEv,
    'the `damaged` event still fires BEFORE the shatter branch, so the killing shot is reported too (1397)');
}

// ---------------------------------------------------------------- the other four readers
{
  const snd = extractFunction('playPropHitSound');
  // ...asserted as a REFERENCE, never as the bare word: `playPropHitSound` carries a comment about
  // "every breakable prop in its radius", and my first draft of this pin was defeated by that prose.
  // Builds 1411 and 1412 record the same trap in both directions.
  assert(!/userData\.breakable/.test(snd),
    'the hit sound no longer refuses an unbreakable prop — something lands on it now, and the two ' +
    'client-prediction call sites have to agree with the host about that');
}
{
  const fn = (extractFunction('explodeAt') + extractFunction('_blastProps'));
  assert(/const broke = damageProp\(o, dmg\*f, null, null, 6, byId\);/.test(fn),
    'the dynamic sweep calls damageProp directly: the ternary that routed around it also skipped the ' +
    'flash, the sound and the event');
  assert(!/breakable===false/.test(fn),
    '...and neither sweep tests the flag any more — damageProp is the one place that decides');
  assert(/if\(o\.userData\._shattered \|\| o\.userData\._destroyed\) continue;/.test(fn),
    'the static sweep still skips props that are already gone');
  assert(/if\(!broke\) _blastShoveProp\(o, pos, R, f\);/.test(fn),
    "and build 1405's shove-what-survived order is unchanged");
}
{ // serialization is untouched: only-when-off, so a level with no unbreakable props is byte-identical
  const pe = extractFunction('propEntry');
  assert(/if\(o\.userData\.breakable===false\) e\.brk=false;/.test(pe),
    'the flag still saves only when turned off');
}

// ---------------------------------------------------------------- the checkbox says what it does
{
  const i = src.indexOf('<b>Breakable</b>');
  assert(i > 0, 'the checkbox exists');
  const blk = src.slice(i, i + 900);
  assert(/Untick it and shots still land/.test(blk),
    'and the hint states what UNTICKING does — the untick was the trap, and its consequence was invisible');
  assert(/On hit signal all fire/.test(blk), '...naming the signal that used to go silent');
  assert(/never breaks/.test(blk), '...and what it does buy');
  assert(/range-target/.test(blk), '...and the case it is for');
}

done('build 1421: `breakable:false` means it never breaks, not that nothing lands on it');
