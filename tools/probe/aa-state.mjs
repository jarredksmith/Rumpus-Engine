// Build 1343: does the new readout tell the truth in every state the pipeline can actually be in?
//
// Two builds guessed at a jagged-edges report and both were wrong, and the reporter's own observation
// ("turning adaptive resolution off changes nothing") killed the second one outright. So this build adds
// a readout instead of a third guess — and a readout is only worth having if it is right, which is what
// this probe is for. Four states, driven for real, with the HUD line and the Level Check rows read back.
import { withGame } from './driver.mjs';

const ST = `JSON.stringify(_aaState())`;
const HUD = `_aaReport().replace(/<[^>]*>/g,'')`;
const ISS = `JSON.stringify(levelIssues().filter(s=>/antialias|resolution|Depth of field|WebGL/i.test(s)).map(s=>s.slice(0,90)))`;

await withGame(async (P) => {
  await P(`worldCfg.autoExp=0; worldCfg.postGrain=0; applyWorldCfg(); editorOpen=false;
    _adaptOn=true; 1`);

  const show = async (label) => {
    console.log('\n' + label);
    console.log('  state  ' + await P(ST));
    console.log('  hud    ' + await P(HUD));
    console.log('  issues ' + await P(ISS));
  };

  // 1. wherever the sandbox's software renderer has settled on its own
  await show('as it settled (SwiftShader — expect a shed rung)');

  // 2. forced to the top rung: MSAA must be reported
  await P(`_prStepI=0; _prScale=1; _hiFxOn=true; _hiFxFails=0; _mbShed=false; _applyPixelRatio();
    disposePost(); ensurePost(); 1`);
  await show('top rung forced');

  // 3. DoF on. `dofEnabled = (worldCfg.dof === true)` — a truthy 1 is NOT enough, which is how the first
  //    run of this probe convinced me the engine had a bug it did not have.
  await P(`worldCfg.dof=true; worldCfg.dofStrength=2; applyWorldCfg();
    _prStepI=0; _hiFxOn=true; _applyPixelRatio(); disposePost(); ensurePost(); 1`);
  await show('top rung + depth of field (1284: DoF cannot be multisampled)');
  await P(`worldCfg.dof=false; applyWorldCfg(); disposePost(); ensurePost(); 1`);

  // 4. post off entirely — the canvas' own AA, which is a different answer again
  await P(`window.__pm = _postOn; _postOn = false; 1`);
  await show('post-processing off');
  await P(`_postOn = window.__pm; 1`);

  // 5. the render-scale case that no adaptive setting can explain: a high-DPI display against _prBase
  console.log('\n_prBase ceiling vs a devicePixelRatio-2 display (the report-shaped case):');
  console.log('  ' + await P(`(function(){ const r=renderer.getPixelRatio();
    renderer.setPixelRatio(1.5); const a=_aaState(); const line=_aaReport().replace(/<[^>]*>/g,'');
    const fake = Object.assign({}, a, { dpr:2, scale:a.pr/2 });
    renderer.setPixelRatio(r);
    return JSON.stringify({ atDpr1:line, ifDisplayWere2:'render '+a.pr.toFixed(2)+'/2.00 ('+Math.round(fake.scale*100)+'% of native)' });
  })()`));
}, { settleMs: 6000 });
