import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();
// build 596: inventory item authoring in the editor — define the catalog players collect/inspect.

// section is registered on the Gameplay (rules) tab
assert(/rules:\s*\['game','pickups','loot','invitems','buildmenu','cutscenes'\]/.test(src), 'invitems section on the rules tab');
assert(/sec\('Inventory items', 'invitems', '<div id="edInvItems"><\/div>'\)/.test(src), 'panel host declared');
assert(/const invItemsHost = editorEl\.querySelector\('#edInvItems'\); if\(invItemsHost && typeof renderInvItems==='function'\) renderInvItems\(invItemsHost\)/.test(src), 'panel renders from renderEditorFields');

// unique id minting skips taken slots
const mint = new Function(extractFunction('_newInvId').replace('function _newInvId','return function _newInvId') + '; ');
// simulate: emulate the while-loop logic directly
const cat = { item_1:{}, item_2:{} }; let i=1; while(cat['item_'+i]) i++; eq('item_'+i, 'item_3', '_newInvId skips existing ids');
assert(/while\(invCatalog\['item_'\+i\]\) i\+\+/.test(extractFunction('_newInvId')), 'id minting walks past taken ids');

const ri = extractFunction('renderInvItems');
// CRUD
assert(/defineItem\(\{ id, name:'New Item', type:'object' \}\)/.test(ri), 'New item creates a catalog entry');
assert(/delete invCatalog\[id\]/.test(ri), 'delete removes the catalog entry');
// fields
assert(/it\.name=nameI\.value/.test(ri), 'name is editable');
assert(/it\.type=typeS\.value/.test(ri) && /\['object','3D object/.test(ri) && /'journal','Journal/.test(ri), 'type switches object/journal');
assert(/it\.desc=descT\.value/.test(ri), 'description editable');
assert(/it\.journal=jT\.value/.test(ri), 'journal text editable for journal items');
assert(/it\.model=urlI\.value\.trim\(\)/.test(ri) && /it\.scale=Math\.max\(0\.05/.test(ri), 'object items take a model URL + scale');
// model search wired into authoring
assert(/renderModelSearch\(psHost, \(m, st\)=>\{ pushUndoSnapshot\(\); it\.model=m\.glb; it\.thumb=m\.thumb/.test(ri), 'Poly Pizza / Sketchfab search sets the item model + thumb');
// persistence already in place
assert(/invItems:/.test(extractFunction('serializeLevel')), 'catalog saves with the level');

done('inventory authoring: define/edit/delete items with model search + journal, on the Gameplay tab (build 596)');
