// (build 798) Prop grouping — bind several props into one "group" by a shared id (userData.groupId). Clicking any member
// selects the whole group, so the existing multi-selection gizmo moves / rotates / scales them together. Ctrl+G groups,
// Ctrl+Shift+G ungroups; Group/Ungroup buttons in the props panel; the id saves with the level as `gid`; duplicating a
// group copies it as an independent group (fresh id).
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// --- helpers: a member lookup + id generator that stays ahead of loaded ids ---
assert(/function _groupMembers\(o\)\{ const gid=o&&o\.userData&&o\.userData\.groupId; if\(!gid\) return o\?\[o\]:\[\]; return propModels\.filter\(p=>p&&p\.userData&&p\.userData\.groupId===gid\); \}/.test(src), 'a member lookup returns everyone sharing the group id');
{
  const _groupMembers = new Function('propModels', extractFunction('_groupMembers') + '; return _groupMembers;')(
    [ {userData:{groupId:'g1'}}, {userData:{groupId:'g2'}}, {userData:{groupId:'g1'}}, {userData:{}} ]
  );
  eq(_groupMembers({userData:{groupId:'g1'}}).length, 2, 'two props share g1');
  eq(_groupMembers({userData:{}}).length, 1, 'an ungrouped prop is its own "group" of one');
}
// _bumpGroupSeq keeps fresh ids ahead of loaded ones
{
  const fn = new Function('return (function(){ let _groupSeq=0; ' + extractFunction('_bumpGroupSeq') + ' ; return { bump:_bumpGroupSeq, get:()=>_groupSeq }; })();')();
  fn.bump('g7'); eq(fn.get(), 7, 'loading g7 advances the counter'); fn.bump('g3'); eq(fn.get(), 7, 'a lower id does not lower it');
}

// --- group / ungroup operations ---
const gs = extractFunction('groupSelectedProps');
assert(/if\(!selProps \|\| selProps\.length<2\) return;/.test(gs), 'grouping needs at least two props');
assert(/const gid=_newGroupId\(\);\s*\n?\s*for\(const o of selProps\) if\(o&&o\.userData\) o\.userData\.groupId=gid;/.test(gs), 'grouping stamps a fresh id on every selected prop');
const us = extractFunction('ungroupSelectedProps');
assert(/for\(const o of selProps\) if\(o&&o\.userData\) delete o\.userData\.groupId;/.test(us), 'ungrouping clears the id');

// --- clicking a member selects the whole group; shift toggles the group ---
assert(/const mem = obj \? _groupMembers\(obj\) : \[\];/.test(src) && /selProps = mem;/.test(src), 'a plain click selects the clicked prop’s whole group');

// --- Ctrl+G / Ctrl+Shift+G hotkeys ---
assert(/\(e\.ctrlKey\|\|e\.metaKey\) && e\.code==='KeyG'[\s\S]*?ungroupSelectedProps\(\)[\s\S]*?groupSelectedProps\(\)/.test(src), 'Ctrl/Cmd+G groups, +Shift ungroups');

// --- Group / Ungroup buttons, gated on the selection ---
assert(/gb\.textContent='⛓ Group'; gb\.title=[\s\S]*?gb\.disabled=\(_selN<2\)/.test(src), 'a Group button (disabled under 2 selected)');
assert(/ub\.textContent='✂ Ungroup'; ub\.title=[\s\S]*?ub\.disabled=!_grouped/.test(src), 'an Ungroup button (disabled when nothing is grouped)');

// --- serialize + load round-trips the group id ---
assert(/if\(o\.userData\.groupId\) e\.gid=o\.userData\.groupId;/.test(extractFunction('propEntry')), 'the group id serializes as gid');
assert(/if\(p\.gid\)\{ obj\.userData\.groupId=p\.gid; _bumpGroupSeq\(p\.gid\); \}/.test(src), 'loading restores the group id + advances the counter');

// --- duplicate copies a group as an independent group (fresh id via a remap) ---
const dp = extractFunction('duplicateSelectedProp');
assert(/const list=\(selProps && selProps\.length\) \? selProps\.slice\(\) :/.test(dp), 'duplicate copies the whole selection, not just the primary');
assert(/const gid = oldGid \? \(remap\[oldGid\] \|\| \(remap\[oldGid\]=_newGroupId\(\)\)\) : null;/.test(dp), 'a duplicated group gets a fresh, consistent id (independent of the original)');

done('build 798: prop grouping — select/transform grouped props as one, saved with the level');
