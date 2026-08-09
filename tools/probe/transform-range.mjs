// Can a creator place a prop where their arena actually reaches?
//
// The audit says the transform sliders clamp typed values back to +-65 while ARENA reaches 2000. The commit
// path's own comment says the opposite ("typed numbers can exceed slider min/max"), so this measures which
// is true rather than trusting either — and, if the typed value survives, what the SLIDER then does with it.
import { withGame } from './driver.mjs';

const say = (k, v) => console.log('  ' + String(k).padEnd(32) + JSON.stringify(v));

await withGame(async (P) => {
  say('settled', await P(`(function(){
    if(!editorOpen) toggleEditor();
    worldCfg.arena = 800; applyWorldCfg();
    editorActive = 'props';
    return { build: BUILD_VERSION, ARENA, arenaMax: 2000 };
  })()`));

  /* Find the real transform field inputs the editor built, and drive them the way a creator does. */
  say('the fields as built', await P(`(function(){
    setEditorMode('build'); renderEditorFields();
    const out = {};
    for(const fi of editorFieldInputs){
      out[fi.k] = { numMin: fi.num.min || '(none)', numMax: fi.num.max || '(none)',
                    rngMin: fi.rng.min, rngMax: fi.rng.max };
    }
    return out;
  })()`));

  console.log('\n--- type a position the arena can hold ----------------------------------------------');
  say('type 300 into Pos X', await P(`(function(){
    const o = propModels.find(Boolean); if(!o) return { err:'no prop' };
    selProps = [o]; editorTargets.props.idx = propModels.indexOf(o);
    renderEditorFields();
    const fi = editorFieldInputs.find(f => f.k === 'px'); if(!fi) return { err:'no px field' };
    fi.num.value = '300'; fi.num.oninput();
    return { state: editorTargets.props.state.px, prop: +o.position.x.toFixed(2),
             numShows: fi.num.value, sliderShows: fi.rng.value };
  })()`));

  console.log('\n--- now touch the slider, which is what a creator does next -------------------------');
  say('nudge the slider once', await P(`(function(){
    const o = propModels.find(Boolean);
    const fi = editorFieldInputs.find(f => f.k === 'px');
    /* a real drag fires oninput with whatever the RANGE element currently holds */
    const before = { state: editorTargets.props.state.px, slider: fi.rng.value };
    fi.rng.oninput();
    return { before, after: { state: editorTargets.props.state.px, prop: +o.position.x.toFixed(2) } };
  })()`));

  console.log('\n--- height and scale, which are fixed regardless of the arena -----------------------');
  say('type 60 into Pos Y', await P(`(function(){
    const o = propModels.find(Boolean);
    const fi = editorFieldInputs.find(f => f.k === 'py'); if(!fi) return { err:'no py' };
    fi.num.value = '60'; fi.num.oninput();
    const typed = { state: editorTargets.props.state.py, slider: fi.rng.value, rngMax: fi.rng.max };
    fi.rng.oninput();
    return { typed, afterSliderTouch: editorTargets.props.state.py };
  })()`));

  say('type 40 into Scale X', await P(`(function(){
    const fi = editorFieldInputs.find(f => f.k === 'sx'); if(!fi) return { err:'no sx' };
    const wasProp = scaleProportional; scaleProportional = false;
    fi.num.value = '40'; fi.num.oninput();
    const typed = { state: editorTargets.props.state.sx, slider: fi.rng.value, rngMax: fi.rng.max };
    fi.rng.oninput();
    const out = { typed, afterSliderTouch: editorTargets.props.state.sx };
    scaleProportional = wasProp;
    return out;
  })()`));

  console.log('\n--- and what the level actually allows ----------------------------------------------');
  say('arena vs field range', await P(`(function(){
    return { ARENA, halfExtent: ARENA, fieldMax: 65,
             reachableFraction: +(65 / ARENA).toFixed(3) };
  })()`));
}, { settleMs: 5000 });

console.log('');
