// The editor's most-repeated action is the play/edit round trip. Time it, and time what it is made of.
import { withGame } from './tools/probe/driver.mjs';

await withGame(async (P, page) => {
  console.log('props', await P('propModels.length'));
  const r = await P(`(function(){
    const out={};
    const t=function(f){ const a=performance.now(); f(); return +(performance.now()-a).toFixed(1); };
    // warm both directions once so the first-time costs (panel build, tutorial) do not dominate
    toggleEditor(); toggleEditor();
    out.toEditor=[]; out.toPlay=[];
    for(let i=0;i<3;i++){ out.toEditor.push(t(function(){ toggleEditor(); })); out.toPlay.push(t(function(){ toggleEditor(); })); }
    // and the pieces, measured where they are cheap to isolate
    toggleEditor();                                  // into the editor
    out.serializeMs = t(function(){ JSON.stringify(serializeLevel()); });
    out.renderFieldsMs = t(function(){ renderEditorFields(); });
    out.snapshotMs = t(function(){ pushUndoSnapshot(); });
    toggleEditor();                                  // back to play
    out.instancingMs = t(function(){ if(typeof buildInstancing==='function') buildInstancing(); });
    out.editorOpen = !!editorOpen;
    return out;
  })()`);
  console.log(JSON.stringify(r, null, 1));
}, { settleMs: 9000 });
